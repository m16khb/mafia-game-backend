import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AICacheService, CacheLevel } from './ai-cache.service';
import { RedisService } from '../redis/redis.service';
import { DecisionContext, DecisionResult } from './ai-decision.service';
import { AIPersona } from '../../entities/ai-persona.entity';
import { Game } from '../../entities/game.entity';
import { Player } from '../../entities/player.entity';
import { LLMResponse } from '../llm/llm.service';

// Mock Redis client
const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
  scan: jest.fn(),
  exists: jest.fn(),
};

const mockRedisService = {
  getClient: jest.fn(() => mockRedisClient),
  getJson: jest.fn(),
  setJson: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: any) => {
    const config = {
      AI_CACHE_TTL: 30,
      AI_CACHE_MAX_SIZE: 100 * 1024 * 1024,
      AI_CACHE_COMPRESSION: true,
    };
    return config[key] || defaultValue;
  }),
};

describe('AICacheService', () => {
  let service: AICacheService;
  let redisService: jest.Mocked<RedisService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AICacheService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AICacheService>(AICacheService);
    redisService = module.get(RedisService);
    configService = module.get(ConfigService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    // Clean up any intervals/timeouts
    await service.onModuleDestroy();
  });

  describe('Cache Key Generation', () => {
    it('should generate consistent cache keys for similar contexts', async () => {
      const mockGame = createMockGame();
      const mockPlayer = createMockPlayer();
      const mockPersona = createMockPersona();

      const context1: DecisionContext = {
        game: mockGame,
        player: mockPlayer,
        decisionType: 'vote',
        gamePhase: 'day_voting',
        availableTargets: ['Player2', 'Player3'],
      };

      const context2: DecisionContext = {
        game: mockGame,
        player: mockPlayer,
        decisionType: 'vote',
        gamePhase: 'day_voting',
        availableTargets: ['Player2', 'Player3'], // Same order
      };

      // Use reflection to access private method for testing
      const generateCacheKey = (service as any).generateCacheKey.bind(service);

      const key1 = await generateCacheKey(context1, mockPersona);
      const key2 = await generateCacheKey(context2, mockPersona);

      expect(key1.contextHash).toBe(key2.contextHash);
      expect(key1.personaId).toBe(key2.personaId);
      expect(key1.decisionType).toBe(key2.decisionType);
    });

    it('should generate different cache keys for different contexts', async () => {
      const mockGame = createMockGame();
      const mockPlayer = createMockPlayer();
      const mockPersona = createMockPersona();

      const context1: DecisionContext = {
        game: mockGame,
        player: mockPlayer,
        decisionType: 'vote',
        gamePhase: 'day_voting',
        availableTargets: ['Player2', 'Player3'],
      };

      const context2: DecisionContext = {
        game: mockGame,
        player: mockPlayer,
        decisionType: 'discussion', // Different decision type
        gamePhase: 'day_voting',
        availableTargets: ['Player2', 'Player3'],
      };

      const generateCacheKey = (service as any).generateCacheKey.bind(service);

      const key1 = await generateCacheKey(context1, mockPersona);
      const key2 = await generateCacheKey(context2, mockPersona);

      expect(key1.contextHash).not.toBe(key2.contextHash);
      expect(key1.decisionType).not.toBe(key2.decisionType);
    });
  });

  describe('Cache Operations', () => {
    it('should cache decision successfully', async () => {
      const mockContext = createMockContext();
      const mockPersona = createMockPersona();
      const mockResult = createMockDecisionResult();
      const mockLLMResponse = createMockLLMResponse();

      redisService.setJson.mockResolvedValue(undefined);

      await service.cacheDecision(
        mockContext,
        mockPersona,
        mockResult,
        mockLLMResponse,
        'persona-specific',
      );

      expect(redisService.setJson).toHaveBeenCalledWith(
        expect.stringContaining('ai:cache:persona'),
        expect.objectContaining({
          decision: expect.objectContaining({
            action: mockResult.action,
            confidence: mockResult.confidence,
          }),
          llmResponse: mockLLMResponse,
          cacheMetadata: expect.objectContaining({
            level: 'persona-specific',
            personaId: mockPersona.id,
          }),
        }),
        expect.any(Number),
      );
    });

    it('should retrieve cached decision successfully', async () => {
      const mockContext = createMockContext();
      const mockPersona = createMockPersona();
      const mockCachedData = createMockCachedDecision();
      const originalHitCount = mockCachedData.cacheMetadata.hitCount;

      redisService.getJson
        .mockResolvedValueOnce(null) // persona-specific miss
        .mockResolvedValueOnce(null) // game-specific miss
        .mockResolvedValueOnce(mockCachedData); // global hit

      const result = await service.getCachedDecision(mockContext, mockPersona);

      expect(result).toBeDefined();
      expect(result!.decision.action).toBe(mockCachedData.decision.action);
      expect(result!.cacheMetadata.hitCount).toBe(originalHitCount + 1);
    });

    it('should return null when no cache hit', async () => {
      const mockContext = createMockContext();
      const mockPersona = createMockPersona();

      redisService.getJson.mockResolvedValue(null);

      const result = await service.getCachedDecision(mockContext, mockPersona);

      expect(result).toBeNull();
      expect(redisService.getJson).toHaveBeenCalledTimes(3); // All three levels checked
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate cache by game state', async () => {
      const gameId = 123;
      const changedFields = ['players', 'phase'];

      mockRedisClient.scan.mockResolvedValue({
        cursor: 0,
        keys: [
          'ai:cache:game:123:vote:abc123',
          'ai:cache:persona:1:123:def456',
        ],
      });

      mockRedisClient.del.mockResolvedValue(2);

      await service.invalidateByGameState(gameId, changedFields);

      expect(mockRedisClient.del).toHaveBeenCalledWith([
        'ai:cache:game:123:vote:abc123',
        'ai:cache:persona:1:123:def456',
      ]);
    });

    it('should invalidate cache by persona', async () => {
      const personaId = 1;

      mockRedisClient.scan.mockResolvedValue({
        cursor: 0,
        keys: [
          'ai:cache:persona:1:vote:abc123',
          'ai:cache:persona:1:discussion:def456',
        ],
      });

      mockRedisClient.del.mockResolvedValue(2);

      await service.invalidateByPersona(personaId);

      expect(mockRedisClient.del).toHaveBeenCalledWith([
        'ai:cache:persona:1:vote:abc123',
        'ai:cache:persona:1:discussion:def456',
      ]);
    });
  });

  describe('Cache Statistics', () => {
    it('should track cache hits and misses', async () => {
      const mockContext = createMockContext();
      const mockPersona = createMockPersona();

      // Simulate cache miss
      redisService.getJson.mockResolvedValue(null);
      await service.getCachedDecision(mockContext, mockPersona);

      // Simulate cache hit
      const mockCachedData = createMockCachedDecision();
      redisService.getJson.mockResolvedValueOnce(mockCachedData);

      await service.getCachedDecision(mockContext, mockPersona);

      const stats = service.getCacheStats();

      expect(stats.totalHits).toBe(1);
      expect(stats.totalMisses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should clear cache statistics when cache is cleared', async () => {
      // Mock scan to return different results for each prefix
      mockRedisClient.scan
        .mockResolvedValueOnce({
          cursor: 0,
          keys: ['ai:cache:global:test1'],
        })
        .mockResolvedValueOnce({
          cursor: 0,
          keys: ['ai:cache:game:test2'],
        })
        .mockResolvedValueOnce({
          cursor: 0,
          keys: ['ai:cache:persona:test3'],
        });

      mockRedisClient.del.mockResolvedValue(1); // Each del call removes 1 key

      const clearedCount = await service.clearCache();

      expect(clearedCount).toBe(3); // Total keys cleared across all patterns
      expect(mockRedisClient.del).toHaveBeenCalledTimes(3);
    });
  });

  describe('Cache Levels', () => {
    it('should build correct Redis keys for different cache levels', () => {
      const buildRedisKey = (service as any).buildRedisKey.bind(service);

      const mockCacheKey = {
        contextHash: 'abc123',
        personaId: 1,
        decisionType: 'vote',
        gamePhase: 'day_voting',
        level: 'persona-specific',
      };

      const globalKey = buildRedisKey(mockCacheKey, 'global');
      const gameKey = buildRedisKey(mockCacheKey, 'game-specific');
      const personaKey = buildRedisKey(mockCacheKey, 'persona-specific');

      expect(globalKey).toContain('ai:cache:global');
      expect(gameKey).toContain('ai:cache:game');
      expect(personaKey).toContain('ai:cache:persona');

      expect(globalKey).toContain('vote');
      expect(gameKey).toContain('1'); // persona ID
      expect(personaKey).toContain('day_voting');
    });
  });

  // Helper functions to create mock objects
  function createMockGame(): Game {
    const game = new Game();
    game.id = 1;
    game.dayCount = 1;
    game.status = 'playing';
    game.getAlivePlayers = jest.fn(() => []);
    return game;
  }

  function createMockPlayer(): Player {
    const player = new Player();
    player.id = 1;
    player.name = 'TestPlayer';
    player.role = 'citizen';
    player.isAlive = true;
    player.aiPersonaId = 1;
    return player;
  }

  function createMockPersona(): AIPersona {
    const persona = new AIPersona();
    persona.id = 1;
    persona.name = 'TestPersona';
    persona.traits = ['analytical', 'cautious', 'deductive', 'communicative'];
    persona.communicationStyle = 'analytical';
    persona.riskTolerance = 'medium';
    persona.votingTendency = 'early';
    return persona;
  }

  function createMockContext(): DecisionContext {
    return {
      game: createMockGame(),
      player: createMockPlayer(),
      decisionType: 'vote',
      gamePhase: 'day_voting',
      availableTargets: ['Player2', 'Player3'],
    };
  }

  function createMockDecisionResult(): DecisionResult {
    return {
      decision: {} as any, // We don't need the full decision object for cache tests
      action: 'vote',
      target: 'Player2',
      reasoning: 'Test reasoning',
      confidence: 7,
      processingTime: 1500,
    };
  }

  function createMockLLMResponse(): LLMResponse {
    return {
      content: 'Test LLM response',
      tokensUsed: 50,
      cost: 0.001,
      model: 'test-model',
      processingTime: 1000,
    };
  }

  function createMockCachedDecision(): any {
    return {
      decision: {
        action: 'vote',
        target: 'Player2',
        reasoning: 'Cached reasoning',
        confidence: 7,
        processingTime: 100,
      },
      llmResponse: createMockLLMResponse(),
      cacheMetadata: {
        level: 'global',
        createdAt: new Date(),
        hitCount: 0,
        lastAccessed: new Date(),
        contextHash: 'abc123',
        personaId: 1,
      },
    };
  }
});

import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { Logger } from '@/libs/logger/logger.service';
import { ClsService } from 'nestjs-cls';
import { AIDecisionProcessor } from './ai-decision.processor';
import {
  IAIDecisionRepository,
  AI_DECISION_REPOSITORY_TOKEN,
  IGameEventRepository,
  GAME_EVENT_REPOSITORY_TOKEN,
  IGameRepository,
  GAME_REPOSITORY_TOKEN,
  IPlayerRepository,
  PLAYER_REPOSITORY_TOKEN,
} from '@libs/repositories';
import { AIDecisionService } from '@/libs/ai/ai-decision.service';
import { Game } from '../../entities/game.entity';
import { Player } from '../../entities/player.entity';
import { AIDecision } from '../../entities/ai-decision.entity';
import { GameEvent } from '../../entities/game-event.entity';

describe('AIDecisionProcessor', () => {
  let processor: AIDecisionProcessor;
  let mockAIDecisionRepository: jest.Mocked<IAIDecisionRepository>;
  let mockGameEventRepository: jest.Mocked<IGameEventRepository>;
  let mockGameRepository: jest.Mocked<IGameRepository>;
  let mockPlayerRepository: jest.Mocked<IPlayerRepository>;
  let mockAIDecisionService: jest.Mocked<AIDecisionService>;
  let mockLogger: jest.Mocked<Logger>;
  let mockClsService: jest.Mocked<ClsService>;

  beforeEach(async () => {
    const mockAIDecisionRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
      findByPlayerId: jest.fn(),
      findByGameId: jest.fn(),
    };

    const mockGameEventRepo = {
      create: jest.fn(),
      save: jest.fn(),
    };

    const mockGameRepo = {
      findByIdWithRelations: jest.fn(),
    };

    const mockPlayerRepo = {
      findById: jest.fn(),
    };

    const mockAIService = {
      makeDecision: jest.fn(),
    };

    const mockLoggerService = {
      setContext: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
    };

    const mockCls = {
      run: jest.fn().mockImplementation((callback) => callback()),
      set: jest.fn(),
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIDecisionProcessor,
        {
          provide: AI_DECISION_REPOSITORY_TOKEN,
          useValue: mockAIDecisionRepo,
        },
        {
          provide: GAME_EVENT_REPOSITORY_TOKEN,
          useValue: mockGameEventRepo,
        },
        {
          provide: GAME_REPOSITORY_TOKEN,
          useValue: mockGameRepo,
        },
        {
          provide: PLAYER_REPOSITORY_TOKEN,
          useValue: mockPlayerRepo,
        },
        {
          provide: AIDecisionService,
          useValue: mockAIService,
        },
        {
          provide: Logger,
          useValue: mockLoggerService,
        },
        {
          provide: ClsService,
          useValue: mockCls,
        },
      ],
    }).compile();

    processor = module.get<AIDecisionProcessor>(AIDecisionProcessor);
    mockAIDecisionRepository = module.get(AI_DECISION_REPOSITORY_TOKEN);
    mockGameEventRepository = module.get(GAME_EVENT_REPOSITORY_TOKEN);
    mockGameRepository = module.get(GAME_REPOSITORY_TOKEN);
    mockPlayerRepository = module.get(PLAYER_REPOSITORY_TOKEN);
    mockAIDecisionService = module.get(AIDecisionService);
    mockLogger = module.get(Logger);
    mockClsService = module.get(ClsService);
  });

  describe('process', () => {
    it('should process a single AI decision job successfully', async () => {
      // Arrange
      const mockGame = new Game();
      mockGame.id = 1;
      mockGame.players = [];

      const mockPlayer = new Player();
      mockPlayer.id = 1;
      mockPlayer.isAi = true;
      mockPlayer.name = 'AI Player 1';

      mockGame.players.push(mockPlayer);

      const jobData = {
        gameId: 1,
        playerId: 1,
        decisionType: 'vote' as const,
        gamePhase: 'day_voting',
        availableTargets: ['Player2', 'Player3'],
        requestContext: 'test-context',
      };

      const mockJob = {
        id: 'job-123',
        name: 'make-decision',
        data: jobData,
      } as Job;

      const mockDecisionResult = {
        decision: new AIDecision(),
        action: 'vote',
        target: 'Player2',
        reasoning: 'Test reasoning',
        confidence: 8,
        processingTime: 1500,
      };

      const mockGameEvent = new GameEvent();

      // Setup mocks
      mockGameRepository.findByIdWithRelations.mockResolvedValue(mockGame);
      mockAIDecisionService.makeDecision.mockResolvedValue(mockDecisionResult);
      mockGameEventRepository.create.mockReturnValue(mockGameEvent);
      mockGameEventRepository.save.mockResolvedValue(mockGameEvent);

      // Act
      await processor.process(mockJob);

      // Assert
      expect(mockGameRepository.findByIdWithRelations).toHaveBeenCalledWith(1, {
        players: true,
        messages: true,
      });
      expect(mockAIDecisionService.makeDecision).toHaveBeenCalledWith({
        game: mockGame,
        player: mockPlayer,
        decisionType: 'vote',
        gamePhase: 'day_voting',
        availableTargets: ['Player2', 'Player3'],
        gameState: undefined,
        timeLimit: undefined,
      });
      expect(mockGameEventRepository.create).toHaveBeenCalledWith({
        gameId: 1,
        eventType: 'ai-decision-completed',
        eventData: expect.objectContaining({
          playerId: 1,
          decisionType: 'vote',
          action: 'vote',
          target: 'Player2',
          confidence: 8,
          processingTime: 1500,
          wasSuccessful: true,
        }),
      });
      expect(mockLogger.log).toHaveBeenCalledWith(
        'AI decision completed for player 1: vote (confidence: 8)',
      );
    });

    it('should handle AI decision service errors gracefully', async () => {
      // Arrange
      const mockGame = new Game();
      mockGame.id = 1;
      mockGame.players = [];

      const mockPlayer = new Player();
      mockPlayer.id = 1;
      mockPlayer.isAi = true;
      mockPlayer.name = 'AI Player 1';

      mockGame.players.push(mockPlayer);

      const jobData = {
        gameId: 1,
        playerId: 1,
        decisionType: 'vote' as const,
        gamePhase: 'day_voting',
        requestContext: 'test-context',
      };

      const mockJob = {
        id: 'job-123',
        name: 'make-decision',
        data: jobData,
      } as Job;

      const mockError = new Error('LLM service unavailable');
      const mockFallbackDecision = new AIDecision();
      const mockGameEvent = new GameEvent();

      // Setup mocks
      mockGameRepository.findByIdWithRelations.mockResolvedValue(mockGame);
      mockAIDecisionService.makeDecision.mockRejectedValue(mockError);
      mockAIDecisionRepository.create.mockReturnValue(mockFallbackDecision);
      mockAIDecisionRepository.save.mockResolvedValue(mockFallbackDecision);
      mockGameEventRepository.create.mockReturnValue(mockGameEvent);
      mockGameEventRepository.save.mockResolvedValue(mockGameEvent);

      // Act
      await processor.process(mockJob);

      // Assert
      expect(mockAIDecisionRepository.create).toHaveBeenCalledWith({
        playerId: 1,
        gameId: 1,
        decisionType: 'vote',
        decisionData: {
          action: 'abstain',
          reasoning: 'Fallback decision due to error: LLM service unavailable',
          alternatives: [],
          error: 'LLM service unavailable',
        },
        processingTime: expect.any(Number),
        confidence: 1,
        gamePhase: 'day_voting',
        wasSuccessful: false,
        outcome: {
          isFallback: true,
          error: 'LLM service unavailable',
        },
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        mockError,
        'AI decision failed for player 1',
      );
    });

    it('should throw error for unknown job types', async () => {
      // Arrange
      const jobData = {
        gameId: 1,
        playerId: 1,
        decisionType: 'vote' as const,
        gamePhase: 'day_voting',
        requestContext: 'test-context',
      };

      const mockJob = {
        id: 'job-123',
        name: 'unknown-job-type',
        data: jobData,
      } as Job;

      // Act & Assert
      await expect(processor.process(mockJob)).rejects.toThrow(
        'Unknown job type: unknown-job-type',
      );
    });

    it('should handle non-AI players gracefully', async () => {
      // Arrange
      const mockGame = new Game();
      mockGame.id = 1;
      mockGame.players = [];

      const mockPlayer = new Player();
      mockPlayer.id = 1;
      mockPlayer.isAi = false; // Not an AI player
      mockPlayer.name = 'Human Player 1';

      mockGame.players.push(mockPlayer);

      const jobData = {
        gameId: 1,
        playerId: 1,
        decisionType: 'vote' as const,
        gamePhase: 'day_voting',
        requestContext: 'test-context',
      };

      const mockJob = {
        id: 'job-123',
        name: 'make-decision',
        data: jobData,
      } as Job;

      const mockFallbackDecision = new AIDecision();
      const mockGameEvent = new GameEvent();

      // Setup mocks
      mockGameRepository.findByIdWithRelations.mockResolvedValue(mockGame);
      mockAIDecisionRepository.create.mockReturnValue(mockFallbackDecision);
      mockAIDecisionRepository.save.mockResolvedValue(mockFallbackDecision);
      mockGameEventRepository.create.mockReturnValue(mockGameEvent);
      mockGameEventRepository.save.mockResolvedValue(mockGameEvent);

      // Act
      await processor.process(mockJob);

      // Assert
      expect(mockAIDecisionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          decisionData: expect.objectContaining({
            error: 'Player 1 is not an AI player',
          }),
        }),
      );
    });
  });
});

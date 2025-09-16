import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { DecisionContext, DecisionResult } from './ai-decision.service';
import { LLMResponse } from '../llm/llm.service';
import { AIPersona } from '../../entities/ai-persona.entity';
import { DecisionType } from '../../entities/ai-decision.entity';

export interface CacheKey {
  contextHash: string;
  personaId: number;
  decisionType: DecisionType;
  gamePhase: string;
  level: CacheLevel;
}

export type CacheLevel = 'global' | 'game-specific' | 'persona-specific';

export interface CachedDecision {
  decision: Omit<DecisionResult, 'decision'>;
  llmResponse: LLMResponse;
  cacheMetadata: {
    level: CacheLevel;
    createdAt: Date;
    hitCount: number;
    lastAccessed: Date;
    contextHash: string;
    gameId?: number;
    personaId: number;
  };
}

export interface CacheStats {
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  totalKeys: number;
  cacheSize: number; // in bytes
  levelStats: Record<
    CacheLevel,
    {
      hits: number;
      misses: number;
      keys: number;
    }
  >;
  recentActivity: {
    timestamp: Date;
    action: 'hit' | 'miss' | 'set' | 'invalidate';
    level: CacheLevel;
    key: string;
  }[];
}

export interface WarmupScenario {
  name: string;
  contexts: Partial<DecisionContext>[];
  priority: 'high' | 'medium' | 'low';
  frequency: number; // hours between warmups
}

@Injectable()
export class AICacheService implements OnModuleDestroy {
  private readonly logger = new Logger(AICacheService.name);
  private readonly cacheConfig: {
    ttl: Record<CacheLevel, number>;
    maxSize: number;
    compressionEnabled: boolean;
    prefixKeys: Record<CacheLevel, string>;
  };

  private stats: CacheStats = {
    totalHits: 0,
    totalMisses: 0,
    hitRate: 0,
    totalKeys: 0,
    cacheSize: 0,
    levelStats: {
      global: { hits: 0, misses: 0, keys: 0 },
      'game-specific': { hits: 0, misses: 0, keys: 0 },
      'persona-specific': { hits: 0, misses: 0, keys: 0 },
    },
    recentActivity: [],
  };

  private warmupScenarios: WarmupScenario[] = [];
  private warmupIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    const defaultTtl = this.configService.get<number>('AI_CACHE_TTL', 30) * 60; // 30 minutes default

    this.cacheConfig = {
      ttl: {
        global: defaultTtl * 48, // 24 hours for global patterns
        'game-specific': defaultTtl * 2, // 1 hour for game-specific
        'persona-specific': defaultTtl, // 30 minutes for persona-specific
      },
      maxSize: this.configService.get<number>(
        'AI_CACHE_MAX_SIZE',
        100 * 1024 * 1024,
      ), // 100MB
      compressionEnabled: this.configService.get<boolean>(
        'AI_CACHE_COMPRESSION',
        true,
      ),
      prefixKeys: {
        global: 'ai:cache:global',
        'game-specific': 'ai:cache:game',
        'persona-specific': 'ai:cache:persona',
      },
    };

    this.initializeWarmupScenarios();
    this.startBackgroundTasks();
  }

  async onModuleDestroy(): Promise<void> {
    // Clear all warmup intervals
    for (const interval of this.warmupIntervals.values()) {
      clearInterval(interval);
    }
    this.warmupIntervals.clear();
  }

  /**
   * Get a cached decision if available
   */
  async getCachedDecision(
    context: DecisionContext,
    persona: AIPersona,
  ): Promise<CachedDecision | null> {
    try {
      const cacheKey = await this.generateCacheKey(context, persona);
      const levels: CacheLevel[] = [
        'persona-specific',
        'game-specific',
        'global',
      ];

      for (const level of levels) {
        const key = this.buildRedisKey(cacheKey, level);
        const cached = await this.redisService.getJson<CachedDecision>(key);

        if (cached) {
          // Update cache metadata
          cached.cacheMetadata.hitCount++;
          cached.cacheMetadata.lastAccessed = new Date();
          await this.redisService.setJson(
            key,
            cached,
            this.cacheConfig.ttl[level],
          );

          // Update statistics
          this.updateStats('hit', level, key);

          this.logger.log(
            `Cache hit - Level: ${level}, Context: ${cacheKey.contextHash}, Persona: ${persona.id}`,
          );

          return cached;
        }
      }

      // No cache hit
      this.updateStats('miss', 'persona-specific', '');
      this.logger.debug(
        `Cache miss - Context: ${cacheKey.contextHash}, Persona: ${persona.id}`,
      );

      return null;
    } catch (error) {
      this.logger.error(`Cache retrieval error: ${error.message}`);
      return null;
    }
  }

  /**
   * Cache a decision result
   */
  async cacheDecision(
    context: DecisionContext,
    persona: AIPersona,
    result: DecisionResult,
    llmResponse: LLMResponse,
    level: CacheLevel = 'persona-specific',
  ): Promise<void> {
    try {
      const cacheKey = await this.generateCacheKey(context, persona);
      const key = this.buildRedisKey(cacheKey, level);

      const cachedData: CachedDecision = {
        decision: {
          action: result.action,
          target: result.target,
          reasoning: result.reasoning,
          confidence: result.confidence,
          processingTime: result.processingTime,
        },
        llmResponse,
        cacheMetadata: {
          level,
          createdAt: new Date(),
          hitCount: 0,
          lastAccessed: new Date(),
          contextHash: cacheKey.contextHash,
          gameId: level === 'game-specific' ? context.game.id : undefined,
          personaId: persona.id,
        },
      };

      // Check cache size limit
      const serializedSize = JSON.stringify(cachedData).length;
      await this.ensureCacheSize(serializedSize);

      await this.redisService.setJson(
        key,
        cachedData,
        this.cacheConfig.ttl[level],
      );

      this.updateStats('set', level, key);

      this.logger.log(
        `Decision cached - Level: ${level}, Size: ${serializedSize} bytes, TTL: ${this.cacheConfig.ttl[level]}s`,
      );
    } catch (error) {
      this.logger.error(`Cache storage error: ${error.message}`);
    }
  }

  /**
   * Invalidate cache entries based on game state changes
   */
  async invalidateByGameState(
    gameId: number,
    changedFields: string[],
  ): Promise<void> {
    try {
      const patterns = [
        `${this.cacheConfig.prefixKeys['game-specific']}:${gameId}:*`,
        `${this.cacheConfig.prefixKeys['persona-specific']}:*:${gameId}:*`,
      ];

      // If critical game state changed, also invalidate global cache
      const criticalFields = ['players', 'phase', 'dayCount', 'alivePlayers'];
      const shouldInvalidateGlobal = changedFields.some((field) =>
        criticalFields.includes(field),
      );

      if (shouldInvalidateGlobal) {
        patterns.push(`${this.cacheConfig.prefixKeys.global}:*`);
      }

      let invalidatedCount = 0;
      for (const pattern of patterns) {
        const keys = await this.getKeysByPattern(pattern);
        if (keys.length > 0) {
          await this.redisService.getClient().del(keys);
          invalidatedCount += keys.length;
        }
      }

      this.updateStats('invalidate', 'game-specific', `gameId:${gameId}`);

      this.logger.log(
        `Cache invalidated - Game: ${gameId}, Fields: [${changedFields.join(', ')}], Keys: ${invalidatedCount}`,
      );
    } catch (error) {
      this.logger.error(`Cache invalidation error: ${error.message}`);
    }
  }

  /**
   * Invalidate cache entries for a specific persona
   */
  async invalidateByPersona(personaId: number): Promise<void> {
    try {
      const pattern = `${this.cacheConfig.prefixKeys['persona-specific']}:${personaId}:*`;
      const keys = await this.getKeysByPattern(pattern);

      if (keys.length > 0) {
        await this.redisService.getClient().del(keys);
        this.updateStats(
          'invalidate',
          'persona-specific',
          `personaId:${personaId}`,
        );

        this.logger.log(
          `Cache invalidated for persona ${personaId} - ${keys.length} keys removed`,
        );
      }
    } catch (error) {
      this.logger.error(`Persona cache invalidation error: ${error.message}`);
    }
  }

  /**
   * Warm up cache with common decision scenarios
   */
  async warmupCache(scenarios?: WarmupScenario[]): Promise<void> {
    const scenariosToWarm = scenarios || this.warmupScenarios;

    this.logger.log(
      `Starting cache warmup with ${scenariosToWarm.length} scenarios`,
    );

    for (const scenario of scenariosToWarm) {
      try {
        await this.warmupScenario(scenario);
      } catch (error) {
        this.logger.error(
          `Warmup scenario "${scenario.name}" failed: ${error.message}`,
        );
      }
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    this.calculateCacheSize();
    return { ...this.stats };
  }

  /**
   * Clear all cache data
   */
  async clearCache(level?: CacheLevel): Promise<number> {
    try {
      let patterns: string[];

      if (level) {
        patterns = [`${this.cacheConfig.prefixKeys[level]}:*`];
      } else {
        patterns = Object.values(this.cacheConfig.prefixKeys).map(
          (prefix) => `${prefix}:*`,
        );
      }

      let clearedCount = 0;
      for (const pattern of patterns) {
        const keys = await this.getKeysByPattern(pattern);
        if (keys.length > 0) {
          await this.redisService.getClient().del(keys);
          clearedCount += keys.length;
        }
      }

      if (!level) {
        this.resetStats();
      } else {
        this.stats.levelStats[level] = { hits: 0, misses: 0, keys: 0 };
      }

      this.logger.log(
        `Cache cleared - Level: ${level || 'all'}, Keys: ${clearedCount}`,
      );

      return clearedCount;
    } catch (error) {
      this.logger.error(`Cache clear error: ${error.message}`);
      return 0;
    }
  }

  /**
   * Generate a unique cache key based on context
   */
  private async generateCacheKey(
    context: DecisionContext,
    persona: AIPersona,
  ): Promise<CacheKey> {
    // Create context hash from relevant game state
    const contextData = {
      // Game state that affects decisions
      gamePhase: context.gamePhase,
      dayCount: context.game.dayCount,
      alivePlayers: context.game
        .getAlivePlayers()
        .map((p) => ({
          id: p.id,
          role: p.role,
          isAlive: p.isAlive,
        }))
        .sort((a, b) => a.id - b.id), // Sort for consistent hashing

      // Player specific context
      playerRole: context.player.role,
      playerIsAlive: context.player.isAlive,

      // Decision context
      decisionType: context.decisionType,
      availableTargets: context.availableTargets?.sort(), // Sort for consistency

      // Persona characteristics (only stable traits)
      personaTraits: {
        traits: persona.traits.sort(), // Sort traits for consistency
        communicationStyle: persona.communicationStyle,
        riskTolerance: persona.riskTolerance,
        votingTendency: persona.votingTendency,
      },
    };

    const contextString = JSON.stringify(contextData);
    const contextHash = createHash('sha256')
      .update(contextString)
      .digest('hex')
      .substring(0, 16);

    return {
      contextHash,
      personaId: persona.id,
      decisionType: context.decisionType,
      gamePhase: context.gamePhase,
      level: 'persona-specific', // Default level
    };
  }

  /**
   * Build Redis key for cache storage
   */
  private buildRedisKey(cacheKey: CacheKey, level: CacheLevel): string {
    const prefix = this.cacheConfig.prefixKeys[level];

    switch (level) {
      case 'global':
        return `${prefix}:${cacheKey.decisionType}:${cacheKey.gamePhase}:${cacheKey.contextHash}`;
      case 'game-specific':
        return `${prefix}:${cacheKey.personaId}:${cacheKey.decisionType}:${cacheKey.contextHash}`;
      case 'persona-specific':
        return `${prefix}:${cacheKey.personaId}:${cacheKey.decisionType}:${cacheKey.gamePhase}:${cacheKey.contextHash}`;
      default:
        throw new Error(`Invalid cache level: ${level}`);
    }
  }

  /**
   * Get keys matching a pattern
   */
  private async getKeysByPattern(pattern: string): Promise<string[]> {
    try {
      // Use SCAN for better performance with large datasets
      const keys: string[] = [];
      let cursor = 0;

      do {
        const result = await this.redisService.getClient().scan(cursor, {
          MATCH: pattern,
          COUNT: 100,
        });

        cursor = result.cursor;
        keys.push(...result.keys);
      } while (cursor !== 0);

      return keys;
    } catch (error) {
      this.logger.error(`Pattern scan error: ${error.message}`);
      return [];
    }
  }

  /**
   * Update cache statistics
   */
  private updateStats(
    action: 'hit' | 'miss' | 'set' | 'invalidate',
    level: CacheLevel,
    key: string,
  ): void {
    const timestamp = new Date();

    switch (action) {
      case 'hit':
        this.stats.totalHits++;
        this.stats.levelStats[level].hits++;
        break;
      case 'miss':
        this.stats.totalMisses++;
        this.stats.levelStats[level].misses++;
        break;
      case 'set':
        this.stats.levelStats[level].keys++;
        break;
      case 'invalidate':
        // Keys count will be updated in calculateCacheSize
        break;
    }

    // Update hit rate
    const total = this.stats.totalHits + this.stats.totalMisses;
    this.stats.hitRate = total > 0 ? this.stats.totalHits / total : 0;

    // Add to recent activity (keep last 100 entries)
    this.stats.recentActivity.unshift({ timestamp, action, level, key });
    if (this.stats.recentActivity.length > 100) {
      this.stats.recentActivity = this.stats.recentActivity.slice(0, 100);
    }
  }

  /**
   * Calculate current cache size
   */
  private async calculateCacheSize(): Promise<void> {
    try {
      let totalKeys = 0;
      let totalSize = 0;

      for (const [level, prefix] of Object.entries(
        this.cacheConfig.prefixKeys,
      )) {
        const pattern = `${prefix}:*`;
        const keys = await this.getKeysByPattern(pattern);

        this.stats.levelStats[level as CacheLevel].keys = keys.length;
        totalKeys += keys.length;

        // Estimate size by sampling some keys
        const sampleSize = Math.min(keys.length, 10);
        if (sampleSize > 0) {
          const sampleKeys = keys.slice(0, sampleSize);
          let sampleTotalSize = 0;

          for (const key of sampleKeys) {
            const value = await this.redisService.get(key);
            if (value) {
              sampleTotalSize += value.length;
            }
          }

          const avgSize = sampleTotalSize / sampleSize;
          totalSize += avgSize * keys.length;
        }
      }

      this.stats.totalKeys = totalKeys;
      this.stats.cacheSize = Math.round(totalSize);
    } catch (error) {
      this.logger.error(`Cache size calculation error: ${error.message}`);
    }
  }

  /**
   * Ensure cache doesn't exceed size limit
   */
  private async ensureCacheSize(newEntrySize: number): Promise<void> {
    if (this.stats.cacheSize + newEntrySize > this.cacheConfig.maxSize) {
      this.logger.warn(`Cache size limit approaching, clearing oldest entries`);

      // Clear oldest entries from least important level first
      const levelsToClean: CacheLevel[] = [
        'global',
        'game-specific',
        'persona-specific',
      ];

      for (const level of levelsToClean) {
        if (this.stats.cacheSize + newEntrySize <= this.cacheConfig.maxSize) {
          break;
        }

        const pattern = `${this.cacheConfig.prefixKeys[level]}:*`;
        const keys = await this.getKeysByPattern(pattern);

        if (keys.length > 0) {
          const keysToDelete = keys.slice(0, Math.ceil(keys.length * 0.2)); // Delete 20%
          await this.redisService.getClient().del(keysToDelete);

          this.logger.log(
            `Cleaned ${keysToDelete.length} keys from ${level} cache level`,
          );
        }
      }

      await this.calculateCacheSize();
    }
  }

  /**
   * Initialize warmup scenarios
   */
  private initializeWarmupScenarios(): void {
    this.warmupScenarios = [
      {
        name: 'common-voting-scenarios',
        contexts: [
          { decisionType: 'vote', gamePhase: 'day_voting' },
          { decisionType: 'discussion', gamePhase: 'day_discussion' },
        ],
        priority: 'high',
        frequency: 2, // Every 2 hours
      },
      {
        name: 'night-action-scenarios',
        contexts: [
          { decisionType: 'night_action', gamePhase: 'night_actions' },
        ],
        priority: 'medium',
        frequency: 4, // Every 4 hours
      },
      {
        name: 'discussion-scenarios',
        contexts: [
          { decisionType: 'discussion', gamePhase: 'day_discussion' },
          { decisionType: 'accusation', gamePhase: 'day_discussion' },
        ],
        priority: 'low',
        frequency: 8, // Every 8 hours
      },
    ];
  }

  /**
   * Warm up a specific scenario
   */
  private async warmupScenario(scenario: WarmupScenario): Promise<void> {
    this.logger.debug(`Warming up scenario: ${scenario.name}`);

    // This is a placeholder - in a real implementation, you would
    // generate common decision contexts and pre-cache them
    // For now, we just log the activity

    for (const contextTemplate of scenario.contexts) {
      // Generate cache keys for common patterns
      const mockContext = {
        decisionType: contextTemplate.decisionType,
        gamePhase: contextTemplate.gamePhase,
        // Add more mock data as needed
      };

      this.logger.debug(
        `Warmup context prepared: ${JSON.stringify(mockContext)}`,
      );
    }
  }

  /**
   * Start background tasks
   */
  private startBackgroundTasks(): void {
    // Cache statistics update every 5 minutes
    setInterval(
      () => {
        this.calculateCacheSize();
      },
      5 * 60 * 1000,
    );

    // Setup warmup schedules
    for (const scenario of this.warmupScenarios) {
      const interval = setInterval(
        () => {
          this.warmupScenario(scenario).catch((error) => {
            this.logger.error(
              `Scheduled warmup failed for ${scenario.name}: ${error.message}`,
            );
          });
        },
        scenario.frequency * 60 * 60 * 1000,
      );

      this.warmupIntervals.set(scenario.name, interval);
    }

    this.logger.log(
      `Started cache background tasks - ${this.warmupScenarios.length} warmup schedules active`,
    );
  }

  /**
   * Reset all statistics
   */
  private resetStats(): void {
    this.stats = {
      totalHits: 0,
      totalMisses: 0,
      hitRate: 0,
      totalKeys: 0,
      cacheSize: 0,
      levelStats: {
        global: { hits: 0, misses: 0, keys: 0 },
        'game-specific': { hits: 0, misses: 0, keys: 0 },
        'persona-specific': { hits: 0, misses: 0, keys: 0 },
      },
      recentActivity: [],
    };
  }
}

/**
 * AI Cache Service Integration Example
 *
 * This file demonstrates how to use the AICacheService with the AI decision system.
 * It shows the integration points and cache management strategies.
 */

import { Injectable, Logger } from '@nestjs/common';
import { AICacheService, CacheLevel } from './ai-cache.service';
import { AIDecisionService, DecisionContext } from './ai-decision.service';
import { AIPersonaService } from './ai-persona.service';

@Injectable()
export class AICacheIntegrationExample {
  private readonly logger = new Logger(AICacheIntegrationExample.name);

  constructor(
    private readonly cacheService: AICacheService,
    private readonly decisionService: AIDecisionService,
    private readonly personaService: AIPersonaService,
  ) {}

  /**
   * Example 1: Basic cache-aware decision making
   * This shows how the AI decision service automatically uses caching
   */
  async makeOptimizedDecision(context: DecisionContext) {
    this.logger.log('Making cache-optimized AI decision');

    try {
      // The AIDecisionService.makeDecision() now automatically:
      // 1. Checks cache for existing decisions
      // 2. Returns cached result if found
      // 3. Makes new LLM call if no cache hit
      // 4. Caches the new result for future use
      const result = await this.decisionService.makeDecision(context);

      this.logger.log(
        `Decision made - Action: ${result.action}, Processing time: ${result.processingTime}ms`,
      );

      return result;
    } catch (error) {
      this.logger.error(`Decision failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Example 2: Manual cache management
   * Shows how to manually interact with the cache service
   */
  async manualCacheOperations(context: DecisionContext) {
    const persona = await this.personaService.getPersonaById(
      context.player.aiPersonaId!,
    );

    // Check cache manually
    const cachedDecision = await this.cacheService.getCachedDecision(
      context,
      persona,
    );

    if (cachedDecision) {
      this.logger.log('Found cached decision, reusing result');
      return cachedDecision;
    }

    // Make new decision
    const newDecision = await this.decisionService.makeDecision(context);

    // Manual caching with specific level
    await this.cacheService.cacheDecision(
      context,
      persona,
      newDecision,
      {
        content: 'Manual decision',
        tokensUsed: 0,
        cost: 0,
        model: 'manual',
        processingTime: newDecision.processingTime,
      },
      'global', // Cache at global level for reuse across games
    );

    return newDecision;
  }

  /**
   * Example 3: Cache invalidation on game state changes
   * Shows how to invalidate cache when game state changes
   */
  async handleGameStateChange(gameId: number, changedFields: string[]) {
    this.logger.log(
      `Game ${gameId} state changed - Fields: [${changedFields.join(', ')}]`,
    );

    // Critical fields that affect AI decisions
    const criticalFields = [
      'players',
      'alivePlayers',
      'phase',
      'dayCount',
      'currentPhase',
    ];

    const hasCriticalChanges = changedFields.some((field) =>
      criticalFields.includes(field),
    );

    if (hasCriticalChanges) {
      // Invalidate relevant cache entries
      await this.decisionService.invalidateCacheForGameStateChange(
        gameId,
        changedFields,
      );

      this.logger.log(
        `Cache invalidated for game ${gameId} due to critical state changes`,
      );
    }
  }

  /**
   * Example 4: Cache warming for new games
   * Pre-cache common decision scenarios
   */
  async warmupCacheForNewGame(gameId: number) {
    this.logger.log(`Warming up cache for new game ${gameId}`);

    try {
      // Warmup common scenarios
      await this.cacheService.warmupCache([
        {
          name: 'new-game-scenarios',
          contexts: [
            { decisionType: 'discussion', gamePhase: 'day_discussion' },
            { decisionType: 'vote', gamePhase: 'day_voting' },
            { decisionType: 'night_action', gamePhase: 'night_actions' },
          ],
          priority: 'high',
          frequency: 1,
        },
      ]);

      this.logger.log(`Cache warmed up for game ${gameId}`);
    } catch (error) {
      this.logger.error(
        `Cache warmup failed for game ${gameId}: ${error.message}`,
      );
    }
  }

  /**
   * Example 5: Cache monitoring and statistics
   * Monitor cache performance and health
   */
  async monitorCachePerformance() {
    const stats = this.cacheService.getCacheStats();

    this.logger.log(`Cache Performance Report:
      Hit Rate: ${(stats.hitRate * 100).toFixed(2)}%
      Total Keys: ${stats.totalKeys}
      Cache Size: ${(stats.cacheSize / 1024 / 1024).toFixed(2)} MB

      Level Statistics:
      - Global: ${stats.levelStats.global.hits} hits, ${stats.levelStats.global.misses} misses, ${stats.levelStats.global.keys} keys
      - Game-specific: ${stats.levelStats['game-specific'].hits} hits, ${stats.levelStats['game-specific'].misses} misses, ${stats.levelStats['game-specific'].keys} keys
      - Persona-specific: ${stats.levelStats['persona-specific'].hits} hits, ${stats.levelStats['persona-specific'].misses} misses, ${stats.levelStats['persona-specific'].keys} keys

      Recent Activity: ${stats.recentActivity.length} recent operations
    `);

    // Alert if hit rate is too low
    if (stats.hitRate < 0.3 && stats.totalHits + stats.totalMisses > 100) {
      this.logger.warn(
        'Cache hit rate is below 30%, consider reviewing cache strategy',
      );
    }

    // Alert if cache is getting too large
    const maxSizeWarning = 80 * 1024 * 1024; // 80MB
    if (stats.cacheSize > maxSizeWarning) {
      this.logger.warn('Cache size approaching limit, consider cleanup');
    }

    return stats;
  }

  /**
   * Example 6: Cache cleanup and maintenance
   * Perform cache maintenance operations
   */
  async performCacheMaintenance() {
    this.logger.log('Starting cache maintenance');

    const stats = await this.monitorCachePerformance();

    // Clear old global cache entries if cache is too large
    if (stats.cacheSize > 50 * 1024 * 1024) {
      const clearedCount = await this.cacheService.clearCache('global');
      this.logger.log(`Cleared ${clearedCount} global cache entries`);
    }

    // Warmup cache after cleanup
    await this.cacheService.warmupCache();

    this.logger.log('Cache maintenance completed');
  }

  /**
   * Example 7: Persona-specific cache invalidation
   * Invalidate cache when AI persona characteristics change
   */
  async handlePersonaUpdate(personaId: number) {
    this.logger.log(
      `AI persona ${personaId} updated, invalidating related cache`,
    );

    await this.cacheService.invalidateByPersona(personaId);

    this.logger.log(`Cache invalidated for persona ${personaId}`);
  }

  /**
   * Example 8: Game cleanup - clear game-specific cache
   * Clean up cache when a game ends
   */
  async cleanupGameCache(gameId: number) {
    this.logger.log(`Cleaning up cache for ended game ${gameId}`);

    // Invalidate all game-specific cache entries
    await this.cacheService.invalidateByGameState(gameId, ['status']);

    this.logger.log(`Cache cleaned up for game ${gameId}`);
  }
}

/**
 * Usage in Game Service or Controller:
 *
 * ```typescript
 * @Injectable()
 * export class GameService {
 *   constructor(
 *     private readonly cacheExample: AICacheIntegrationExample,
 *   ) {}
 *
 *   async playerJoined(gameId: number) {
 *     // Invalidate cache when players change
 *     await this.cacheExample.handleGameStateChange(gameId, ['players']);
 *   }
 *
 *   async phaseChanged(gameId: number, newPhase: string) {
 *     // Invalidate cache when game phase changes
 *     await this.cacheExample.handleGameStateChange(gameId, ['phase', 'currentPhase']);
 *   }
 *
 *   async gameEnded(gameId: number) {
 *     // Clean up cache when game ends
 *     await this.cacheExample.cleanupGameCache(gameId);
 *   }
 * }
 * ```
 */

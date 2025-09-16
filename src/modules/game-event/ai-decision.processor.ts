import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { Logger } from '@/libs/logger/logger.service';
import { ClsService } from 'nestjs-cls';
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
import {
  AIDecisionService,
  DecisionContext,
  DecisionResult,
} from '@/libs/ai/ai-decision.service';
import { DecisionType } from '../../entities/ai-decision.entity';

interface AIDecisionJobData {
  gameId: number;
  playerId: number;
  decisionType: DecisionType;
  gamePhase: string;
  availableTargets?: string[];
  gameState?: Record<string, any>;
  timeLimit?: number;
  requestContext?: string;
}

interface BatchAIDecisionJobData {
  decisions: AIDecisionJobData[];
  requestContext?: string;
}

@Processor('ai-decisions')
@Injectable()
export class AIDecisionProcessor extends WorkerHost {
  constructor(
    @Inject(AI_DECISION_REPOSITORY_TOKEN)
    private readonly aiDecisionRepository: IAIDecisionRepository,
    @Inject(GAME_EVENT_REPOSITORY_TOKEN)
    private readonly gameEventRepository: IGameEventRepository,
    @Inject(GAME_REPOSITORY_TOKEN)
    private readonly gameRepository: IGameRepository,
    @Inject(PLAYER_REPOSITORY_TOKEN)
    private readonly playerRepository: IPlayerRepository,
    private readonly aiDecisionService: AIDecisionService,
    private readonly logger: Logger,
    private readonly cls: ClsService,
  ) {
    super();
    this.logger.setContext(AIDecisionProcessor.name);
  }

  async process(
    job: Job<AIDecisionJobData | BatchAIDecisionJobData, any, string>,
  ): Promise<void> {
    const { requestContext } = job.data;

    return this.cls.run(async () => {
      if (requestContext) {
        this.cls.set('request-context', requestContext);
      }

      this.logger.log(`Processing AI decision job: ${job.id} - ${job.name}`);

      try {
        if (job.name === 'make-decision') {
          await this.processSingleDecision(job.data as AIDecisionJobData);
        } else if (job.name === 'batch-decisions') {
          await this.processBatchDecisions(job.data as BatchAIDecisionJobData);
        } else {
          throw new Error(`Unknown job type: ${job.name}`);
        }

        this.logger.log(`AI decision job completed: ${job.id}`);
      } catch (error) {
        this.logger.error(
          error,
          `Failed to process AI decision job ${job.id}:`,
        );
        throw error; // Re-throw to mark job as failed
      }
    });
  }

  private async processSingleDecision(
    jobData: AIDecisionJobData,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Load game and player data
      const context = await this.buildDecisionContext(jobData);

      // Make AI decision
      const result = await this.aiDecisionService.makeDecision(context);

      // Log successful decision event
      await this.logDecisionEvent(jobData.gameId, 'ai-decision-completed', {
        playerId: jobData.playerId,
        decisionType: jobData.decisionType,
        action: result.action,
        target: result.target,
        confidence: result.confidence,
        processingTime: result.processingTime,
        wasSuccessful: true,
      });

      this.logger.log(
        `AI decision completed for player ${jobData.playerId}: ${result.action} (confidence: ${result.confidence})`,
      );
    } catch (error) {
      const processingTime = Date.now() - startTime;

      // Create fallback decision record
      await this.createFallbackDecision(jobData, error.message, processingTime);

      // Log failed decision event
      await this.logDecisionEvent(jobData.gameId, 'ai-decision-failed', {
        playerId: jobData.playerId,
        decisionType: jobData.decisionType,
        error: error.message,
        processingTime,
        wasSuccessful: false,
      });

      this.logger.error(
        error,
        `AI decision failed for player ${jobData.playerId}`,
      );

      // Don't re-throw here - we've handled the error gracefully
    }
  }

  private async processBatchDecisions(
    jobData: BatchAIDecisionJobData,
  ): Promise<void> {
    this.logger.log(
      `Processing batch of ${jobData.decisions.length} AI decisions`,
    );

    const results: Array<{ success: boolean; error?: string }> = [];

    for (const decisionData of jobData.decisions) {
      try {
        await this.processSingleDecision(decisionData);
        results.push({ success: true });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }

    // Log batch completion event
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;

    await this.logDecisionEvent(
      jobData.decisions[0]?.gameId || 0,
      'ai-batch-decisions-completed',
      {
        totalDecisions: results.length,
        successfulDecisions: successCount,
        failedDecisions: failureCount,
        successRate: successCount / results.length,
      },
    );

    this.logger.log(
      `Batch AI decisions completed: ${successCount}/${results.length} successful`,
    );
  }

  private async buildDecisionContext(
    jobData: AIDecisionJobData,
  ): Promise<DecisionContext> {
    // Load game with relations
    const game = await this.gameRepository.findByIdWithRelations(
      jobData.gameId,
      {
        players: true,
        messages: true,
      },
    );

    if (!game) {
      throw new Error(`Game ${jobData.gameId} not found`);
    }

    // Find the AI player
    const player = game.players.find((p) => p.id === jobData.playerId);
    if (!player) {
      throw new Error(
        `Player ${jobData.playerId} not found in game ${jobData.gameId}`,
      );
    }

    if (!player.isAi) {
      throw new Error(`Player ${jobData.playerId} is not an AI player`);
    }

    // Build context
    const context: DecisionContext = {
      game,
      player,
      decisionType: jobData.decisionType,
      gamePhase: jobData.gamePhase,
      availableTargets: jobData.availableTargets,
      gameState: jobData.gameState,
      timeLimit: jobData.timeLimit,
    };

    return context;
  }

  private async createFallbackDecision(
    jobData: AIDecisionJobData,
    errorMessage: string,
    processingTime: number,
  ): Promise<void> {
    try {
      const fallbackAction = this.getFallbackAction(jobData.decisionType);

      const decision = this.aiDecisionRepository.create({
        playerId: jobData.playerId,
        gameId: jobData.gameId,
        decisionType: jobData.decisionType,
        decisionData: {
          action: fallbackAction,
          reasoning: `Fallback decision due to error: ${errorMessage}`,
          alternatives: [],
          error: errorMessage,
        },
        processingTime,
        confidence: 1, // Low confidence for fallback
        gamePhase: jobData.gamePhase,
        wasSuccessful: false,
        outcome: {
          isFallback: true,
          error: errorMessage,
        },
      });

      await this.aiDecisionRepository.save(decision);

      this.logger.log(
        `Created fallback decision for player ${jobData.playerId}: ${fallbackAction}`,
      );
    } catch (fallbackError) {
      this.logger.error(fallbackError, 'Failed to create fallback decision');
    }
  }

  private async logDecisionEvent(
    gameId: number,
    eventType: string,
    eventData: Record<string, any>,
  ): Promise<void> {
    try {
      const gameEvent = this.gameEventRepository.create({
        gameId,
        eventType,
        eventData,
      });

      await this.gameEventRepository.save(gameEvent);
    } catch (error) {
      this.logger.error(error, 'Failed to log decision event');
      // Don't throw here - logging failure shouldn't break the main process
    }
  }

  private getFallbackAction(decisionType: DecisionType): string {
    const fallbackMap = {
      vote: 'abstain',
      night_action: 'skip',
      discussion: 'observe',
      accusation: 'dismiss',
    };
    return fallbackMap[decisionType] || 'abstain';
  }

  private validateJobData(jobData: AIDecisionJobData): void {
    if (!jobData.gameId || jobData.gameId <= 0) {
      throw new Error('Invalid gameId');
    }

    if (!jobData.playerId || jobData.playerId <= 0) {
      throw new Error('Invalid playerId');
    }

    if (!jobData.decisionType) {
      throw new Error('Decision type is required');
    }

    const validDecisionTypes: DecisionType[] = [
      'vote',
      'night_action',
      'discussion',
      'accusation',
    ];

    if (!validDecisionTypes.includes(jobData.decisionType)) {
      throw new Error(`Invalid decision type: ${jobData.decisionType}`);
    }

    if (!jobData.gamePhase) {
      throw new Error('Game phase is required');
    }

    if (
      jobData.timeLimit &&
      (jobData.timeLimit <= 0 || jobData.timeLimit > 300000)
    ) {
      throw new Error('Time limit must be between 1ms and 5 minutes');
    }
  }

  private shouldRetryJob(error: Error): boolean {
    // Retry for transient errors, not for validation or business logic errors
    const retryableErrors = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'Database connection',
      'Redis connection',
      'LLM service unavailable',
    ];

    return retryableErrors.some((retryableError) =>
      error.message.includes(retryableError),
    );
  }
}

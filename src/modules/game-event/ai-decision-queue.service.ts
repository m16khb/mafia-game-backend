import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { DecisionType } from '../../entities/ai-decision.entity';

export interface AIDecisionJobData {
  gameId: number;
  playerId: number;
  decisionType: DecisionType;
  gamePhase: string;
  availableTargets?: string[];
  gameState?: Record<string, any>;
  timeLimit?: number;
  requestContext?: string;
}

export interface BatchAIDecisionJobData {
  decisions: AIDecisionJobData[];
  requestContext?: string;
}

@Injectable()
export class AIDecisionQueueService {
  constructor(
    @InjectQueue('ai-decisions')
    private readonly aiDecisionQueue: Queue,
    private readonly cls: ClsService,
  ) {}

  async addAIDecisionJob(
    gameId: number,
    playerId: number,
    decisionType: DecisionType,
    gamePhase: string,
    options?: {
      availableTargets?: string[];
      gameState?: Record<string, any>;
      timeLimit?: number;
      priority?: number;
      delay?: number;
    },
  ): Promise<void> {
    try {
      const requestContext = this.cls.get('request-context');

      const jobData: AIDecisionJobData = {
        gameId,
        playerId,
        decisionType,
        gamePhase,
        availableTargets: options?.availableTargets,
        gameState: options?.gameState,
        timeLimit: options?.timeLimit,
        requestContext,
      };

      await this.aiDecisionQueue.add('make-decision', jobData, {
        priority: options?.priority || 0,
        delay: options?.delay || 0,
        removeOnComplete: 10, // Keep last 10 completed jobs
        removeOnFail: 5, // Keep last 5 failed jobs
        attempts: 3, // Retry up to 3 times
        backoff: {
          type: 'exponential',
          delay: 2000, // Start with 2 second delay
        },
      });
    } catch (error) {
      console.error(`Failed to add AI decision job: ${error.message}`);
      throw error;
    }
  }

  async addBatchAIDecisionJobs(
    decisions: Array<{
      gameId: number;
      playerId: number;
      decisionType: DecisionType;
      gamePhase: string;
      availableTargets?: string[];
      gameState?: Record<string, any>;
      timeLimit?: number;
    }>,
    options?: {
      priority?: number;
      delay?: number;
    },
  ): Promise<void> {
    try {
      const requestContext = this.cls.get('request-context');

      const batchData: BatchAIDecisionJobData = {
        decisions: decisions.map((decision) => ({
          ...decision,
          requestContext,
        })),
        requestContext,
      };

      await this.aiDecisionQueue.add('batch-decisions', batchData, {
        priority: options?.priority || 0,
        delay: options?.delay || 0,
        removeOnComplete: 5,
        removeOnFail: 3,
        attempts: 2, // Fewer retries for batch jobs
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
      });
    } catch (error) {
      console.error(`Failed to add batch AI decision jobs: ${error.message}`);
      throw error;
    }
  }

  async addDelayedDecision(
    gameId: number,
    playerId: number,
    decisionType: DecisionType,
    gamePhase: string,
    delayMs: number,
    options?: {
      availableTargets?: string[];
      gameState?: Record<string, any>;
      timeLimit?: number;
      priority?: number;
    },
  ): Promise<void> {
    return this.addAIDecisionJob(gameId, playerId, decisionType, gamePhase, {
      ...options,
      delay: delayMs,
    });
  }

  async addUrgentDecision(
    gameId: number,
    playerId: number,
    decisionType: DecisionType,
    gamePhase: string,
    options?: {
      availableTargets?: string[];
      gameState?: Record<string, any>;
      timeLimit?: number;
    },
  ): Promise<void> {
    return this.addAIDecisionJob(gameId, playerId, decisionType, gamePhase, {
      ...options,
      priority: 10, // High priority
    });
  }

  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.aiDecisionQueue.getWaiting(),
        this.aiDecisionQueue.getActive(),
        this.aiDecisionQueue.getCompleted(),
        this.aiDecisionQueue.getFailed(),
        this.aiDecisionQueue.getDelayed(),
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
      };
    } catch (error) {
      console.error(`Failed to get queue stats: ${error.message}`);
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      };
    }
  }

  async clearQueue(): Promise<void> {
    try {
      await this.aiDecisionQueue.obliterate({ force: true });
    } catch (error) {
      console.error(`Failed to clear AI decision queue: ${error.message}`);
      throw error;
    }
  }

  async pauseQueue(): Promise<void> {
    try {
      await this.aiDecisionQueue.pause();
    } catch (error) {
      console.error(`Failed to pause AI decision queue: ${error.message}`);
      throw error;
    }
  }

  async resumeQueue(): Promise<void> {
    try {
      await this.aiDecisionQueue.resume();
    } catch (error) {
      console.error(`Failed to resume AI decision queue: ${error.message}`);
      throw error;
    }
  }
}

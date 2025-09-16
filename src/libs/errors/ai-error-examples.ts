/**
 * AI Error Integration Examples
 *
 * This file demonstrates how to use the AI error classes in practice
 * with the existing AI services in the mafia game backend.
 */

import { Logger } from '@nestjs/common';
import {
  LLMTimeoutError,
  LLMRateLimitError,
  LLMBudgetExceededError,
  LLMInvalidResponseError,
  PersonaNotFoundError,
  DecisionTimeoutError,
  InvalidDecisionError,
  ChatGenerationError,
  AIMemoryExhaustionError,
  VotingStrategyError,
  AIConfigError,
  AIErrorUtils,
} from './ai-errors';

/**
 * Example: LLM Service Error Handling
 */
export class LLMServiceErrorHandlingExample {
  private readonly logger = new Logger(LLMServiceErrorHandlingExample.name);

  async generateResponseWithErrorHandling(
    prompt: string,
    playerId: number,
    gameId: number,
  ): Promise<string> {
    const startTime = Date.now();
    let attempt = 0;
    let lastError: Error;

    while (attempt < 3) {
      try {
        // Simulate LLM service call
        const response = await this.callLLMService(prompt);
        return response;
      } catch (error) {
        lastError = error;

        // Log error details
        const errorSummary = AIErrorUtils.summarizeForLogging(error);
        this.logger.error('LLM service error', {
          ...errorSummary,
          playerId,
          gameId,
          attempt: attempt + 1,
          promptLength: prompt.length,
        });

        // Handle specific error types
        if (error instanceof LLMBudgetExceededError) {
          // Budget exceeded - no point in retrying
          this.logger.error(`Daily budget exceeded: $${error.context?.dailySpent}`, {
            playerId,
            gameId,
          });
          throw error;
        }

        if (error instanceof LLMRateLimitError) {
          // Rate limit - wait and retry
          const delay = Math.min(5000, (error.context?.resetTime as number || Date.now()) - Date.now());
          this.logger.warn(`Rate limit hit, waiting ${delay}ms`, { playerId, gameId });
          await this.sleep(delay);
        } else if (AIErrorUtils.isRetryable(error)) {
          // Other retryable errors - exponential backoff
          const delay = AIErrorUtils.calculateRetryDelay(error, attempt);
          this.logger.warn(`Retryable error, waiting ${delay}ms`, { playerId, gameId });
          await this.sleep(delay);
        } else {
          // Non-retryable error
          throw error;
        }

        attempt++;
      }
    }

    throw lastError!;
  }

  private async callLLMService(prompt: string): Promise<string> {
    // Simulate various error conditions
    const random = Math.random();

    if (random < 0.1) {
      throw new LLMTimeoutError('Request timeout', 30000, 'req_' + Date.now());
    } else if (random < 0.2) {
      throw new LLMRateLimitError('Rate limit exceeded', Date.now() + 60000, 0);
    } else if (random < 0.25) {
      throw new LLMBudgetExceededError(9.75, 10.0, 0.5);
    } else if (random < 0.3) {
      throw new LLMInvalidResponseError('Malformed JSON response', 'json', '{ invalid', 2.5);
    }

    return 'Valid response from LLM';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Example: AI Persona Service Error Handling
 */
export class PersonaServiceErrorHandlingExample {
  private readonly logger = new Logger(PersonaServiceErrorHandlingExample.name);

  async assignPersonaWithValidation(
    playerId: number,
    gameId: number,
    requestedPersonaId?: string,
  ): Promise<string> {
    try {
      // Validate persona exists
      if (requestedPersonaId) {
        const persona = this.getPersonaById(requestedPersonaId);
        if (!persona) {
          throw new PersonaNotFoundError(requestedPersonaId, playerId);
        }
      }

      // Assign persona
      const assignedPersonaId = await this.performPersonaAssignment(playerId, requestedPersonaId);

      this.logger.log(`Successfully assigned persona '${assignedPersonaId}' to player ${playerId}`);
      return assignedPersonaId;

    } catch (error) {
      if (error instanceof PersonaNotFoundError) {
        // Fallback to random persona
        this.logger.warn(`Persona '${error.context?.personaId}' not found, using random assignment`, {
          playerId,
          gameId,
        });
        return this.performPersonaAssignment(playerId);
      }

      throw error;
    }
  }

  private getPersonaById(personaId: string): any {
    // Simulate persona lookup
    return personaId === 'invalid' ? null : { id: personaId, name: 'Test Persona' };
  }

  private async performPersonaAssignment(playerId: number, personaId?: string): Promise<string> {
    // Simulate persona assignment
    return personaId || 'detective-holmes';
  }
}

/**
 * Example: AI Decision Service Error Handling
 */
export class DecisionServiceErrorHandlingExample {
  private readonly logger = new Logger(DecisionServiceErrorHandlingExample.name);

  async makeDecisionWithTimeout(
    playerId: number,
    gameId: number,
    phase: string,
    timeoutMs: number = 30000,
  ): Promise<{ action: string; target?: string; confidence: number }> {
    const startTime = Date.now();

    try {
      // Set up timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new DecisionTimeoutError(playerId, gameId, phase, timeoutMs));
        }, timeoutMs);
      });

      // Make decision with race against timeout
      const decisionPromise = this.generateDecision(playerId, gameId, phase);

      const decision = await Promise.race([decisionPromise, timeoutPromise]);

      // Validate decision
      if (!this.isValidDecision(decision, phase)) {
        throw new InvalidDecisionError(
          playerId,
          gameId,
          phase,
          decision.action,
          'Action not allowed in current phase',
        );
      }

      const duration = Date.now() - startTime;
      this.logger.log(`Decision completed in ${duration}ms`, {
        playerId,
        gameId,
        phase,
        action: decision.action,
        confidence: decision.confidence,
      });

      return decision;

    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof DecisionTimeoutError) {
        this.logger.error(`Decision timeout after ${duration}ms`, {
          playerId,
          gameId,
          phase,
          timeoutMs,
        });

        // Return default decision
        return { action: 'abstain', confidence: 1 };
      }

      if (error instanceof InvalidDecisionError) {
        this.logger.error('Invalid decision made', {
          playerId,
          gameId,
          phase,
          action: error.context?.action,
        });

        // Return safe default decision
        return { action: 'abstain', confidence: 1 };
      }

      throw error;
    }
  }

  private async generateDecision(
    playerId: number,
    gameId: number,
    phase: string,
  ): Promise<{ action: string; target?: string; confidence: number }> {
    // Simulate AI decision making
    await new Promise(resolve => setTimeout(resolve, Math.random() * 20000)); // 0-20s

    return {
      action: 'vote',
      target: 'player_123',
      confidence: 7,
    };
  }

  private isValidDecision(
    decision: { action: string; target?: string; confidence: number },
    phase: string,
  ): boolean {
    // Simulate decision validation
    if (phase === 'night' && decision.action === 'vote') {
      return false; // Can't vote at night
    }
    return true;
  }
}

/**
 * Example: Comprehensive Error Logging and Monitoring
 */
export class AIErrorMonitoringExample {
  private readonly logger = new Logger(AIErrorMonitoringExample.name);
  private errorCounts = new Map<string, number>();
  private totalCosts = 0;

  async processAIOperation<T>(
    operation: string,
    playerId: number,
    gameId: number,
    task: () => Promise<T>,
  ): Promise<T> {
    const startTime = Date.now();

    try {
      const result = await task();

      this.logger.log(`AI operation '${operation}' succeeded`, {
        playerId,
        gameId,
        duration: Date.now() - startTime,
      });

      return result;

    } catch (error) {
      // Track error metrics
      this.trackError(error);

      // Create comprehensive error log
      const errorSummary = AIErrorUtils.summarizeForLogging(error);
      const cost = AIErrorUtils.getCost(error);

      this.logger.error(`AI operation '${operation}' failed`, {
        ...errorSummary,
        playerId,
        gameId,
        duration: Date.now() - startTime,
        totalCost: this.totalCosts,
      });

      // Handle critical errors
      if (errorSummary.severity === 'critical') {
        this.logger.fatal('Critical AI error detected', {
          operation,
          playerId,
          gameId,
          error: errorSummary,
        });

        // Notify monitoring systems
        await this.notifyMonitoring(error, { operation, playerId, gameId });
      }

      // Re-throw for upstream handling
      throw error;
    }
  }

  private trackError(error: Error): void {
    const errorType = error.constructor.name;
    const count = this.errorCounts.get(errorType) || 0;
    this.errorCounts.set(errorType, count + 1);

    const cost = AIErrorUtils.getCost(error);
    this.totalCosts += cost;
  }

  private async notifyMonitoring(
    error: Error,
    context: { operation: string; playerId: number; gameId: number },
  ): Promise<void> {
    // Simulate notification to monitoring system (Sentry, DataDog, etc.)
    this.logger.warn('Monitoring notification sent', { error: error.message, context });
  }

  getErrorStats(): {
    errorCounts: Record<string, number>;
    totalCosts: number;
    mostCommonErrors: Array<{ type: string; count: number }>;
  } {
    const errorCounts = Object.fromEntries(this.errorCounts);
    const mostCommonErrors = Array.from(this.errorCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));

    return {
      errorCounts,
      totalCosts: this.totalCosts,
      mostCommonErrors,
    };
  }
}

/**
 * Example: Configuration Validation
 */
export class AIConfigValidationExample {
  private readonly logger = new Logger(AIConfigValidationExample.name);

  validateAIConfiguration(config: Record<string, any>): void {
    const requiredKeys = [
      'OPENROUTER_API_KEY',
      'AI_DECISION_TIMEOUT',
      'AI_CONCURRENT_LIMIT',
      'OPENROUTER_DAILY_LIMIT',
    ];

    const validationErrors: string[] = [];

    for (const key of requiredKeys) {
      if (!(key in config)) {
        validationErrors.push(`Missing required configuration: ${key}`);
      }
    }

    // Type validations
    if (config.AI_DECISION_TIMEOUT && typeof config.AI_DECISION_TIMEOUT !== 'number') {
      validationErrors.push(`AI_DECISION_TIMEOUT must be a number, got ${typeof config.AI_DECISION_TIMEOUT}`);
    }

    if (config.AI_CONCURRENT_LIMIT && (!Number.isInteger(config.AI_CONCURRENT_LIMIT) || config.AI_CONCURRENT_LIMIT < 1)) {
      validationErrors.push(`AI_CONCURRENT_LIMIT must be a positive integer, got ${config.AI_CONCURRENT_LIMIT}`);
    }

    if (config.OPENROUTER_DAILY_LIMIT && (typeof config.OPENROUTER_DAILY_LIMIT !== 'number' || config.OPENROUTER_DAILY_LIMIT <= 0)) {
      validationErrors.push(`OPENROUTER_DAILY_LIMIT must be a positive number, got ${config.OPENROUTER_DAILY_LIMIT}`);
    }

    // API key validation
    if (config.OPENROUTER_API_KEY && (
      typeof config.OPENROUTER_API_KEY !== 'string' ||
      config.OPENROUTER_API_KEY.includes('your_') ||
      config.OPENROUTER_API_KEY.length < 10
    )) {
      validationErrors.push('OPENROUTER_API_KEY appears to be invalid or placeholder');
    }

    if (validationErrors.length > 0) {
      throw new AIConfigError(
        'AI configuration validation failed',
        validationErrors[0], // Show first error as primary
        'valid configuration',
        config,
      );
    }

    this.logger.log('AI configuration validation passed');
  }
}

/**
 * Usage Examples in Service Methods
 */
export class AIServiceIntegrationExample {
  private readonly errorMonitoring = new AIErrorMonitoringExample();
  private readonly logger = new Logger(AIServiceIntegrationExample.name);

  async generateAIChatMessage(
    playerId: number,
    gameId: number,
    phase: string,
    context: string,
  ): Promise<string> {
    return this.errorMonitoring.processAIOperation(
      'generate_chat_message',
      playerId,
      gameId,
      async () => {
        try {
          // Check memory usage
          const memoryUsage = process.memoryUsage();
          const memoryMB = memoryUsage.heapUsed / 1024 / 1024;
          const maxMemoryMB = 512; // 512MB limit

          if (memoryMB > maxMemoryMB) {
            throw new AIMemoryExhaustionError(memoryMB, maxMemoryMB, 'chat_generation');
          }

          // Generate chat message
          const message = await this.callLLMForChatGeneration(context);

          // Validate message content
          if (!message || message.trim().length < 5) {
            throw new ChatGenerationError(
              playerId,
              gameId,
              phase,
              'Generated message too short or empty',
              0.25, // Cost of failed generation
            );
          }

          return message;

        } catch (error) {
          // Convert generic errors to specific AI errors
          if (error instanceof Error && error.message.includes('timeout')) {
            throw new ChatGenerationError(
              playerId,
              gameId,
              phase,
              `Chat generation timeout: ${error.message}`,
              0.5,
            );
          }

          throw error;
        }
      },
    );
  }

  async makeVotingDecision(
    playerId: number,
    gameId: number,
    availableTargets: number[],
  ): Promise<{ targetId: number; confidence: number }> {
    return this.errorMonitoring.processAIOperation(
      'voting_decision',
      playerId,
      gameId,
      async () => {
        if (availableTargets.length === 0) {
          throw new VotingStrategyError(
            playerId,
            gameId,
            'No valid voting targets available',
          );
        }

        try {
          const decision = await this.calculateVotingStrategy(playerId, availableTargets);
          return decision;
        } catch (error) {
          if (error instanceof Error && error.message.includes('strategy')) {
            throw new VotingStrategyError(playerId, gameId, error.message);
          }
          throw error;
        }
      },
    );
  }

  private async callLLMForChatGeneration(context: string): Promise<string> {
    // Simulate LLM call
    await new Promise(resolve => setTimeout(resolve, 1000));
    return `Generated response based on: ${context.slice(0, 50)}...`;
  }

  private async calculateVotingStrategy(
    playerId: number,
    availableTargets: number[],
  ): Promise<{ targetId: number; confidence: number }> {
    // Simulate voting strategy calculation
    await new Promise(resolve => setTimeout(resolve, 500));
    return {
      targetId: availableTargets[Math.floor(Math.random() * availableTargets.length)],
      confidence: Math.floor(Math.random() * 10) + 1,
    };
  }
}
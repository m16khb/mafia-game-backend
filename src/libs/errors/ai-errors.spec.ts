import {
  AIError,
  LLMServiceError,
  LLMConnectionError,
  LLMAuthenticationError,
  LLMRateLimitError,
  LLMTimeoutError,
  LLMInvalidResponseError,
  LLMBudgetExceededError,
  LLMInsufficientCreditsError,
  LLMQueueFullError,
  LLMModelNotAvailableError,
  PersonaNotFoundError,
  PersonaAssignmentError,
  PersonaConflictError,
  PersonaInvalidConfigError,
  InsufficientPersonasError,
  DecisionTimeoutError,
  InvalidDecisionError,
  DecisionContextError,
  IllegalGameActionError,
  ChatGenerationError,
  ChatFilterError,
  ChatTimingError,
  AIMemoryExhaustionError,
  AIConcurrencyLimitError,
  AIStorageError,
  VotingStrategyError,
  SuspicionTrackingError,
  RoleSpecificError,
  AIConfigError,
  AIInitializationError,
  AIServiceUnavailableError,
  AIMetricsError,
  AIPerformanceError,
  AIErrorUtils,
} from './ai-errors';

describe('AI Error Classes', () => {
  describe('AIError Base Class', () => {
    class TestAIError extends AIError {
      constructor(message: string, isRetryable: boolean = false, cost: number = 0) {
        super(message, 'TEST_ERROR', isRetryable, cost, { test: true });
      }
    }

    it('should create AI error with proper inheritance', () => {
      const error = new TestAIError('Test error message', true, 5.0);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TestAIError);
      expect(error.message).toBe('Test error message');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.isRetryable).toBe(true);
      expect(error.cost).toBe(5.0);
      expect(error.context).toEqual({ test: true });
    });

    it('should set proper error name', () => {
      const error = new TestAIError('Test error');
      expect(error.name).toBe('TestAIError');
    });
  });

  describe('LLM Service Errors', () => {
    it('should create LLMConnectionError with proper properties', () => {
      const error = new LLMConnectionError('Connection failed', 'https://api.openrouter.ai', 30000);

      expect(error.message).toBe('Connection failed');
      expect(error.code).toBe('LLM_CONNECTION_ERROR');
      expect(error.isRetryable).toBe(true);
      expect(error.cost).toBe(0);
      expect(error.context).toEqual({
        endpoint: 'https://api.openrouter.ai',
        timeout: 30000,
      });
    });

    it('should create LLMAuthenticationError as non-retryable', () => {
      const error = new LLMAuthenticationError('Invalid API key', true);

      expect(error.code).toBe('LLM_AUTH_ERROR');
      expect(error.isRetryable).toBe(false);
      expect(error.context).toEqual({ apiKeyPresent: true });
    });

    it('should create LLMRateLimitError as retryable', () => {
      const resetTime = Date.now() + 60000;
      const error = new LLMRateLimitError('Rate limit exceeded', resetTime, 10);

      expect(error.code).toBe('LLM_RATE_LIMIT');
      expect(error.isRetryable).toBe(true);
      expect(error.context).toEqual({
        resetTime,
        requestsRemaining: 10,
      });
    });

    it('should create LLMTimeoutError with request tracking', () => {
      const error = new LLMTimeoutError('Request timeout', 30000, 'req_123');

      expect(error.code).toBe('LLM_TIMEOUT');
      expect(error.isRetryable).toBe(true);
      expect(error.context).toEqual({
        timeoutMs: 30000,
        requestId: 'req_123',
      });
    });

    it('should create LLMInvalidResponseError with response truncation', () => {
      const longResponse = 'x'.repeat(1000);
      const error = new LLMInvalidResponseError(
        'Invalid JSON',
        'json',
        longResponse,
        2.5,
      );

      expect(error.code).toBe('LLM_INVALID_RESPONSE');
      expect(error.isRetryable).toBe(false);
      expect(error.cost).toBe(2.5);
      expect(error.context?.actualResponse).toHaveLength(500);
    });

    it('should create LLMBudgetExceededError with cost tracking', () => {
      const error = new LLMBudgetExceededError(9.75, 10.0, 0.50);

      expect(error.code).toBe('LLM_BUDGET_EXCEEDED');
      expect(error.isRetryable).toBe(false);
      expect(error.cost).toBe(0.50);
      expect(error.message).toContain('$9.7500 of $10.00');
      expect(error.context).toEqual({
        dailySpent: 9.75,
        dailyLimit: 10.0,
        requestCost: 0.50,
      });
    });

    it('should create LLMQueueFullError as retryable', () => {
      const error = new LLMQueueFullError(50, 50);

      expect(error.code).toBe('LLM_QUEUE_FULL');
      expect(error.isRetryable).toBe(true);
      expect(error.message).toContain('50/50 requests');
    });

    it('should create LLMModelNotAvailableError with alternatives', () => {
      const availableModels = ['gpt-3.5-turbo', 'claude-3-haiku'];
      const error = new LLMModelNotAvailableError('gpt-5', availableModels);

      expect(error.code).toBe('LLM_MODEL_UNAVAILABLE');
      expect(error.isRetryable).toBe(false);
      expect(error.context).toEqual({
        modelName: 'gpt-5',
        availableModels,
      });
    });
  });

  describe('AI Persona Errors', () => {
    it('should create PersonaNotFoundError', () => {
      const error = new PersonaNotFoundError('detective-holmes', 123);

      expect(error.code).toBe('PERSONA_NOT_FOUND');
      expect(error.context).toEqual({
        playerId: 123,
        personaId: 'detective-holmes',
      });
    });

    it('should create PersonaConflictError', () => {
      const error = new PersonaConflictError('smooth-talker', 123, 456);

      expect(error.code).toBe('PERSONA_CONFLICT');
      expect(error.message).toContain('already assigned to player 123');
      expect(error.context).toEqual({
        playerId: 456,
        personaId: 'smooth-talker',
      });
    });

    it('should create PersonaInvalidConfigError', () => {
      const invalidFields = ['aggression', 'trust'];
      const error = new PersonaInvalidConfigError('wild-card', invalidFields);

      expect(error.code).toBe('PERSONA_INVALID_CONFIG');
      expect(error.message).toContain('aggression, trust');
    });

    it('should create InsufficientPersonasError', () => {
      const error = new InsufficientPersonasError(8, 5);

      expect(error.code).toBe('INSUFFICIENT_PERSONAS');
      expect(error.message).toContain('need 8, have 5');
    });
  });

  describe('AI Decision Errors', () => {
    it('should create DecisionTimeoutError', () => {
      const error = new DecisionTimeoutError(123, 456, 'voting', 30000);

      expect(error.code).toBe('DECISION_TIMEOUT');
      expect(error.message).toContain('player 123 in voting phase after 30000ms');
      expect(error.context).toEqual({
        playerId: 123,
        gameId: 456,
        phase: 'voting',
      });
    });

    it('should create InvalidDecisionError', () => {
      const error = new InvalidDecisionError(123, 456, 'night', 'invalid_action', 'Action not allowed');

      expect(error.code).toBe('INVALID_DECISION');
      expect(error.message).toContain("'invalid_action' for player 123 in night: Action not allowed");
    });

    it('should create DecisionContextError', () => {
      const missingContext = ['playerList', 'gameState'];
      const error = new DecisionContextError(123, 456, missingContext);

      expect(error.code).toBe('DECISION_CONTEXT_ERROR');
      expect(error.message).toContain('playerList, gameState');
    });

    it('should create IllegalGameActionError', () => {
      const error = new IllegalGameActionError(123, 456, 'vote', 'night_phase', 'Voting not allowed at night');

      expect(error.code).toBe('ILLEGAL_GAME_ACTION');
      expect(error.message).toContain("'vote' attempted by AI player 123 in state 'night_phase'");
    });
  });

  describe('AI Chat Errors', () => {
    it('should create ChatGenerationError with cost tracking', () => {
      const error = new ChatGenerationError(123, 456, 'discussion', 'Inappropriate content', 1.25);

      expect(error.code).toBe('CHAT_GENERATION_ERROR');
      expect(error.cost).toBe(1.25);
      expect(error.message).toContain('AI player 123 in discussion: Inappropriate content');
    });

    it('should create ChatFilterError', () => {
      const error = new ChatFilterError(123, 456, 'Filtered message', 'Contains profanity');

      expect(error.code).toBe('CHAT_FILTER_ERROR');
      expect(error.message).toContain('Contains profanity');
    });

    it('should create ChatTimingError', () => {
      const error = new ChatTimingError(123, 456, 'night', 'public_message');

      expect(error.code).toBe('CHAT_TIMING_ERROR');
      expect(error.message).toContain('AI player 123 in night: public_message');
    });
  });

  describe('AI Resource Errors', () => {
    it('should create AIMemoryExhaustionError', () => {
      const error = new AIMemoryExhaustionError(1024, 1000, 'persona_cache');

      expect(error.code).toBe('AI_MEMORY_EXHAUSTION');
      expect(error.message).toContain('persona_cache: 1024MB / 1000MB');
      expect(error.context).toEqual({
        resourceType: 'memory',
        currentUsage: 1024,
        maxCapacity: 1000,
      });
    });

    it('should create AIConcurrencyLimitError', () => {
      const error = new AIConcurrencyLimitError(10, 5, 'llm_requests');

      expect(error.code).toBe('AI_CONCURRENCY_LIMIT');
      expect(error.message).toContain('llm_requests: 10/5');
    });

    it('should create AIStorageError', () => {
      const error = new AIStorageError('Connection failed', 'database', 'write');

      expect(error.code).toBe('AI_STORAGE_ERROR');
      expect(error.message).toContain('database/write): Connection failed');
    });
  });

  describe('AI Strategy Errors', () => {
    it('should create VotingStrategyError', () => {
      const error = new VotingStrategyError(123, 456, 'No valid targets');

      expect(error.code).toBe('VOTING_STRATEGY_ERROR');
      expect(error.context).toEqual({
        playerId: 123,
        gameId: 456,
        strategyType: 'voting',
      });
    });

    it('should create SuspicionTrackingError', () => {
      const error = new SuspicionTrackingError(123, 456, 789, 'Invalid target');

      expect(error.code).toBe('SUSPICION_TRACKING_ERROR');
      expect(error.message).toContain('targeting player 789');
    });

    it('should create RoleSpecificError', () => {
      const error = new RoleSpecificError(123, 456, 'mafia', 'kill', 'Target is already dead');

      expect(error.code).toBe('ROLE_SPECIFIC_ERROR');
      expect(error.message).toContain('mafia AI player 123 attempting kill');
    });
  });

  describe('AI Configuration Errors', () => {
    it('should create AIConfigError', () => {
      const error = new AIConfigError('Invalid value', 'AI_TIMEOUT', 'number', 'invalid');

      expect(error.code).toBe('AI_CONFIG_ERROR');
      expect(error.message).toContain("'AI_TIMEOUT': Invalid value");
      expect(error.context).toEqual({
        configKey: 'AI_TIMEOUT',
        expectedType: 'number',
        actualValue: 'invalid',
      });
    });

    it('should create AIInitializationError', () => {
      const dependencies = ['LLMService', 'PersonaService'];
      const error = new AIInitializationError('AIModule', 'Missing dependencies', dependencies);

      expect(error.code).toBe('AI_INITIALIZATION_ERROR');
      expect(error.message).toContain("'AIModule': Missing dependencies");
      expect(error.context).toEqual({
        component: 'AIModule',
        dependencies,
      });
    });

    it('should create AIServiceUnavailableError as potentially retryable', () => {
      const error = new AIServiceUnavailableError('PersonaService', 'Database connection lost');

      expect(error.code).toBe('AI_SERVICE_UNAVAILABLE');
      expect(error.isRetryable).toBe(true);
      expect(error.message).toContain("'PersonaService' is unavailable: Database connection lost");
    });
  });

  describe('AI Monitoring Errors', () => {
    it('should create AIMetricsError', () => {
      const error = new AIMetricsError('Calculation failed', 'decision_latency', 123);

      expect(error.code).toBe('AI_METRICS_ERROR');
      expect(error.context).toEqual({
        metricName: 'decision_latency',
        gameId: 123,
      });
    });

    it('should create AIPerformanceError', () => {
      const error = new AIPerformanceError(123, 456, 'response_time', 5000, 8000);

      expect(error.code).toBe('AI_PERFORMANCE_ERROR');
      expect(error.message).toContain('response_time 8000 exceeds threshold 5000');
      expect(error.context).toEqual({
        playerId: 123,
        gameId: 456,
        metric: 'response_time',
        threshold: 5000,
        actualValue: 8000,
      });
    });
  });

  describe('AIErrorUtils', () => {
    describe('isRetryable', () => {
      it('should return true for retryable errors', () => {
        const retryableError = new LLMTimeoutError('Timeout', 30000);
        const nonRetryableError = new LLMAuthenticationError('Auth failed');

        expect(AIErrorUtils.isRetryable(retryableError)).toBe(true);
        expect(AIErrorUtils.isRetryable(nonRetryableError)).toBe(false);
      });

      it('should return false for non-AI errors', () => {
        const standardError = new Error('Standard error');
        expect(AIErrorUtils.isRetryable(standardError)).toBe(false);
      });
    });

    describe('getCost', () => {
      it('should return cost for AI errors with cost', () => {
        const costlyError = new LLMInvalidResponseError('Invalid', 'json', 'response', 2.5);
        const freeError = new PersonaNotFoundError('detective');

        expect(AIErrorUtils.getCost(costlyError)).toBe(2.5);
        expect(AIErrorUtils.getCost(freeError)).toBe(0);
      });

      it('should return 0 for non-AI errors', () => {
        const standardError = new Error('Standard error');
        expect(AIErrorUtils.getCost(standardError)).toBe(0);
      });
    });

    describe('getContext', () => {
      it('should return context for AI errors', () => {
        const error = new DecisionTimeoutError(123, 456, 'voting', 30000);
        const context = AIErrorUtils.getContext(error);

        expect(context).toEqual({
          playerId: 123,
          gameId: 456,
          phase: 'voting',
        });
      });

      it('should return undefined for non-AI errors', () => {
        const standardError = new Error('Standard error');
        expect(AIErrorUtils.getContext(standardError)).toBeUndefined();
      });
    });

    describe('Error Type Checking', () => {
      it('should correctly identify LLM errors', () => {
        const llmError = new LLMTimeoutError('Timeout', 30000);
        const personaError = new PersonaNotFoundError('detective');

        expect(AIErrorUtils.isLLMError(llmError)).toBe(true);
        expect(AIErrorUtils.isLLMError(personaError)).toBe(false);
      });

      it('should correctly identify persona errors', () => {
        const personaError = new PersonaNotFoundError('detective');
        const decisionError = new DecisionTimeoutError(123, 456, 'voting', 30000);

        expect(AIErrorUtils.isPersonaError(personaError)).toBe(true);
        expect(AIErrorUtils.isPersonaError(decisionError)).toBe(false);
      });

      it('should correctly identify decision errors', () => {
        const decisionError = new InvalidDecisionError(123, 456, 'night', 'invalid');
        const chatError = new ChatGenerationError(123, 456, 'discussion', 'Failed');

        expect(AIErrorUtils.isDecisionError(decisionError)).toBe(true);
        expect(AIErrorUtils.isDecisionError(chatError)).toBe(false);
      });

      it('should correctly identify other error types', () => {
        const chatError = new ChatGenerationError(123, 456, 'discussion', 'Failed');
        const resourceError = new AIMemoryExhaustionError(1024, 1000, 'cache');
        const strategyError = new VotingStrategyError(123, 456, 'No targets');
        const configError = new AIConfigError('Invalid', 'key');

        expect(AIErrorUtils.isChatError(chatError)).toBe(true);
        expect(AIErrorUtils.isResourceError(resourceError)).toBe(true);
        expect(AIErrorUtils.isStrategyError(strategyError)).toBe(true);
        expect(AIErrorUtils.isConfigError(configError)).toBe(true);
      });
    });

    describe('getSeverity', () => {
      it('should return critical for config and auth errors', () => {
        const configError = new AIConfigError('Invalid', 'key');
        const authError = new LLMAuthenticationError('Auth failed');

        expect(AIErrorUtils.getSeverity(configError)).toBe('critical');
        expect(AIErrorUtils.getSeverity(authError)).toBe('critical');
      });

      it('should return high for resource and budget errors', () => {
        const memoryError = new AIMemoryExhaustionError(1024, 1000, 'cache');
        const budgetError = new LLMBudgetExceededError(10, 10, 1);

        expect(AIErrorUtils.getSeverity(memoryError)).toBe('high');
        expect(AIErrorUtils.getSeverity(budgetError)).toBe('high');
      });

      it('should return medium for timeout and rate limit errors', () => {
        const timeoutError = new LLMTimeoutError('Timeout', 30000);
        const rateLimitError = new LLMRateLimitError('Rate limit');

        expect(AIErrorUtils.getSeverity(timeoutError)).toBe('medium');
        expect(AIErrorUtils.getSeverity(rateLimitError)).toBe('medium');
      });

      it('should return low for other errors', () => {
        const personaError = new PersonaNotFoundError('detective');
        expect(AIErrorUtils.getSeverity(personaError)).toBe('low');
      });
    });

    describe('calculateRetryDelay', () => {
      it('should return 0 for non-retryable errors', () => {
        const nonRetryableError = new LLMAuthenticationError('Auth failed');
        expect(AIErrorUtils.calculateRetryDelay(nonRetryableError, 1)).toBe(0);
      });

      it('should calculate exponential backoff for retryable errors', () => {
        const retryableError = new LLMTimeoutError('Timeout', 30000);

        expect(AIErrorUtils.calculateRetryDelay(retryableError, 0)).toBe(1000); // 1s
        expect(AIErrorUtils.calculateRetryDelay(retryableError, 1)).toBe(2000); // 2s
        expect(AIErrorUtils.calculateRetryDelay(retryableError, 2)).toBe(4000); // 4s
      });

      it('should use longer delays for rate limit errors', () => {
        const rateLimitError = new LLMRateLimitError('Rate limit');

        expect(AIErrorUtils.calculateRetryDelay(rateLimitError, 0)).toBe(2000); // 2s
        expect(AIErrorUtils.calculateRetryDelay(rateLimitError, 1)).toBe(4000); // 4s
      });

      it('should cap delay at maximum', () => {
        const retryableError = new LLMTimeoutError('Timeout', 30000);
        expect(AIErrorUtils.calculateRetryDelay(retryableError, 10)).toBe(30000); // 30s max
      });
    });

    describe('summarizeForLogging', () => {
      it('should create proper summary for AI errors', () => {
        const error = new DecisionTimeoutError(123, 456, 'voting', 30000);
        const summary = AIErrorUtils.summarizeForLogging(error);

        expect(summary).toEqual({
          type: 'DecisionTimeoutError',
          code: 'DECISION_TIMEOUT',
          message: error.message,
          severity: 'medium',
          retryable: false,
          cost: 0,
          context: {
            playerId: 123,
            gameId: 456,
            phase: 'voting',
          },
        });
      });

      it('should handle non-AI errors', () => {
        const error = new Error('Standard error');
        const summary = AIErrorUtils.summarizeForLogging(error);

        expect(summary).toEqual({
          type: 'Error',
          code: 'UNKNOWN_ERROR',
          message: 'Standard error',
          severity: 'low',
          retryable: false,
          cost: 0,
          context: {},
        });
      });
    });
  });
});
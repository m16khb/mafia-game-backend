import { DomainError } from './domain-error';

/**
 * AI 시스템 관련 에러의 기본 클래스
 */
export abstract class AIError extends DomainError {
  constructor(
    message: string,
    code: string,
    public readonly isRetryable: boolean = false,
    public readonly cost: number = 0,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message, code);
  }
}

/**
 * LLM 서비스 관련 에러들
 */
export class LLMServiceError extends AIError {
  constructor(
    message: string,
    cost: number = 0,
    context?: Record<string, unknown>,
    isRetryable: boolean = false,
  ) {
    super(message, 'LLM_SERVICE_ERROR', isRetryable, cost, context);
  }
}

export class LLMConnectionError extends AIError {
  constructor(
    message: string = 'Failed to connect to LLM service',
    endpoint?: string,
    timeout?: number,
  ) {
    super(
      message,
      'LLM_CONNECTION_ERROR',
      true, // Retryable
      0,
      { endpoint, timeout },
    );
  }
}

export class LLMAuthenticationError extends AIError {
  constructor(
    message: string = 'LLM service authentication failed',
    apiKeyPresent: boolean = false,
  ) {
    super(
      message,
      'LLM_AUTH_ERROR',
      false, // Not retryable - requires configuration fix
      0,
      { apiKeyPresent },
    );
  }
}

export class LLMRateLimitError extends AIError {
  constructor(
    message: string = 'LLM service rate limit exceeded',
    resetTime?: number,
    requestsRemaining?: number,
  ) {
    super(
      message,
      'LLM_RATE_LIMIT',
      true, // Retryable after delay
      0,
      { resetTime, requestsRemaining },
    );
  }
}

export class LLMTimeoutError extends AIError {
  constructor(
    message: string = 'LLM request timeout',
    timeoutMs: number,
    requestId?: string,
  ) {
    super(
      message,
      'LLM_TIMEOUT',
      true, // Retryable
      0,
      { timeoutMs, requestId },
    );
  }
}

export class LLMInvalidResponseError extends AIError {
  constructor(
    message: string = 'Invalid or malformed LLM response',
    expectedFormat?: string,
    actualResponse?: string,
    cost: number = 0,
  ) {
    super(
      message,
      'LLM_INVALID_RESPONSE',
      false, // Not retryable - likely model issue
      cost,
      { expectedFormat, actualResponse: actualResponse?.slice(0, 500) }, // Truncate for logs
    );
  }
}

export class LLMBudgetExceededError extends AIError {
  constructor(
    dailySpent: number,
    dailyLimit: number,
    requestCost: number,
  ) {
    super(
      `Daily LLM budget exceeded: $${dailySpent.toFixed(4)} of $${dailyLimit.toFixed(2)} used`,
      'LLM_BUDGET_EXCEEDED',
      false, // Not retryable until next day
      requestCost,
      { dailySpent, dailyLimit, requestCost },
    );
  }
}

export class LLMInsufficientCreditsError extends AIError {
  constructor(
    message: string = 'Insufficient OpenRouter credits',
    currentBalance?: number,
  ) {
    super(
      message,
      'LLM_INSUFFICIENT_CREDITS',
      false, // Not retryable without adding credits
      0,
      { currentBalance },
    );
  }
}

export class LLMQueueFullError extends AIError {
  constructor(
    queueSize: number,
    maxQueueSize: number,
  ) {
    super(
      `LLM request queue is full: ${queueSize}/${maxQueueSize} requests`,
      'LLM_QUEUE_FULL',
      true, // Retryable after a delay
      0,
      { queueSize, maxQueueSize },
    );
  }
}

export class LLMModelNotAvailableError extends AIError {
  constructor(
    modelName: string,
    availableModels?: string[],
  ) {
    super(
      `LLM model '${modelName}' is not available`,
      'LLM_MODEL_UNAVAILABLE',
      false, // Not retryable without changing model
      0,
      { modelName, availableModels },
    );
  }
}

/**
 * AI 페르소나 관련 에러들
 */
export class AIPersonaError extends AIError {
  constructor(
    message: string,
    code: string,
    playerId?: number,
    personaId?: string,
  ) {
    super(message, code, false, 0, { playerId, personaId });
  }
}

export class PersonaNotFoundError extends AIPersonaError {
  constructor(
    personaId: string,
    playerId?: number,
  ) {
    super(
      `AI persona '${personaId}' not found`,
      'PERSONA_NOT_FOUND',
      playerId,
      personaId,
    );
  }
}

export class PersonaAssignmentError extends AIPersonaError {
  constructor(
    message: string,
    playerId: number,
    personaId?: string,
  ) {
    super(
      `Failed to assign persona to player ${playerId}: ${message}`,
      'PERSONA_ASSIGNMENT_ERROR',
      playerId,
      personaId,
    );
  }
}

export class PersonaConflictError extends AIPersonaError {
  constructor(
    personaId: string,
    existingPlayerId: number,
    newPlayerId: number,
  ) {
    super(
      `Persona '${personaId}' is already assigned to player ${existingPlayerId}, cannot assign to player ${newPlayerId}`,
      'PERSONA_CONFLICT',
      newPlayerId,
      personaId,
    );
  }
}

export class PersonaInvalidConfigError extends AIPersonaError {
  constructor(
    personaId: string,
    invalidFields: string[],
  ) {
    super(
      `Persona '${personaId}' has invalid configuration: ${invalidFields.join(', ')}`,
      'PERSONA_INVALID_CONFIG',
      undefined,
      personaId,
    );
  }
}

export class InsufficientPersonasError extends AIPersonaError {
  constructor(
    requiredCount: number,
    availableCount: number,
  ) {
    super(
      `Insufficient personas available: need ${requiredCount}, have ${availableCount}`,
      'INSUFFICIENT_PERSONAS',
      undefined,
      undefined,
    );
  }
}

/**
 * AI 의사결정 관련 에러들
 */
export class AIDecisionError extends AIError {
  constructor(
    message: string,
    code: string,
    playerId: number,
    gameId: number,
    phase?: string,
    cost: number = 0,
  ) {
    super(message, code, false, cost, { playerId, gameId, phase });
  }
}

export class DecisionTimeoutError extends AIDecisionError {
  constructor(
    playerId: number,
    gameId: number,
    phase: string,
    timeoutMs: number,
  ) {
    super(
      `AI decision timeout for player ${playerId} in ${phase} phase after ${timeoutMs}ms`,
      'DECISION_TIMEOUT',
      playerId,
      gameId,
      phase,
    );
  }
}

export class InvalidDecisionError extends AIDecisionError {
  constructor(
    playerId: number,
    gameId: number,
    phase: string,
    decision: string,
    reason?: string,
  ) {
    super(
      `Invalid AI decision '${decision}' for player ${playerId} in ${phase}${reason ? `: ${reason}` : ''}`,
      'INVALID_DECISION',
      playerId,
      gameId,
      phase,
    );
  }
}

export class DecisionContextError extends AIDecisionError {
  constructor(
    playerId: number,
    gameId: number,
    missingContext: string[],
  ) {
    super(
      `Missing decision context for player ${playerId}: ${missingContext.join(', ')}`,
      'DECISION_CONTEXT_ERROR',
      playerId,
      gameId,
    );
  }
}

export class IllegalGameActionError extends AIDecisionError {
  constructor(
    playerId: number,
    gameId: number,
    action: string,
    gameState: string,
    reason?: string,
  ) {
    super(
      `Illegal action '${action}' attempted by AI player ${playerId} in state '${gameState}'${reason ? `: ${reason}` : ''}`,
      'ILLEGAL_GAME_ACTION',
      playerId,
      gameId,
      gameState,
    );
  }
}

/**
 * AI 채팅 및 커뮤니케이션 관련 에러들
 */
export class AIChatError extends AIError {
  constructor(
    message: string,
    code: string,
    playerId: number,
    gameId: number,
    cost: number = 0,
  ) {
    super(message, code, false, cost, { playerId, gameId });
  }
}

export class ChatGenerationError extends AIChatError {
  constructor(
    playerId: number,
    gameId: number,
    phase: string,
    reason: string,
    cost: number = 0,
  ) {
    super(
      `Failed to generate chat for AI player ${playerId} in ${phase}: ${reason}`,
      'CHAT_GENERATION_ERROR',
      playerId,
      gameId,
      cost,
    );
  }
}

export class ChatFilterError extends AIChatError {
  constructor(
    playerId: number,
    gameId: number,
    message: string,
    reason: string,
  ) {
    super(
      `Chat message blocked for AI player ${playerId}: ${reason}`,
      'CHAT_FILTER_ERROR',
      playerId,
      gameId,
    );
  }
}

export class ChatTimingError extends AIChatError {
  constructor(
    playerId: number,
    gameId: number,
    phase: string,
    attemptedAction: string,
  ) {
    super(
      `Inappropriate chat timing for AI player ${playerId} in ${phase}: ${attemptedAction}`,
      'CHAT_TIMING_ERROR',
      playerId,
      gameId,
    );
  }
}

/**
 * AI 시스템 리소스 관련 에러들
 */
export class AIResourceError extends AIError {
  constructor(
    message: string,
    code: string,
    resourceType: string,
    currentUsage?: number,
    maxCapacity?: number,
  ) {
    super(message, code, false, 0, { resourceType, currentUsage, maxCapacity });
  }
}

export class AIMemoryExhaustionError extends AIResourceError {
  constructor(
    currentMemoryMB: number,
    maxMemoryMB: number,
    component: string,
  ) {
    super(
      `AI system memory exhaustion in ${component}: ${currentMemoryMB}MB / ${maxMemoryMB}MB`,
      'AI_MEMORY_EXHAUSTION',
      'memory',
      currentMemoryMB,
      maxMemoryMB,
    );
  }
}

export class AIConcurrencyLimitError extends AIResourceError {
  constructor(
    currentRequests: number,
    maxConcurrent: number,
    operationType: string,
  ) {
    super(
      `AI concurrency limit exceeded for ${operationType}: ${currentRequests}/${maxConcurrent}`,
      'AI_CONCURRENCY_LIMIT',
      'concurrency',
      currentRequests,
      maxConcurrent,
    );
  }
}

export class AIStorageError extends AIResourceError {
  constructor(
    message: string,
    storageType: 'memory' | 'database' | 'cache',
    operation: 'read' | 'write' | 'delete',
  ) {
    super(
      `AI storage error (${storageType}/${operation}): ${message}`,
      'AI_STORAGE_ERROR',
      storageType,
    );
  }
}

/**
 * AI 전략 및 행동 관련 에러들
 */
export class AIStrategyError extends AIError {
  constructor(
    message: string,
    code: string,
    playerId: number,
    gameId: number,
    strategyType: string,
  ) {
    super(message, code, false, 0, { playerId, gameId, strategyType });
  }
}

export class VotingStrategyError extends AIStrategyError {
  constructor(
    playerId: number,
    gameId: number,
    reason: string,
  ) {
    super(
      `Voting strategy error for AI player ${playerId}: ${reason}`,
      'VOTING_STRATEGY_ERROR',
      playerId,
      gameId,
      'voting',
    );
  }
}

export class SuspicionTrackingError extends AIStrategyError {
  constructor(
    playerId: number,
    gameId: number,
    targetId: number,
    reason: string,
  ) {
    super(
      `Suspicion tracking error for AI player ${playerId} targeting player ${targetId}: ${reason}`,
      'SUSPICION_TRACKING_ERROR',
      playerId,
      gameId,
      'suspicion',
    );
  }
}

export class RoleSpecificError extends AIStrategyError {
  constructor(
    playerId: number,
    gameId: number,
    role: string,
    action: string,
    reason: string,
  ) {
    super(
      `Role-specific error for ${role} AI player ${playerId} attempting ${action}: ${reason}`,
      'ROLE_SPECIFIC_ERROR',
      playerId,
      gameId,
      'role-specific',
    );
  }
}

/**
 * AI 설정 및 초기화 관련 에러들
 */
export class AIConfigError extends AIError {
  constructor(
    message: string,
    configKey: string,
    expectedType?: string,
    actualValue?: unknown,
  ) {
    super(
      `AI configuration error for '${configKey}': ${message}`,
      'AI_CONFIG_ERROR',
      false,
      0,
      { configKey, expectedType, actualValue },
    );
  }
}

export class AIInitializationError extends AIError {
  constructor(
    component: string,
    reason: string,
    dependencies?: string[],
  ) {
    super(
      `Failed to initialize AI component '${component}': ${reason}`,
      'AI_INITIALIZATION_ERROR',
      false,
      0,
      { component, dependencies },
    );
  }
}

export class AIServiceUnavailableError extends AIError {
  constructor(
    service: string,
    reason?: string,
  ) {
    super(
      `AI service '${service}' is unavailable${reason ? `: ${reason}` : ''}`,
      'AI_SERVICE_UNAVAILABLE',
      true, // May be retryable
      0,
      { service },
    );
  }
}

/**
 * AI 모니터링 및 분석 관련 에러들
 */
export class AIMetricsError extends AIError {
  constructor(
    message: string,
    metricName: string,
    gameId?: number,
  ) {
    super(
      `AI metrics error for '${metricName}': ${message}`,
      'AI_METRICS_ERROR',
      false,
      0,
      { metricName, gameId },
    );
  }
}

export class AIPerformanceError extends AIError {
  constructor(
    playerId: number,
    gameId: number,
    metric: string,
    threshold: number,
    actualValue: number,
  ) {
    super(
      `AI performance degradation for player ${playerId}: ${metric} ${actualValue} exceeds threshold ${threshold}`,
      'AI_PERFORMANCE_ERROR',
      false,
      0,
      { playerId, gameId, metric, threshold, actualValue },
    );
  }
}

/**
 * 에러 분류 유틸리티 함수들
 */
export class AIErrorUtils {
  /**
   * 에러가 재시도 가능한지 확인
   */
  static isRetryable(error: Error): boolean {
    return error instanceof AIError && error.isRetryable;
  }

  /**
   * 에러에서 비용 정보 추출
   */
  static getCost(error: Error): number {
    return error instanceof AIError ? error.cost : 0;
  }

  /**
   * 에러 컨텍스트 정보 추출
   */
  static getContext(error: Error): Record<string, unknown> | undefined {
    return error instanceof AIError ? error.context : undefined;
  }

  /**
   * 에러가 특정 카테고리에 속하는지 확인
   */
  static isLLMError(error: Error): boolean {
    return error instanceof LLMServiceError ||
           error instanceof LLMConnectionError ||
           error instanceof LLMAuthenticationError ||
           error instanceof LLMRateLimitError ||
           error instanceof LLMTimeoutError ||
           error instanceof LLMInvalidResponseError ||
           error instanceof LLMBudgetExceededError ||
           error instanceof LLMInsufficientCreditsError ||
           error instanceof LLMQueueFullError ||
           error instanceof LLMModelNotAvailableError;
  }

  static isPersonaError(error: Error): boolean {
    return error instanceof AIPersonaError;
  }

  static isDecisionError(error: Error): boolean {
    return error instanceof AIDecisionError;
  }

  static isChatError(error: Error): boolean {
    return error instanceof AIChatError;
  }

  static isResourceError(error: Error): boolean {
    return error instanceof AIResourceError;
  }

  static isStrategyError(error: Error): boolean {
    return error instanceof AIStrategyError;
  }

  static isConfigError(error: Error): boolean {
    return error instanceof AIConfigError ||
           error instanceof AIInitializationError ||
           error instanceof AIServiceUnavailableError;
  }

  /**
   * 에러 심각도 분류
   */
  static getSeverity(error: Error): 'low' | 'medium' | 'high' | 'critical' {
    if (error instanceof AIConfigError ||
        error instanceof AIInitializationError ||
        error instanceof LLMAuthenticationError) {
      return 'critical';
    }

    if (error instanceof AIMemoryExhaustionError ||
        error instanceof LLMBudgetExceededError ||
        error instanceof LLMInsufficientCreditsError) {
      return 'high';
    }

    if (error instanceof LLMTimeoutError ||
        error instanceof DecisionTimeoutError ||
        error instanceof LLMRateLimitError) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * 재시도 대기 시간 계산 (지수 백오프)
   */
  static calculateRetryDelay(error: Error, attempt: number): number {
    if (!this.isRetryable(error)) {
      return 0;
    }

    const baseDelay = 1000; // 1초
    const maxDelay = 30000; // 30초

    if (error instanceof LLMRateLimitError) {
      // Rate limit 에러의 경우 더 긴 대기
      return Math.min(baseDelay * Math.pow(2, attempt) * 2, maxDelay * 2);
    }

    return Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  }

  /**
   * 에러 로깅을 위한 요약 정보 생성
   */
  static summarizeForLogging(error: Error): {
    type: string;
    code: string;
    message: string;
    severity: string;
    retryable: boolean;
    cost: number;
    context: Record<string, unknown>;
  } {
    const isAIError = error instanceof AIError;

    return {
      type: error.constructor.name,
      code: isAIError ? error.code : 'UNKNOWN_ERROR',
      message: error.message,
      severity: this.getSeverity(error),
      retryable: this.isRetryable(error),
      cost: this.getCost(error),
      context: this.getContext(error) || {},
    };
  }
}
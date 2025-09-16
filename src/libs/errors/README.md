# AI Error Handling System

This directory contains comprehensive error handling classes specifically designed for the AI system in the Mafia Game Backend. The error classes follow TypeScript best practices and NestJS patterns while providing detailed context for debugging, monitoring, and retry logic.

## Architecture Overview

The AI error system is built on a hierarchical structure:

```
DomainError (base)
└── AIError (AI base)
    ├── LLM Errors (OpenRouter/LLM service failures)
    ├── Persona Errors (AI personality management)
    ├── Decision Errors (AI game decision failures)
    ├── Chat Errors (AI communication issues)
    ├── Resource Errors (Memory, concurrency, storage)
    ├── Strategy Errors (Voting, suspicion tracking)
    └── Config/Monitoring Errors (Setup and metrics)
```

## Key Features

### 🔄 Retry Classification
Errors are automatically classified as retryable or non-retryable:
- **Retryable**: Timeouts, rate limits, connection issues
- **Non-retryable**: Authentication failures, invalid configurations, budget exceeded

### 💰 Cost Tracking
Failed LLM requests track associated costs for budget management and analysis.

### 📊 Comprehensive Context
Each error includes structured context data for debugging and monitoring.

### 🎯 Severity Levels
Automatic severity classification (low, medium, high, critical) for alerting systems.

### 📈 Monitoring Integration
Built-in utilities for error aggregation, logging, and monitoring system integration.

## Error Categories

### LLM Service Errors

Handle failures in OpenRouter/LLM API interactions:

```typescript
import { LLMTimeoutError, LLMRateLimitError, LLMBudgetExceededError } from '@libs/errors';

try {
  const response = await llmService.generateResponse(prompt);
} catch (error) {
  if (error instanceof LLMTimeoutError) {
    // Retry with exponential backoff
    await retry();
  } else if (error instanceof LLMRateLimitError) {
    // Wait until rate limit resets
    await waitForReset(error.context?.resetTime);
  } else if (error instanceof LLMBudgetExceededError) {
    // Stop all LLM requests until tomorrow
    await pauseLLMOperations();
  }
}
```

**Available Classes:**
- `LLMConnectionError` - Network/connection failures
- `LLMAuthenticationError` - API key issues
- `LLMRateLimitError` - Rate limiting with reset time
- `LLMTimeoutError` - Request timeouts
- `LLMInvalidResponseError` - Malformed responses
- `LLMBudgetExceededError` - Daily spending limits
- `LLMInsufficientCreditsError` - Account balance issues
- `LLMQueueFullError` - Request queue capacity
- `LLMModelNotAvailableError` - Model availability

### AI Persona Errors

Handle AI personality system failures:

```typescript
import { PersonaNotFoundError, PersonaConflictError } from '@libs/errors';

try {
  await personaService.assignPersona(playerId, 'detective-holmes');
} catch (error) {
  if (error instanceof PersonaNotFoundError) {
    // Fall back to random persona assignment
    await personaService.assignRandomPersona(playerId);
  } else if (error instanceof PersonaConflictError) {
    // Handle persona already assigned to another player
    await resolvePersonaConflict(error);
  }
}
```

**Available Classes:**
- `PersonaNotFoundError` - Persona ID not found
- `PersonaAssignmentError` - Assignment failures
- `PersonaConflictError` - Persona already assigned
- `PersonaInvalidConfigError` - Invalid persona data
- `InsufficientPersonasError` - Not enough personas available

### AI Decision Errors

Handle game decision-making failures:

```typescript
import { DecisionTimeoutError, InvalidDecisionError } from '@libs/errors';

try {
  const decision = await aiService.makeDecision(playerId, gameContext);
} catch (error) {
  if (error instanceof DecisionTimeoutError) {
    // Use default safe decision
    return { action: 'abstain', confidence: 1 };
  } else if (error instanceof InvalidDecisionError) {
    // Log invalid decision and retry with different approach
    logger.warn('Invalid AI decision', error.context);
    return await fallbackDecision(playerId);
  }
}
```

**Available Classes:**
- `DecisionTimeoutError` - Decision taking too long
- `InvalidDecisionError` - Illegal game moves
- `DecisionContextError` - Missing decision context
- `IllegalGameActionError` - Actions not allowed in current state

### Chat & Communication Errors

Handle AI chat generation failures:

```typescript
import { ChatGenerationError, ChatFilterError } from '@libs/errors';

try {
  const message = await aiService.generateChatMessage(context);
  return message;
} catch (error) {
  if (error instanceof ChatGenerationError) {
    // Track cost and use fallback message
    budgetTracker.recordFailedCost(error.cost);
    return generateFallbackMessage(context);
  } else if (error instanceof ChatFilterError) {
    // Message was filtered, try again with different approach
    return await generateSafeMessage(context);
  }
}
```

**Available Classes:**
- `ChatGenerationError` - Failed to generate chat
- `ChatFilterError` - Message blocked by filters
- `ChatTimingError` - Inappropriate timing for chat

### Resource Management Errors

Handle system resource constraints:

```typescript
import { AIMemoryExhaustionError, AIConcurrencyLimitError } from '@libs/errors';

try {
  await processAIRequest(request);
} catch (error) {
  if (error instanceof AIMemoryExhaustionError) {
    // Clear caches and retry
    await clearAICaches();
    await processAIRequest(request);
  } else if (error instanceof AIConcurrencyLimitError) {
    // Queue request for later processing
    await queueRequest(request);
  }
}
```

**Available Classes:**
- `AIMemoryExhaustionError` - Memory usage exceeded
- `AIConcurrencyLimitError` - Too many concurrent requests
- `AIStorageError` - Database/cache storage issues

## Error Utilities

The `AIErrorUtils` class provides powerful utilities for error handling:

### Error Classification

```typescript
import { AIErrorUtils } from '@libs/errors';

if (AIErrorUtils.isRetryable(error)) {
  const delay = AIErrorUtils.calculateRetryDelay(error, attemptNumber);
  await sleep(delay);
  return retry();
}

const severity = AIErrorUtils.getSeverity(error);
if (severity === 'critical') {
  await notifyOpsTeam(error);
}
```

### Cost Tracking

```typescript
const totalCost = errors
  .map(error => AIErrorUtils.getCost(error))
  .reduce((sum, cost) => sum + cost, 0);
```

### Monitoring Integration

```typescript
const errorSummary = AIErrorUtils.summarizeForLogging(error);
logger.error('AI operation failed', errorSummary);

// Send to monitoring system
monitoringSystem.recordError({
  type: errorSummary.type,
  severity: errorSummary.severity,
  cost: errorSummary.cost,
  context: errorSummary.context,
});
```

## Best Practices

### 1. Use Specific Error Types

```typescript
// ✅ Good - Specific error with context
throw new LLMTimeoutError('OpenAI request timeout', 30000, requestId);

// ❌ Bad - Generic error
throw new Error('LLM failed');
```

### 2. Include Relevant Context

```typescript
// ✅ Good - Rich context for debugging
throw new DecisionTimeoutError(playerId, gameId, 'voting_phase', 30000);

// ❌ Bad - No context
throw new Error('Decision timeout');
```

### 3. Handle Costs Properly

```typescript
// ✅ Good - Track costs even on failures
try {
  return await llmService.generate(prompt);
} catch (error) {
  const cost = AIErrorUtils.getCost(error);
  budgetTracker.recordFailedCost(cost);
  throw error;
}
```

### 4. Use Error Utilities

```typescript
// ✅ Good - Use utilities for consistent handling
const errorSummary = AIErrorUtils.summarizeForLogging(error);
logger.error('AI operation failed', errorSummary);

if (AIErrorUtils.isRetryable(error)) {
  const delay = AIErrorUtils.calculateRetryDelay(error, attempt);
  await sleep(delay);
  return retry();
}
```

### 5. Implement Graceful Degradation

```typescript
try {
  return await aiService.generateSmartResponse(context);
} catch (error) {
  if (error instanceof LLMBudgetExceededError) {
    // Fall back to rule-based response
    return generateRuleBasedResponse(context);
  }
  throw error;
}
```

## Integration Examples

See `ai-error-examples.ts` for comprehensive examples of:
- LLM service error handling with retries
- Persona assignment with fallbacks
- Decision making with timeouts
- Error monitoring and metrics
- Configuration validation

## Testing

All error classes are fully tested in `ai-errors.spec.ts`. The tests cover:
- Error inheritance and properties
- Context data handling
- Cost tracking
- Retry logic
- Error classification utilities
- Logging integration

Run tests with:
```bash
npm test -- --testPathPattern="ai-errors.spec.ts"
```

## Monitoring Integration

The error system is designed to integrate with monitoring platforms:

```typescript
// Sentry integration
Sentry.captureException(error, {
  tags: {
    severity: AIErrorUtils.getSeverity(error),
    retryable: AIErrorUtils.isRetryable(error),
    cost: AIErrorUtils.getCost(error),
  },
  extra: AIErrorUtils.getContext(error),
});

// DataDog metrics
dataDog.increment('ai.errors.total', 1, {
  error_type: error.constructor.name,
  severity: AIErrorUtils.getSeverity(error),
});
```

This comprehensive error handling system ensures robust, debuggable, and maintainable AI operations in the Mafia Game Backend.
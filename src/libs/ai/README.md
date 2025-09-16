# AI Validation Service

The AI Validation Service provides comprehensive validation for AI decisions in the mafia game, ensuring game integrity, rule compliance, and persona consistency.

## Features

### 1. AI Decision Input/Output Validation
- Validates AI decision inputs against game rules
- Checks decision consistency and logical validity
- Validates player actions against current game state

### 2. Persona Behavior Validation
- Ensures decisions match persona traits and characteristics
- Validates communication style consistency
- Checks risk tolerance alignment
- Validates voting tendencies and suspicion levels

### 3. Timing Constraints and Phase-Specific Rules
- Validates processing time constraints
- Ensures decisions are appropriate for current game phase
- Validates role-specific action permissions

### 4. Decision Quality Assessment
- Provides confidence scoring for decision quality
- Evaluates logical consistency
- Assesses strategic value
- Measures information utilization

### 5. Custom Validation Rules
- Support for custom validation rules and configuration
- Extensible validation framework
- Configurable validation parameters

## Usage

### Basic Validation

```typescript
import { AIValidationService } from '@libs/ai';

// Inject the service
constructor(private readonly aiValidationService: AIValidationService) {}

// Validate an AI decision
const validationResult = await this.aiValidationService.validateAIDecision(
  decision,
  context,
  persona,
);

if (!validationResult.isValid) {
  console.log('Validation errors:', validationResult.errors);
}

if (validationResult.warnings.length > 0) {
  console.log('Validation warnings:', validationResult.warnings);
}
```

### Custom Validation Rules

```typescript
const customRules = {
  no_immediate_revenge: { enabled: true },
  consistent_voting_pattern: { enabled: true },
  role_action_frequency: { maxPerGame: 3 },
};

const errors = await this.aiValidationService.applyCustomValidationRules(
  decision,
  context,
  customRules,
);
```

### Integrated Validation Pipeline

```typescript
import { AIValidatedDecisionService } from './ai-validation.integration.example';

// Use the integrated service for complete validation pipeline
const result = await this.aiValidatedDecisionService.makeValidatedDecision(context);

console.log('Decision:', result.decision);
console.log('Validation:', result.validation);
console.log('Auto-corrected:', result.wasAutoCorreted);
console.log('Corrections applied:', result.corrections);
```

## Validation Components

### Game Rules Validation
- Phase compatibility checking
- Action legality verification
- Target validation
- Role-specific restrictions

### Persona Behavior Validation
- Communication style consistency
- Risk tolerance alignment
- Voting tendency patterns
- Personality trait matching

### Decision Quality Metrics
- Logical consistency (0-1)
- Strategic value (0-1)
- Risk assessment (0-1)
- Information utilization (0-1)
- Overall quality score (0-1)

### Timing Validation
- Processing time limits
- Expected time ranges
- Efficiency scoring

## Configuration

Configure validation parameters through environment variables:

```env
AI_MAX_PROCESSING_TIME=30000
AI_MIN_CONFIDENCE=3
AI_MAX_DEVIATION_SCORE=0.7
AI_TRAIT_CONSISTENCY_THRESHOLD=0.6
```

## Error Handling

The service provides comprehensive error handling:

- **Validation Errors**: Critical rule violations that prevent decision execution
- **Warnings**: Non-critical issues that should be monitored
- **Recommendations**: Suggestions for improving decision quality

## Integration Points

### AI Decision Pipeline
The validation service integrates with:
- `AIDecisionService` - Core decision making
- `AIPersonaService` - Persona management
- `AIPerformanceService` - Performance tracking
- `AICacheService` - Decision caching

### Event System
Validation results emit events for monitoring:
- `ai.decision.warnings` - Decision warnings
- `ai.validation.metrics` - Validation metrics
- `ai.decision.failed` - Validation failures

## Performance Considerations

- Validation typically adds 10-50ms to decision processing
- Results are cached where appropriate
- Batch validation available for multiple decisions
- Configurable validation depth levels

## Testing

Comprehensive test suite available:

```bash
npm test src/libs/ai/ai-validation.service.spec.ts
```

## Architecture

The validation service follows the repository pattern and dependency injection:

```
AIValidationService
├── Game Rules Validator
├── Persona Behavior Validator
├── Timing Validator
├── Quality Evaluator
└── Custom Rules Engine
```

## Future Enhancements

- Machine learning-based validation improvements
- Dynamic validation thresholds based on game statistics
- Advanced persona learning from validation feedback
- Real-time validation monitoring dashboard
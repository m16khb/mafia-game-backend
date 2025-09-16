import { Injectable, Logger } from '@nestjs/common';
import { AIDecisionService, DecisionContext, DecisionResult } from './ai-decision.service';
import { AIValidationService, ValidationResult } from './ai-validation.service';
import { AIPersonaService } from './ai-persona.service';
import { AIPerformanceService } from './ai-performance.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Example integration showing how to use AIValidationService
 * in the AI decision pipeline to ensure decision quality and game integrity.
 */
@Injectable()
export class AIValidatedDecisionService {
  private readonly logger = new Logger(AIValidatedDecisionService.name);

  constructor(
    private readonly aiDecisionService: AIDecisionService,
    private readonly aiValidationService: AIValidationService,
    private readonly aiPersonaService: AIPersonaService,
    private readonly aiPerformanceService: AIPerformanceService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Make a validated AI decision with comprehensive validation pipeline
   */
  async makeValidatedDecision(context: DecisionContext): Promise<{
    decision: DecisionResult;
    validation: ValidationResult;
    wasAutoCorreted: boolean;
    corrections: string[];
  }> {
    const startTime = Date.now();
    let wasAutoCorreted = false;
    const corrections: string[] = [];

    try {
      // 1. Get AI persona for validation context
      const persona = await this.aiPersonaService.getPersonaById(
        context.player.aiPersonaId!,
      );

      // 2. Make initial AI decision
      let decision = await this.aiDecisionService.makeDecision(context);

      // 3. Validate the decision
      let validation = await this.aiValidationService.validateAIDecision(
        decision,
        context,
        persona,
      );

      // 4. Handle validation failures with auto-correction
      if (!validation.isValid) {
        this.logger.warn(
          `AI decision validation failed for player ${context.player.name}. Errors: ${validation.errors.length}`,
        );

        // Attempt auto-correction for critical errors
        const correctionResult = await this.attemptAutoCorrection(
          decision,
          context,
          persona,
          validation,
        );

        if (correctionResult.success) {
          decision = correctionResult.correctedDecision;
          validation = correctionResult.validation;
          wasAutoCorreted = true;
          corrections.push(...correctionResult.corrections);

          this.logger.log(
            `Auto-corrected AI decision for player ${context.player.name}. Corrections: [${corrections.join(', ')}]`,
          );
        } else {
          // If auto-correction fails, use fallback
          decision = this.createValidatedFallbackDecision(context, validation);
          validation = await this.aiValidationService.validateAIDecision(
            decision,
            context,
            persona,
          );
          corrections.push('Used fallback decision due to validation failure');

          this.logger.warn(
            `Used fallback decision for player ${context.player.name} due to validation failure`,
          );
        }
      }

      // 5. Handle warnings with recommendations
      if (validation.warnings.length > 0) {
        this.logger.log(
          `AI decision has warnings for player ${context.player.name}: ${validation.warnings.map(w => w.message).join('; ')}`,
        );

        // Emit warning event for monitoring
        this.eventEmitter.emit('ai.decision.warnings', {
          playerId: context.player.id,
          gameId: context.game.id,
          warnings: validation.warnings,
          recommendations: validation.recommendations,
        });
      }

      // 6. Log performance metrics
      const totalProcessingTime = Date.now() - startTime;
      await this.logValidationMetrics(
        context,
        decision,
        validation,
        totalProcessingTime,
        wasAutoCorreted,
      );

      // 7. Update persona performance based on validation results
      await this.updatePersonaPerformanceFromValidation(
        persona.id,
        validation,
        wasAutoCorreted,
      );

      return {
        decision,
        validation,
        wasAutoCorreted,
        corrections,
      };
    } catch (error) {
      this.logger.error(
        `Validated AI decision process failed for player ${context.player.id}: ${error.message}`,
        error.stack,
      );

      // Create emergency fallback decision
      const emergencyDecision = this.createEmergencyFallbackDecision(context);
      const emergencyValidation: ValidationResult = {
        isValid: false,
        errors: [
          {
            field: 'system',
            message: `Emergency fallback due to system error: ${error.message}`,
            severity: 'error',
          },
        ],
        warnings: [],
        confidenceScore: 0.1,
        qualityScore: 0.1,
        recommendations: ['Review system logs for validation errors'],
      };

      return {
        decision: emergencyDecision,
        validation: emergencyValidation,
        wasAutoCorreted: true,
        corrections: ['Emergency fallback decision'],
      };
    }
  }

  /**
   * Batch validate multiple AI decisions with consistency checking
   */
  async validateBatchDecisions(
    decisions: { decision: DecisionResult; context: DecisionContext }[],
  ): Promise<{
    validations: ValidationResult[];
    batchConsistencyScore: number;
    crossPlayerInconsistencies: string[];
    recommendations: string[];
  }> {
    const validations: ValidationResult[] = [];
    const crossPlayerInconsistencies: string[] = [];
    const recommendations: string[] = [];

    // Validate each decision individually
    for (const { decision, context } of decisions) {
      const persona = await this.aiPersonaService.getPersonaById(
        context.player.aiPersonaId!,
      );

      const validation = await this.aiValidationService.validateAIDecision(
        decision,
        context,
        persona,
      );

      validations.push(validation);
    }

    // Check for cross-player inconsistencies
    const consistencyResults = this.analyzeBatchConsistency(decisions);
    crossPlayerInconsistencies.push(...consistencyResults.inconsistencies);

    // Generate batch-level recommendations
    const batchRecommendations = this.generateBatchRecommendations(
      validations,
      consistencyResults,
    );
    recommendations.push(...batchRecommendations);

    return {
      validations,
      batchConsistencyScore: consistencyResults.overallConsistency,
      crossPlayerInconsistencies,
      recommendations,
    };
  }

  /**
   * Apply custom validation rules with configuration
   */
  async validateWithCustomRules(
    decision: DecisionResult,
    context: DecisionContext,
    customRulesConfig: Record<string, any>,
  ): Promise<ValidationResult> {
    const persona = await this.aiPersonaService.getPersonaById(
      context.player.aiPersonaId!,
    );

    // Standard validation first
    const standardValidation = await this.aiValidationService.validateAIDecision(
      decision,
      context,
      persona,
    );

    // Apply custom rules
    const customRuleErrors = await this.aiValidationService.applyCustomValidationRules(
      decision,
      context,
      customRulesConfig,
    );

    // Merge results
    const combinedValidation: ValidationResult = {
      ...standardValidation,
      errors: [...standardValidation.errors, ...customRuleErrors.filter(e => e.severity === 'error')],
      warnings: [
        ...standardValidation.warnings,
        ...customRuleErrors.filter(e => e.severity === 'warning'),
      ],
      isValid: standardValidation.isValid && !customRuleErrors.some(e => e.severity === 'error'),
    };

    return combinedValidation;
  }

  /**
   * Attempt to auto-correct validation failures
   */
  private async attemptAutoCorrection(
    decision: DecisionResult,
    context: DecisionContext,
    persona: any,
    validation: ValidationResult,
  ): Promise<{
    success: boolean;
    correctedDecision?: DecisionResult;
    validation?: ValidationResult;
    corrections: string[];
  }> {
    const corrections: string[] = [];

    // Create a copy of the decision for correction
    let correctedDecision = { ...decision };

    // 1. Fix invalid actions for game phase
    const gameRuleErrors = validation.errors.filter(e => e.field === 'gameRules');
    if (gameRuleErrors.length > 0) {
      const validActions = this.getValidActionsForPhase(context.gamePhase, context.player.role);
      if (validActions.length > 0) {
        correctedDecision.action = this.selectBestActionForPersona(validActions, persona);
        corrections.push(`Corrected invalid action to ${correctedDecision.action}`);
      }
    }

    // 2. Fix invalid targets
    const targetErrors = validation.errors.filter(e =>
      e.message.includes('Target') && e.message.includes('not in available targets')
    );
    if (targetErrors.length > 0 && context.availableTargets?.length > 0) {
      correctedDecision.target = this.selectBestTargetForPersona(
        context.availableTargets,
        persona,
        correctedDecision.action,
      );
      corrections.push(`Corrected invalid target to ${correctedDecision.target}`);
    }

    // 3. Improve low-confidence decisions with better reasoning
    if (correctedDecision.confidence < 4) {
      correctedDecision.reasoning = this.generateImprovedReasoning(
        correctedDecision.action,
        correctedDecision.target,
        context,
        persona,
      );
      correctedDecision.confidence = Math.min(correctedDecision.confidence + 2, 7);
      corrections.push('Improved reasoning and confidence');
    }

    // Re-validate the corrected decision
    if (corrections.length > 0) {
      const correctedValidation = await this.aiValidationService.validateAIDecision(
        correctedDecision,
        context,
        persona,
      );

      return {
        success: correctedValidation.isValid || correctedValidation.errors.length < validation.errors.length,
        correctedDecision,
        validation: correctedValidation,
        corrections,
      };
    }

    return { success: false, corrections: [] };
  }

  /**
   * Create a validated fallback decision when auto-correction fails
   */
  private createValidatedFallbackDecision(
    context: DecisionContext,
    validation: ValidationResult,
  ): DecisionResult {
    // Select the safest valid action for the current context
    const safeActions = this.getSafeActionsForContext(context);
    const selectedAction = safeActions[0] || 'observe';

    return {
      decision: this.aiDecisionService['decisionRepository'].create({
        playerId: context.player.id,
        gameId: context.game.id,
        decisionType: context.decisionType,
        decisionData: {
          action: selectedAction,
          reasoning: 'Safe fallback decision after validation failure',
          alternatives: [],
        },
        processingTime: 100,
        confidence: 3,
        gamePhase: context.gamePhase,
      }),
      action: selectedAction,
      reasoning: 'Safe fallback decision after validation failure',
      confidence: 3,
      processingTime: 100,
    };
  }

  /**
   * Create emergency fallback decision for system errors
   */
  private createEmergencyFallbackDecision(context: DecisionContext): DecisionResult {
    const emergencyAction = this.getEmergencyActionForDecisionType(context.decisionType);

    return {
      decision: this.aiDecisionService['decisionRepository'].create({
        playerId: context.player.id,
        gameId: context.game.id,
        decisionType: context.decisionType,
        decisionData: {
          action: emergencyAction,
          reasoning: 'Emergency system fallback',
          alternatives: [],
        },
        processingTime: 50,
        confidence: 1,
        gamePhase: context.gamePhase,
      }),
      action: emergencyAction,
      reasoning: 'Emergency system fallback',
      confidence: 1,
      processingTime: 50,
    };
  }

  /**
   * Analyze consistency across multiple decisions in a batch
   */
  private analyzeBatchConsistency(
    decisions: { decision: DecisionResult; context: DecisionContext }[],
  ): {
    overallConsistency: number;
    inconsistencies: string[];
  } {
    const inconsistencies: string[] = [];
    let consistencyScore = 1.0;

    // Check for contradictory actions (e.g., multiple players targeting the same person)
    const targetsMap = new Map<string, string[]>();
    for (const { decision, context } of decisions) {
      if (decision.target) {
        const actionTargets = targetsMap.get(decision.action) || [];
        actionTargets.push(decision.target);
        targetsMap.set(decision.action, actionTargets);
      }
    }

    // Look for potential conflicts
    for (const [action, targets] of targetsMap) {
      const uniqueTargets = new Set(targets);
      if (action === 'kill' && uniqueTargets.size < targets.length) {
        inconsistencies.push('Multiple mafia players targeting same victim');
        consistencyScore -= 0.3;
      }
      if (action === 'heal' && uniqueTargets.size < targets.length) {
        inconsistencies.push('Multiple doctors targeting same player');
        consistencyScore -= 0.2;
      }
    }

    return {
      overallConsistency: Math.max(0, consistencyScore),
      inconsistencies,
    };
  }

  /**
   * Generate recommendations for batch of decisions
   */
  private generateBatchRecommendations(
    validations: ValidationResult[],
    consistencyResults: any,
  ): string[] {
    const recommendations: string[] = [];

    const avgConfidence = validations.reduce((sum, v) => sum + v.confidenceScore, 0) / validations.length;
    const avgQuality = validations.reduce((sum, v) => sum + v.qualityScore, 0) / validations.length;

    if (avgConfidence < 0.6) {
      recommendations.push('Overall decision confidence is low - review AI prompts and persona configurations');
    }

    if (avgQuality < 0.5) {
      recommendations.push('Overall decision quality is poor - consider retraining or adjusting AI parameters');
    }

    if (consistencyResults.overallConsistency < 0.7) {
      recommendations.push('Batch decisions show inconsistencies - review coordination logic');
    }

    const errorCount = validations.reduce((sum, v) => sum + v.errors.length, 0);
    if (errorCount > validations.length * 0.5) {
      recommendations.push('High error rate detected - immediate attention required');
    }

    return recommendations;
  }

  /**
   * Log comprehensive validation metrics
   */
  private async logValidationMetrics(
    context: DecisionContext,
    decision: DecisionResult,
    validation: ValidationResult,
    totalProcessingTime: number,
    wasAutoCorreted: boolean,
  ): Promise<void> {
    const metrics = {
      gameId: context.game.id,
      playerId: context.player.id,
      decisionType: context.decisionType,
      gamePhase: context.gamePhase,
      isValid: validation.isValid,
      confidenceScore: validation.confidenceScore,
      qualityScore: validation.qualityScore,
      errorCount: validation.errors.length,
      warningCount: validation.warnings.length,
      processingTime: decision.processingTime,
      totalValidationTime: totalProcessingTime,
      wasAutoCorreted,
    };

    // Log to performance service
    this.aiPerformanceService.recordDecisionMetrics(metrics);

    // Emit metrics event for monitoring
    this.eventEmitter.emit('ai.validation.metrics', metrics);
  }

  /**
   * Update persona performance based on validation results
   */
  private async updatePersonaPerformanceFromValidation(
    personaId: number,
    validation: ValidationResult,
    wasAutoCorreted: boolean,
  ): Promise<void> {
    try {
      await this.aiPerformanceService.updatePersonaValidationStats(personaId, {
        confidenceScore: validation.confidenceScore,
        qualityScore: validation.qualityScore,
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length,
        wasAutoCorreted,
      });
    } catch (error) {
      this.logger.error(
        `Failed to update persona validation stats: ${error.message}`,
      );
    }
  }

  // Helper methods

  private getValidActionsForPhase(gamePhase: string, role: string): string[] {
    const phaseActionMap: Record<string, string[]> = {
      day_discussion: ['question', 'observe', 'accuse', 'defend'],
      day_voting: ['vote', 'abstain'],
      night_actions: role === 'mafia' ? ['kill', 'skip'] :
                    role === 'police' ? ['investigate', 'skip'] :
                    role === 'doctor' ? ['heal', 'skip'] : ['skip'],
    };

    return phaseActionMap[gamePhase] || ['observe'];
  }

  private selectBestActionForPersona(validActions: string[], persona: any): string {
    // Simple persona-based action selection
    if (persona.isAggressive() && validActions.includes('accuse')) return 'accuse';
    if (persona.isAnalytical() && validActions.includes('question')) return 'question';
    if (persona.isQuiet() && validActions.includes('observe')) return 'observe';

    return validActions[0];
  }

  private selectBestTargetForPersona(
    availableTargets: string[],
    persona: any,
    action: string,
  ): string | undefined {
    // Simple random selection - in practice, this would use more sophisticated logic
    return availableTargets[Math.floor(Math.random() * availableTargets.length)];
  }

  private generateImprovedReasoning(
    action: string,
    target: string | undefined,
    context: DecisionContext,
    persona: any,
  ): string {
    const baseReasoning = `${action} action chosen based on current game state analysis`;
    const targetReasoning = target ? ` targeting ${target}` : '';
    const phaseReasoning = ` during ${context.gamePhase} phase`;

    return `${baseReasoning}${targetReasoning}${phaseReasoning}. Decision aligns with strategic objectives.`;
  }

  private getSafeActionsForContext(context: DecisionContext): string[] {
    const safeActionMap: Record<string, string[]> = {
      day_discussion: ['observe', 'question'],
      day_voting: ['abstain'],
      night_actions: ['skip'],
    };

    return safeActionMap[context.gamePhase] || ['observe'];
  }

  private getEmergencyActionForDecisionType(decisionType: string): string {
    const emergencyActionMap: Record<string, string> = {
      vote: 'abstain',
      night_action: 'skip',
      discussion: 'observe',
      accusation: 'dismiss',
    };

    return emergencyActionMap[decisionType] || 'observe';
  }
}
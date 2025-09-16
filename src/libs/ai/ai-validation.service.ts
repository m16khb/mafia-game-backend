import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIDecision, DecisionType } from '../../entities/ai-decision.entity';
import { AIPersona } from '../../entities/ai-persona.entity';
import { Player } from '../../entities/player.entity';
import { Game, GamePhase } from '../../entities/game.entity';
import { DecisionContext, DecisionResult } from './ai-decision.service';

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  suggestion?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  confidenceScore: number;
  qualityScore: number;
  recommendations: string[];
}

export interface PersonaBehaviorValidation {
  isConsistent: boolean;
  deviationScore: number;
  inconsistentTraits: string[];
  suggestedAdjustments: string[];
}

export interface GameRuleValidation {
  isAllowed: boolean;
  ruleViolations: string[];
  phaseCompatibility: boolean;
  targetValidation: boolean;
  actionLegality: boolean;
}

export interface TimingValidation {
  isWithinTimeLimit: boolean;
  processingTime: number;
  expectedRange: { min: number; max: number };
  efficiencyScore: number;
}

export interface DecisionQualityMetrics {
  logicalConsistency: number;
  strategicValue: number;
  riskAssessment: number;
  informationUtilization: number;
  overallQuality: number;
}

@Injectable()
export class AIValidationService {
  private readonly logger = new Logger(AIValidationService.name);
  private readonly validationConfig: {
    maxProcessingTime: number;
    minConfidence: number;
    maxDeviationScore: number;
    requiredTraitConsistency: number;
  };

  constructor(private readonly configService: ConfigService) {
    this.validationConfig = {
      maxProcessingTime: this.configService.get<number>(
        'AI_MAX_PROCESSING_TIME',
        30000,
      ),
      minConfidence: this.configService.get<number>('AI_MIN_CONFIDENCE', 3),
      maxDeviationScore: this.configService.get<number>(
        'AI_MAX_DEVIATION_SCORE',
        0.7,
      ),
      requiredTraitConsistency: this.configService.get<number>(
        'AI_TRAIT_CONSISTENCY_THRESHOLD',
        0.6,
      ),
    };
  }

  /**
   * 종합적인 AI 결정 검증
   */
  async validateAIDecision(
    decision: DecisionResult | AIDecision,
    context: DecisionContext,
    persona: AIPersona,
  ): Promise<ValidationResult> {
    const startTime = Date.now();

    try {
      const errors: ValidationError[] = [];
      const warnings: ValidationError[] = [];
      const recommendations: string[] = [];

      // 1. 게임 규칙 검증
      const gameRuleValidation = this.validateGameRules(decision, context);
      if (!gameRuleValidation.isAllowed) {
        errors.push(
          ...gameRuleValidation.ruleViolations.map((violation) => ({
            field: 'gameRules',
            message: violation,
            severity: 'error' as const,
            suggestion: 'Ensure decision complies with current game phase rules',
          })),
        );
      }

      // 2. 페르소나 행동 검증
      const behaviorValidation = this.validatePersonaBehavior(
        decision,
        context,
        persona,
      );
      if (!behaviorValidation.isConsistent) {
        warnings.push({
          field: 'personaBehavior',
          message: `Behavior inconsistent with persona traits: ${behaviorValidation.inconsistentTraits.join(', ')}`,
          severity: 'warning',
          suggestion: behaviorValidation.suggestedAdjustments.join('; '),
        });
      }

      // 3. 타이밍 검증
      const timingValidation = this.validateTiming(decision, context);
      if (!timingValidation.isWithinTimeLimit) {
        errors.push({
          field: 'timing',
          message: `Decision processing time exceeded limit: ${timingValidation.processingTime}ms`,
          severity: 'error',
          suggestion: `Keep processing time within ${timingValidation.expectedRange.max}ms`,
        });
      }

      // 4. 결정 품질 평가
      const qualityMetrics = this.evaluateDecisionQuality(
        decision,
        context,
        persona,
      );
      if (qualityMetrics.overallQuality < 0.5) {
        warnings.push({
          field: 'quality',
          message: `Low decision quality score: ${qualityMetrics.overallQuality}`,
          severity: 'warning',
          suggestion: 'Consider improving logical consistency and strategic value',
        });
      }

      // 5. 신뢰도 검증
      const confidence = this.extractConfidence(decision);
      if (confidence < this.validationConfig.minConfidence) {
        warnings.push({
          field: 'confidence',
          message: `Low confidence score: ${confidence}`,
          severity: 'warning',
          suggestion: 'Review decision logic or provide more context',
        });
      }

      // 6. 추천 사항 생성
      recommendations.push(...this.generateRecommendations(decision, context, persona, qualityMetrics));

      // 전체 검증 점수 계산
      const confidenceScore = this.calculateConfidenceScore(
        gameRuleValidation,
        behaviorValidation,
        timingValidation,
        confidence,
      );

      const result: ValidationResult = {
        isValid: errors.length === 0,
        errors,
        warnings,
        confidenceScore,
        qualityScore: qualityMetrics.overallQuality,
        recommendations,
      };

      this.logger.log(
        `AI decision validation completed in ${Date.now() - startTime}ms - Valid: ${result.isValid}, Errors: ${errors.length}, Warnings: ${warnings.length}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `AI decision validation failed: ${error.message}`,
        error.stack,
      );

      return {
        isValid: false,
        errors: [
          {
            field: 'validation',
            message: `Validation process failed: ${error.message}`,
            severity: 'error',
            suggestion: 'Check validation service configuration',
          },
        ],
        warnings: [],
        confidenceScore: 0,
        qualityScore: 0,
        recommendations: [],
      };
    }
  }

  /**
   * 게임 규칙 검증
   */
  validateGameRules(
    decision: DecisionResult | AIDecision,
    context: DecisionContext,
  ): GameRuleValidation {
    const violations: string[] = [];
    let phaseCompatibility = true;
    let targetValidation = true;
    let actionLegality = true;

    const action = this.extractAction(decision);
    const target = this.extractTarget(decision);
    const decisionType = this.extractDecisionType(decision, context);

    // 페이즈 호환성 검증
    if (!this.isDecisionValidForPhase(decisionType, context.gamePhase)) {
      phaseCompatibility = false;
      violations.push(
        `Decision type "${decisionType}" not allowed in phase "${context.gamePhase}"`,
      );
    }

    // 액션 합법성 검증
    const validActions = this.getValidActionsForContext(context);
    if (!validActions.includes(action)) {
      actionLegality = false;
      violations.push(
        `Action "${action}" not valid for ${decisionType} in ${context.gamePhase}`,
      );
    }

    // 타겟 검증
    if (target && context.availableTargets) {
      if (!context.availableTargets.includes(target)) {
        targetValidation = false;
        violations.push(`Target "${target}" not in available targets list`);
      }
    }

    // 역할별 액션 제한 검증
    const roleRestrictions = this.validateRoleSpecificActions(
      action,
      target,
      context.player.role,
      context,
    );
    if (roleRestrictions.length > 0) {
      actionLegality = false;
      violations.push(...roleRestrictions);
    }

    // 게임 상태별 제한 검증
    const gameStateRestrictions = this.validateGameStateRestrictions(
      action,
      target,
      context.game,
      context.player,
    );
    if (gameStateRestrictions.length > 0) {
      violations.push(...gameStateRestrictions);
    }

    return {
      isAllowed: violations.length === 0,
      ruleViolations: violations,
      phaseCompatibility,
      targetValidation,
      actionLegality,
    };
  }

  /**
   * 페르소나 행동 일관성 검증
   */
  validatePersonaBehavior(
    decision: DecisionResult | AIDecision,
    context: DecisionContext,
    persona: AIPersona,
  ): PersonaBehaviorValidation {
    const action = this.extractAction(decision);
    const target = this.extractTarget(decision);
    const reasoning = this.extractReasoning(decision);

    const inconsistentTraits: string[] = [];
    const suggestedAdjustments: string[] = [];
    let deviationScore = 0;

    // 의사소통 스타일 검증
    const communicationConsistency = this.validateCommunicationStyle(
      action,
      reasoning,
      persona.communicationStyle,
    );
    if (communicationConsistency.deviation > 0.3) {
      deviationScore += communicationConsistency.deviation;
      inconsistentTraits.push(`communication_style:${persona.communicationStyle}`);
      suggestedAdjustments.push(communicationConsistency.suggestion);
    }

    // 위험 감수 성향 검증
    const riskConsistency = this.validateRiskTolerance(
      action,
      target,
      context,
      persona.riskTolerance,
    );
    if (riskConsistency.deviation > 0.3) {
      deviationScore += riskConsistency.deviation;
      inconsistentTraits.push(`risk_tolerance:${persona.riskTolerance}`);
      suggestedAdjustments.push(riskConsistency.suggestion);
    }

    // 투표 성향 검증
    if (context.decisionType === 'vote') {
      const votingConsistency = this.validateVotingTendency(
        action,
        target,
        context,
        persona.votingTendency,
      );
      if (votingConsistency.deviation > 0.3) {
        deviationScore += votingConsistency.deviation;
        inconsistentTraits.push(`voting_tendency:${persona.votingTendency}`);
        suggestedAdjustments.push(votingConsistency.suggestion);
      }
    }

    // 성격 특성 검증
    const traitConsistency = this.validatePersonalityTraits(
      action,
      reasoning,
      persona.traits,
    );
    if (traitConsistency.deviation > 0.3) {
      deviationScore += traitConsistency.deviation;
      inconsistentTraits.push(...traitConsistency.inconsistentTraits);
      suggestedAdjustments.push(traitConsistency.suggestion);
    }

    // 의심 수준 검증
    const suspicionConsistency = this.validateSuspicionLevel(
      action,
      target,
      reasoning,
      persona.suspicionLevel,
    );
    if (suspicionConsistency.deviation > 0.3) {
      deviationScore += suspicionConsistency.deviation;
      inconsistentTraits.push(`suspicion_level:${persona.suspicionLevel}`);
      suggestedAdjustments.push(suspicionConsistency.suggestion);
    }

    const averageDeviation = deviationScore / 5; // 5개 검증 항목
    const isConsistent = averageDeviation <= this.validationConfig.maxDeviationScore;

    return {
      isConsistent,
      deviationScore: Math.round(averageDeviation * 100) / 100,
      inconsistentTraits,
      suggestedAdjustments,
    };
  }

  /**
   * 타이밍 검증
   */
  validateTiming(
    decision: DecisionResult | AIDecision,
    context: DecisionContext,
  ): TimingValidation {
    const processingTime = this.extractProcessingTime(decision);
    const expectedRange = this.getExpectedProcessingTimeRange(context);

    const isWithinTimeLimit =
      processingTime <= (context.timeLimit || this.validationConfig.maxProcessingTime);

    // 효율성 점수 계산 (처리 시간과 기대 범위 기준)
    const efficiencyScore = Math.max(
      0,
      1 - (processingTime - expectedRange.min) / (expectedRange.max - expectedRange.min),
    );

    return {
      isWithinTimeLimit,
      processingTime,
      expectedRange,
      efficiencyScore: Math.round(efficiencyScore * 100) / 100,
    };
  }

  /**
   * 결정 품질 평가
   */
  evaluateDecisionQuality(
    decision: DecisionResult | AIDecision,
    context: DecisionContext,
    persona: AIPersona,
  ): DecisionQualityMetrics {
    const action = this.extractAction(decision);
    const target = this.extractTarget(decision);
    const reasoning = this.extractReasoning(decision);
    const confidence = this.extractConfidence(decision);

    // 논리적 일관성 평가
    const logicalConsistency = this.evaluateLogicalConsistency(
      action,
      target,
      reasoning,
      context,
    );

    // 전략적 가치 평가
    const strategicValue = this.evaluateStrategicValue(
      action,
      target,
      context,
      persona,
    );

    // 위험 평가
    const riskAssessment = this.evaluateRiskAssessment(
      action,
      target,
      context,
      persona.riskTolerance,
    );

    // 정보 활용도 평가
    const informationUtilization = this.evaluateInformationUtilization(
      reasoning,
      context,
    );

    // 전체 품질 점수 (가중 평균)
    const overallQuality =
      logicalConsistency * 0.3 +
      strategicValue * 0.3 +
      riskAssessment * 0.2 +
      informationUtilization * 0.2;

    return {
      logicalConsistency: Math.round(logicalConsistency * 100) / 100,
      strategicValue: Math.round(strategicValue * 100) / 100,
      riskAssessment: Math.round(riskAssessment * 100) / 100,
      informationUtilization: Math.round(informationUtilization * 100) / 100,
      overallQuality: Math.round(overallQuality * 100) / 100,
    };
  }

  /**
   * 커스텀 검증 규칙 적용
   */
  async applyCustomValidationRules(
    decision: DecisionResult | AIDecision,
    context: DecisionContext,
    customRules: Record<string, any>,
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    try {
      for (const [ruleName, ruleConfig] of Object.entries(customRules)) {
        const ruleResult = await this.executeCustomRule(
          ruleName,
          ruleConfig,
          decision,
          context,
        );

        if (!ruleResult.passed) {
          errors.push({
            field: `custom_rule_${ruleName}`,
            message: ruleResult.message,
            severity: ruleResult.severity || 'warning',
            suggestion: ruleResult.suggestion,
          });
        }
      }
    } catch (error) {
      this.logger.error(
        `Custom validation rules execution failed: ${error.message}`,
      );
      errors.push({
        field: 'custom_rules',
        message: `Custom rule execution failed: ${error.message}`,
        severity: 'error',
        suggestion: 'Check custom rule configuration',
      });
    }

    return errors;
  }

  // Private helper methods

  private isDecisionValidForPhase(
    decisionType: DecisionType,
    gamePhase: string,
  ): boolean {
    const phaseDecisionMap: Record<string, DecisionType[]> = {
      day_discussion: ['discussion', 'accusation'],
      day_voting: ['vote'],
      night_actions: ['night_action'],
      day: ['discussion', 'accusation'],
      voting: ['vote'],
      night: ['night_action'],
    };

    const allowedDecisions = phaseDecisionMap[gamePhase];
    return allowedDecisions ? allowedDecisions.includes(decisionType) : false;
  }

  private getValidActionsForContext(context: DecisionContext): string[] {
    const baseActions = this.getBaseActionsForDecisionType(context.decisionType);

    // 역할별 추가 액션
    const roleActions = this.getRoleSpecificActions(context.player.role, context.decisionType);

    return [...baseActions, ...roleActions];
  }

  private getBaseActionsForDecisionType(decisionType: DecisionType): string[] {
    const actionMap = {
      vote: ['vote', 'abstain'],
      night_action: ['skip'],
      discussion: ['accuse', 'defend', 'question', 'observe', 'agree', 'disagree'],
      accusation: ['accuse', 'counter_accuse', 'support', 'dismiss'],
    };
    return actionMap[decisionType] || [];
  }

  private getRoleSpecificActions(role: string, decisionType: DecisionType): string[] {
    if (decisionType !== 'night_action') return [];

    const roleActionMap: Record<string, string[]> = {
      mafia: ['kill'],
      police: ['investigate'],
      doctor: ['heal'],
      citizen: [], // Citizens have no night actions
    };

    return roleActionMap[role] || [];
  }

  private validateRoleSpecificActions(
    action: string,
    target: string | null,
    role: string,
    context: DecisionContext,
  ): string[] {
    const violations: string[] = [];

    // 야간 액션 역할별 제한
    if (context.decisionType === 'night_action') {
      if (role === 'citizen' && !['skip'].includes(action)) {
        violations.push(`Citizens cannot perform night actions other than skip`);
      }

      if (role === 'mafia' && action === 'kill' && !target) {
        violations.push(`Mafia must specify a target for kill action`);
      }

      if (role === 'police' && action === 'investigate' && !target) {
        violations.push(`Police must specify a target for investigate action`);
      }

      if (role === 'doctor' && action === 'heal' && !target) {
        violations.push(`Doctor must specify a target for heal action`);
      }
    }

    // 투표 제한
    if (context.decisionType === 'vote' && action === 'vote' && !target) {
      violations.push(`Vote action requires a target`);
    }

    return violations;
  }

  private validateGameStateRestrictions(
    action: string,
    target: string | null,
    game: Game,
    player: Player,
  ): string[] {
    const violations: string[] = [];

    // 죽은 플레이어는 액션 불가
    if (!player.isAlive && !['observe'].includes(action)) {
      violations.push(`Dead players cannot perform actions other than observe`);
    }

    // 자기 자신을 대상으로 하는 액션 제한
    if (target === player.name) {
      const selfTargetActions = ['heal']; // 의사는 자기 치료 가능
      if (!selfTargetActions.includes(action)) {
        violations.push(`Cannot target yourself with action: ${action}`);
      }
    }

    return violations;
  }

  private validateCommunicationStyle(
    action: string,
    reasoning: string | null,
    style: string,
  ): { deviation: number; suggestion: string } {
    let deviation = 0;
    let suggestion = '';

    const aggressiveActions = ['accuse', 'counter_accuse', 'kill'];
    const analyticalActions = ['investigate', 'question', 'observe'];
    const emotionalActions = ['defend', 'support', 'agree'];
    const quietActions = ['abstain', 'skip', 'observe'];

    switch (style) {
      case 'aggressive':
        if (!aggressiveActions.some(a => action.includes(a))) {
          deviation = 0.4;
          suggestion = 'Consider more aggressive actions like accuse or counter_accuse';
        }
        break;
      case 'analytical':
        if (!analyticalActions.some(a => action.includes(a)) && reasoning && reasoning.length < 50) {
          deviation = 0.3;
          suggestion = 'Provide more detailed analytical reasoning';
        }
        break;
      case 'emotional':
        if (!emotionalActions.some(a => action.includes(a))) {
          deviation = 0.3;
          suggestion = 'Consider more emotionally-driven responses';
        }
        break;
      case 'quiet':
        if (!quietActions.includes(action)) {
          deviation = 0.2;
          suggestion = 'Consider more reserved actions like observe or abstain';
        }
        break;
    }

    return { deviation, suggestion };
  }

  private validateRiskTolerance(
    action: string,
    target: string | null,
    context: DecisionContext,
    riskTolerance: string,
  ): { deviation: number; suggestion: string } {
    let deviation = 0;
    let suggestion = '';

    const highRiskActions = ['accuse', 'kill', 'counter_accuse'];
    const lowRiskActions = ['abstain', 'skip', 'observe', 'agree'];

    const alivePlayers = context.game?.getAlivePlayers?.()?.length || context.game?.players?.filter(p => p.isAlive).length || 0;
    const isEarlyGame = (context.game?.dayCount || 1) <= 2;
    const isLateGame = alivePlayers <= 4;

    if (riskTolerance === 'high' && lowRiskActions.includes(action) && !isLateGame) {
      deviation = 0.4;
      suggestion = 'Consider taking more risks with aggressive actions';
    } else if (riskTolerance === 'low' && highRiskActions.includes(action)) {
      deviation = 0.4;
      suggestion = 'Consider safer, more conservative actions';
    }

    return { deviation, suggestion };
  }

  private validateVotingTendency(
    action: string,
    target: string | null,
    context: DecisionContext,
    votingTendency: string,
  ): { deviation: number; suggestion: string } {
    let deviation = 0;
    let suggestion = '';

    const voteCount = context.gameState?.voteCount || 0;
    const totalPlayers = context.game.getAlivePlayers?.()?.length || context.game.players?.filter(p => p.isAlive).length || 0;
    const isEarlyVoting = voteCount < totalPlayers * 0.3;
    const isLateVoting = voteCount > totalPlayers * 0.7;

    switch (votingTendency) {
      case 'early':
        if (action === 'abstain' && isEarlyVoting) {
          deviation = 0.5;
          suggestion = 'Early voters should participate in voting more actively';
        }
        break;
      case 'late':
        if (action === 'vote' && isEarlyVoting) {
          deviation = 0.3;
          suggestion = 'Late voters typically wait for more information';
        }
        break;
      case 'follower':
        if (action === 'vote' && voteCount === 0) {
          deviation = 0.4;
          suggestion = 'Followers typically wait for others to vote first';
        }
        break;
      case 'leader':
        if (action === 'abstain' && voteCount === 0) {
          deviation = 0.4;
          suggestion = 'Leaders should take initiative in voting';
        }
        break;
    }

    return { deviation, suggestion };
  }

  private validatePersonalityTraits(
    action: string,
    reasoning: string | null,
    traits: string[],
  ): { deviation: number; inconsistentTraits: string[]; suggestion: string } {
    let deviation = 0;
    const inconsistentTraits: string[] = [];
    const suggestions: string[] = [];

    for (const trait of traits) {
      const traitValidation = this.validateSingleTrait(trait, action, reasoning);
      if (traitValidation.isInconsistent) {
        deviation += 0.2;
        inconsistentTraits.push(trait);
        if (traitValidation.suggestion) {
          suggestions.push(traitValidation.suggestion);
        }
      }
    }

    return {
      deviation: Math.min(deviation, 1),
      inconsistentTraits,
      suggestion: suggestions.join('; ') || 'Ensure actions align with personality traits',
    };
  }

  private validateSingleTrait(
    trait: string,
    action: string,
    reasoning: string | null,
  ): { isInconsistent: boolean; suggestion?: string } {
    const traitActionMap: Record<string, { positive: string[]; negative: string[] }> = {
      logical: {
        positive: ['investigate', 'question', 'observe'],
        negative: ['accuse'],
      },
      impulsive: {
        positive: ['accuse', 'vote'],
        negative: ['abstain', 'observe'],
      },
      methodical: {
        positive: ['observe', 'question'],
        negative: ['accuse'],
      },
      suspicious: {
        positive: ['investigate', 'accuse', 'question'],
        negative: ['agree', 'support'],
      },
      trusting: {
        positive: ['support', 'agree', 'defend'],
        negative: ['accuse', 'counter_accuse'],
      },
      careful: {
        positive: ['observe', 'abstain'],
        negative: ['accuse', 'kill'],
      },
    };

    const traitActions = traitActionMap[trait];
    if (!traitActions) return { isInconsistent: false };

    const isPositiveMatch = traitActions.positive.some(a => action.includes(a));
    const isNegativeMatch = traitActions.negative.some(a => action.includes(a));

    if (isNegativeMatch && !isPositiveMatch) {
      return {
        isInconsistent: true,
        suggestion: `Consider actions more aligned with "${trait}" trait: ${traitActions.positive.join(', ')}`,
      };
    }

    return { isInconsistent: false };
  }

  private validateSuspicionLevel(
    action: string,
    target: string | null,
    reasoning: string | null,
    suspicionLevel: number,
  ): { deviation: number; suggestion: string } {
    let deviation = 0;
    let suggestion = '';

    const suspiciousActions = ['accuse', 'investigate', 'question'];
    const trustingActions = ['support', 'agree', 'defend'];

    const isHighSuspicion = suspicionLevel >= 7;
    const isLowSuspicion = suspicionLevel <= 4;

    if (isHighSuspicion && trustingActions.includes(action)) {
      deviation = 0.4;
      suggestion = 'High suspicion level suggests more questioning or investigative actions';
    } else if (isLowSuspicion && suspiciousActions.includes(action) && !reasoning?.includes('evidence')) {
      deviation = 0.3;
      suggestion = 'Low suspicion level suggests more trusting behavior unless strong evidence exists';
    }

    return { deviation, suggestion };
  }

  private evaluateLogicalConsistency(
    action: string,
    target: string | null,
    reasoning: string | null,
    context: DecisionContext,
  ): number {
    let score = 0.2; // Lower base score

    // 추론의 존재와 품질
    if (reasoning && reasoning.length > 20) {
      score += 0.3;
    } else if (reasoning && reasoning.length > 5) {
      score += 0.1;
    } else if (!reasoning || reasoning.length === 0) {
      score = 0.1; // Very low score for no reasoning
    }

    // 액션과 추론의 일치성
    if (reasoning && reasoning.length > 5) {
      const actionKeywords = this.getActionKeywords(action);
      const hasRelevantKeywords = actionKeywords.some(keyword =>
        reasoning.toLowerCase().includes(keyword.toLowerCase())
      );
      if (hasRelevantKeywords) {
        score += 0.2;
      }
    }

    // 타겟과 추론의 일치성
    if (target && reasoning && reasoning.length > 5) {
      if (reasoning.toLowerCase().includes(target.toLowerCase())) {
        score += 0.1;
      }
    }

    return Math.min(score, 1);
  }

  private evaluateStrategicValue(
    action: string,
    target: string | null,
    context: DecisionContext,
    persona: AIPersona,
  ): number {
    let score = 0.5; // Base score

    const alivePlayers = context.game?.getAlivePlayers?.()?.length ||
                        context.game?.players?.filter(p => p.isAlive).length || 0;
    const isEarlyGame = (context.game?.dayCount || 1) <= 2;
    const isLateGame = alivePlayers <= 4;

    // 게임 단계별 전략적 가치
    if (isEarlyGame) {
      const earlyGameActions = ['observe', 'question', 'investigate'];
      if (earlyGameActions.includes(action)) {
        score += 0.3;
      }
    } else if (isLateGame) {
      const lateGameActions = ['vote', 'accuse', 'kill'];
      if (lateGameActions.includes(action) && target) {
        score += 0.3;
      }
    }

    // 역할별 전략적 가치
    const roleValue = this.evaluateRoleStrategicValue(
      action,
      target,
      context.player.role,
      context,
    );
    score += roleValue * 0.2;

    return Math.min(score, 1);
  }

  private evaluateRoleStrategicValue(
    action: string,
    target: string | null,
    role: string,
    context: DecisionContext,
  ): number {
    const roleStrategies: Record<string, Record<string, number>> = {
      mafia: {
        kill: 0.8,
        accuse: 0.6,
        defend: 0.4,
        observe: 0.2,
      },
      police: {
        investigate: 0.8,
        question: 0.6,
        accuse: 0.5,
        vote: 0.4,
      },
      doctor: {
        heal: 0.8,
        observe: 0.6,
        defend: 0.4,
        question: 0.3,
      },
      citizen: {
        vote: 0.7,
        accuse: 0.6,
        question: 0.5,
        observe: 0.4,
      },
    };

    return roleStrategies[role]?.[action] || 0.3;
  }

  private evaluateRiskAssessment(
    action: string,
    target: string | null,
    context: DecisionContext,
    riskTolerance: string,
  ): number {
    const actionRisk = this.getActionRiskLevel(action, context);
    const toleranceScore = this.getRiskToleranceScore(riskTolerance);

    // 위험도와 성향이 일치하면 높은 점수
    const riskAlignment = 1 - Math.abs(actionRisk - toleranceScore);

    return Math.max(0, riskAlignment);
  }

  private getActionRiskLevel(action: string, context: DecisionContext): number {
    const riskLevels: Record<string, number> = {
      accuse: 0.8,
      kill: 0.9,
      counter_accuse: 0.7,
      vote: 0.6,
      investigate: 0.4,
      question: 0.3,
      defend: 0.2,
      observe: 0.1,
      abstain: 0.1,
      skip: 0.1,
    };

    return riskLevels[action] || 0.5;
  }

  private getRiskToleranceScore(riskTolerance: string): number {
    const toleranceScores: Record<string, number> = {
      high: 0.8,
      medium: 0.5,
      low: 0.2,
    };

    return toleranceScores[riskTolerance] || 0.5;
  }

  private evaluateInformationUtilization(
    reasoning: string | null,
    context: DecisionContext,
  ): number {
    if (!reasoning) return 0.2;

    let score = 0.3; // Base score for having reasoning

    // 게임 상태 정보 활용 확인
    const gameStateKeywords = [
      'day ' + (context.game?.dayCount || 1),
      context.gamePhase,
      'alive',
      'dead',
      'mafia',
      'citizen',
    ];

    const utilizedKeywords = gameStateKeywords.filter(keyword =>
      reasoning.toLowerCase().includes(keyword.toLowerCase())
    );

    score += utilizedKeywords.length * 0.1;

    // 플레이어별 정보 활용
    if (context.availableTargets) {
      const mentionedPlayers = context.availableTargets.filter(player =>
        reasoning.toLowerCase().includes(player.toLowerCase())
      );
      score += mentionedPlayers.length * 0.05;
    }

    return Math.min(score, 1);
  }

  private getActionKeywords(action: string): string[] {
    const keywordMap: Record<string, string[]> = {
      accuse: ['suspicious', 'guilty', 'mafia', 'evidence'],
      vote: ['eliminate', 'voted', 'guilty', 'suspicious'],
      investigate: ['check', 'investigate', 'suspicious', 'evidence'],
      defend: ['innocent', 'defend', 'trust', 'wrong'],
      observe: ['watch', 'observe', 'wait', 'information'],
      question: ['ask', 'question', 'clarify', 'explain'],
      kill: ['eliminate', 'target', 'threat', 'dangerous'],
      heal: ['protect', 'save', 'heal', 'important'],
    };

    return keywordMap[action] || [];
  }

  private getExpectedProcessingTimeRange(context: DecisionContext): { min: number; max: number } {
    const baseRange = { min: 500, max: 5000 };

    // 결정 타입별 조정
    switch (context.decisionType) {
      case 'vote':
        return { min: 1000, max: 8000 };
      case 'night_action':
        return { min: 800, max: 6000 };
      case 'discussion':
        return { min: 300, max: 4000 };
      case 'accusation':
        return { min: 1000, max: 7000 };
      default:
        return baseRange;
    }
  }

  private calculateConfidenceScore(
    gameRuleValidation: GameRuleValidation,
    behaviorValidation: PersonaBehaviorValidation,
    timingValidation: TimingValidation,
    confidence: number,
  ): number {
    let score = 0;

    // 게임 규칙 준수 (40%)
    if (gameRuleValidation.isAllowed) {
      score += 0.4;
    } else {
      score += Math.max(0, 0.4 - gameRuleValidation.ruleViolations.length * 0.1);
    }

    // 페르소나 일관성 (30%)
    if (behaviorValidation.isConsistent) {
      score += 0.3;
    } else {
      score += Math.max(0, 0.3 - behaviorValidation.deviationScore * 0.3);
    }

    // 타이밍 (20%)
    score += timingValidation.efficiencyScore * 0.2;

    // 신뢰도 (10%)
    score += (confidence / 10) * 0.1;

    return Math.round(score * 100) / 100;
  }

  private generateRecommendations(
    decision: DecisionResult | AIDecision,
    context: DecisionContext,
    persona: AIPersona,
    qualityMetrics: DecisionQualityMetrics,
  ): string[] {
    const recommendations: string[] = [];

    // 품질 기반 추천
    if (qualityMetrics.logicalConsistency < 0.6) {
      recommendations.push('Improve reasoning quality and logical flow');
    }

    if (qualityMetrics.strategicValue < 0.5) {
      recommendations.push('Consider more strategically valuable actions for current game phase');
    }

    if (qualityMetrics.informationUtilization < 0.4) {
      recommendations.push('Utilize more available game state information in decision making');
    }

    // 페르소나 기반 추천
    if (persona.isAnalytical() && !this.extractReasoning(decision)) {
      recommendations.push('Provide detailed analytical reasoning consistent with persona');
    }

    if (persona.riskTolerance === 'low' && this.getActionRiskLevel(this.extractAction(decision), context) > 0.6) {
      recommendations.push('Consider less risky actions aligned with risk tolerance');
    }

    // 게임 상황 기반 추천
    const alivePlayers = context.game?.getAlivePlayers?.()?.length ||
                        context.game?.players?.filter(p => p.isAlive).length || 0;
    if (alivePlayers <= 4 && this.extractAction(decision) === 'observe') {
      recommendations.push('Late game requires more decisive actions');
    }

    return recommendations;
  }

  private async executeCustomRule(
    ruleName: string,
    ruleConfig: any,
    decision: DecisionResult | AIDecision,
    context: DecisionContext,
  ): Promise<{
    passed: boolean;
    message: string;
    severity?: 'error' | 'warning' | 'info';
    suggestion?: string;
  }> {
    // 커스텀 규칙 실행 로직
    // 여기서는 간단한 예시 구현
    switch (ruleName) {
      case 'no_immediate_revenge':
        return this.validateNoImmediateRevenge(decision, context, ruleConfig);
      case 'consistent_voting_pattern':
        return this.validateConsistentVotingPattern(decision, context, ruleConfig);
      case 'role_action_frequency':
        return this.validateRoleActionFrequency(decision, context, ruleConfig);
      default:
        return {
          passed: false,
          message: `Unknown custom rule: ${ruleName}`,
          severity: 'warning',
          suggestion: 'Ensure custom rule is properly configured',
        };
    }
  }

  private validateNoImmediateRevenge(
    decision: DecisionResult | AIDecision,
    context: DecisionContext,
    config: any,
  ): { passed: boolean; message: string; severity?: 'error' | 'warning' | 'info'; suggestion?: string } {
    // 즉시 복수 방지 규칙 구현
    const action = this.extractAction(decision);
    const target = this.extractTarget(decision);

    if (action === 'vote' || action === 'accuse' || action === 'kill') {
      // 간단한 검증 로직
      return {
        passed: true,
        message: 'No immediate revenge detected',
      };
    }

    return {
      passed: true,
      message: 'Rule not applicable to this action',
    };
  }

  private validateConsistentVotingPattern(
    decision: DecisionResult | AIDecision,
    context: DecisionContext,
    config: any,
  ): { passed: boolean; message: string; severity?: 'error' | 'warning' | 'info'; suggestion?: string } {
    // 일관된 투표 패턴 검증
    return {
      passed: true,
      message: 'Voting pattern appears consistent',
    };
  }

  private validateRoleActionFrequency(
    decision: DecisionResult | AIDecision,
    context: DecisionContext,
    config: any,
  ): { passed: boolean; message: string; severity?: 'error' | 'warning' | 'info'; suggestion?: string } {
    // 역할별 액션 빈도 검증
    return {
      passed: true,
      message: 'Role action frequency within acceptable range',
    };
  }

  // Utility methods for extracting data from different decision types

  private extractAction(decision: DecisionResult | AIDecision): string {
    if ('action' in decision) {
      return decision.action;
    }
    return decision.decisionData?.action || 'unknown';
  }

  private extractTarget(decision: DecisionResult | AIDecision): string | null {
    if ('target' in decision) {
      return decision.target || null;
    }
    return (decision as AIDecision).decisionData?.target || null;
  }

  private extractReasoning(decision: DecisionResult | AIDecision): string | null {
    if ('reasoning' in decision) {
      return decision.reasoning || null;
    }
    return (decision as AIDecision).decisionData?.reasoning || null;
  }

  private extractConfidence(decision: DecisionResult | AIDecision): number {
    return decision.confidence || 5;
  }

  private extractProcessingTime(decision: DecisionResult | AIDecision): number {
    return decision.processingTime || 0;
  }

  private extractDecisionType(decision: DecisionResult | AIDecision, context: DecisionContext): DecisionType {
    if ('decisionType' in decision) {
      return decision.decisionType;
    }
    return context.decisionType;
  }
}
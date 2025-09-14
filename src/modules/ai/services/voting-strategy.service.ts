import { Injectable } from '@nestjs/common';
import { Logger } from '@libs/logger';
import { Game, GameRole } from '../../../entities/game.entity';
import { Player } from '../../../entities/player.entity';
import { AIPersona } from '../types/ai-persona.types';
import { SuspicionData } from '../types/suspicion.types';
import {
  VotingDecision,
  VotingStrategy,
  VotingContext,
  VoteScoreResult,
  ScoreBreakdown,
  VoteReason,
  RiskAssessment,
  VotingOutcome,
  TeamImpact,
  GameStateChange,
  AlternativeVote,
  RoleVotingConfig,
  VotingSimulation,
  VotingScenario,
  GeneratedVoteExplanation,
  VoteExplanationContext,
  ExplanationStyle
} from '../types/voting-strategy.types';

/**
 * 투표 전략 엔진
 * 역할별, 성격별 최적 투표 전략을 구현하고 의사결정을 지원
 */
@Injectable()
export class VotingStrategyService {
  private readonly roleStrategies = new Map<GameRole, VotingStrategy>();
  private readonly roleConfigs = new Map<GameRole, RoleVotingConfig>();

  constructor(private readonly logger: Logger) {
    this.logger.setContext(VotingStrategyService.name);
    this.initializeRoleStrategies();
    this.initializeRoleConfigs();
  }

  /**
   * 투표 결정을 계산합니다.
   */
  async calculateVote(
    voter: Player,
    persona: AIPersona,
    game: Game,
    suspicionData: Map<number, SuspicionData>
  ): Promise<VotingDecision> {
    this.logger.log(`Calculating vote for player ${voter.name} (${voter.role})`);

    const context = this.createVotingContext(voter, persona, game, suspicionData);
    const strategy = this.getVotingStrategy(voter.role, persona, context);
    const candidates = this.getVotingCandidates(game, voter);
    
    // 후보가 없는 경우 처리
    if (candidates.length === 0) {
      return {
        target: voter, // 임시로 자기 자신 반환 (실제로는 투표하지 않음)
        confidence: 0,
        reasoning: 'No valid candidates available',
        shouldExplain: false,
        priority: 1,
        expectedOutcome: {
          type: 'no_elimination',
          probability: 1,
          teamImpact: { mafiaImpact: 0, citizenImpact: 0, explanation: 'No candidates' },
          gameStateChange: { suspicionChanges: [], informationReveal: [], allianceChanges: [] }
        },
        alternatives: []
      };
    }

    // 각 후보에 대한 점수 계산
    const scoredCandidates = await Promise.all(
      candidates.map(candidate => this.calculateVotingScore(candidate, context, strategy))
    );

    // 점수순으로 정렬
    scoredCandidates.sort((a, b) => b.totalScore - a.totalScore);

    // 최적 선택 결정
    const bestCandidate = scoredCandidates[0];
    const alternatives = this.generateAlternatives(scoredCandidates.slice(1, 4));
    
    // 투표 결정 생성
    const decision: VotingDecision = {
      target: bestCandidate.player,
      confidence: this.calculateConfidence(bestCandidate, strategy),
      reasoning: this.generateReasoning(bestCandidate),
      shouldExplain: this.shouldExplainVote(persona, bestCandidate),
      priority: this.calculatePriority(bestCandidate, context),
      expectedOutcome: this.predictOutcome(bestCandidate, context),
      alternatives
    };

    this.logger.log(`Vote decision: ${voter.name} -> ${decision.target.name} (confidence: ${decision.confidence})`);
    
    return decision;
  }

  /**
   * 투표 설명을 생성합니다.
   */
  async generateVoteExplanation(
    decision: VotingDecision,
    context: VotingContext,
    style: ExplanationStyle = this.getDefaultExplanationStyle(context.persona)
  ): Promise<GeneratedVoteExplanation> {
    this.logger.log(`Generating vote explanation for ${context.voter.name}`);

    const explanationContext: VoteExplanationContext = {
      decision,
      votingContext: context,
      explanationStyle: style,
      audience: 'all_players',
      length: 'brief'
    };

    const mainExplanation = this.buildMainExplanation(explanationContext);
    const keyReasons = this.extractKeyReasons(decision);
    const supportingDetails = this.buildSupportingDetails(explanationContext);
    const emotionalTone = this.determineEmotionalTone(context.persona, decision);
    const expectedReactions = this.predictPlayerReactions(decision, context);

    return {
      mainExplanation,
      keyReasons,
      supportingDetails,
      emotionalTone,
      expectedReactions
    };
  }

  /**
   * 투표 시뮬레이션을 실행합니다.
   */
  async simulateVoting(
    context: VotingContext,
    scenarios: number = 5
  ): Promise<VotingSimulation> {
    this.logger.log(`Running voting simulation with ${scenarios} scenarios`);

    const simulationId = `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const votingScenarios: VotingScenario[] = [];

    // 다양한 시나리오 생성 및 시뮬레이션
    for (let i = 0; i < scenarios; i++) {
      const scenario = await this.generateVotingScenario(context, i);
      votingScenarios.push(scenario);
    }

    // 최적 선택 결정
    const optimalChoice = await this.calculateVote(
      context.voter,
      context.persona,
      context.game,
      context.suspicionData
    );

    const confidence = this.calculateSimulationConfidence(votingScenarios);

    return {
      simulationId,
      scenarios: votingScenarios,
      optimalChoice,
      confidence,
      timestamp: new Date()
    };
  }

  /**
   * 역할별 투표 전략을 업데이트합니다.
   */
  updateRoleStrategy(role: GameRole, strategy: VotingStrategy): void {
    this.logger.log(`Updating voting strategy for role: ${role}`);
    this.roleStrategies.set(role, strategy);
  }

  /**
   * 투표 패턴을 학습하고 전략을 개선합니다.
   */
  learnFromVotingResult(
    voter: Player,
    decision: VotingDecision,
    actualOutcome: any,
    gameResult: any
  ): void {
    this.logger.log(`Learning from voting result for player ${voter.name}`);
    
    // 실제 구현에서는 머신러닝이나 통계적 학습을 통해
    // 투표 전략을 개선하는 로직이 들어갈 수 있음
    
    const strategy = this.roleStrategies.get(voter.role);
    if (strategy) {
      // 전략 조정 로직
      this.adjustStrategy(strategy, decision, actualOutcome, gameResult);
    }
  }

  // Private helper methods

  private createVotingContext(
    voter: Player,
    persona: AIPersona,
    game: Game,
    suspicionData: Map<number, SuspicionData>
  ): VotingContext {
    const candidates = game.players.filter(p => p.id !== voter.id && p.isAlive);
    const existingVotes = new Map<number, number>(); // 실제로는 현재 투표 상황을 가져와야 함
    
    return {
      game,
      voter,
      persona,
      phase: game.currentPhase,
      candidates,
      suspicionData,
      gameContext: {
        phase: game.currentPhase,
        dayCount: game.dayCount,
        alivePlayersCount: game.getAlivePlayers().length,
        recentEvents: []
      },
      existingVotes,
      timeRemaining: 60, // 임시값
      additionalInfo: {}
    };
  }

  private getVotingStrategy(role: GameRole, persona: AIPersona, context: VotingContext): VotingStrategy {
    const baseStrategy = this.roleStrategies.get(role);
    if (!baseStrategy) {
      return this.getDefaultStrategy();
    }

    // 페르소나와 상황에 따른 전략 조정
    const adjustedStrategy: VotingStrategy = {
      ...baseStrategy,
      riskTolerance: baseStrategy.riskTolerance * (1 + persona.personality.aggression * 0.3),
      analysisDepth: baseStrategy.analysisDepth * (1 + persona.personality.analytical * 0.2),
      teamworkFactor: baseStrategy.teamworkFactor * (1 + persona.playStyle.teamplayPreference * 0.4),
      suspicionThreshold: baseStrategy.suspicionThreshold * (1 - persona.personality.trust * 0.2)
    };

    return adjustedStrategy;
  }

  private getVotingCandidates(game: Game, voter: Player): Player[] {
    return game.players.filter(p => 
      p.id !== voter.id && 
      p.isAlive && 
      !this.isProtectedPlayer(p, voter)
    );
  }

  private isProtectedPlayer(candidate: Player, voter: Player): boolean {
    // 같은 팀 보호 로직
    if (voter.role === 'mafia' && candidate.role === 'mafia') {
      return true;
    }
    
    // 기타 보호 조건들
    return false;
  }

  private async calculateVotingScore(
    candidate: Player,
    context: VotingContext,
    strategy: VotingStrategy
  ): Promise<VoteScoreResult> {
    const suspicionData = context.suspicionData.get(candidate.id);
    
    const scoreBreakdown = this.calculateScoreBreakdown(candidate, context, strategy, suspicionData);
    const totalScore = this.calculateTotalScore(scoreBreakdown, strategy);
    const reasons = this.generateVoteReasons(candidate, context, suspicionData);
    const riskAssessment = this.assessRisk(candidate, context, strategy);

    return {
      player: candidate,
      totalScore,
      scoreBreakdown,
      reasons,
      riskAssessment
    };
  }

  private calculateScoreBreakdown(
    candidate: Player,
    context: VotingContext,
    strategy: VotingStrategy,
    suspicionData?: SuspicionData
  ): ScoreBreakdown {
    const suspicionScore = suspicionData ? suspicionData.level * 10 : 1;
    const strategicValue = this.calculateStrategicValue(candidate, context, strategy);
    const riskScore = this.calculateRiskScore(candidate, context);
    const teamworkScore = this.calculateTeamworkScore(candidate, context, strategy);
    const informationValue = this.calculateInformationValue(candidate, context);
    const timingScore = this.calculateTimingScore(candidate, context);
    const miscBonus = this.calculateMiscBonus(candidate, context);

    return {
      suspicionScore,
      strategicValue,
      riskScore,
      teamworkScore,
      informationValue,
      timingScore,
      miscBonus
    };
  }

  private calculateTotalScore(breakdown: ScoreBreakdown, strategy: VotingStrategy): number {
    const weights = {
      suspicion: 0.4,
      strategic: 0.25,
      risk: -0.15 * strategy.riskTolerance,
      teamwork: 0.2 * strategy.teamworkFactor,
      information: 0.1 * strategy.analysisDepth,
      timing: 0.1,
      misc: 0.05
    };

    return (
      breakdown.suspicionScore * weights.suspicion +
      breakdown.strategicValue * weights.strategic +
      breakdown.riskScore * weights.risk +
      breakdown.teamworkScore * weights.teamwork +
      breakdown.informationValue * weights.information +
      breakdown.timingScore * weights.timing +
      breakdown.miscBonus * weights.misc
    );
  }

  private calculateStrategicValue(candidate: Player, context: VotingContext, strategy: VotingStrategy): number {
    let value = 5; // 기본값

    // 역할별 전략적 가치 계산
    if (context.voter.role === 'mafia') {
      // 마피아는 시민 제거에 높은 가치
      if (candidate.role === 'police' || candidate.role === 'doctor') {
        value += 3;
      } else if (candidate.role === 'citizen') {
        value += 2;
      }
    } else {
      // 시민은 마피아 제거에 높은 가치
      if (candidate.role === 'mafia') {
        value += 4;
      }
    }

    return value;
  }

  private calculateRiskScore(candidate: Player, context: VotingContext): number {
    let risk = 0;

    // 잘못된 투표의 위험성 평가
    if (context.voter.role === 'citizen' && candidate.role === 'citizen') {
      risk += 3; // 시민이 시민을 투표하는 위험
    }

    // 보복 위험
    if (candidate.role === 'mafia' && context.gameContext.alivePlayersCount <= 4) {
      risk += 2; // 게임 후반 마피아 투표의 보복 위험
    }

    return risk;
  }

  private calculateTeamworkScore(candidate: Player, context: VotingContext, strategy: VotingStrategy): number {
    let score = 5;

    // 팀 협력 점수 계산
    if (strategy.teamworkFactor > 0.7) {
      // 다른 플레이어들의 투표 성향과 일치도 평가
      const consensus = this.evaluateConsensus(candidate, context);
      score += consensus * 2;
    }

    return score;
  }

  private calculateInformationValue(candidate: Player, context: VotingContext): number {
    let value = 5;

    // 정보 획득 가치 평가
    if (candidate.role === 'police' || candidate.role === 'doctor') {
      // 특수 역할 제거로 인한 정보 획득
      value += 2;
    }

    return value;
  }

  private calculateTimingScore(candidate: Player, context: VotingContext): number {
    let score = 5;

    // 타이밍 적절성 평가
    if (context.timeRemaining < 30 && context.phase === 'voting') {
      // 시간이 촉박할 때는 확실한 선택 선호
      score += 1;
    }

    return score;
  }

  private calculateMiscBonus(candidate: Player, context: VotingContext): number {
    let bonus = 0;

    // 기타 보너스 요소들
    if (context.gameContext.dayCount === 1) {
      // 첫날에는 보수적 접근
      bonus -= 0.5;
    }

    return bonus;
  }

  private generateVoteReasons(
    candidate: Player,
    context: VotingContext,
    suspicionData?: SuspicionData
  ): VoteReason[] {
    const reasons: VoteReason[] = [];

    if (suspicionData && suspicionData.level > 0.6) {
      reasons.push({
        type: 'high_suspicion',
        description: `High suspicion level (${Math.round(suspicionData.level * 100)}%)`,
        confidence: suspicionData.confidence,
        weight: 0.4,
        evidence: suspicionData.reasons.map(r => r.description)
      });
    }

    if (context.voter.role === 'mafia' && candidate.role !== 'mafia') {
      reasons.push({
        type: 'strategic_elimination',
        description: 'Strategic elimination of non-mafia player',
        confidence: 0.8,
        weight: 0.3,
        evidence: ['Role-based strategic decision']
      });
    }

    return reasons;
  }

  private assessRisk(candidate: Player, context: VotingContext, strategy: VotingStrategy): RiskAssessment {
    const overallRisk = this.calculateOverallRisk(candidate, context);
    const identityExposureRisk = this.calculateIdentityExposureRisk(candidate, context);
    const retaliationRisk = this.calculateRetaliationRisk(candidate, context);
    const misjudgmentRisk = this.calculateMisjudgmentRisk(candidate, context);
    const teamLossRisk = this.calculateTeamLossRisk(candidate, context);

    return {
      overallRisk,
      identityExposureRisk,
      retaliationRisk,
      misjudgmentRisk,
      teamLossRisk,
      mitigation: this.generateRiskMitigation(candidate, context)
    };
  }

  private calculateOverallRisk(candidate: Player, context: VotingContext): number {
    // 종합 위험도 계산
    return 0.5; // 임시 구현
  }

  private calculateIdentityExposureRisk(candidate: Player, context: VotingContext): number {
    // 신원 노출 위험 계산
    if (context.voter.role === 'mafia' && candidate.role === 'citizen') {
      return 0.3; // 마피아가 시민을 투표할 때의 노출 위험
    }
    return 0.1;
  }

  private calculateRetaliationRisk(candidate: Player, context: VotingContext): number {
    // 보복 위험 계산
    return 0.2; // 임시 구현
  }

  private calculateMisjudgmentRisk(candidate: Player, context: VotingContext): number {
    // 오판 위험 계산
    return 0.3; // 임시 구현
  }

  private calculateTeamLossRisk(candidate: Player, context: VotingContext): number {
    // 팀 손실 위험 계산
    if (context.voter.role === candidate.role) {
      return 0.8; // 같은 팀원 투표의 높은 위험
    }
    return 0.1;
  }

  private generateRiskMitigation(candidate: Player, context: VotingContext): string[] {
    const mitigation: string[] = [];
    
    mitigation.push('Provide solid reasoning for the vote');
    mitigation.push('Monitor other players\' reactions');
    
    if (context.voter.role === 'mafia') {
      mitigation.push('Coordinate with team members');
    }
    
    return mitigation;
  }

  private calculateConfidence(bestCandidate: VoteScoreResult, strategy: VotingStrategy): number {
    const baseConfidence = Math.min(1, bestCandidate.totalScore / 10);
    const riskAdjustment = 1 - (bestCandidate.riskAssessment.overallRisk * 0.3);
    const strategyConfidence = strategy.riskTolerance;
    
    return Math.max(0.1, Math.min(1, baseConfidence * riskAdjustment * strategyConfidence));
  }

  private generateReasoning(candidate: VoteScoreResult): string {
    const primaryReason = candidate.reasons[0];
    if (primaryReason) {
      return `Voting for ${candidate.player.name}: ${primaryReason.description}`;
    }
    return `Voting for ${candidate.player.name} based on strategic analysis`;
  }

  private shouldExplainVote(persona: AIPersona, candidate: VoteScoreResult): boolean {
    // 성격과 상황에 따른 설명 필요성 판단
    const needsExplanation = 
      persona.personality.analytical > 0.6 || // 분석적인 성격은 설명을 선호
      persona.personality.emotional < 0.3 || // 감정적이지 않은 플레이어는 논리적 설명
      persona.communicationStyle.verbosity > 0.6 || // 말 많은 성격
      candidate.riskAssessment.overallRisk > 0.7 ||
      candidate.totalScore < 6;
    
    return needsExplanation;
  }

  private calculatePriority(candidate: VoteScoreResult, context: VotingContext): number {
    // 점수를 1-10 우선순위로 변환
    let basePriority = Math.max(1, Math.min(10, Math.round(candidate.totalScore)));
    
    // 게임 후반부에는 우선순위 증가
    const dayCount = context.gameContext.dayCount || context.game.dayCount;
    if (dayCount >= 4) {
      basePriority = Math.min(10, basePriority + 2); // 후반부 보너스
    }
    
    return basePriority;
  }

  private predictOutcome(candidate: VoteScoreResult, context: VotingContext): VotingOutcome {
    const eliminationProbability = this.calculateEliminationProbability(candidate, context);
    
    return {
      type: eliminationProbability > 0.5 ? 'elimination' : 'tie',
      probability: eliminationProbability,
      teamImpact: this.calculateTeamImpact(candidate, context),
      gameStateChange: this.predictGameStateChange(candidate, context)
    };
  }

  private calculateEliminationProbability(candidate: VoteScoreResult, context: VotingContext): number {
    // 제거 확률 계산 (다른 플레이어들의 투표 성향 고려)
    return 0.7; // 임시 구현
  }

  private calculateTeamImpact(candidate: VoteScoreResult, context: VotingContext): TeamImpact {
    let mafiaImpact = 0;
    let citizenImpact = 0;
    let explanation = '';

    if (candidate.player.role === 'mafia') {
      mafiaImpact = -1;
      citizenImpact = 1;
      explanation = 'Eliminating mafia member benefits citizens';
    } else {
      mafiaImpact = 1;
      citizenImpact = -1;
      explanation = 'Eliminating non-mafia member benefits mafia';
    }

    return { mafiaImpact, citizenImpact, explanation };
  }

  private predictGameStateChange(candidate: VoteScoreResult, context: VotingContext): GameStateChange {
    return {
      suspicionChanges: [],
      informationReveal: [],
      allianceChanges: []
    };
  }

  private generateAlternatives(scoredCandidates: VoteScoreResult[]): AlternativeVote[] {
    return scoredCandidates.map(candidate => ({
      target: candidate.player,
      score: candidate.totalScore,
      reason: candidate.reasons[0]?.description || 'Alternative choice',
      conditional: false
    }));
  }

  private evaluateConsensus(candidate: Player, context: VotingContext): number {
    // 다른 플레이어들과의 합의도 평가
    return 0.5; // 임시 구현
  }

  // Strategy initialization methods

  private initializeRoleStrategies(): void {
    // 마피아 전략
    this.roleStrategies.set('mafia', {
      name: 'Mafia Strategy',
      description: 'Eliminate citizens while maintaining cover',
      applicableRoles: ['mafia'],
      priorities: ['eliminate_threats', 'avoid_suspicion', 'protect_teammates'],
      riskTolerance: 0.6,
      analysisDepth: 0.7,
      teamworkFactor: 0.9,
      suspicionThreshold: 0.4,
      strategicConsiderations: [
        {
          type: 'misdirection',
          weight: 0.8,
          description: 'Create false leads',
          applicableConditions: ['high_suspicion', 'information_pressure']
        }
      ]
    });

    // 경찰 전략
    this.roleStrategies.set('police', {
      name: 'Police Strategy',
      description: 'Use investigation results to eliminate mafia',
      applicableRoles: ['police'],
      priorities: ['use_investigation_results', 'eliminate_suspected_mafia', 'protect_identity'],
      riskTolerance: 0.4,
      analysisDepth: 0.9,
      teamworkFactor: 0.6,
      suspicionThreshold: 0.3,
      strategicConsiderations: [
        {
          type: 'information_warfare',
          weight: 0.9,
          description: 'Leverage investigation information strategically',
          applicableConditions: ['has_investigation_info']
        }
      ]
    });

    // 의사 전략
    this.roleStrategies.set('doctor', {
      name: 'Doctor Strategy',
      description: 'Protect key players and stay hidden',
      applicableRoles: ['doctor'],
      priorities: ['protect_key_players', 'eliminate_threats', 'stay_hidden'],
      riskTolerance: 0.3,
      analysisDepth: 0.6,
      teamworkFactor: 0.5,
      suspicionThreshold: 0.5,
      strategicConsiderations: [
        {
          type: 'timing',
          weight: 0.7,
          description: 'Time reveals carefully',
          applicableConditions: ['endgame', 'critical_situation']
        }
      ]
    });

    // 시민 전략
    this.roleStrategies.set('citizen', {
      name: 'Citizen Strategy',
      description: 'Follow evidence and eliminate suspicious players',
      applicableRoles: ['citizen'],
      priorities: ['follow_evidence', 'trust_confirmed_roles', 'eliminate_suspicious'],
      riskTolerance: 0.5,
      analysisDepth: 0.5,
      teamworkFactor: 0.7,
      suspicionThreshold: 0.6,
      strategicConsiderations: [
        {
          type: 'alliance_building',
          weight: 0.6,
          description: 'Build trust with other citizens',
          applicableConditions: ['midgame', 'confusion']
        }
      ]
    });
  }

  private initializeRoleConfigs(): void {
    // 역할별 상세 설정 초기화
    // 실제 구현에서는 더 복잡한 설정들이 들어갈 수 있음
  }

  private getDefaultStrategy(): VotingStrategy {
    return {
      name: 'Default Strategy',
      description: 'Basic voting strategy',
      applicableRoles: ['citizen'],
      priorities: ['eliminate_suspicious'],
      riskTolerance: 0.5,
      analysisDepth: 0.5,
      teamworkFactor: 0.5,
      suspicionThreshold: 0.5,
      strategicConsiderations: []
    };
  }

  private getDefaultExplanationStyle(persona: AIPersona): ExplanationStyle {
    return {
      formality: persona.communicationStyle.formality,
      directness: persona.communicationStyle.directness,
      emotionality: persona.personality.emotional,
      logicalStructure: persona.personality.analytical,
      includePersonalOpinion: persona.communicationStyle.verbosity > 0.6
    };
  }

  private buildMainExplanation(context: VoteExplanationContext): string {
    const { decision, votingContext } = context;
    const target = decision.target.name;
    const confidence = Math.round(decision.confidence * 100);
    
    return `I'm voting for ${target} (${confidence}% confidence). ${decision.reasoning}`;
  }

  private extractKeyReasons(decision: VotingDecision): string[] {
    // 주요 이유들 추출
    return [
      'High suspicion level',
      'Strategic necessity',
      'Evidence-based decision'
    ].slice(0, 2); // 최대 2개의 주요 이유
  }

  private buildSupportingDetails(context: VoteExplanationContext): string[] {
    // 보조 설명 생성
    return [
      'Based on behavioral analysis',
      'Consistent with previous observations'
    ];
  }

  private determineEmotionalTone(persona: AIPersona, decision: VotingDecision): 'neutral' | 'confident' | 'hesitant' | 'defensive' | 'aggressive' {
    if (decision.confidence > 0.8) {
      return persona.personality.aggression > 0.6 ? 'aggressive' : 'confident';
    } else if (decision.confidence < 0.4) {
      return 'hesitant';
    } else {
      return 'neutral';
    }
  }

  private predictPlayerReactions(decision: VotingDecision, context: VotingContext): any[] {
    // 플레이어 반응 예측
    return []; // 임시 구현
  }

  private async generateVotingScenario(context: VotingContext, scenarioIndex: number): Promise<VotingScenario> {
    // 투표 시나리오 생성
    const voteDistribution = new Map<number, number>();
    
    // 임시 구현
    context.candidates.forEach(candidate => {
      voteDistribution.set(candidate.id, Math.floor(Math.random() * 3));
    });

    return {
      name: `Scenario ${scenarioIndex + 1}`,
      voteDistribution,
      probability: 1 / 5, // 균등 확률
      outcomeAnalysis: {
        eliminatedPlayer: null,
        gameStateChange: {
          suspicionChanges: [],
          informationReveal: [],
          allianceChanges: []
        },
        teamBenefits: new Map(),
        followUpEffects: []
      }
    };
  }

  private calculateSimulationConfidence(scenarios: VotingScenario[]): number {
    // 시뮬레이션 신뢰도 계산
    return 0.7; // 임시 구현
  }

  private adjustStrategy(
    strategy: VotingStrategy,
    decision: VotingDecision,
    actualOutcome: any,
    gameResult: any
  ): void {
    // 전략 학습 및 조정
    // 실제 구현에서는 성과를 기반으로 전략을 개선
  }
}
import { Injectable } from '@nestjs/common';
import { Logger } from '@libs/logger';
import { Game, GamePhase } from '../../../entities/game.entity';
import { Player } from '../../../entities/player.entity';
import { Message } from '../../../entities/message.entity';
import {
  SuspicionData,
  SuspicionReason,
  SuspicionReasonType,
  SuspicionHistoryEntry,
  SuspicionUpdate,
  GameContext,
  VotingPatternAnalysis,
  VoteRecord,
  SuspiciousVoteAnalysis,
  PlayerCorrelation,
  SuspicionInference,
  SuspicionReport,
  OverallAssessment,
  PlayerSuspicionRanking,
  TeamCompositionEstimate,
  GameStateAnalysis,
  RecommendedAction,
} from '../types/suspicion.types';

/**
 * 의심 추적 및 분석 서비스
 * AI 플레이어들의 의심 레벨을 추적하고 게임 상황을 분석
 */
@Injectable()
export class SuspicionTrackerService {
  private readonly suspicionMaps = new Map<
    number,
    Map<number, Map<number, SuspicionData>>
  >();
  private readonly votingHistory = new Map<number, VoteRecord[]>();
  private readonly behaviorBaselines = new Map<number, any>();

  constructor(private readonly logger: Logger) {
    this.logger.setContext(SuspicionTrackerService.name);
  }

  /**
   * 의심 레벨을 업데이트합니다.
   */
  updateSuspicion(
    gameId: number,
    suspectingPlayerId: number,
    suspectedPlayerId: number,
    reason: SuspicionReason,
    intensity: number,
  ): SuspicionUpdate {
    this.logger.log(
      `Updating suspicion: Player ${suspectingPlayerId} suspects Player ${suspectedPlayerId}`,
    );

    const gameMap = this.getOrCreateGameMap(gameId);
    const playerSuspicions = this.getOrCreatePlayerSuspicions(
      gameMap,
      suspectingPlayerId,
    );
    const currentSuspicion = this.getOrCreateSuspicionData(
      playerSuspicions,
      suspectedPlayerId,
    );

    const previousLevel = currentSuspicion.level;
    const levelChange = this.calculateLevelChange(intensity, currentSuspicion);
    const newLevel = Math.max(0, Math.min(1, previousLevel + levelChange));

    // 의심 데이터 업데이트
    currentSuspicion.level = newLevel;
    currentSuspicion.reasons.push(reason);
    currentSuspicion.lastUpdated = new Date();
    currentSuspicion.confidence = this.calculateConfidence(
      currentSuspicion.reasons,
    );

    // 히스토리 기록
    const historyEntry: SuspicionHistoryEntry = {
      timestamp: new Date(),
      reason,
      previousLevel,
      newLevel,
      intensityChange: levelChange,
      gameContext: this.createGameContext(),
    };
    currentSuspicion.history.push(historyEntry);

    // 업데이트 결과 반환
    return {
      suspectedPlayerId,
      suspectingPlayerId,
      updatedSuspicion: currentSuspicion,
      levelChange,
      newReasons: [reason],
    };
  }

  /**
   * 투표 패턴을 분석합니다.
   */
  analyzeVotingPattern(game: Game, playerId: number): VotingPatternAnalysis {
    this.logger.log(`Analyzing voting pattern for player ${playerId}`);

    const votingHistory = this.votingHistory.get(playerId) || [];
    const suspiciousVotes = this.identifySuspiciousVotes(votingHistory, game);
    const teamCoordination = this.calculateTeamCoordination(playerId, game);

    const analysis: VotingPatternAnalysis = {
      playerId,
      votingHistory,
      patternScore: this.calculateVotingPatternScore(votingHistory, game),
      suspiciousVotes,
      teamCoordinationIndex: teamCoordination,
    };

    return analysis;
  }

  /**
   * 메시지를 기반으로 의심을 업데이트합니다.
   */
  analyzeMessageForSuspicion(
    gameId: number,
    analyzingPlayerId: number,
    message: Message,
    game: Game,
  ): SuspicionUpdate[] {
    this.logger.log(
      `Analyzing message from player ${message.senderId} for suspicions`,
    );

    const updates: SuspicionUpdate[] = [];

    // 메시지 내용 분석
    const suspiciousElements = this.detectSuspiciousElements(message);

    for (const element of suspiciousElements) {
      const reason: SuspicionReason = {
        type: 'chat_analysis',
        description: element.description,
        intensity: element.intensity,
        confidence: element.confidence,
        timestamp: new Date(),
        evidence: {
          type: 'message',
          data: message,
          description: `Message content analysis: ${element.description}`,
          weight: element.intensity,
        },
      };

      const update = this.updateSuspicion(
        gameId,
        analyzingPlayerId,
        message.senderId,
        reason,
        element.intensity,
      );

      updates.push(update);
    }

    return updates;
  }

  /**
   * 밤 생존 패턴을 분석합니다.
   */
  analyzeNightSurvivalPattern(
    gameId: number,
    analyzingPlayerId: number,
    survivedPlayerId: number,
    game: Game,
  ): SuspicionUpdate | null {
    this.logger.log(`Analyzing night survival for player ${survivedPlayerId}`);

    // 밤에 살아남은 패턴이 의심스러운지 분석
    const survivalSuspicion = this.calculateSurvivalSuspicion(
      survivedPlayerId,
      game,
    );

    if (survivalSuspicion > 0.3) {
      // 임계값 이상일 때만 의심 업데이트
      const reason: SuspicionReason = {
        type: 'night_survival',
        description: `Player ${survivedPlayerId} has suspicious survival pattern`,
        intensity: survivalSuspicion,
        confidence: 0.6,
        timestamp: new Date(),
      };

      return this.updateSuspicion(
        gameId,
        analyzingPlayerId,
        survivedPlayerId,
        reason,
        survivalSuspicion,
      );
    }

    return null;
  }

  /**
   * 투표를 기록합니다.
   */
  recordVote(
    gameId: number,
    voterId: number,
    targetId: number,
    reason?: string,
    confidence: number = 0.5,
  ): void {
    this.logger.log(
      `Recording vote: Player ${voterId} votes for Player ${targetId}`,
    );

    const vote: VoteRecord = {
      targetId,
      timestamp: new Date(),
      reason,
      confidence,
      gameContext: this.createGameContext(),
    };

    const history = this.votingHistory.get(voterId) || [];
    history.push(vote);
    this.votingHistory.set(voterId, history);

    // 투표 패턴 기반 의심 업데이트
    this.updateSuspicionBasedOnVote(gameId, voterId, targetId, vote);
  }

  /**
   * 의심 추론을 생성합니다.
   */
  generateSuspicionInference(
    gameId: number,
    analyzingPlayerId: number,
    targetPlayerId: number,
  ): SuspicionInference {
    this.logger.log(
      `Generating suspicion inference for player ${targetPlayerId}`,
    );

    const gameMap = this.suspicionMaps.get(gameId);
    const playerSuspicions = gameMap?.get(analyzingPlayerId);
    const suspicionData = playerSuspicions?.get(targetPlayerId);

    if (!suspicionData) {
      return this.createEmptyInference(targetPlayerId);
    }

    const inferredRole = this.inferRole(suspicionData);
    const probability = this.calculateRoleProbability(
      suspicionData,
      inferredRole,
    );
    const reasoning = this.generateReasoning(suspicionData);
    const confidence = this.calculateInferenceConfidence(
      suspicionData,
      reasoning,
    );

    return {
      suspectedPlayerId: targetPlayerId,
      inferredRole,
      probability,
      reasoning,
      confidence,
      timestamp: new Date(),
    };
  }

  /**
   * 종합적인 의심 보고서를 생성합니다.
   */
  generateSuspicionReport(
    gameId: number,
    analyzingPlayerId: number,
    game: Game,
  ): SuspicionReport {
    this.logger.log(
      `Generating suspicion report for player ${analyzingPlayerId}`,
    );

    const gameMap = this.suspicionMaps.get(gameId);
    const playerSuspicions = gameMap?.get(analyzingPlayerId) || new Map();

    // 플레이어별 의심 데이터 수집
    const playerSuspicionData = new Map<number, SuspicionData>();
    for (const [playerId, suspicion] of playerSuspicions) {
      playerSuspicionData.set(playerId, suspicion);
    }

    // 투표 패턴 분석
    const votingPatternAnalyses: VotingPatternAnalysis[] = [];
    for (const player of game.players) {
      if (player.isAi && player.isAlive) {
        votingPatternAnalyses.push(this.analyzeVotingPattern(game, player.id));
      }
    }

    // 의심 추론 생성
    const suspicionInferences: SuspicionInference[] = [];
    for (const player of game.players) {
      if (player.id !== analyzingPlayerId && player.isAlive) {
        suspicionInferences.push(
          this.generateSuspicionInference(gameId, analyzingPlayerId, player.id),
        );
      }
    }

    // 종합 평가
    const overallAssessment = this.generateOverallAssessment(
      playerSuspicionData,
      votingPatternAnalyses,
      suspicionInferences,
      game,
    );

    return {
      timestamp: new Date(),
      gameContext: this.createGameContext(),
      playerSuspicions: playerSuspicionData,
      behaviorAnalyses: [], // BehaviorAnalyzerService에서 제공
      votingPatternAnalyses,
      suspicionInferences,
      overallAssessment,
    };
  }

  /**
   * 플레이어의 의심 데이터를 가져옵니다.
   */
  getSuspicionData(
    gameId: number,
    suspectingPlayerId: number,
    suspectedPlayerId: number,
  ): SuspicionData | null {
    const gameMap = this.suspicionMaps.get(gameId);
    const playerSuspicions = gameMap?.get(suspectingPlayerId);
    return playerSuspicions?.get(suspectedPlayerId) || null;
  }

  /**
   * 게임 종료 시 정리 작업을 수행합니다.
   */
  cleanup(gameId: number): void {
    this.logger.log(`Cleaning up suspicion data for game ${gameId}`);

    this.suspicionMaps.delete(gameId);

    // 투표 히스토리에서 해당 게임 관련 데이터 정리
    for (const [playerId, votes] of this.votingHistory) {
      const filteredVotes = votes.filter(
        (vote) => vote.gameContext.phase !== undefined,
      );
      if (filteredVotes.length === 0) {
        this.votingHistory.delete(playerId);
      } else {
        this.votingHistory.set(playerId, filteredVotes);
      }
    }
  }

  // Private helper methods

  private getOrCreateGameMap(
    gameId: number,
  ): Map<number, Map<number, SuspicionData>> {
    if (!this.suspicionMaps.has(gameId)) {
      this.suspicionMaps.set(gameId, new Map());
    }
    return this.suspicionMaps.get(gameId)!;
  }

  private getOrCreatePlayerSuspicions(
    gameMap: Map<number, Map<number, SuspicionData>>,
    playerId: number,
  ): Map<number, SuspicionData> {
    if (!gameMap.has(playerId)) {
      gameMap.set(playerId, new Map());
    }
    return gameMap.get(playerId)!;
  }

  private getOrCreateSuspicionData(
    playerSuspicions: Map<number, SuspicionData>,
    suspectedPlayerId: number,
  ): SuspicionData {
    if (!playerSuspicions.has(suspectedPlayerId)) {
      const newSuspicion: SuspicionData = {
        level: 0.1, // 기본 의심 레벨
        reasons: [],
        history: [],
        lastUpdated: new Date(),
        confidence: 0.5,
      };
      playerSuspicions.set(suspectedPlayerId, newSuspicion);
    }
    return playerSuspicions.get(suspectedPlayerId)!;
  }

  private calculateLevelChange(
    intensity: number,
    currentSuspicion: SuspicionData,
  ): number {
    // 현재 의심 레벨이 높을수록 추가 증가량은 감소 (로그 스케일)
    const decayFactor = 1 - currentSuspicion.level * 0.3;
    return intensity * decayFactor;
  }

  private calculateConfidence(reasons: SuspicionReason[]): number {
    if (reasons.length === 0) return 0.5;

    const avgConfidence =
      reasons.reduce((sum, reason) => sum + reason.confidence, 0) /
      reasons.length;
    const diversityBonus = Math.min(reasons.length / 5, 0.2); // 다양한 이유가 있을수록 신뢰도 증가

    return Math.min(1, avgConfidence + diversityBonus);
  }

  private createGameContext(): GameContext {
    // 실제 구현에서는 현재 게임 상태를 반영
    return {
      phase: 'day',
      dayCount: 1,
      alivePlayersCount: 6,
      recentEvents: [],
    };
  }

  private detectSuspiciousElements(
    message: Message,
  ): Array<{ description: string; intensity: number; confidence: number }> {
    const elements: Array<{
      description: string;
      intensity: number;
      confidence: number;
    }> = [];
    const content = message.content.toLowerCase();

    // 방어적 언어 패턴 감지
    const defensivePatterns = [
      '아니야',
      '그런 게 아니야',
      '왜 나를',
      '증거가 있어?',
      '억울해',
    ];
    for (const pattern of defensivePatterns) {
      if (content.includes(pattern)) {
        elements.push({
          description: `Defensive language detected: ${pattern}`,
          intensity: 0.3,
          confidence: 0.7,
        });
      }
    }

    // 주제 전환 시도 감지
    const redirectPatterns = [
      '그런데',
      '그보다는',
      '다른 얘기인데',
      '그것보다',
    ];
    for (const pattern of redirectPatterns) {
      if (content.includes(pattern)) {
        elements.push({
          description: `Topic redirection detected: ${pattern}`,
          intensity: 0.2,
          confidence: 0.6,
        });
      }
    }

    // 과도한 확신 표현
    const overConfidentPatterns = ['100% 확실', '절대로', '분명히', '틀림없이'];
    for (const pattern of overConfidentPatterns) {
      if (content.includes(pattern)) {
        elements.push({
          description: `Overconfident language: ${pattern}`,
          intensity: 0.25,
          confidence: 0.5,
        });
      }
    }

    return elements;
  }

  private calculateSurvivalSuspicion(
    survivedPlayerId: number,
    game: Game,
  ): number {
    // 간단한 생존 패턴 분석
    // 실제로는 더 복잡한 알고리즘이 필요
    const totalNights = game.dayCount - 1;
    if (totalNights <= 1) return 0;

    // 마피아가 특정 플레이어를 계속 살려두는 패턴이 있는지 분석
    const survivalRate = 1.0; // 실제 구현에서는 계산 필요
    const expectedSurvivalRate = 0.7; // 평균 생존율

    return Math.max(0, survivalRate - expectedSurvivalRate);
  }

  private identifySuspiciousVotes(
    votingHistory: VoteRecord[],
    game: Game,
  ): SuspiciousVoteAnalysis[] {
    const suspicious: SuspiciousVoteAnalysis[] = [];

    // 간단한 분석: 일관성 없는 투표 패턴 감지
    for (let i = 1; i < votingHistory.length; i++) {
      const current = votingHistory[i];
      const previous = votingHistory[i - 1];

      // 급격한 투표 대상 변경 감지
      if (current.targetId !== previous.targetId && current.confidence < 0.6) {
        suspicious.push({
          vote: current,
          suspicionReason: 'Inconsistent voting pattern',
          suspicionIntensity: 0.4,
          correlationWithOthers: [], // 실제로는 다른 플레이어들과의 상관관계 분석
        });
      }
    }

    return suspicious;
  }

  private calculateTeamCoordination(playerId: number, game: Game): number {
    // 다른 플레이어들과의 투표 일치도 계산
    // 간단한 구현 - 실제로는 더 복잡한 분석 필요
    return 0.5;
  }

  private calculateVotingPatternScore(
    votingHistory: VoteRecord[],
    game: Game,
  ): number {
    if (votingHistory.length === 0) return 0.5;

    // 투표 일관성, 타이밍, 근거 제시 등을 종합적으로 평가
    let score = 0.5;

    // 투표 확신도 평균
    const avgConfidence =
      votingHistory.reduce((sum, vote) => sum + vote.confidence, 0) /
      votingHistory.length;
    score += (avgConfidence - 0.5) * 0.3;

    // 근거 제시율
    const reasonProvisionRate =
      votingHistory.filter((vote) => vote.reason).length / votingHistory.length;
    score += reasonProvisionRate * 0.2;

    return Math.max(0, Math.min(1, score));
  }

  private updateSuspicionBasedOnVote(
    gameId: number,
    voterId: number,
    targetId: number,
    vote: VoteRecord,
  ): void {
    // 투표 패턴을 기반으로 한 의심 업데이트 로직
    // 이 부분은 복잡한 게임 이론과 패턴 분석이 필요

    const reason: SuspicionReason = {
      type: 'voting_pattern',
      description: `Voted for player ${targetId}`,
      intensity: 0.1,
      confidence: vote.confidence,
      timestamp: new Date(),
      evidence: {
        type: 'vote',
        data: vote,
        description: `Vote evidence: ${vote.reason || 'No reason provided'}`,
        weight: 0.1,
      },
    };

    // 자기 자신에 대한 투표 기록이므로, 다른 AI들이 이를 분석해야 함
    // 여기서는 간단히 패스
  }

  private inferRole(
    suspicionData: SuspicionData,
  ): 'citizen' | 'mafia' | 'police' | 'doctor' | 'unknown' {
    if (suspicionData.level > 0.7) {
      return 'mafia';
    } else if (suspicionData.level < 0.3) {
      // 낮은 의심도는 시민이거나 특수 역할일 가능성
      const hasRoleClaimEvidence = suspicionData.reasons.some(
        (r) => r.type === 'role_claim',
      );
      if (hasRoleClaimEvidence) {
        return 'police'; // 또는 추가 분석 필요
      }
      return 'citizen';
    }

    return 'unknown';
  }

  private calculateRoleProbability(
    suspicionData: SuspicionData,
    role: string,
  ): number {
    // 역할별 확률 계산
    switch (role) {
      case 'mafia':
        return suspicionData.level;
      case 'citizen':
        return 1 - suspicionData.level;
      case 'police':
      case 'doctor':
        return 0.3; // 특수 역할은 낮은 기본 확률
      default:
        return 0.5;
    }
  }

  private generateReasoning(suspicionData: SuspicionData): any[] {
    // 추론 근거 생성
    return suspicionData.reasons.map((reason) => ({
      type: 'behavioral',
      description: reason.description,
      weight: reason.intensity,
      supportingEvidence: reason.evidence ? [reason.evidence] : [],
    }));
  }

  private calculateInferenceConfidence(
    suspicionData: SuspicionData,
    reasoning: any[],
  ): number {
    const reasoningStrength =
      reasoning.reduce((sum, r) => sum + r.weight, 0) / reasoning.length;
    return Math.min(1, suspicionData.confidence * reasoningStrength);
  }

  private createEmptyInference(targetPlayerId: number): SuspicionInference {
    return {
      suspectedPlayerId: targetPlayerId,
      inferredRole: 'unknown',
      probability: 0.5,
      reasoning: [],
      confidence: 0.1,
      timestamp: new Date(),
    };
  }

  private generateOverallAssessment(
    playerSuspicions: Map<number, SuspicionData>,
    votingAnalyses: VotingPatternAnalysis[],
    inferences: SuspicionInference[],
    game: Game,
  ): OverallAssessment {
    // 가장 의심스러운 플레이어들 순위
    const rankings: PlayerSuspicionRanking[] = [];
    for (const [playerId, suspicion] of playerSuspicions) {
      rankings.push({
        playerId,
        suspicionScore: suspicion.level,
        rank: 0, // 정렬 후 설정
        primaryReason: suspicion.reasons[0] || {
          type: 'voting_pattern',
          description: 'No specific reason',
          intensity: 0,
          confidence: 0.5,
          timestamp: new Date(),
        },
      });
    }
    rankings.sort((a, b) => b.suspicionScore - a.suspicionScore);
    rankings.forEach((rank, index) => (rank.rank = index + 1));

    // 팀 구성 추정
    const teamEstimate: TeamCompositionEstimate = {
      estimatedMafia: rankings.slice(0, 2).map((r) => ({
        playerId: r.playerId,
        probability: r.suspicionScore,
      })),
      estimatedCitizens: rankings.slice(-3).map((r) => ({
        playerId: r.playerId,
        probability: 1 - r.suspicionScore,
      })),
      specialRoles: [
        {
          role: 'police',
          candidates: rankings
            .filter((r) => r.suspicionScore < 0.3)
            .map((r) => ({
              playerId: r.playerId,
              probability: 0.3,
            })),
          confidence: 0.4,
        },
      ],
      confidence: 0.6,
    };

    // 게임 상황 분석
    const gameAnalysis: GameStateAnalysis = {
      mafiaAdvantage: this.calculateMafiaAdvantage(game),
      citizenAdvantage: this.calculateCitizenAdvantage(game),
      estimatedRemainingTurns: Math.ceil(
        game.players.filter((p) => p.isAlive).length / 2,
      ),
      criticalDecisionPoints: ['Next voting phase', 'Role reveals'],
    };

    // 권장 행동
    const recommendedActions: RecommendedAction[] = [
      {
        type: 'investigate',
        targetPlayerId: rankings[0]?.playerId,
        description: `Investigate most suspicious player`,
        priority: 8,
        expectedOutcome: 'Gain information about suspected mafia member',
      },
      {
        type: 'vote',
        targetPlayerId: rankings[0]?.playerId,
        description: `Vote to eliminate most suspicious player`,
        priority: 7,
        expectedOutcome: 'Remove potential mafia threat',
      },
    ];

    return {
      mostSuspicious: rankings,
      teamCompositionEstimate: teamEstimate,
      gameStateAnalysis: gameAnalysis,
      recommendedActions,
    };
  }

  private calculateMafiaAdvantage(game: Game): number {
    const alivePlayers = game.players.filter((p) => p.isAlive).length;
    const mafiaCount = game.players.filter(
      (p) => p.role === 'mafia' && p.isAlive,
    ).length;

    // 마피아가 시민 수와 같아지면 게임 승리이므로 비율로 계산
    return mafiaCount / (alivePlayers - mafiaCount);
  }

  private calculateCitizenAdvantage(game: Game): number {
    return 1 - this.calculateMafiaAdvantage(game);
  }
}

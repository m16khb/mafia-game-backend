import { GamePhase, GameRole } from '../../../entities/game.entity';
import { Player } from '../../../entities/player.entity';
import { Message } from '../../../entities/message.entity';

/**
 * 의심 추적 시스템 타입 정의
 */

/**
 * 의심 데이터
 */
export interface SuspicionData {
  /** 의심 레벨 (0-1) */
  level: number;
  /** 의심 이유들 */
  reasons: SuspicionReason[];
  /** 의심 변화 기록 */
  history: SuspicionHistoryEntry[];
  /** 마지막 업데이트 시간 */
  lastUpdated: Date;
  /** 신뢰도 점수 */
  confidence: number;
}

/**
 * 의심 이유
 */
export interface SuspicionReason {
  /** 의심 유형 */
  type: SuspicionReasonType;
  /** 의심 이유 설명 */
  description: string;
  /** 의심 강도 (0-1) */
  intensity: number;
  /** 신뢰도 (0-1) */
  confidence: number;
  /** 발생 시간 */
  timestamp: Date;
  /** 관련 증거 */
  evidence?: SuspicionEvidence;
}

export type SuspicionReasonType =
  | 'voting_pattern' // 투표 패턴 분석
  | 'chat_analysis' // 채팅 행동 분석
  | 'night_survival' // 밤 생존 패턴
  | 'role_claim' // 역할 주장 관련
  | 'defense_pattern' // 방어 패턴
  | 'accusation_timing' // 의심 제기 타이밍
  | 'team_coordination' // 팀 협조 패턴
  | 'information_sharing' // 정보 공유 패턴
  | 'reaction_speed' // 반응 속도
  | 'emotional_response'; // 감정적 반응

/**
 * 의심 변화 기록
 */
export interface SuspicionHistoryEntry {
  /** 기록 시간 */
  timestamp: Date;
  /** 의심 변화 이유 */
  reason: SuspicionReason;
  /** 이전 의심 레벨 */
  previousLevel: number;
  /** 새로운 의심 레벨 */
  newLevel: number;
  /** 의심 레벨 변화량 */
  intensityChange: number;
  /** 관련 게임 컨텍스트 */
  gameContext: GameContext;
}

/**
 * 의심 증거
 */
export interface SuspicionEvidence {
  /** 증거 유형 */
  type: 'message' | 'vote' | 'timing' | 'pattern' | 'behavior';
  /** 증거 데이터 */
  data: any;
  /** 증거 설명 */
  description: string;
  /** 증거 가중치 */
  weight: number;
}

/**
 * 게임 컨텍스트
 */
export interface GameContext {
  /** 현재 페이즈 */
  phase: GamePhase;
  /** 현재 일차 */
  dayCount: number;
  /** 생존 플레이어 수 */
  alivePlayersCount: number;
  /** 최근 이벤트들 */
  recentEvents: string[];
}

/**
 * 의심 업데이트 결과
 */
export interface SuspicionUpdate {
  /** 의심받는 플레이어 ID */
  suspectedPlayerId: number;
  /** 의심하는 플레이어 ID */
  suspectingPlayerId: number;
  /** 업데이트된 의심 데이터 */
  updatedSuspicion: SuspicionData;
  /** 의심 레벨 변화량 */
  levelChange: number;
  /** 새로운 이유들 */
  newReasons: SuspicionReason[];
}

/**
 * 행동 분석 결과
 */
export interface BehaviorAnalysis {
  /** 플레이어 ID */
  playerId: number;
  /** 분석 시간 */
  timestamp: Date;
  /** 말하기 패턴 */
  verbosity: VerbosityAnalysis;
  /** 주제 회피 패턴 */
  topicAvoidance: TopicAvoidanceAnalysis;
  /** 방어적 성향 */
  defensiveness: DefensivenessAnalysis;
  /** 의심 제기 패턴 */
  accusationPattern: AccusationPatternAnalysis;
  /** 시간 패턴 */
  timePattern: TimePatternAnalysis;
  /** 종합 점수 */
  overallScore: number;
  /** 분석 신뢰도 */
  confidence: number;
}

/**
 * 말하기 패턴 분석
 */
export interface VerbosityAnalysis {
  /** 평균 메시지 길이 */
  averageMessageLength: number;
  /** 메시지 빈도 */
  messageFrequency: number;
  /** 기준 대비 변화율 */
  changeFromBaseline: number;
  /** 침묵 기간 */
  silencePeriods: number[];
}

/**
 * 주제 회피 분석
 */
export interface TopicAvoidanceAnalysis {
  /** 회피 점수 (0-1) */
  avoidanceScore: number;
  /** 회피한 주제들 */
  avoidedTopics: string[];
  /** 주제 전환 빈도 */
  topicChangeFrequency: number;
  /** 모호한 답변 빈도 */
  vagueResponseCount: number;
}

/**
 * 방어적 성향 분석
 */
export interface DefensivenessAnalysis {
  /** 방어 점수 (0-1) */
  defensivenessScore: number;
  /** 방어적 언어 사용 빈도 */
  defensiveLanguageCount: number;
  /** 정당화 시도 빈도 */
  justificationAttempts: number;
  /** 반박 패턴 */
  counterAttackPattern: number;
}

/**
 * 의심 제기 패턴 분석
 */
export interface AccusationPatternAnalysis {
  /** 의심 제기 빈도 */
  accusationFrequency: number;
  /** 의심 대상 분산도 */
  targetDiversity: number;
  /** 의심 타이밍 패턴 */
  timingPattern: 'early' | 'late' | 'reactive' | 'strategic';
  /** 근거 제시 정도 */
  evidenceProvision: number;
}

/**
 * 시간 패턴 분석
 */
export interface TimePatternAnalysis {
  /** 평균 응답 시간 */
  averageResponseTime: number;
  /** 응답 시간 변화 패턴 */
  responseTimePattern: number[];
  /** 급작스러운 침묵 빈도 */
  suddenSilenceCount: number;
  /** 활동 시간 패턴 */
  activityTimePattern: ActivityPeriod[];
}

/**
 * 활동 시간대
 */
export interface ActivityPeriod {
  /** 시작 시간 */
  start: Date;
  /** 종료 시간 */
  end: Date;
  /** 활동 강도 */
  intensity: number;
  /** 메시지 수 */
  messageCount: number;
}

/**
 * 투표 패턴 분석
 */
export interface VotingPatternAnalysis {
  /** 플레이어 ID */
  playerId: number;
  /** 투표 기록 */
  votingHistory: VoteRecord[];
  /** 투표 패턴 점수 */
  patternScore: number;
  /** 의심스러운 투표들 */
  suspiciousVotes: SuspiciousVoteAnalysis[];
  /** 팀 협조 지수 */
  teamCoordinationIndex: number;
}

/**
 * 투표 기록
 */
export interface VoteRecord {
  /** 투표 대상 ID */
  targetId: number;
  /** 투표 시간 */
  timestamp: Date;
  /** 투표 이유 */
  reason?: string;
  /** 투표 확신도 */
  confidence: number;
  /** 게임 상황 */
  gameContext: GameContext;
}

/**
 * 의심스러운 투표 분석
 */
export interface SuspiciousVoteAnalysis {
  /** 투표 기록 */
  vote: VoteRecord;
  /** 의심 이유 */
  suspicionReason: string;
  /** 의심 강도 */
  suspicionIntensity: number;
  /** 다른 플레이어들의 투표와의 상관관계 */
  correlationWithOthers: PlayerCorrelation[];
}

/**
 * 플레이어 상관관계
 */
export interface PlayerCorrelation {
  /** 상관관계 대상 플레이어 ID */
  playerId: number;
  /** 상관관계 점수 (-1 ~ 1) */
  correlationScore: number;
  /** 상관관계 유형 */
  correlationType: 'positive' | 'negative' | 'neutral';
  /** 상관관계 설명 */
  description: string;
}

/**
 * 의심 추론 결과
 */
export interface SuspicionInference {
  /** 의심받는 플레이어 ID */
  suspectedPlayerId: number;
  /** 추정 역할 */
  inferredRole: GameRole | 'unknown';
  /** 추정 확률 */
  probability: number;
  /** 추론 근거 */
  reasoning: InferenceReasoning[];
  /** 추론 신뢰도 */
  confidence: number;
  /** 추론 생성 시간 */
  timestamp: Date;
}

/**
 * 추론 근거
 */
export interface InferenceReasoning {
  /** 근거 유형 */
  type: 'behavioral' | 'statistical' | 'pattern' | 'elimination';
  /** 근거 설명 */
  description: string;
  /** 근거 가중치 */
  weight: number;
  /** 지지 증거들 */
  supportingEvidence: SuspicionEvidence[];
}

/**
 * 의심 보고서
 */
export interface SuspicionReport {
  /** 보고서 생성 시간 */
  timestamp: Date;
  /** 게임 컨텍스트 */
  gameContext: GameContext;
  /** 플레이어별 의심 데이터 */
  playerSuspicions: Map<number, SuspicionData>;
  /** 행동 분석 결과들 */
  behaviorAnalyses: BehaviorAnalysis[];
  /** 투표 패턴 분석들 */
  votingPatternAnalyses: VotingPatternAnalysis[];
  /** 의심 추론 결과들 */
  suspicionInferences: SuspicionInference[];
  /** 종합 평가 */
  overallAssessment: OverallAssessment;
}

/**
 * 종합 평가
 */
export interface OverallAssessment {
  /** 가장 의심스러운 플레이어들 */
  mostSuspicious: PlayerSuspicionRanking[];
  /** 팀 구성 추정 */
  teamCompositionEstimate: TeamCompositionEstimate;
  /** 게임 상황 분석 */
  gameStateAnalysis: GameStateAnalysis;
  /** 권장 행동 */
  recommendedActions: RecommendedAction[];
}

/**
 * 플레이어 의심 순위
 */
export interface PlayerSuspicionRanking {
  /** 플레이어 ID */
  playerId: number;
  /** 의심 점수 */
  suspicionScore: number;
  /** 순위 */
  rank: number;
  /** 주요 의심 이유 */
  primaryReason: SuspicionReason;
}

/**
 * 팀 구성 추정
 */
export interface TeamCompositionEstimate {
  /** 추정 마피아 멤버들 */
  estimatedMafia: PlayerProbability[];
  /** 추정 시민 멤버들 */
  estimatedCitizens: PlayerProbability[];
  /** 특수 역할 추정 */
  specialRoles: SpecialRoleEstimate[];
  /** 추정 확신도 */
  confidence: number;
}

/**
 * 플레이어 확률
 */
export interface PlayerProbability {
  /** 플레이어 ID */
  playerId: number;
  /** 확률 */
  probability: number;
}

/**
 * 특수 역할 추정
 */
export interface SpecialRoleEstimate {
  /** 역할 */
  role: 'police' | 'doctor';
  /** 후보 플레이어들 */
  candidates: PlayerProbability[];
  /** 추정 확신도 */
  confidence: number;
}

/**
 * 게임 상황 분석
 */
export interface GameStateAnalysis {
  /** 마피아 우위 정도 */
  mafiaAdvantage: number;
  /** 시민 우위 정도 */
  citizenAdvantage: number;
  /** 게임 종료까지 예상 턴 수 */
  estimatedRemainingTurns: number;
  /** 중요 결정 포인트들 */
  criticalDecisionPoints: string[];
}

/**
 * 권장 행동
 */
export interface RecommendedAction {
  /** 행동 유형 */
  type: 'investigate' | 'vote' | 'defend' | 'attack' | 'observe';
  /** 대상 플레이어 ID */
  targetPlayerId?: number;
  /** 행동 설명 */
  description: string;
  /** 우선순위 (1-10) */
  priority: number;
  /** 예상 효과 */
  expectedOutcome: string;
}

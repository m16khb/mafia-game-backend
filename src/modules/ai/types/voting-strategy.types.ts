import { GameRole, GamePhase } from '../../../entities/game.entity';
import { Player } from '../../../entities/player.entity';
import { AIPersona } from './ai-persona.types';
import { SuspicionData, GameContext } from './suspicion.types';

/**
 * 투표 전략 시스템 타입 정의
 */

/**
 * 투표 결정
 */
export interface VotingDecision {
  /** 투표 대상 플레이어 */
  target: Player;
  /** 투표 확신도 (0-1) */
  confidence: number;
  /** 투표 이유 */
  reasoning: string;
  /** 투표 설명 필요 여부 */
  shouldExplain: boolean;
  /** 투표 우선순위 (1-10) */
  priority: number;
  /** 예상 결과 */
  expectedOutcome: VotingOutcome;
  /** 대안 투표 대상들 */
  alternatives: AlternativeVote[];
}

/**
 * 투표 결과 예상
 */
export interface VotingOutcome {
  /** 예상 결과 유형 */
  type: 'elimination' | 'tie' | 'no_elimination';
  /** 결과 확률 */
  probability: number;
  /** 팀에 대한 영향 */
  teamImpact: TeamImpact;
  /** 게임 상황 변화 예측 */
  gameStateChange: GameStateChange;
}

/**
 * 팀 영향도
 */
export interface TeamImpact {
  /** 마피아 팀에 대한 영향 (-1 ~ 1) */
  mafiaImpact: number;
  /** 시민 팀에 대한 영향 (-1 ~ 1) */
  citizenImpact: number;
  /** 영향에 대한 설명 */
  explanation: string;
}

/**
 * 게임 상황 변화
 */
export interface GameStateChange {
  /** 의심 관계도 변화 */
  suspicionChanges: SuspicionChange[];
  /** 정보 공개 가능성 */
  informationReveal: InformationReveal[];
  /** 연합 관계 변화 */
  allianceChanges: AllianceChange[];
}

/**
 * 의심 변화
 */
export interface SuspicionChange {
  /** 대상 플레이어 ID */
  playerId: number;
  /** 의심 변화량 */
  suspicionDelta: number;
  /** 변화 이유 */
  reason: string;
}

/**
 * 정보 공개
 */
export interface InformationReveal {
  /** 정보 유형 */
  type: 'role' | 'alliance' | 'knowledge' | 'pattern';
  /** 정보 내용 */
  content: string;
  /** 공개 확률 */
  probability: number;
  /** 관련 플레이어들 */
  involvedPlayers: number[];
}

/**
 * 연합 관계 변화
 */
export interface AllianceChange {
  /** 플레이어 A ID */
  playerAId: number;
  /** 플레이어 B ID */
  playerBId: number;
  /** 관계 변화 (-1 ~ 1) */
  relationshipDelta: number;
  /** 변화 이유 */
  reason: string;
}

/**
 * 대안 투표
 */
export interface AlternativeVote {
  /** 대상 플레이어 */
  target: Player;
  /** 선택 점수 */
  score: number;
  /** 선택 이유 */
  reason: string;
  /** 조건부 선택 여부 */
  conditional: boolean;
  /** 조건 */
  condition?: VotingCondition;
}

/**
 * 투표 조건
 */
export interface VotingCondition {
  /** 조건 유형 */
  type: 'other_votes' | 'information_revealed' | 'time_pressure' | 'tie_situation';
  /** 조건 설명 */
  description: string;
  /** 조건 확인 함수 */
  checkCondition: (context: VotingContext) => boolean;
}

/**
 * 투표 전략
 */
export interface VotingStrategy {
  /** 전략 이름 */
  name: string;
  /** 전략 설명 */
  description: string;
  /** 적용 역할 */
  applicableRoles: GameRole[];
  /** 우선순위 목록 */
  priorities: VotingPriority[];
  /** 위험 허용도 (0-1) */
  riskTolerance: number;
  /** 분석 깊이 (0-1) */
  analysisDepth: number;
  /** 팀워크 요소 (0-1) */
  teamworkFactor: number;
  /** 의심 임계값 */
  suspicionThreshold: number;
  /** 전략적 고려사항 */
  strategicConsiderations: StrategicConsideration[];
}

/**
 * 투표 우선순위
 */
export type VotingPriority = 
  | 'eliminate_threats'
  | 'avoid_suspicion'
  | 'protect_teammates'
  | 'use_investigation_results'
  | 'eliminate_suspected_mafia'
  | 'protect_identity'
  | 'protect_key_players'
  | 'stay_hidden'
  | 'follow_evidence'
  | 'trust_confirmed_roles'
  | 'eliminate_suspicious'
  | 'maintain_cover'
  | 'create_confusion'
  | 'build_alliances';

/**
 * 전략적 고려사항
 */
export interface StrategicConsideration {
  /** 고려사항 유형 */
  type: 'information_warfare' | 'misdirection' | 'alliance_building' | 'timing' | 'pressure';
  /** 가중치 */
  weight: number;
  /** 설명 */
  description: string;
  /** 적용 조건 */
  applicableConditions: string[];
}

/**
 * 투표 컨텍스트
 */
export interface VotingContext {
  /** 현재 게임 */
  game: any; // Game 타입 참조
  /** 투표하는 플레이어 */
  voter: Player;
  /** 플레이어 페르소나 */
  persona: AIPersona;
  /** 현재 페이즈 */
  phase: GamePhase;
  /** 투표 후보들 */
  candidates: Player[];
  /** 의심 데이터 맵 */
  suspicionData: Map<number, SuspicionData>;
  /** 게임 컨텍스트 */
  gameContext: GameContext;
  /** 이미 투표한 플레이어들 */
  existingVotes: Map<number, number>; // voterId -> targetId
  /** 남은 투표 시간 */
  timeRemaining: number;
  /** 추가 정보 */
  additionalInfo: Record<string, any>;
}

/**
 * 투표 점수 계산 결과
 */
export interface VoteScoreResult {
  /** 대상 플레이어 */
  player: Player;
  /** 총 점수 */
  totalScore: number;
  /** 점수 세부사항 */
  scoreBreakdown: ScoreBreakdown;
  /** 투표 이유 */
  reasons: VoteReason[];
  /** 위험도 평가 */
  riskAssessment: RiskAssessment;
}

/**
 * 점수 세부사항
 */
export interface ScoreBreakdown {
  /** 의심 점수 */
  suspicionScore: number;
  /** 전략적 가치 점수 */
  strategicValue: number;
  /** 위험도 점수 */
  riskScore: number;
  /** 팀워크 점수 */
  teamworkScore: number;
  /** 정보 가치 점수 */
  informationValue: number;
  /** 타이밍 점수 */
  timingScore: number;
  /** 기타 보너스 */
  miscBonus: number;
}

/**
 * 투표 이유
 */
export interface VoteReason {
  /** 이유 유형 */
  type: VoteReasonType;
  /** 이유 설명 */
  description: string;
  /** 신뢰도 */
  confidence: number;
  /** 가중치 */
  weight: number;
  /** 지지 증거 */
  evidence: string[];
}

export type VoteReasonType = 
  | 'high_suspicion'
  | 'strategic_elimination'
  | 'information_gathering'
  | 'threat_removal'
  | 'alliance_building'
  | 'misdirection'
  | 'defensive_voting'
  | 'follow_consensus'
  | 'pressure_application'
  | 'role_confirmation';

/**
 * 위험도 평가
 */
export interface RiskAssessment {
  /** 전체 위험도 (0-1) */
  overallRisk: number;
  /** 신원 노출 위험 */
  identityExposureRisk: number;
  /** 보복 위험 */
  retaliationRisk: number;
  /** 오판 위험 */
  misjudgmentRisk: number;
  /** 팀 손실 위험 */
  teamLossRisk: number;
  /** 위험 완화 방안 */
  mitigation: string[];
}

/**
 * 투표 설명 생성 컨텍스트
 */
export interface VoteExplanationContext {
  /** 투표 결정 */
  decision: VotingDecision;
  /** 투표 컨텍스트 */
  votingContext: VotingContext;
  /** 설명 스타일 */
  explanationStyle: ExplanationStyle;
  /** 대상 청중 */
  audience: 'all_players' | 'specific_players' | 'mafia_team';
  /** 설명 길이 */
  length: 'brief' | 'detailed' | 'comprehensive';
}

/**
 * 설명 스타일
 */
export interface ExplanationStyle {
  /** 형식성 레벨 (0-1) */
  formality: number;
  /** 직접성 (0-1) */
  directness: number;
  /** 감정적 표현 (0-1) */
  emotionality: number;
  /** 논리적 구조화 (0-1) */
  logicalStructure: number;
  /** 개인적 의견 포함 여부 */
  includePersonalOpinion: boolean;
}

/**
 * 생성된 투표 설명
 */
export interface GeneratedVoteExplanation {
  /** 메인 설명 */
  mainExplanation: string;
  /** 핵심 이유 */
  keyReasons: string[];
  /** 보조 설명 */
  supportingDetails: string[];
  /** 감정적 톤 */
  emotionalTone: 'neutral' | 'confident' | 'hesitant' | 'defensive' | 'aggressive';
  /** 예상 반응 */
  expectedReactions: PlayerReaction[];
}

/**
 * 플레이어 반응 예측
 */
export interface PlayerReaction {
  /** 플레이어 ID */
  playerId: number;
  /** 예상 반응 유형 */
  reactionType: 'supportive' | 'neutral' | 'suspicious' | 'defensive' | 'counter_accusation';
  /** 반응 확률 */
  probability: number;
  /** 반응 이유 */
  reason: string;
}

/**
 * 역할별 투표 전략 설정
 */
export interface RoleVotingConfig {
  /** 역할 */
  role: GameRole;
  /** 기본 전략 */
  defaultStrategy: VotingStrategy;
  /** 상황별 전략 변형 */
  situationalStrategies: SituationalStrategy[];
  /** 특수 규칙 */
  specialRules: SpecialVotingRule[];
  /** 협력 규칙 */
  cooperationRules: CooperationRule[];
}

/**
 * 상황별 전략
 */
export interface SituationalStrategy {
  /** 상황 조건 */
  condition: SituationCondition;
  /** 적용할 전략 */
  strategy: VotingStrategy;
  /** 우선순위 */
  priority: number;
  /** 설명 */
  description: string;
}

/**
 * 상황 조건
 */
export interface SituationCondition {
  /** 조건 유형 */
  type: 'player_count' | 'day_count' | 'suspicion_level' | 'role_revealed' | 'team_status';
  /** 조건 연산자 */
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  /** 조건 값 */
  value: number | string | boolean;
  /** 조건 설명 */
  description: string;
}

/**
 * 특수 투표 규칙
 */
export interface SpecialVotingRule {
  /** 규칙 이름 */
  name: string;
  /** 규칙 설명 */
  description: string;
  /** 적용 조건 */
  condition: SituationCondition;
  /** 규칙 효과 */
  effect: VotingRuleEffect;
}

/**
 * 투표 규칙 효과
 */
export interface VotingRuleEffect {
  /** 효과 유형 */
  type: 'modify_score' | 'exclude_target' | 'force_target' | 'change_strategy';
  /** 효과 매개변수 */
  parameters: Record<string, any>;
  /** 효과 설명 */
  description: string;
}

/**
 * 협력 규칙
 */
export interface CooperationRule {
  /** 협력 대상 역할 */
  targetRole: GameRole;
  /** 협력 유형 */
  cooperationType: 'coordinate_votes' | 'protect_each_other' | 'share_information' | 'create_diversion';
  /** 협력 조건 */
  conditions: SituationCondition[];
  /** 협력 강도 (0-1) */
  intensity: number;
  /** 설명 */
  description: string;
}

/**
 * 투표 시뮬레이션 결과
 */
export interface VotingSimulation {
  /** 시뮬레이션 ID */
  simulationId: string;
  /** 시뮬레이션된 투표 결과들 */
  scenarios: VotingScenario[];
  /** 최적 선택 */
  optimalChoice: VotingDecision;
  /** 시뮬레이션 신뢰도 */
  confidence: number;
  /** 시뮬레이션 시간 */
  timestamp: Date;
}

/**
 * 투표 시나리오
 */
export interface VotingScenario {
  /** 시나리오 이름 */
  name: string;
  /** 투표 분포 */
  voteDistribution: Map<number, number>; // targetId -> vote count
  /** 시나리오 확률 */
  probability: number;
  /** 결과 분석 */
  outcomeAnalysis: OutcomeAnalysis;
}

/**
 * 결과 분석
 */
export interface OutcomeAnalysis {
  /** 제거될 플레이어 */
  eliminatedPlayer: Player | null;
  /** 게임 상태 변화 */
  gameStateChange: GameStateChange;
  /** 각 팀에 대한 이익 */
  teamBenefits: Map<string, number>; // team -> benefit score
  /** 후속 영향 */
  followUpEffects: string[];
}

/**
 * 투표 패턴 학습 데이터
 */
export interface VotingPatternLearning {
  /** 플레이어 ID */
  playerId: number;
  /** 학습된 투표 패턴 */
  learnedPatterns: VotingPattern[];
  /** 예측 모델 */
  predictionModel: VotingPredictionModel;
  /** 학습 신뢰도 */
  confidence: number;
  /** 마지막 업데이트 */
  lastUpdated: Date;
}

/**
 * 투표 패턴
 */
export interface VotingPattern {
  /** 패턴 유형 */
  type: 'tendency' | 'avoidance' | 'timing' | 'reasoning';
  /** 패턴 설명 */
  description: string;
  /** 패턴 강도 */
  strength: number;
  /** 지지 증거 */
  evidence: string[];
  /** 적용 조건 */
  applicableConditions: string[];
}

/**
 * 투표 예측 모델
 */
export interface VotingPredictionModel {
  /** 모델 유형 */
  type: 'statistical' | 'pattern_based' | 'ml_based';
  /** 모델 매개변수 */
  parameters: Record<string, number>;
  /** 예측 정확도 */
  accuracy: number;
  /** 모델 설명 */
  description: string;
}
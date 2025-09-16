import { AIPersona } from './ai-persona.types';
import { Message } from '../../../entities/message.entity';
import { Game, GamePhase } from '../../../entities/game.entity';

/**
 * AI 채팅 생성 및 타이밍 관련 타입 정의
 */

/**
 * 채팅 생성 결정 정보
 */
export interface ChatDecision {
  /** 채팅을 생성할지 여부 */
  shouldChat: boolean;
  /** 채팅 생성 확률 (0-1) */
  probability: number;
  /** 결정 근거 */
  reason: ChatTriggerReason;
  /** 지연 시간 (밀리초) */
  delay: number;
  /** 우선순위 (높을수록 우선) */
  priority: number;
}

/**
 * 채팅 트리거 이유
 */
export type ChatTriggerReason =
  | 'phase_start' // 페이즈 시작
  | 'direct_mention' // 직접 언급됨
  | 'accused' // 의심받음
  | 'defend_self' // 자기 방어 필요
  | 'defend_other' // 다른 플레이어 방어
  | 'share_suspicion' // 의심 공유
  | 'vote_persuasion' // 투표 설득
  | 'information_response' // 정보 요청에 응답
  | 'personality_driven' // 성격 기반 자발적 발언
  | 'silence_break' // 긴 침묵 깨기
  | 'bandwagon' // 분위기 편승
  | 'role_hint' // 역할 암시
  | 'game_progress'; // 게임 진행 관련

/**
 * 대화 참여 패턴
 */
export interface ConversationPattern {
  /** 평균 메시지 간격 (초) */
  averageInterval: number;
  /** 연속 메시지 확률 */
  burstProbability: number;
  /** 침묵 후 참여 확률 */
  rejoiningProbability: number;
  /** 주제 변경 시도 확률 */
  topicChangeProbability: number;
  /** 질문 생성 확률 */
  questionProbability: number;
}

/**
 * 메시지 분석 결과
 */
export interface MessageAnalysis {
  /** 메시지가 나를 직접 언급하는가 */
  directMention: boolean;
  /** 메시지가 나를 의심하는가 */
  accusatory: boolean;
  /** 메시지가 질문인가 */
  isQuestion: boolean;
  /** 메시지가 정보를 요구하는가 */
  requestsInformation: boolean;
  /** 메시지의 감정적 강도 (0-1) */
  emotionalIntensity: number;
  /** 메시지의 주제 */
  topic: MessageTopic;
  /** 응답이 기대되는가 */
  expectsResponse: boolean;
}

/**
 * 메시지 주제 분류
 */
export type MessageTopic =
  | 'suspicion' // 의심 표현
  | 'defense' // 방어 논리
  | 'information' // 정보 공유
  | 'vote_discussion' // 투표 관련
  | 'role_hint' // 역할 암시
  | 'small_talk' // 잡담
  | 'strategy' // 전략 논의
  | 'accusation' // 직접적 고발
  | 'support' // 지지 표명
  | 'confusion' // 혼란 표현
  | 'meta_game'; // 게임 진행 관련

/**
 * 채팅 생성 컨텍스트
 */
export interface ChatGenerationContext {
  /** 현재 게임 */
  game: Game;
  /** 채팅을 생성할 AI 플레이어 */
  player: any; // Player 타입
  /** AI 페르소나 */
  persona: AIPersona;
  /** 트리거 이유 */
  trigger: ChatTriggerReason;
  /** 참조할 메시지 (있는 경우) */
  referencedMessage?: Message;
  /** 최근 대화 히스토리 */
  recentMessages: Message[];
  /** 현재 대화 상태 */
  conversationState: ConversationState;
}

/**
 * 대화 상태 정보
 */
export interface ConversationState {
  /** 현재 대화 주제 */
  currentTopic: MessageTopic;
  /** 대화 참여자 수 */
  activeParticipants: number;
  /** 마지막 메시지 이후 경과 시간 (초) */
  timeSinceLastMessage: number;
  /** 현재 대화의 감정적 분위기 */
  atmosphereLevel: AtmosphereLevel;
  /** 내가 마지막으로 말한 이후 경과 시간 (초) */
  timeSinceMyLastMessage: number;
  /** 현재 진행 중인 논쟁이 있는가 */
  hasOngoingArgument: boolean;
}

/**
 * 대화 분위기 수준
 */
export type AtmosphereLevel =
  | 'calm' // 평온함
  | 'tense' // 긴장감
  | 'heated' // 격렬함
  | 'suspicious' // 의심스러운 분위기
  | 'panicked' // 공황 상태
  | 'analytical' // 분석적 분위기
  | 'casual'; // 가벼운 분위기

/**
 * 채팅 응답 생성 결과
 */
export interface ChatResponse {
  /** 생성된 메시지 내용 */
  content: string;
  /** 메시지 타입 */
  type: 'chat' | 'whisper' | 'announcement';
  /** 감정 상태 */
  emotion: EmotionState;
  /** 확신도 (0-1) */
  confidence: number;
  /** 추가 메시지가 필요한가 */
  needsFollowUp: boolean;
  /** 다음 메시지 예상 지연 시간 */
  nextMessageDelay?: number;
}

/**
 * 감정 상태
 */
export type EmotionState =
  | 'neutral' // 중립
  | 'confident' // 자신감 있음
  | 'nervous' // 긴장함
  | 'aggressive' // 공격적
  | 'defensive' // 방어적
  | 'suspicious' // 의심스러움
  | 'supportive' // 지지적
  | 'confused' // 혼란스러움
  | 'excited' // 흥분함
  | 'worried'; // 걱정됨

/**
 * 채팅 패턴 설정
 */
export interface ChatPatternConfig {
  /** 기본 채팅 확률 (페이즈별) */
  baseChatProbabilities: Record<GamePhase, number>;
  /** 성격별 수정치 */
  personalityModifiers: PersonalityModifiers;
  /** 역할별 수정치 */
  roleModifiers: Record<string, number>;
  /** 상황별 수정치 */
  situationModifiers: SituationModifiers;
}

/**
 * 성격별 채팅 수정치
 */
export interface PersonalityModifiers {
  /** 수다스러운 정도에 따른 수정치 */
  verbosityMultiplier: number;
  /** 감정적 반응에 따른 수정치 */
  emotionalResponseMultiplier: number;
  /** 리더십에 따른 발언 빈도 수정치 */
  leadershipMultiplier: number;
  /** 공격성에 따른 논쟁 참여 수정치 */
  aggressionMultiplier: number;
}

/**
 * 상황별 채팅 수정치
 */
export interface SituationModifiers {
  /** 의심받을 때 */
  whenSuspected: number;
  /** 다른 사람이 의심받을 때 */
  whenOthersSuspected: number;
  /** 투표 시간 임박 시 */
  nearVoteDeadline: number;
  /** 게임 초반 */
  earlyGame: number;
  /** 게임 후반 */
  lateGame: number;
  /** 위기 상황 */
  criticalSituation: number;
}

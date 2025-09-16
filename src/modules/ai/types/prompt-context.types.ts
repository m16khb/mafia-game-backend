import { Game } from '../../../entities/game.entity';
import { Player } from '../../../entities/player.entity';
import { Message } from '../../../entities/message.entity';
import { AIPersona } from './ai-persona.types';

/**
 * 게임 프롬프트 생성을 위한 컨텍스트 정보
 */
export interface GamePromptContext {
  /** 현재 게임 상태 */
  game: Game;
  /** 프롬프트를 받을 플레이어 */
  player: Player;
  /** 플레이어의 AI 페르소나 */
  persona: AIPersona;
  /** 현재 게임 페이즈 */
  phase: 'day' | 'night' | 'vote' | 'result';
  /** 최근 게임 이벤트들 */
  recentEvents: GameEvent[];
  /** 게임 히스토리 */
  gameHistory: string;
}

/**
 * 채팅 프롬프트 생성을 위한 컨텍스트 정보
 */
export interface ChatPromptContext {
  /** 기본 게임 컨텍스트 */
  gameState: GamePromptContext;
  /** 대화의 맥락 */
  conversationContext: ConversationContext;
  /** 최근 채팅 메시지들 */
  recentChat: Message[];
  /** 참조할 특정 메시지 (답변하는 경우) */
  referencedMessage?: Message;
  /** 채팅 생성 이유/트리거 */
  chatTrigger: ChatTrigger;
}

/**
 * 투표 프롬프트 생성을 위한 컨텍스트 정보
 */
export interface VotePromptContext {
  /** 기본 게임 컨텍스트 */
  gameState: GamePromptContext;
  /** 투표 가능한 플레이어들 */
  voteCandidates: Player[];
  /** 현재 투표 상황 */
  currentVotes: VoteStatus[];
  /** 의심 데이터 */
  suspicionData: Map<number, number>;
  /** 투표 제한 시간 */
  timeRemaining: number;
}

/**
 * 게임 이벤트 정보
 */
export interface GameEvent {
  /** 이벤트 타입 */
  type:
    | 'player_death'
    | 'role_reveal'
    | 'phase_change'
    | 'vote_result'
    | 'night_action';
  /** 이벤트 설명 */
  description: string;
  /** 이벤트가 발생한 시점 */
  timestamp: Date;
  /** 관련 플레이어 ID들 */
  involvedPlayerIds: number[];
  /** 추가 데이터 */
  metadata?: Record<string, any>;
}

/**
 * 대화 맥락 정보
 */
export interface ConversationContext {
  /** 현재 대화 주제 */
  currentTopic: ConversationTopic;
  /** 대화 참여자들 */
  participants: number[];
  /** 대화 시작 시점 */
  conversationStart: Date;
  /** 대화의 감정적 톤 */
  emotionalTone:
    | 'neutral'
    | 'tense'
    | 'accusatory'
    | 'defensive'
    | 'cooperative';
}

/**
 * 대화 주제 분류
 */
export type ConversationTopic =
  | 'role_discussion' // 역할 관련 논의
  | 'suspicion_sharing' // 의심 공유
  | 'vote_coordination' // 투표 조율
  | 'defense_argument' // 방어 논증
  | 'information_sharing' // 정보 공유
  | 'small_talk' // 잡담
  | 'strategy_discussion'; // 전략 논의

/**
 * 채팅 생성 트리거
 */
export type ChatTrigger =
  | 'phase_start' // 페이즈 시작
  | 'response_to_message' // 메시지에 대한 응답
  | 'spontaneous' // 자발적 발언
  | 'accusation_defense' // 의심받을 때 방어
  | 'information_share' // 정보 공유 목적
  | 'vote_persuasion' // 투표 설득
  | 'role_hint'; // 역할 암시

/**
 * 현재 투표 상황
 */
export interface VoteStatus {
  /** 투표한 플레이어 ID */
  voterId: number;
  /** 투표받은 플레이어 ID */
  targetId: number;
  /** 투표 시점 */
  timestamp: Date;
}

/**
 * 프롬프트 템플릿 옵션
 */
export interface PromptTemplateOptions {
  /** 응답 길이 제한 */
  maxLength?: number;
  /** 공식적/비공식적 톤 */
  formalityLevel?: 'casual' | 'formal' | 'neutral';
  /** 감정 표현 정도 */
  emotionalIntensity?: 'low' | 'medium' | 'high';
  /** JSON 응답 형식 요구 */
  requireJsonResponse?: boolean;
  /** 추가 제약 조건 */
  constraints?: string[];
}

import { GamePhase, GameRole } from '../../../entities/game.entity';
import { AIPersona } from './ai-persona.types';

/**
 * 페이즈별 AI 행동 패턴 정의
 */
export interface PhaseBehaviorPattern {
  phase: GamePhase;
  behaviors: BehaviorAction[];
  priority: number;
  conditions?: BehaviorCondition[];
}

/**
 * AI 행동 액션
 */
export interface BehaviorAction {
  type: BehaviorActionType;
  probability: number;
  delayRange: [number, number]; // [min, max] in milliseconds
  parameters?: Record<string, any>;
}

export type BehaviorActionType =
  | 'initiate_discussion'
  | 'respond_to_suspicion'
  | 'cast_suspicion'
  | 'defend_player'
  | 'share_information'
  | 'ask_question'
  | 'vote_explanation'
  | 'role_hint'
  | 'silence_strategy'
  | 'alliance_building'
  | 'misdirection';

/**
 * 행동 조건
 */
export interface BehaviorCondition {
  type:
    | 'player_count'
    | 'day_count'
    | 'suspicion_level'
    | 'role_revealed'
    | 'team_status';
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  value: number | string | boolean;
}

/**
 * 역할별 페이즈 행동 설정
 */
export interface RolePhaseConfig {
  role: GameRole;
  phaseConfigs: Map<GamePhase, PhaseBehaviorPattern>;
}

/**
 * 페이즈 전환 시 행동
 */
export interface PhaseTransitionBehavior {
  fromPhase: GamePhase;
  toPhase: GamePhase;
  actions: BehaviorAction[];
  triggerDelay: number;
}

/**
 * 상황별 반응 패턴
 */
export interface SituationResponse {
  situation: SituationType;
  roleResponses: Map<GameRole, BehaviorAction[]>;
  personalityModifiers: PersonalityBehaviorModifier[];
}

export type SituationType =
  | 'player_eliminated'
  | 'player_accused'
  | 'role_revealed'
  | 'voting_started'
  | 'tie_vote'
  | 'game_nearly_over'
  | 'mafia_advantage'
  | 'citizen_advantage';

/**
 * 성격에 따른 행동 수정자
 */
export interface PersonalityBehaviorModifier {
  personalityTrait: keyof AIPersona['personality'];
  threshold: number;
  modifier: BehaviorModification;
}

export interface BehaviorModification {
  probabilityMultiplier: number;
  delayMultiplier: number;
  additionalActions?: BehaviorAction[];
}

/**
 * AI 행동 실행 컨텍스트
 */
export interface BehaviorExecutionContext {
  gameId: number;
  playerId: number;
  phase: GamePhase;
  dayCount: number;
  alivePlayers: number;
  suspicionLevel: number;
  recentEvents: GameEvent[];
}

export interface GameEvent {
  type: string;
  description: string;
  timestamp: Date;
  playerId?: number;
  targetId?: number;
}

/**
 * 행동 실행 결과
 */
export interface BehaviorExecutionResult {
  executed: boolean;
  action: BehaviorAction;
  delayUsed: number;
  reason: string;
  followUpActions?: BehaviorAction[];
}

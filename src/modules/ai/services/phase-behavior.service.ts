import { Injectable } from '@nestjs/common';
import { Logger } from '@libs/logger';
import { Game, GamePhase, GameRole } from '../../../entities/game.entity';
import { Player } from '../../../entities/player.entity';
import { AIPersona } from '../types/ai-persona.types';
import {
  PhaseBehaviorPattern,
  BehaviorAction,
  BehaviorActionType,
  RolePhaseConfig,
  PhaseTransitionBehavior,
  SituationResponse,
  SituationType,
  BehaviorExecutionContext,
  BehaviorExecutionResult,
  PersonalityBehaviorModifier,
  BehaviorModification
} from '../types/phase-behavior.types';

/**
 * 페이즈별 AI 행동 패턴 관리 서비스
 */
@Injectable()
export class PhaseBehaviorService {
  private readonly rolePhaseConfigs = new Map<GameRole, Map<GamePhase, PhaseBehaviorPattern>>();
  private readonly phaseTransitions: PhaseTransitionBehavior[] = [];
  private readonly situationResponses = new Map<SituationType, SituationResponse>();

  constructor(private readonly logger: Logger) {
    this.logger.setContext(PhaseBehaviorService.name);
    this.initializeRoleBehaviors();
    this.initializePhaseTransitions();
    this.initializeSituationResponses();
  }

  /**
   * 페이즈 시작 시 AI 행동 패턴을 실행합니다.
   */
  async executePhaseStartBehaviors(
    game: Game,
    phase: GamePhase,
    aiPlayers: Player[],
    personaMap: Map<number, AIPersona>
  ): Promise<BehaviorExecutionResult[]> {
    this.logger.log(`Executing phase start behaviors for ${phase}`);
    
    const results: BehaviorExecutionResult[] = [];
    
    for (const player of aiPlayers) {
      const persona = personaMap.get(player.id);
      if (!persona) continue;

      const behaviorPattern = this.getBehaviorPattern(player.role, phase);
      if (!behaviorPattern) continue;

      const context: BehaviorExecutionContext = {
        gameId: game.id,
        playerId: player.id,
        phase,
        dayCount: game.dayCount,
        alivePlayers: game.getAlivePlayers().length,
        suspicionLevel: 0.3, // 임시값, 나중에 suspicion tracker에서 가져올 예정
        recentEvents: [] // 임시값
      };

      for (const action of behaviorPattern.behaviors) {
        const shouldExecute = await this.shouldExecuteAction(action, persona, context);
        if (shouldExecute) {
          const result = await this.executeAction(action, player, persona, context);
          results.push(result);
        }
      }
    }

    return results;
  }

  /**
   * 페이즈 전환 시 행동을 실행합니다.
   */
  async executePhaseTransition(
    game: Game,
    fromPhase: GamePhase,
    toPhase: GamePhase,
    aiPlayers: Player[],
    personaMap: Map<number, AIPersona>
  ): Promise<void> {
    this.logger.log(`Executing phase transition: ${fromPhase} -> ${toPhase}`);

    const transition = this.phaseTransitions.find(
      t => t.fromPhase === fromPhase && t.toPhase === toPhase
    );

    if (!transition) return;

    setTimeout(async () => {
      for (const player of aiPlayers) {
        const persona = personaMap.get(player.id);
        if (!persona) continue;

        const context: BehaviorExecutionContext = {
          gameId: game.id,
          playerId: player.id,
          phase: toPhase,
          dayCount: game.dayCount,
          alivePlayers: game.getAlivePlayers().length,
          suspicionLevel: 0.3,
          recentEvents: []
        };

        for (const action of transition.actions) {
          const shouldExecute = await this.shouldExecuteAction(action, persona, context);
          if (shouldExecute) {
            await this.executeAction(action, player, persona, context);
          }
        }
      }
    }, transition.triggerDelay);
  }

  /**
   * 특정 상황에 대한 반응을 실행합니다.
   */
  async executeSituationResponse(
    situation: SituationType,
    game: Game,
    aiPlayers: Player[],
    personaMap: Map<number, AIPersona>
  ): Promise<void> {
    this.logger.log(`Executing situation response for: ${situation}`);

    const response = this.situationResponses.get(situation);
    if (!response) return;

    for (const player of aiPlayers) {
      const persona = personaMap.get(player.id);
      if (!persona) continue;

      const roleActions = response.roleResponses.get(player.role);
      if (!roleActions) continue;

      const context: BehaviorExecutionContext = {
        gameId: game.id,
        playerId: player.id,
        phase: game.currentPhase,
        dayCount: game.dayCount,
        alivePlayers: game.getAlivePlayers().length,
        suspicionLevel: 0.3,
        recentEvents: []
      };

      for (const action of roleActions) {
        const modifiedAction = this.applyPersonalityModifiers(action, persona, response.personalityModifiers);
        const shouldExecute = await this.shouldExecuteAction(modifiedAction, persona, context);
        
        if (shouldExecute) {
          await this.executeAction(modifiedAction, player, persona, context);
        }
      }
    }
  }

  private getBehaviorPattern(role: GameRole, phase: GamePhase): PhaseBehaviorPattern | undefined {
    return this.rolePhaseConfigs.get(role)?.get(phase);
  }

  private async shouldExecuteAction(
    action: BehaviorAction,
    persona: AIPersona,
    context: BehaviorExecutionContext
  ): Promise<boolean> {
    // 기본 확률 계산
    let probability = action.probability;

    // 성격에 따른 확률 조정
    probability = this.adjustProbabilityByPersonality(probability, action.type, persona);

    // 상황에 따른 확률 조정
    probability = this.adjustProbabilityByContext(probability, action.type, context);

    return Math.random() < probability;
  }

  private async executeAction(
    action: BehaviorAction,
    player: Player,
    persona: AIPersona,
    context: BehaviorExecutionContext
  ): Promise<BehaviorExecutionResult> {
    const delay = this.calculateActionDelay(action, persona);
    
    this.logger.log(
      `Scheduling ${action.type} for player ${player.name} in ${delay}ms`
    );

    // 실제 액션 실행은 타이머로 지연
    setTimeout(() => {
      this.performAction(action, player, persona, context);
    }, delay);

    return {
      executed: true,
      action,
      delayUsed: delay,
      reason: `Phase behavior: ${action.type}`,
      followUpActions: this.getFollowUpActions(action, context)
    };
  }

  private performAction(
    action: BehaviorAction,
    player: Player,
    persona: AIPersona,
    context: BehaviorExecutionContext
  ): void {
    this.logger.log(`Executing ${action.type} for player ${player.name}`);
    
    // TODO: 실제 액션 실행 (채팅 생성, 투표 등)
    // 현재는 로그만 출력
    switch (action.type) {
      case 'initiate_discussion':
        this.logger.log(`${player.name} initiates discussion`);
        break;
      case 'cast_suspicion':
        this.logger.log(`${player.name} casts suspicion`);
        break;
      case 'defend_player':
        this.logger.log(`${player.name} defends a player`);
        break;
      // ... 다른 액션들
    }
  }

  private calculateActionDelay(action: BehaviorAction, persona: AIPersona): number {
    const [minDelay, maxDelay] = action.delayRange;
    const baseDelay = minDelay + Math.random() * (maxDelay - minDelay);
    
    // 성격에 따른 지연 조정
    const personalityFactor = this.getPersonalityDelayFactor(persona);
    
    return Math.floor(baseDelay * personalityFactor);
  }

  private getPersonalityDelayFactor(persona: AIPersona): number {
    // 신중함이 높으면 더 오래 기다림
    const cautionFactor = 1 + (persona.personality.caution * 0.5);
    
    // 감정적이면 더 빨리 반응
    const emotionalFactor = 1 - (persona.personality.emotional * 0.3);
    
    return cautionFactor * emotionalFactor;
  }

  private adjustProbabilityByPersonality(
    baseProbability: number,
    actionType: BehaviorActionType,
    persona: AIPersona
  ): number {
    let adjusted = baseProbability;

    switch (actionType) {
      case 'cast_suspicion':
        adjusted *= (1 + persona.personality.aggression * 0.5);
        break;
      case 'defend_player':
        adjusted *= (1 + persona.personality.trust * 0.3);
        break;
      case 'initiate_discussion':
        adjusted *= (1 + persona.personality.leadership * 0.4);
        break;
      case 'ask_question':
        adjusted *= (1 + persona.personality.analytical * 0.3);
        break;
    }

    return Math.min(1, Math.max(0, adjusted));
  }

  private adjustProbabilityByContext(
    baseProbability: number,
    actionType: BehaviorActionType,
    context: BehaviorExecutionContext
  ): number {
    let adjusted = baseProbability;

    // 게임 후반부에는 더 적극적
    if (context.dayCount > 3) {
      adjusted *= 1.2;
    }

    // 플레이어가 적어지면 더 신중하게
    if (context.alivePlayers <= 4) {
      if (actionType === 'cast_suspicion') {
        adjusted *= 1.5;
      }
    }

    return Math.min(1, Math.max(0, adjusted));
  }

  private applyPersonalityModifiers(
    action: BehaviorAction,
    persona: AIPersona,
    modifiers: PersonalityBehaviorModifier[]
  ): BehaviorAction {
    let modifiedAction = { ...action };

    for (const modifier of modifiers) {
      const traitValue = persona.personality[modifier.personalityTrait];
      
      if (traitValue >= modifier.threshold) {
        modifiedAction.probability *= modifier.modifier.probabilityMultiplier;
        modifiedAction.delayRange = [
          modifiedAction.delayRange[0] * modifier.modifier.delayMultiplier,
          modifiedAction.delayRange[1] * modifier.modifier.delayMultiplier
        ];
      }
    }

    return modifiedAction;
  }

  private getFollowUpActions(
    action: BehaviorAction,
    context: BehaviorExecutionContext
  ): BehaviorAction[] | undefined {
    // 특정 액션 후 후속 액션 정의
    switch (action.type) {
      case 'cast_suspicion':
        return [{
          type: 'vote_explanation',
          probability: 0.6,
          delayRange: [5000, 15000]
        }];
      default:
        return undefined;
    }
  }

  private initializeRoleBehaviors(): void {
    // 마피아 역할 행동 패턴
    const mafiaPatterns = new Map<GamePhase, PhaseBehaviorPattern>();
    
    mafiaPatterns.set('day', {
      phase: 'day',
      behaviors: [
        {
          type: 'misdirection',
          probability: 0.7,
          delayRange: [5000, 15000]
        },
        {
          type: 'cast_suspicion',
          probability: 0.5,
          delayRange: [10000, 25000]
        },
        {
          type: 'defend_player',
          probability: 0.3,
          delayRange: [8000, 20000]
        }
      ],
      priority: 1
    });

    mafiaPatterns.set('voting', {
      phase: 'voting',
      behaviors: [
        {
          type: 'vote_explanation',
          probability: 0.8,
          delayRange: [2000, 8000]
        }
      ],
      priority: 2
    });

    this.rolePhaseConfigs.set('mafia', mafiaPatterns);

    // 시민 역할 행동 패턴
    const citizenPatterns = new Map<GamePhase, PhaseBehaviorPattern>();
    
    citizenPatterns.set('day', {
      phase: 'day',
      behaviors: [
        {
          type: 'ask_question',
          probability: 0.4,
          delayRange: [8000, 20000]
        },
        {
          type: 'share_information',
          probability: 0.3,
          delayRange: [10000, 25000]
        },
        {
          type: 'initiate_discussion',
          probability: 0.6,
          delayRange: [5000, 15000]
        }
      ],
      priority: 1
    });

    this.rolePhaseConfigs.set('citizen', citizenPatterns);

    // 경찰 역할 행동 패턴
    const policePatterns = new Map<GamePhase, PhaseBehaviorPattern>();
    
    policePatterns.set('day', {
      phase: 'day',
      behaviors: [
        {
          type: 'role_hint',
          probability: 0.3,
          delayRange: [15000, 30000]
        },
        {
          type: 'cast_suspicion',
          probability: 0.6,
          delayRange: [10000, 20000]
        }
      ],
      priority: 1
    });

    this.rolePhaseConfigs.set('police', policePatterns);

    // 의사 역할 행동 패턴
    const doctorPatterns = new Map<GamePhase, PhaseBehaviorPattern>();
    
    doctorPatterns.set('day', {
      phase: 'day',
      behaviors: [
        {
          type: 'silence_strategy',
          probability: 0.5,
          delayRange: [20000, 40000]
        },
        {
          type: 'defend_player',
          probability: 0.4,
          delayRange: [12000, 25000]
        }
      ],
      priority: 1
    });

    this.rolePhaseConfigs.set('doctor', doctorPatterns);
  }

  private initializePhaseTransitions(): void {
    // 밤 -> 낮 전환
    this.phaseTransitions.push({
      fromPhase: 'night',
      toPhase: 'day',
      actions: [
        {
          type: 'initiate_discussion',
          probability: 0.8,
          delayRange: [3000, 8000]
        }
      ],
      triggerDelay: 2000
    });

    // 낮 -> 투표 전환
    this.phaseTransitions.push({
      fromPhase: 'day',
      toPhase: 'voting',
      actions: [
        {
          type: 'vote_explanation',
          probability: 0.6,
          delayRange: [1000, 5000]
        }
      ],
      triggerDelay: 1000
    });
  }

  private initializeSituationResponses(): void {
    // 플레이어 제거 상황
    const playerEliminatedResponse: SituationResponse = {
      situation: 'player_eliminated',
      roleResponses: new Map([
        ['mafia', [
          {
            type: 'misdirection',
            probability: 0.8,
            delayRange: [5000, 12000]
          }
        ]],
        ['citizen', [
          {
            type: 'share_information',
            probability: 0.6,
            delayRange: [3000, 10000]
          }
        ]]
      ]),
      personalityModifiers: [
        {
          personalityTrait: 'emotional',
          threshold: 0.7,
          modifier: {
            probabilityMultiplier: 1.3,
            delayMultiplier: 0.7
          }
        }
      ]
    };

    this.situationResponses.set('player_eliminated', playerEliminatedResponse);
  }
}
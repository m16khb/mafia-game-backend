import { Injectable, Inject } from '@nestjs/common';
import { Player } from '../../../entities/player.entity';
import { AIPersona } from '../types/ai-persona.types';
import { AI_PERSONAS } from '../data/ai-personas.data';
import { Logger } from '@libs/logger';
import { IPlayerRepository, PLAYER_REPOSITORY_TOKEN } from '@libs/repositories';

@Injectable()
export class AIPersonaService {
  private readonly personaAssignments = new Map<number, AIPersona>();

  constructor(
    private readonly logger: Logger,
    @Inject(PLAYER_REPOSITORY_TOKEN)
    private readonly playerRepository: IPlayerRepository,
  ) {
    this.logger.setContext(AIPersonaService.name);
  }

  /**
   * AI 플레이어들에게 랜덤한 페르소나를 배정합니다.
   */
  assignRandomPersonas(players: Player[]): Map<number, AIPersona> {
    const aiPlayers = players.filter((p) => p.isAi);
    const availablePersonas = [...AI_PERSONAS];
    const assignments = new Map<number, AIPersona>();

    this.logger.log(`Assigning personas to ${aiPlayers.length} AI players`);

    aiPlayers.forEach((player) => {
      if (availablePersonas.length === 0) {
        // 페르소나가 부족한 경우 다시 채우기
        availablePersonas.push(...AI_PERSONAS);
      }

      const randomIndex = Math.floor(Math.random() * availablePersonas.length);
      const persona = availablePersonas.splice(randomIndex, 1)[0];

      assignments.set(player.id, persona);
      this.personaAssignments.set(player.id, persona);

      // 플레이어 이름을 페르소나 이름으로 업데이트
      player.name = persona.name;

      this.logger.log(
        `Assigned persona '${persona.name}' (${persona.id}) to AI player ${player.id}`,
      );
    });

    return assignments;
  }

  /**
   * 특정 플레이어의 페르소나를 가져옵니다.
   * 먼저 메모리에서 찾고, 없으면 데이터베이스에서 조회합니다.
   */
  async getPersona(playerId: number): Promise<AIPersona | undefined> {
    // 메모리에서 찾기
    const cachedPersona = this.personaAssignments.get(playerId);
    if (cachedPersona) {
      return cachedPersona;
    }

    // 데이터베이스에서 플레이어 정보 조회
    const player = await this.playerRepository.findById(playerId);
    if (player?.aiPersonaId) {
      // Map numeric ID to string ID for legacy compatibility
      const personaIdMap: Record<number, string> = {
        1: 'detective-holmes',
        2: 'smooth-talker',
        3: 'team-player',
        4: 'lone-wolf',
        5: 'wild-card',
      };

      const stringId =
        personaIdMap[player.aiPersonaId] || player.aiPersonaId.toString();
      const persona = this.getPersonaById(stringId);
      if (persona) {
        // 메모리에 캐시
        this.personaAssignments.set(playerId, persona);
        return persona;
      }
    }

    return undefined;
  }

  /**
   * 동기식으로 메모리에서만 페르소나를 가져옵니다.
   */
  getPersonaFromMemory(playerId: number): AIPersona | undefined {
    return this.personaAssignments.get(playerId);
  }

  /**
   * 페르소나 ID로 페르소나를 가져옵니다.
   */
  getPersonaById(personaId: string): AIPersona | undefined {
    return AI_PERSONAS.find((p) => p.id === personaId);
  }

  /**
   * 모든 사용 가능한 페르소나를 가져옵니다.
   */
  getAllPersonas(): AIPersona[] {
    return [...AI_PERSONAS];
  }

  /**
   * 특정 플레이어의 페르소나 배정을 제거합니다.
   */
  removePersonaAssignment(playerId: number): boolean {
    const removed = this.personaAssignments.delete(playerId);
    if (removed) {
      this.logger.log(`Removed persona assignment for player ${playerId}`);
    }
    return removed;
  }

  /**
   * 페르소나의 성격 특성을 문자열로 설명합니다.
   */
  describePersonality(persona: AIPersona): string {
    const traits = [];

    if (persona.personality.analytical > 0.7) {
      traits.push('분석적');
    }
    if (persona.personality.aggression > 0.7) {
      traits.push('공격적');
    } else if (persona.personality.aggression < 0.3) {
      traits.push('온순함');
    }
    if (persona.personality.caution > 0.7) {
      traits.push('신중함');
    }
    if (persona.personality.trust > 0.7) {
      traits.push('신뢰적');
    } else if (persona.personality.trust < 0.3) {
      traits.push('의심많음');
    }
    if (persona.personality.leadership > 0.7) {
      traits.push('리더십');
    }
    if (persona.personality.emotional > 0.7) {
      traits.push('감정적');
    } else if (persona.personality.emotional < 0.3) {
      traits.push('냉정함');
    }

    return traits.join(', ') || '평범함';
  }

  /**
   * 페르소나의 플레이 스타일을 설명합니다.
   */
  describePlayStyle(persona: AIPersona): string {
    const styles = [];

    styles.push(
      `투표성향: ${this.translateVotingPattern(persona.playStyle.votingPattern)}`,
    );
    styles.push(
      `대화수준: ${this.translateDiscussionLevel(persona.playStyle.discussionLevel)}`,
    );
    styles.push(
      `의심임계값: ${Math.round(persona.playStyle.suspicionThreshold * 100)}%`,
    );
    styles.push(
      `팀플레이: ${Math.round(persona.playStyle.teamplayPreference * 100)}%`,
    );

    return styles.join(', ');
  }

  private translateVotingPattern(pattern: string): string {
    const patterns = {
      aggressive: '공격적',
      defensive: '방어적',
      analytical: '분석적',
      random: '무작위',
    };
    return patterns[pattern as keyof typeof patterns] || pattern;
  }

  private translateDiscussionLevel(level: string): string {
    const levels = {
      silent: '과묵',
      moderate: '보통',
      active: '활발',
      talkative: '수다스러움',
    };
    return levels[level as keyof typeof levels] || level;
  }

  /**
   * 게임 종료 시 모든 페르소나 배정을 정리합니다.
   */
  clearAllAssignments(): void {
    const count = this.personaAssignments.size;
    this.personaAssignments.clear();
    this.logger.log(`Cleared ${count} persona assignments`);
  }
}

import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIPersona,
  CommunicationStyle,
  RiskTolerance,
  VotingTendency,
} from '../../entities/ai-persona.entity';
import {
  IAIPersonaRepository,
  AI_PERSONA_REPOSITORY_TOKEN,
} from '../repositories';

export interface CreatePersonaDto {
  name: string;
  traits: string[];
  communicationStyle: CommunicationStyle;
  riskTolerance: RiskTolerance;
  votingTendency: VotingTendency;
  suspicionLevel: number;
  deceptionSkill: number;
  description?: string;
}

export interface PersonaAssignmentResult {
  persona: AIPersona;
  playerId: number;
  role: string;
  assignmentScore: number;
}

@Injectable()
export class AIPersonaService {
  private readonly logger = new Logger(AIPersonaService.name);
  private readonly defaultPersonalitySet: string;

  constructor(
    @Inject(AI_PERSONA_REPOSITORY_TOKEN)
    private readonly personaRepository: IAIPersonaRepository,
    private readonly configService: ConfigService,
  ) {
    this.defaultPersonalitySet = this.configService.get<string>(
      'AI_DEFAULT_PERSONALITY_SET',
      'default',
    );
  }

  async createPersona(createDto: CreatePersonaDto): Promise<AIPersona> {
    this.logger.log(`Creating AI persona: ${createDto.name}`);

    // Validate traits
    if (!this.validateTraits(createDto.traits)) {
      throw new Error('Invalid traits: must have 2-5 unique traits');
    }

    // Validate suspicion and deception levels
    if (createDto.suspicionLevel < 1 || createDto.suspicionLevel > 10) {
      throw new Error('Suspicion level must be between 1 and 10');
    }

    if (createDto.deceptionSkill < 1 || createDto.deceptionSkill > 10) {
      throw new Error('Deception skill must be between 1 and 10');
    }

    const persona = this.personaRepository.create({
      name: createDto.name,
      traits: createDto.traits,
      communicationStyle: createDto.communicationStyle,
      riskTolerance: createDto.riskTolerance,
      votingTendency: createDto.votingTendency,
      suspicionLevel: createDto.suspicionLevel,
      deceptionSkill: createDto.deceptionSkill,
      description: createDto.description,
      isActive: true,
      gamesPlayed: 0,
      winRate: 0.0,
      averageDecisionTime: null,
      rolePerformance: {},
    });

    return this.personaRepository.save(persona);
  }

  async getPersonaById(id: number): Promise<AIPersona> {
    const persona = await this.personaRepository.findById(id);
    if (!persona) {
      throw new Error(`AI persona with ID ${id} not found`);
    }
    return persona;
  }

  async getPersonaByName(name: string): Promise<AIPersona> {
    const persona = await this.personaRepository.findByName(name);
    if (!persona) {
      throw new Error(`AI persona with name "${name}" not found`);
    }
    return persona;
  }

  async getAllActivePersonas(): Promise<AIPersona[]> {
    return this.personaRepository.findActive();
  }

  async getPersonasForGame(
    count: number,
    personalitySet?: string,
  ): Promise<AIPersona[]> {
    this.logger.log(
      `Selecting ${count} personas for game (set: ${personalitySet || 'default'})`,
    );

    let personas: AIPersona[];

    if (personalitySet && personalitySet !== 'default') {
      personas =
        await this.personaRepository.findByPersonalitySet(personalitySet);
    } else {
      personas = await this.personaRepository.findActive();
    }

    if (personas.length < count) {
      throw new Error(
        `Not enough active personas available. Need ${count}, found ${personas.length}`,
      );
    }

    // Select diverse personas for better gameplay
    return this.selectDiversePersonas(personas, count);
  }

  async assignPersonasToPlayers(
    playerIds: number[],
    roles: string[],
    personalitySet?: string,
  ): Promise<PersonaAssignmentResult[]> {
    if (playerIds.length !== roles.length) {
      throw new Error('Player IDs and roles arrays must have the same length');
    }

    const personas = await this.getPersonasForGame(
      playerIds.length,
      personalitySet,
    );
    const assignments: PersonaAssignmentResult[] = [];

    // Create assignment matrix and find optimal matches
    const assignmentMatrix = this.calculateAssignmentMatrix(personas, roles);
    const optimalAssignments = this.findOptimalAssignments(assignmentMatrix);

    for (let i = 0; i < playerIds.length; i++) {
      const personaIndex = optimalAssignments[i];
      assignments.push({
        persona: personas[personaIndex],
        playerId: playerIds[i],
        role: roles[i],
        assignmentScore: assignmentMatrix[personaIndex][i],
      });
    }

    this.logger.log(`Assigned ${assignments.length} personas to players`);
    return assignments;
  }

  async updatePersonaPerformance(
    personaId: number,
    role: string,
    won: boolean,
    decisionTimeMs: number,
  ): Promise<void> {
    const persona = await this.getPersonaById(personaId);

    // Update overall stats
    persona.updateGameStats(won, decisionTimeMs);

    // Update role-specific stats
    persona.updateRolePerformance(role, won, decisionTimeMs);

    await this.personaRepository.save(persona);

    this.logger.log(
      `Updated performance for persona ${persona.name} - Role: ${role}, Won: ${won}, DecisionTime: ${decisionTimeMs}ms`,
    );
  }

  async getPersonaStats(personaId: number): Promise<{
    persona: AIPersona;
    overallStats: {
      gamesPlayed: number;
      winRate: number;
      averageDecisionTime: number;
      reliabilityScore: number;
    };
    roleStats: Record<
      string,
      {
        gamesPlayed: number;
        winRate: number;
        averageDecisionTime: number;
      }
    >;
  }> {
    const persona = await this.getPersonaById(personaId);

    return {
      persona,
      overallStats: {
        gamesPlayed: persona.gamesPlayed,
        winRate: persona.winRate,
        averageDecisionTime: persona.averageDecisionTime || 0,
        reliabilityScore: persona.getReliabilityScore(),
      },
      roleStats: persona.rolePerformance || {},
    };
  }

  async generatePersonalityPromptContext(personaId: number): Promise<string> {
    const persona = await this.getPersonaById(personaId);

    const traits = persona.traits.join(', ');
    const communicationDesc = this.getCommunicationStyleDescription(
      persona.communicationStyle,
    );
    const riskDesc = this.getRiskToleranceDescription(persona.riskTolerance);
    const votingDesc = this.getVotingTendencyDescription(
      persona.votingTendency,
    );

    return `You are an AI player with the following personality:

Traits: ${traits}
Communication Style: ${communicationDesc}
Risk Tolerance: ${riskDesc}
Voting Tendency: ${votingDesc}
Suspicion Level: ${persona.suspicionLevel}/10 (${persona.suspicionLevel >= 7 ? 'highly suspicious' : persona.suspicionLevel >= 4 ? 'moderately suspicious' : 'trusting'})
Deception Skill: ${persona.deceptionSkill}/10 (${persona.deceptionSkill >= 7 ? 'skilled deceiver' : persona.deceptionSkill >= 4 ? 'average deceiver' : 'poor at deception'})

${persona.description ? `Background: ${persona.description}` : ''}

Play consistently with this personality throughout the game.`;
  }

  async deactivatePersona(personaId: number): Promise<void> {
    const persona = await this.getPersonaById(personaId);
    persona.deactivate();
    await this.personaRepository.save(persona);
    this.logger.log(`Deactivated persona: ${persona.name}`);
  }

  async activatePersona(personaId: number): Promise<void> {
    const persona = await this.getPersonaById(personaId);
    persona.activate();
    await this.personaRepository.save(persona);
    this.logger.log(`Activated persona: ${persona.name}`);
  }

  async seedDefaultPersonas(): Promise<AIPersona[]> {
    this.logger.log('Seeding default AI personas');

    const defaultPersonas: CreatePersonaDto[] = [
      {
        name: 'analytical_detective',
        traits: ['logical', 'methodical', 'observant', 'patient'],
        communicationStyle: 'analytical',
        riskTolerance: 'low',
        votingTendency: 'late',
        suspicionLevel: 8,
        deceptionSkill: 3,
        description:
          'A careful analyzer who methodically examines evidence and voting patterns.',
      },
      {
        name: 'aggressive_leader',
        traits: ['bold', 'decisive', 'confrontational', 'charismatic'],
        communicationStyle: 'aggressive',
        riskTolerance: 'high',
        votingTendency: 'early',
        suspicionLevel: 6,
        deceptionSkill: 7,
        description:
          'A forceful personality who takes charge and pushes for quick decisions.',
      },
      {
        name: 'emotional_reactor',
        traits: ['impulsive', 'expressive', 'intuitive', 'dramatic'],
        communicationStyle: 'emotional',
        riskTolerance: 'medium',
        votingTendency: 'follower',
        suspicionLevel: 7,
        deceptionSkill: 4,
        description:
          'Responds emotionally to game events and follows gut feelings.',
      },
      {
        name: 'quiet_observer',
        traits: ['cautious', 'watchful', 'reserved', 'strategic'],
        communicationStyle: 'quiet',
        riskTolerance: 'low',
        votingTendency: 'late',
        suspicionLevel: 5,
        deceptionSkill: 8,
        description:
          'Says little but watches everything, making calculated moves.',
      },
      {
        name: 'social_mediator',
        traits: ['diplomatic', 'cooperative', 'optimistic', 'persuasive'],
        communicationStyle: 'analytical',
        riskTolerance: 'medium',
        votingTendency: 'leader',
        suspicionLevel: 4,
        deceptionSkill: 6,
        description:
          'Tries to build consensus and keep the group working together.',
      },
    ];

    const personas: AIPersona[] = [];

    for (const personaData of defaultPersonas) {
      try {
        // Check if persona already exists
        const existing = await this.personaRepository.findByName(
          personaData.name,
        );
        if (existing) {
          this.logger.log(
            `Persona ${personaData.name} already exists, skipping`,
          );
          personas.push(existing);
          continue;
        }

        const persona = await this.createPersona(personaData);
        personas.push(persona);
        this.logger.log(`Created default persona: ${persona.name}`);
      } catch (error) {
        this.logger.error(
          `Failed to create persona ${personaData.name}: ${error.message}`,
        );
      }
    }

    return personas;
  }

  private validateTraits(traits: string[]): boolean {
    if (!Array.isArray(traits) || traits.length < 2 || traits.length > 5) {
      return false;
    }

    // Check for unique traits
    const uniqueTraits = new Set(traits);
    return uniqueTraits.size === traits.length;
  }

  private selectDiversePersonas(
    personas: AIPersona[],
    count: number,
  ): AIPersona[] {
    if (personas.length <= count) {
      return personas;
    }

    const selected: AIPersona[] = [];
    const remaining = [...personas];

    // Ensure diversity in communication styles
    const styleGroups: Record<CommunicationStyle, AIPersona[]> = {
      aggressive: [],
      analytical: [],
      emotional: [],
      quiet: [],
    };

    remaining.forEach((persona) => {
      styleGroups[persona.communicationStyle].push(persona);
    });

    // Select one from each style group first
    for (const style in styleGroups) {
      if (selected.length >= count) break;

      const group = styleGroups[style as CommunicationStyle];
      if (group.length > 0) {
        const best = group.reduce((prev, curr) =>
          curr.getReliabilityScore() > prev.getReliabilityScore() ? curr : prev,
        );
        selected.push(best);
        remaining.splice(remaining.indexOf(best), 1);
      }
    }

    // Fill remaining slots with best performers
    while (selected.length < count && remaining.length > 0) {
      const best = remaining.reduce((prev, curr) =>
        curr.getReliabilityScore() > prev.getReliabilityScore() ? curr : prev,
      );
      selected.push(best);
      remaining.splice(remaining.indexOf(best), 1);
    }

    return selected;
  }

  private calculateAssignmentMatrix(
    personas: AIPersona[],
    roles: string[],
  ): number[][] {
    const matrix: number[][] = [];

    for (let i = 0; i < personas.length; i++) {
      matrix[i] = [];
      for (let j = 0; j < roles.length; j++) {
        matrix[i][j] = this.calculatePersonaRoleScore(personas[i], roles[j]);
      }
    }

    return matrix;
  }

  private calculatePersonaRoleScore(persona: AIPersona, role: string): number {
    let score = 5; // Base score

    // Role-specific personality matching
    switch (role) {
      case 'mafia':
        score += persona.deceptionSkill * 0.3;
        score += persona.riskTolerance === 'high' ? 1 : 0;
        score += persona.communicationStyle === 'aggressive' ? 1 : 0;
        break;

      case 'police':
        score += persona.suspicionLevel * 0.2;
        score += persona.isAnalytical() ? 2 : 0;
        score += persona.votingTendency === 'leader' ? 1 : 0;
        break;

      case 'doctor':
        score += persona.riskTolerance === 'low' ? 1 : 0;
        score += persona.isQuiet() ? 1 : 0;
        score += persona.hasTrait('careful') ? 1 : 0;
        break;

      case 'citizen':
        // Citizens benefit from any personality type
        score += persona.getReliabilityScore() * 2;
        break;
    }

    // Historical performance bonus
    const rolePerformance = persona.getRolePerformance(role);
    if (rolePerformance && rolePerformance.gamesPlayed > 0) {
      score += rolePerformance.winRate * 2;
    }

    return Math.max(0, Math.min(10, score));
  }

  private findOptimalAssignments(matrix: number[][]): number[] {
    // Simple greedy assignment - for production, consider Hungarian algorithm
    const assignments: number[] = [];
    const usedPersonas = new Set<number>();

    for (let roleIndex = 0; roleIndex < matrix[0].length; roleIndex++) {
      let bestPersona = -1;
      let bestScore = -1;

      for (let personaIndex = 0; personaIndex < matrix.length; personaIndex++) {
        if (usedPersonas.has(personaIndex)) continue;

        if (matrix[personaIndex][roleIndex] > bestScore) {
          bestScore = matrix[personaIndex][roleIndex];
          bestPersona = personaIndex;
        }
      }

      if (bestPersona !== -1) {
        assignments.push(bestPersona);
        usedPersonas.add(bestPersona);
      }
    }

    return assignments;
  }

  private getCommunicationStyleDescription(style: CommunicationStyle): string {
    const descriptions = {
      aggressive: 'Direct and confrontational, pushes for quick action',
      analytical: 'Logical and methodical, focuses on evidence and reasoning',
      emotional: 'Expressive and intuitive, reacts based on feelings',
      quiet: 'Reserved and observant, speaks little but watches carefully',
    };
    return descriptions[style];
  }

  private getRiskToleranceDescription(tolerance: RiskTolerance): string {
    const descriptions = {
      high: 'Willing to take big risks for potential rewards',
      medium: 'Balances caution with calculated risks',
      low: 'Prefers safe, conservative choices',
    };
    return descriptions[tolerance];
  }

  private getVotingTendencyDescription(tendency: VotingTendency): string {
    const descriptions = {
      early: 'Makes decisions quickly and votes early in discussions',
      late: 'Waits to hear all arguments before deciding',
      follower: 'Tends to follow the lead of other players',
      leader: 'Tries to influence others and guide voting decisions',
    };
    return descriptions[tendency];
  }
}

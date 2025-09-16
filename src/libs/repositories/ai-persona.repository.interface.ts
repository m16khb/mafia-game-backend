import {
  AIPersona,
  CommunicationStyle,
  RiskTolerance,
  VotingTendency,
} from '../../entities/ai-persona.entity';

export interface IAIPersonaRepository {
  create(personaData: Partial<AIPersona>): AIPersona;
  save(persona: AIPersona): Promise<AIPersona>;
  findById(id: number): Promise<AIPersona | null>;
  findByName(name: string): Promise<AIPersona | null>;
  findAll(): Promise<AIPersona[]>;
  findActive(): Promise<AIPersona[]>;
  findByPersonalitySet(personalitySet: string): Promise<AIPersona[]>;
  findByTraits(traits: string[]): Promise<AIPersona[]>;
  findByCommunicationStyle(style: CommunicationStyle): Promise<AIPersona[]>;
  findByRiskTolerance(tolerance: RiskTolerance): Promise<AIPersona[]>;
  findByVotingTendency(tendency: VotingTendency): Promise<AIPersona[]>;
  findHighPerformance(
    minWinRate?: number,
    minGamesPlayed?: number,
  ): Promise<AIPersona[]>;
  update(id: number, updates: Partial<AIPersona>): Promise<AIPersona>;
  delete(id: number): Promise<void>;
  softDelete(id: number): Promise<void>;
  getPerformanceStats(id: number): Promise<{
    totalGames: number;
    winRate: number;
    averageDecisionTime: number;
    rolePerformance: Record<string, any>;
  } | null>;
  bulkCreate(personas: Partial<AIPersona>[]): Promise<AIPersona[]>;
  findRandomActive(count: number): Promise<AIPersona[]>;
}

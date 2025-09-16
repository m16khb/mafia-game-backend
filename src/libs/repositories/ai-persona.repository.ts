import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AIPersona,
  CommunicationStyle,
  RiskTolerance,
  VotingTendency,
} from '../../entities/ai-persona.entity';
import { IAIPersonaRepository } from './ai-persona.repository.interface';

@Injectable()
export class AIPersonaRepository implements IAIPersonaRepository {
  constructor(
    @InjectRepository(AIPersona)
    private readonly repository: Repository<AIPersona>,
  ) {}

  create(personaData: Partial<AIPersona>): AIPersona {
    return this.repository.create(personaData);
  }

  async save(persona: AIPersona): Promise<AIPersona> {
    return this.repository.save(persona);
  }

  async findById(id: number): Promise<AIPersona | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByName(name: string): Promise<AIPersona | null> {
    return this.repository.findOne({ where: { name } });
  }

  async findAll(): Promise<AIPersona[]> {
    return this.repository.find();
  }

  async findActive(): Promise<AIPersona[]> {
    return this.repository.find({ where: { isActive: true } });
  }

  async findByPersonalitySet(personalitySet: string): Promise<AIPersona[]> {
    // For now, return all active personas as personalitySet field doesn't exist yet
    return this.repository.find({ where: { isActive: true } });
  }

  async findByTraits(traits: string[]): Promise<AIPersona[]> {
    return this.repository
      .createQueryBuilder('persona')
      .where('JSON_CONTAINS(persona.traits, :traits)', {
        traits: JSON.stringify(traits),
      })
      .getMany();
  }

  async findByCommunicationStyle(
    style: CommunicationStyle,
  ): Promise<AIPersona[]> {
    return this.repository.find({ where: { communicationStyle: style } });
  }

  async findByRiskTolerance(tolerance: RiskTolerance): Promise<AIPersona[]> {
    return this.repository.find({ where: { riskTolerance: tolerance } });
  }

  async findByVotingTendency(tendency: VotingTendency): Promise<AIPersona[]> {
    return this.repository.find({ where: { votingTendency: tendency } });
  }

  async findHighPerformance(
    minWinRate = 0.6,
    minGamesPlayed = 5,
  ): Promise<AIPersona[]> {
    return this.repository
      .createQueryBuilder('persona')
      .where('persona.winRate >= :minWinRate', { minWinRate })
      .andWhere('persona.gamesPlayed >= :minGamesPlayed', { minGamesPlayed })
      .orderBy('persona.winRate', 'DESC')
      .getMany();
  }

  async update(id: number, updates: Partial<AIPersona>): Promise<AIPersona> {
    await this.repository.update(id, updates);
    const updatedPersona = await this.findById(id);
    if (!updatedPersona) {
      throw new Error(`AIPersona with id ${id} not found after update`);
    }
    return updatedPersona;
  }

  async delete(id: number): Promise<void> {
    await this.repository.delete(id);
  }

  async softDelete(id: number): Promise<void> {
    await this.repository.update(id, { isActive: false });
  }

  async getPerformanceStats(id: number): Promise<{
    totalGames: number;
    winRate: number;
    averageDecisionTime: number;
    rolePerformance: Record<string, any>;
  } | null> {
    const persona = await this.findById(id);
    if (!persona) {
      return null;
    }

    return {
      totalGames: persona.gamesPlayed,
      winRate: persona.winRate,
      averageDecisionTime: persona.averageDecisionTime || 0,
      rolePerformance: persona.rolePerformance || {},
    };
  }

  async bulkCreate(personas: Partial<AIPersona>[]): Promise<AIPersona[]> {
    const entities = personas.map((data) => this.repository.create(data));
    return this.repository.save(entities);
  }

  async findRandomActive(count: number): Promise<AIPersona[]> {
    return this.repository
      .createQueryBuilder('persona')
      .where('persona.isActive = true')
      .orderBy('RAND()')
      .limit(count)
      .getMany();
  }
}

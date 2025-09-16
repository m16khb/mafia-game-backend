import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AIDecision, DecisionType } from '../../entities/ai-decision.entity';
import { IAIDecisionRepository } from './ai-decision.repository.interface';

@Injectable()
export class AIDecisionRepository implements IAIDecisionRepository {
  constructor(
    @InjectRepository(AIDecision)
    private readonly repository: Repository<AIDecision>,
  ) {}

  create(decisionData: Partial<AIDecision>): AIDecision {
    return this.repository.create(decisionData);
  }

  async save(decision: AIDecision): Promise<AIDecision> {
    return this.repository.save(decision);
  }

  async findById(id: number): Promise<AIDecision | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByPlayerId(playerId: number): Promise<AIDecision[]> {
    return this.repository.find({
      where: { playerId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByGameId(gameId: number): Promise<AIDecision[]> {
    return this.repository.find({
      where: { gameId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByPlayerAndGame(
    playerId: number,
    gameId: number,
  ): Promise<AIDecision[]> {
    return this.repository.find({
      where: { playerId, gameId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByDecisionType(type: DecisionType): Promise<AIDecision[]> {
    return this.repository.find({
      where: { decisionType: type },
      order: { createdAt: 'DESC' },
    });
  }

  async findByGamePhase(gameId: number, phase: string): Promise<AIDecision[]> {
    return this.repository.find({
      where: { gameId, gamePhase: phase },
      order: { createdAt: 'DESC' },
    });
  }

  async findRecentByPlayer(
    playerId: number,
    limit = 50,
  ): Promise<AIDecision[]> {
    return this.repository.find({
      where: { playerId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async findHighConfidence(minConfidence = 8): Promise<AIDecision[]> {
    return this.repository
      .createQueryBuilder('decision')
      .where('decision.confidence >= :minConfidence', { minConfidence })
      .orderBy('decision.confidence', 'DESC')
      .getMany();
  }

  async findSuccessful(): Promise<AIDecision[]> {
    return this.repository.find({
      where: { wasSuccessful: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findFailed(): Promise<AIDecision[]> {
    return this.repository.find({
      where: { wasSuccessful: false },
      order: { createdAt: 'DESC' },
    });
  }

  async findPending(): Promise<AIDecision[]> {
    return this.repository
      .createQueryBuilder('decision')
      .where('decision.wasSuccessful IS NULL')
      .orderBy('decision.createdAt', 'DESC')
      .getMany();
  }

  async findByProcessingTime(
    maxTime?: number,
    minTime?: number,
  ): Promise<AIDecision[]> {
    const query = this.repository.createQueryBuilder('decision');

    if (maxTime !== undefined) {
      query.andWhere('decision.processingTime <= :maxTime', { maxTime });
    }

    if (minTime !== undefined) {
      query.andWhere('decision.processingTime >= :minTime', { minTime });
    }

    return query.orderBy('decision.processingTime', 'ASC').getMany();
  }

  async findWithTarget(target: string): Promise<AIDecision[]> {
    return this.repository
      .createQueryBuilder('decision')
      .where('JSON_EXTRACT(decision.decisionData, "$.target") = :target', {
        target,
      })
      .orderBy('decision.createdAt', 'DESC')
      .getMany();
  }

  async findByPromptTemplate(template: string): Promise<AIDecision[]> {
    return this.repository.find({
      where: { promptUsed: template },
      order: { createdAt: 'DESC' },
    });
  }

  async getGameDecisionStats(gameId: number): Promise<{
    totalDecisions: number;
    averageConfidence: number;
    averageProcessingTime: number;
    successRate: number;
    decisionsByType: Record<DecisionType, number>;
  }> {
    const decisions = await this.findByGameId(gameId);

    if (decisions.length === 0) {
      return {
        totalDecisions: 0,
        averageConfidence: 0,
        averageProcessingTime: 0,
        successRate: 0,
        decisionsByType: {} as Record<DecisionType, number>,
      };
    }

    const totalConfidence = decisions.reduce((sum, d) => sum + d.confidence, 0);
    const totalProcessingTime = decisions.reduce(
      (sum, d) => sum + d.processingTime,
      0,
    );
    const successfulDecisions = decisions.filter(
      (d) => d.wasSuccessful === true,
    ).length;

    const decisionsByType: Record<DecisionType, number> = {} as Record<
      DecisionType,
      number
    >;
    for (const decision of decisions) {
      decisionsByType[decision.decisionType] =
        (decisionsByType[decision.decisionType] || 0) + 1;
    }

    return {
      totalDecisions: decisions.length,
      averageConfidence: totalConfidence / decisions.length,
      averageProcessingTime: totalProcessingTime / decisions.length,
      successRate: successfulDecisions / decisions.length,
      decisionsByType,
    };
  }

  async getPlayerDecisionStats(playerId: number): Promise<{
    totalDecisions: number;
    averageConfidence: number;
    averageProcessingTime: number;
    successRate: number;
    recentPerformance: number[];
  }> {
    const decisions = await this.findByPlayerId(playerId);

    if (decisions.length === 0) {
      return {
        totalDecisions: 0,
        averageConfidence: 0,
        averageProcessingTime: 0,
        successRate: 0,
        recentPerformance: [],
      };
    }

    const totalConfidence = decisions.reduce((sum, d) => sum + d.confidence, 0);
    const totalProcessingTime = decisions.reduce(
      (sum, d) => sum + d.processingTime,
      0,
    );
    const successfulDecisions = decisions.filter(
      (d) => d.wasSuccessful === true,
    ).length;

    // Recent performance (last 10 decisions, 1 for success, 0 for failure)
    const recent10 = decisions.slice(0, 10);
    const recentPerformance = recent10.map((d) =>
      d.wasSuccessful === true ? 1 : 0,
    );

    return {
      totalDecisions: decisions.length,
      averageConfidence: totalConfidence / decisions.length,
      averageProcessingTime: totalProcessingTime / decisions.length,
      successRate: successfulDecisions / decisions.length,
      recentPerformance,
    };
  }

  async delete(id: number): Promise<void> {
    await this.repository.delete(id);
  }

  async deleteByGame(gameId: number): Promise<void> {
    await this.repository.delete({ gameId });
  }

  async deleteOlderThan(date: Date): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .delete()
      .where('createdAt < :date', { date })
      .execute();
  }

  async bulkCreate(decisions: Partial<AIDecision>[]): Promise<AIDecision[]> {
    const entities = decisions.map((data) => this.repository.create(data));
    return this.repository.save(entities);
  }

  async findDecisionPattern(
    playerId: number,
    pattern: Record<string, any>,
  ): Promise<AIDecision[]> {
    const query = this.repository
      .createQueryBuilder('decision')
      .where('decision.playerId = :playerId', { playerId });

    for (const [key, value] of Object.entries(pattern)) {
      query.andWhere(
        `JSON_EXTRACT(decision.decisionData, "$.${key}") = :${key}`,
        { [key]: value },
      );
    }

    return query.orderBy('decision.createdAt', 'DESC').getMany();
  }
}

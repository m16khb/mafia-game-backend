import { AIDecision, DecisionType } from '../../entities/ai-decision.entity';

export interface IAIDecisionRepository {
  create(decisionData: Partial<AIDecision>): AIDecision;
  save(decision: AIDecision): Promise<AIDecision>;
  findById(id: number): Promise<AIDecision | null>;
  findByPlayerId(playerId: number): Promise<AIDecision[]>;
  findByGameId(gameId: number): Promise<AIDecision[]>;
  findByPlayerAndGame(playerId: number, gameId: number): Promise<AIDecision[]>;
  findByDecisionType(type: DecisionType): Promise<AIDecision[]>;
  findByGamePhase(gameId: number, phase: string): Promise<AIDecision[]>;
  findRecentByPlayer(playerId: number, limit?: number): Promise<AIDecision[]>;
  findHighConfidence(minConfidence?: number): Promise<AIDecision[]>;
  findSuccessful(): Promise<AIDecision[]>;
  findFailed(): Promise<AIDecision[]>;
  findPending(): Promise<AIDecision[]>;
  findByProcessingTime(
    maxTime?: number,
    minTime?: number,
  ): Promise<AIDecision[]>;
  findWithTarget(target: string): Promise<AIDecision[]>;
  findByPromptTemplate(template: string): Promise<AIDecision[]>;
  getGameDecisionStats(gameId: number): Promise<{
    totalDecisions: number;
    averageConfidence: number;
    averageProcessingTime: number;
    successRate: number;
    decisionsByType: Record<DecisionType, number>;
  }>;
  getPlayerDecisionStats(playerId: number): Promise<{
    totalDecisions: number;
    averageConfidence: number;
    averageProcessingTime: number;
    successRate: number;
    recentPerformance: number[];
  }>;
  delete(id: number): Promise<void>;
  deleteByGame(gameId: number): Promise<void>;
  deleteOlderThan(date: Date): Promise<void>;
  bulkCreate(decisions: Partial<AIDecision>[]): Promise<AIDecision[]>;
  findDecisionPattern(
    playerId: number,
    pattern: Record<string, any>,
  ): Promise<AIDecision[]>;
}

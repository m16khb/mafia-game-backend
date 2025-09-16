import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AIDecision, DecisionType } from '../../entities/ai-decision.entity';
import { AIPersona } from '../../entities/ai-persona.entity';
import { PromptTemplate } from '../../entities/prompt-template.entity';
import { Player } from '../../entities/player.entity';
import { Game } from '../../entities/game.entity';
import {
  IAIDecisionRepository,
  AI_DECISION_REPOSITORY_TOKEN,
  IPromptTemplateRepository,
  PROMPT_TEMPLATE_REPOSITORY_TOKEN,
} from '../repositories';
import { LLMService, LLMResponse } from '../llm/llm.service';
import { AIPersonaService } from './ai-persona.service';
import { AICacheService, CacheLevel } from './ai-cache.service';

export interface DecisionContext {
  game: Game;
  player: Player;
  decisionType: DecisionType;
  gamePhase: string;
  availableTargets?: string[];
  gameState?: Record<string, any>;
  timeLimit?: number;
}

export interface DecisionResult {
  decision: AIDecision;
  action: string;
  target?: string;
  reasoning: string;
  confidence: number;
  processingTime: number;
}

@Injectable()
export class AIDecisionService {
  private readonly logger = new Logger(AIDecisionService.name);
  private readonly decisionTimeout: number;
  private readonly concurrentLimit: number;
  private readonly activeDecisions = new Map<string, Promise<DecisionResult>>();

  constructor(
    @Inject(AI_DECISION_REPOSITORY_TOKEN)
    private readonly decisionRepository: IAIDecisionRepository,
    @Inject(PROMPT_TEMPLATE_REPOSITORY_TOKEN)
    private readonly templateRepository: IPromptTemplateRepository,
    private readonly llmService: LLMService,
    private readonly personaService: AIPersonaService,
    private readonly cacheService: AICacheService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.decisionTimeout = this.configService.get<number>(
      'AI_DECISION_TIMEOUT',
      30000,
    );
    this.concurrentLimit = this.configService.get<number>(
      'AI_CONCURRENT_LIMIT',
      5,
    );
  }

  async makeDecision(context: DecisionContext): Promise<DecisionResult> {
    const startTime = Date.now();
    const decisionKey = `${context.player.id}-${context.decisionType}-${Date.now()}`;

    try {
      this.logger.log(
        `Making AI decision for player ${context.player.name} - Type: ${context.decisionType}, Phase: ${context.gamePhase}`,
      );

      // Check concurrent limit
      if (this.activeDecisions.size >= this.concurrentLimit) {
        throw new Error(
          `Concurrent decision limit reached (${this.concurrentLimit})`,
        );
      }

      // Create decision promise
      const decisionPromise = this.processDecision(context, startTime);
      this.activeDecisions.set(decisionKey, decisionPromise);

      // Apply timeout
      const timeLimit = context.timeLimit || this.decisionTimeout;
      const result = await Promise.race([
        decisionPromise,
        this.createTimeoutPromise(timeLimit, decisionKey),
      ]);

      return result;
    } catch (error) {
      this.logger.error(
        `AI decision failed for player ${context.player.id}: ${error.message}`,
      );

      // Emit failure event for performance monitoring
      this.eventEmitter.emit('ai.decision.failed', {
        error,
        context: {
          gameId: context.game.id,
          playerId: context.player.id,
          decisionType: context.decisionType,
        },
        processingTime: Date.now() - startTime,
      });

      // Create fallback decision
      return this.createFallbackDecision(context, startTime, error.message);
    } finally {
      this.activeDecisions.delete(decisionKey);
    }
  }

  async batchDecisions(contexts: DecisionContext[]): Promise<DecisionResult[]> {
    this.logger.log(`Processing batch of ${contexts.length} AI decisions`);

    const promises = contexts.map((context) =>
      this.makeDecision(context).catch((error) => {
        this.logger.error(
          `Batch decision failed for player ${context.player.id}: ${error.message}`,
        );
        return this.createFallbackDecision(context, Date.now(), error.message);
      }),
    );

    return Promise.all(promises);
  }

  async getDecisionHistory(
    playerId: number,
    gameId?: number,
    limit = 50,
  ): Promise<AIDecision[]> {
    if (gameId) {
      return this.decisionRepository.findByPlayerAndGame(playerId, gameId);
    }
    return this.decisionRepository.findRecentByPlayer(playerId, limit);
  }

  async getGameDecisionStats(gameId: number): Promise<{
    totalDecisions: number;
    averageConfidence: number;
    averageProcessingTime: number;
    successRate: number;
    decisionsByType: Record<DecisionType, number>;
  }> {
    return this.decisionRepository.getGameDecisionStats(gameId);
  }

  async markDecisionOutcome(
    decisionId: number,
    wasSuccessful: boolean,
    outcome?: Record<string, any>,
  ): Promise<void> {
    const decision = await this.decisionRepository.findById(decisionId);
    if (!decision) {
      throw new Error(`Decision ${decisionId} not found`);
    }

    if (wasSuccessful) {
      decision.markAsSuccessful(outcome);
    } else {
      decision.markAsFailed(outcome);
    }

    await this.decisionRepository.save(decision);

    this.logger.log(
      `Marked decision ${decisionId} as ${wasSuccessful ? 'successful' : 'failed'}`,
    );
  }

  async analyzeDecisionPattern(playerId: number): Promise<{
    preferredActions: Record<string, number>;
    averageConfidence: number;
    decisionSpeed: 'fast' | 'normal' | 'slow';
    consistency: number;
    strengths: string[];
    weaknesses: string[];
  }> {
    const decisions = await this.decisionRepository.findRecentByPlayer(
      playerId,
      100,
    );

    if (decisions.length === 0) {
      return {
        preferredActions: {},
        averageConfidence: 5,
        decisionSpeed: 'normal',
        consistency: 0,
        strengths: [],
        weaknesses: [],
      };
    }

    const actionCounts: Record<string, number> = {};
    let totalConfidence = 0;
    let totalProcessingTime = 0;
    let successfulDecisions = 0;

    for (const decision of decisions) {
      const target = decision.getTarget() || 'none';
      actionCounts[target] = (actionCounts[target] || 0) + 1;
      totalConfidence += decision.confidence;
      totalProcessingTime += decision.processingTime;

      if (decision.isSuccessful()) {
        successfulDecisions++;
      }
    }

    const avgConfidence = totalConfidence / decisions.length;
    const avgProcessingTime = totalProcessingTime / decisions.length;
    const successRate = successfulDecisions / decisions.length;

    const decisionSpeed =
      avgProcessingTime <= 5000
        ? 'fast'
        : avgProcessingTime <= 15000
          ? 'normal'
          : 'slow';

    const consistency = this.calculateConsistency(decisions);
    const strengths = this.identifyStrengths(
      decisions,
      successRate,
      avgConfidence,
    );
    const weaknesses = this.identifyWeaknesses(
      decisions,
      successRate,
      avgConfidence,
    );

    return {
      preferredActions: actionCounts,
      averageConfidence: Math.round(avgConfidence * 100) / 100,
      decisionSpeed,
      consistency,
      strengths,
      weaknesses,
    };
  }

  private async processDecision(
    context: DecisionContext,
    startTime: number,
  ): Promise<DecisionResult> {
    // Get AI persona
    if (!context.player.aiPersonaId) {
      throw new Error('Player does not have an AI persona assigned');
    }

    const persona = await this.personaService.getPersonaById(
      context.player.aiPersonaId,
    );

    // Check cache first
    const cachedResult = await this.cacheService.getCachedDecision(
      context,
      persona,
    );
    if (cachedResult) {
      this.logger.log(
        `Using cached decision for player ${context.player.name} - Type: ${context.decisionType}`,
      );

      // Create decision record for cached result
      const processingTime = Date.now() - startTime;
      const decision = await this.saveDecisionFromCache(
        context,
        cachedResult,
        processingTime,
      );

      const decisionResult = {
        decision,
        action: cachedResult.decision.action,
        target: cachedResult.decision.target,
        reasoning: cachedResult.decision.reasoning || '',
        confidence: cachedResult.decision.confidence || 5,
        processingTime,
      };

      // Emit performance event for cached decision
      this.eventEmitter.emit('ai.decision.completed', {
        decisionResult,
        llmResponse: cachedResult.llmResponse,
        gameId: context.game.id,
        cacheHit: true,
      });

      return decisionResult;
    }

    // No cache hit, proceed with normal decision making
    this.logger.log(
      `Generating new AI decision for player ${context.player.name} - Type: ${context.decisionType}`,
    );

    // Find appropriate prompt template
    const template = await this.findBestTemplate(
      context.decisionType,
      context.player.role,
      persona,
    );

    // Build prompt context
    const promptContext = await this.buildPromptContext(
      context,
      persona,
      template,
    );

    // Generate LLM response
    const llmResponse = await this.generateLLMDecision(promptContext, template);

    // Parse decision from response
    const parsedDecision = await this.llmService.parseDecisionResponse(
      llmResponse.content,
    );

    // Validate decision
    const validatedDecision = this.validateDecision(parsedDecision, context);

    // Create and save decision record
    const processingTime = Date.now() - startTime;
    const decision = await this.saveDecision(
      context,
      template,
      llmResponse,
      validatedDecision,
      processingTime,
    );

    // Cache the decision result
    const decisionResult: DecisionResult = {
      decision,
      action: validatedDecision.action,
      target: validatedDecision.target,
      reasoning: validatedDecision.reasoning || '',
      confidence: validatedDecision.confidence || 5,
      processingTime,
    };

    // Determine cache level based on decision characteristics
    const cacheLevel = this.determineCacheLevel(context, validatedDecision);

    await this.cacheService.cacheDecision(
      context,
      persona,
      decisionResult,
      llmResponse,
      cacheLevel,
    );

    // Emit detailed performance event
    this.eventEmitter.emit('ai.decision.completed', {
      decisionResult,
      llmResponse,
      gameId: context.game.id,
      cacheHit: false,
    });

    return decisionResult;
  }

  private async findBestTemplate(
    decisionType: DecisionType,
    role: string,
    persona: AIPersona,
  ): Promise<PromptTemplate> {
    // Try to find role and persona specific template first
    let templates = await this.templateRepository.findByCategoryAndRole(
      this.mapDecisionTypeToCategory(decisionType),
      role as any,
    );

    if (templates.length === 0) {
      // Fallback to any role template for this category
      templates = await this.templateRepository.findByCategoryAndRole(
        this.mapDecisionTypeToCategory(decisionType),
        'any',
      );
    }

    if (templates.length === 0) {
      throw new Error(
        `No prompt templates found for decision type: ${decisionType}`,
      );
    }

    // Select best performing template
    const bestTemplate = templates.reduce((prev, curr) =>
      curr.getPerformanceScore() > prev.getPerformanceScore() ? curr : prev,
    );

    return bestTemplate;
  }

  private async buildPromptContext(
    context: DecisionContext,
    persona: AIPersona,
    template: PromptTemplate,
  ): Promise<string> {
    const personalityContext =
      await this.personaService.generatePersonalityPromptContext(persona.id);

    const gameState = this.buildGameStateContext(context);
    const playerInfo = this.buildPlayerInfoContext(context);
    const availableActions = this.buildAvailableActionsContext(context);

    const parameters = {
      personalityContext,
      gameState,
      playerInfo,
      availableActions,
      gamePhase: context.gamePhase,
      playerList: context.availableTargets?.join(', ') || 'none',
      dayCount: context.game.dayCount.toString(),
    };

    return template.generatePrompt(parameters);
  }

  private async generateLLMDecision(
    prompt: string,
    template: PromptTemplate,
  ): Promise<LLMResponse> {
    // Use routine model for simple decisions, strategy model for complex ones
    const isComplexDecision =
      template.category === 'coordination' || template.parameters.length > 5;

    if (isComplexDecision) {
      return this.llmService.generateStrategicDecision(prompt, 200);
    } else {
      return this.llmService.generateRoutineDecision(prompt, 100);
    }
  }

  private validateDecision(
    parsedDecision: any,
    context: DecisionContext,
  ): {
    action: string;
    target?: string;
    reasoning?: string;
    confidence?: number;
  } {
    let { action, target, reasoning, confidence } = parsedDecision;

    // Validate action
    const validActions = this.getValidActionsForDecisionType(
      context.decisionType,
    );
    if (!validActions.includes(action)) {
      this.logger.warn(
        `Invalid action "${action}" for decision type ${context.decisionType}, defaulting to abstain`,
      );
      action = 'abstain';
    }

    // Validate target
    if (
      target &&
      context.availableTargets &&
      !context.availableTargets.includes(target)
    ) {
      this.logger.warn(
        `Invalid target "${target}", selecting random valid target`,
      );
      target =
        context.availableTargets[
          Math.floor(Math.random() * context.availableTargets.length)
        ];
    }

    // Validate confidence
    confidence = Math.max(1, Math.min(10, confidence || 5));

    return { action, target, reasoning, confidence };
  }

  private async saveDecision(
    context: DecisionContext,
    template: PromptTemplate,
    llmResponse: LLMResponse,
    validatedDecision: any,
    processingTime: number,
  ): Promise<AIDecision> {
    const decision = this.decisionRepository.create({
      playerId: context.player.id,
      gameId: context.game.id,
      decisionType: context.decisionType,
      decisionData: {
        action: validatedDecision.action,
        target: validatedDecision.target,
        reasoning: validatedDecision.reasoning,
        alternatives: [], // Could be extracted from LLM response
      },
      promptUsed: template.name,
      llmResponse: llmResponse.content,
      processingTime,
      confidence: validatedDecision.confidence,
      gamePhase: context.gamePhase,
    });

    const savedDecision = await this.decisionRepository.save(decision);

    // Update template usage statistics
    await this.templateRepository.updateUsageStats(template.id);

    return savedDecision;
  }

  private createTimeoutPromise(
    timeLimit: number,
    decisionKey: string,
  ): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Decision timeout after ${timeLimit}ms`));
      }, timeLimit);
    });
  }

  private createFallbackDecision(
    context: DecisionContext,
    startTime: number,
    errorMessage: string,
  ): DecisionResult {
    const processingTime = Date.now() - startTime;
    const fallbackAction = this.getFallbackAction(context.decisionType);

    const decision = this.decisionRepository.create({
      playerId: context.player.id,
      gameId: context.game.id,
      decisionType: context.decisionType,
      decisionData: {
        action: fallbackAction,
        reasoning: `Fallback decision due to error: ${errorMessage}`,
        alternatives: [],
      },
      processingTime,
      confidence: 1, // Low confidence for fallback
      gamePhase: context.gamePhase,
      wasSuccessful: false,
    });

    return {
      decision,
      action: fallbackAction,
      reasoning: `Fallback decision due to error: ${errorMessage}`,
      confidence: 1,
      processingTime,
    };
  }

  private mapDecisionTypeToCategory(decisionType: DecisionType): any {
    const mapping = {
      vote: 'voting',
      night_action: 'role_action',
      discussion: 'discussion',
      accusation: 'discussion',
    };
    return mapping[decisionType] || 'discussion';
  }

  private buildGameStateContext(context: DecisionContext): string {
    const game = context.game;
    const alivePlayers = game.getAlivePlayers();
    const mafiaCount = game.getMafiaPlayers().length;
    const citizenCount = game.getCitizenPlayers().length;

    return `Day ${game.dayCount}, Phase: ${context.gamePhase}.
    Alive: ${alivePlayers.length} players (${mafiaCount} mafia, ${citizenCount} citizens).`;
  }

  private buildPlayerInfoContext(context: DecisionContext): string {
    const player = context.player;
    return `You are ${player.name}, playing as ${player.role}. You are ${player.isAlive ? 'alive' : 'dead'}.`;
  }

  private buildAvailableActionsContext(context: DecisionContext): string {
    const actions = this.getValidActionsForDecisionType(context.decisionType);
    const targets = context.availableTargets
      ? ` Available targets: ${context.availableTargets.join(', ')}`
      : '';
    return `Available actions: ${actions.join(', ')}.${targets}`;
  }

  private getValidActionsForDecisionType(decisionType: DecisionType): string[] {
    const actionMap = {
      vote: ['vote', 'abstain'],
      night_action: ['kill', 'investigate', 'heal', 'skip'],
      discussion: ['accuse', 'defend', 'question', 'observe'],
      accusation: ['accuse', 'counter_accuse', 'support', 'dismiss'],
    };
    return actionMap[decisionType] || ['abstain'];
  }

  private getFallbackAction(decisionType: DecisionType): string {
    const fallbackMap = {
      vote: 'abstain',
      night_action: 'skip',
      discussion: 'observe',
      accusation: 'dismiss',
    };
    return fallbackMap[decisionType] || 'abstain';
  }

  private calculateConsistency(decisions: AIDecision[]): number {
    if (decisions.length < 2) return 0;

    const actions = decisions.map((d) => d.getTarget() || 'none');
    const uniqueActions = new Set(actions);

    // Consistency = 1 - (unique actions / total actions)
    return Math.max(0, 1 - uniqueActions.size / actions.length);
  }

  private identifyStrengths(
    decisions: AIDecision[],
    successRate: number,
    avgConfidence: number,
  ): string[] {
    const strengths: string[] = [];

    if (successRate > 0.7) strengths.push('High success rate');
    if (avgConfidence > 7) strengths.push('Confident decision making');
    if (decisions.some((d) => d.isFastDecision()))
      strengths.push('Quick decision making');

    const voteDecisions = decisions.filter((d) => d.isVoteDecision());
    if (
      voteDecisions.length > 0 &&
      voteDecisions.filter((d) => d.isSuccessful()).length /
        voteDecisions.length >
        0.6
    ) {
      strengths.push('Good voting decisions');
    }

    return strengths;
  }

  private identifyWeaknesses(
    decisions: AIDecision[],
    successRate: number,
    avgConfidence: number,
  ): string[] {
    const weaknesses: string[] = [];

    if (successRate < 0.4) weaknesses.push('Low success rate');
    if (avgConfidence < 4) weaknesses.push('Low confidence in decisions');
    if (decisions.some((d) => d.processingTime > 20000))
      weaknesses.push('Slow decision making');

    const nightActions = decisions.filter((d) => d.isNightActionDecision());
    if (
      nightActions.length > 0 &&
      nightActions.filter((d) => d.isSuccessful()).length /
        nightActions.length <
        0.3
    ) {
      weaknesses.push('Poor night action choices');
    }

    return weaknesses;
  }

  /**
   * Save decision record from cached result
   */
  private async saveDecisionFromCache(
    context: DecisionContext,
    cachedResult: any,
    processingTime: number,
  ): Promise<AIDecision> {
    const decision = this.decisionRepository.create({
      playerId: context.player.id,
      gameId: context.game.id,
      decisionType: context.decisionType,
      decisionData: {
        action: cachedResult.decision.action,
        target: cachedResult.decision.target,
        reasoning: cachedResult.decision.reasoning,
        alternatives: [], // Not stored in cache
      },
      promptUsed: 'cached_decision',
      llmResponse: cachedResult.llmResponse.content,
      processingTime,
      confidence: cachedResult.decision.confidence,
      gamePhase: context.gamePhase,
    });

    return this.decisionRepository.save(decision);
  }

  /**
   * Determine cache level based on decision characteristics
   */
  private determineCacheLevel(
    context: DecisionContext,
    decision: any,
  ): CacheLevel {
    // High confidence generic decisions can be cached globally
    if (decision.confidence >= 8 && this.isGenericDecision(context, decision)) {
      return 'global';
    }

    // Game-specific decisions for strategic contexts
    if (
      context.decisionType === 'night_action' ||
      context.decisionType === 'vote'
    ) {
      return 'game-specific';
    }

    // Default to persona-specific
    return 'persona-specific';
  }

  /**
   * Check if decision is generic enough for global caching
   */
  private isGenericDecision(context: DecisionContext, decision: any): boolean {
    // Abstain/skip decisions are often generic
    if (['abstain', 'skip', 'observe'].includes(decision.action)) {
      return true;
    }

    // Early game discussion decisions can be generic
    if (
      context.decisionType === 'discussion' &&
      context.game.dayCount <= 2 &&
      decision.confidence >= 7
    ) {
      return true;
    }

    return false;
  }

  /**
   * Invalidate cache when game state changes
   */
  async invalidateCacheForGameStateChange(
    gameId: number,
    changedFields: string[],
  ): Promise<void> {
    try {
      await this.cacheService.invalidateByGameState(gameId, changedFields);
      this.logger.log(
        `Cache invalidated for game ${gameId} due to state change: [${changedFields.join(', ')}]`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to invalidate cache for game ${gameId}: ${error.message}`,
      );
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics(): any {
    return this.cacheService.getCacheStats();
  }

  /**
   * Warm up cache with common scenarios
   */
  async warmupDecisionCache(): Promise<void> {
    try {
      await this.cacheService.warmupCache();
      this.logger.log('Decision cache warmup completed');
    } catch (error) {
      this.logger.error(`Cache warmup failed: ${error.message}`);
    }
  }

  /**
   * Clear decision cache
   */
  async clearDecisionCache(level?: CacheLevel): Promise<number> {
    try {
      const clearedCount = await this.cacheService.clearCache(level);
      this.logger.log(
        `Decision cache cleared - Level: ${level || 'all'}, Keys: ${clearedCount}`,
      );
      return clearedCount;
    } catch (error) {
      this.logger.error(`Failed to clear cache: ${error.message}`);
      return 0;
    }
  }
}

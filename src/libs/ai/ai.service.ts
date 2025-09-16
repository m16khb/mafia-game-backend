import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Game } from '../../entities/game.entity';
import { Player } from '../../entities/player.entity';
import {
  AIPersonaService,
  PersonaAssignmentResult,
} from './ai-persona.service';
import {
  AIDecisionService,
  DecisionContext,
  DecisionResult,
} from './ai-decision.service';
import { LLMService } from '../llm/llm.service';

export interface AIGameSetupResult {
  game: Game;
  assignments: PersonaAssignmentResult[];
  setupTime: number;
}

export interface AIPhaseResult {
  decisions: DecisionResult[];
  phaseTime: number;
  totalCost: number;
  errors: string[];
}

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  constructor(
    private readonly personaService: AIPersonaService,
    private readonly decisionService: AIDecisionService,
    private readonly llmService: LLMService,
    private readonly configService: ConfigService,
  ) {}

  async setupAIGame(
    game: Game,
    humanPlayerId: number,
  ): Promise<AIGameSetupResult> {
    const startTime = Date.now();

    try {
      this.logger.log(
        `Setting up AI game ${game.id} with ${game.aiPlayerCount} AI players`,
      );

      // Get AI players (excluding human player)
      const aiPlayers = game.players.filter(
        (player) => player.id !== humanPlayerId && player.isAi,
      );

      if (aiPlayers.length !== game.aiPlayerCount) {
        throw new Error(
          `Expected ${game.aiPlayerCount} AI players, found ${aiPlayers.length}`,
        );
      }

      // Assign roles if not already assigned
      if (!aiPlayers.every((player) => player.role)) {
        game.assignRoles();
      }

      // Get player IDs and roles for persona assignment
      const playerIds = aiPlayers.map((player) => player.id);
      const roles = aiPlayers.map((player) => player.role);

      // Assign AI personas
      const assignments = await this.personaService.assignPersonasToPlayers(
        playerIds,
        roles,
        game.aiPersonalitySet,
      );

      // Update players with persona assignments
      for (const assignment of assignments) {
        const player = aiPlayers.find((p) => p.id === assignment.playerId);
        if (player) {
          player.aiPersonaId = assignment.persona.id;
          player.aiDecisionTimeout = this.configService.get<number>(
            'AI_DECISION_TIMEOUT',
            30000,
          );
        }
      }

      const setupTime = Date.now() - startTime;

      this.logger.log(
        `AI game setup completed in ${setupTime}ms with ${assignments.length} persona assignments`,
      );

      return {
        game,
        assignments,
        setupTime,
      };
    } catch (error) {
      this.logger.error(`AI game setup failed: ${error.message}`);
      throw error;
    }
  }

  async processAIPhase(game: Game, phase: string): Promise<AIPhaseResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let totalCost = 0;

    try {
      this.logger.log(`Processing AI phase: ${phase} for game ${game.id}`);

      // Get AI players who need to make decisions
      const aiPlayers = game.players.filter(
        (player) => player.isAi && player.isAlive && player.aiPersonaId,
      );

      if (aiPlayers.length === 0) {
        return {
          decisions: [],
          phaseTime: Date.now() - startTime,
          totalCost: 0,
          errors: ['No AI players available for decisions'],
        };
      }

      // Create decision contexts for each AI player
      const contexts: DecisionContext[] = [];

      for (const player of aiPlayers) {
        const context = this.createDecisionContext(game, player, phase);
        if (context) {
          contexts.push(context);
        } else {
          errors.push(
            `Could not create decision context for player ${player.name}`,
          );
        }
      }

      // Process decisions in batch
      const decisions = await this.decisionService.batchDecisions(contexts);

      // Calculate total cost from LLM usage
      const stats = this.llmService.getUsageStats();
      // This is an approximation - in a real system you'd track costs per request
      totalCost = decisions.length * 0.01; // Estimate $0.01 per decision

      // Mark AI decisions as complete
      game.markAIDecisionsComplete();

      const phaseTime = Date.now() - startTime;

      this.logger.log(
        `AI phase ${phase} completed in ${phaseTime}ms with ${decisions.length} decisions`,
      );

      return {
        decisions,
        phaseTime,
        totalCost,
        errors,
      };
    } catch (error) {
      this.logger.error(`AI phase processing failed: ${error.message}`);
      errors.push(error.message);

      return {
        decisions: [],
        phaseTime: Date.now() - startTime,
        totalCost,
        errors,
      };
    }
  }

  async getGameAIStats(gameId: number): Promise<{
    decisionStats: any;
    costEstimate: number;
    performanceMetrics: {
      averageDecisionTime: number;
      averageConfidence: number;
      successRate: number;
    };
  }> {
    const decisionStats =
      await this.decisionService.getGameDecisionStats(gameId);

    // Estimate cost based on decision count
    const costEstimate = decisionStats.totalDecisions * 0.01;

    return {
      decisionStats,
      costEstimate,
      performanceMetrics: {
        averageDecisionTime: decisionStats.averageProcessingTime,
        averageConfidence: decisionStats.averageConfidence,
        successRate: decisionStats.successRate,
      },
    };
  }

  async initializeAISystem(): Promise<void> {
    this.logger.log('Initializing AI system...');

    try {
      // Test LLM connection
      const connectionOk = await this.llmService.testConnection();
      if (!connectionOk) {
        throw new Error('LLM service connection test failed');
      }

      // Seed default personas if needed
      const personas = await this.personaService.getAllActivePersonas();
      if (personas.length === 0) {
        this.logger.log('No AI personas found, seeding defaults...');
        await this.personaService.seedDefaultPersonas();
      }

      this.logger.log(
        `AI system initialized with ${personas.length} available personas`,
      );
    } catch (error) {
      this.logger.error(`AI system initialization failed: ${error.message}`);
      throw error;
    }
  }

  async healthCheck(): Promise<{
    llmService: boolean;
    personaCount: number;
    usageStats: any;
    status: 'healthy' | 'degraded' | 'unhealthy';
  }> {
    try {
      const llmHealthy = await this.llmService.testConnection();
      const personas = await this.personaService.getAllActivePersonas();
      const usageStats = this.llmService.getUsageStats();

      const status =
        llmHealthy && personas.length > 0
          ? 'healthy'
          : personas.length > 0
            ? 'degraded'
            : 'unhealthy';

      return {
        llmService: llmHealthy,
        personaCount: personas.length,
        usageStats,
        status,
      };
    } catch (error) {
      this.logger.error(`AI health check failed: ${error.message}`);
      return {
        llmService: false,
        personaCount: 0,
        usageStats: null,
        status: 'unhealthy',
      };
    }
  }

  private createDecisionContext(
    game: Game,
    player: Player,
    phase: string,
  ): DecisionContext | null {
    try {
      const decisionType = this.mapPhaseToDecisionType(phase);
      if (!decisionType) {
        return null;
      }

      const availableTargets = this.getAvailableTargets(game, player, phase);

      return {
        game,
        player,
        decisionType,
        gamePhase: phase,
        availableTargets,
        gameState: {
          alivePlayers: game.getAlivePlayers().length,
          mafiaCount: game.getMafiaPlayers().length,
          citizenCount: game.getCitizenPlayers().length,
          dayCount: game.dayCount,
        },
        timeLimit: player.aiDecisionTimeout,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create decision context for ${player.name}: ${error.message}`,
      );
      return null;
    }
  }

  private mapPhaseToDecisionType(phase: string): any {
    const mapping = {
      day_discussion: 'discussion',
      day_voting: 'vote',
      night_actions: 'night_action',
    };
    return mapping[phase as keyof typeof mapping] || null;
  }

  private getAvailableTargets(
    game: Game,
    player: Player,
    phase: string,
  ): string[] {
    const alivePlayers = game
      .getAlivePlayers()
      .filter((p) => p.id !== player.id);

    if (phase === 'night_actions') {
      // Night actions can target any alive player
      return alivePlayers.map((p) => p.name);
    } else if (phase === 'day_voting') {
      // Voting can target any alive player except self
      return alivePlayers.map((p) => p.name);
    } else {
      // Discussion phase - can mention any alive player
      return alivePlayers.map((p) => p.name);
    }
  }
}

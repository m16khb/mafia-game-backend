import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { Logger } from '@/libs/logger/logger.service';
import { ClsService } from 'nestjs-cls';
import {
  IAIDecisionRepository,
  AI_DECISION_REPOSITORY_TOKEN,
  IGameEventRepository,
  GAME_EVENT_REPOSITORY_TOKEN,
  IGameRepository,
  GAME_REPOSITORY_TOKEN,
  IPlayerRepository,
  PLAYER_REPOSITORY_TOKEN,
} from '@libs/repositories';
import {
  AIDecisionService,
  DecisionContext,
  DecisionResult,
} from '@/libs/ai/ai-decision.service';
import { AIPersonaService } from '@/libs/ai/ai-persona.service';
import { DecisionType } from '../../entities/ai-decision.entity';

interface TeamCoordinationJobData {
  gameId: number;
  teamType: 'mafia' | 'police_doctor'; // Coordination team type
  coordinationType: CoordinationType;
  gamePhase: string;
  participants: number[]; // Player IDs involved in coordination
  contextData?: Record<string, any>;
  urgencyLevel?: 'low' | 'medium' | 'high';
  requestContext?: string;
}

interface VotingCoordinationJobData {
  gameId: number;
  mafiaPlayerIds: number[];
  targetCandidates: string[];
  eliminationGoal: string; // Target to eliminate or protect
  coordinationStrategy: 'consensus' | 'split_vote' | 'bandwagon';
  requestContext?: string;
}

interface NightCoordinationJobData {
  gameId: number;
  mafiaPlayerIds: number[];
  targetAnalysis: Record<string, any>;
  killingStrategy: 'priority_target' | 'random' | 'defensive';
  requestContext?: string;
}

interface TeamCommunicationJobData {
  gameId: number;
  teamPlayerIds: number[];
  messageType: 'strategy_update' | 'role_revealed' | 'coordination_plan';
  communicationData: Record<string, any>;
  requestContext?: string;
}

type CoordinationType =
  | 'voting_coordination'
  | 'night_planning'
  | 'strategy_alignment'
  | 'role_discovery'
  | 'team_communication'
  | 'elimination_planning'
  | 'defense_coordination';

interface CoordinationResult {
  coordinationType: CoordinationType;
  participants: number[];
  decisions: DecisionResult[];
  teamStrategy: Record<string, any>;
  communicationPlan: string[];
  success: boolean;
  processingTime: number;
}

@Processor('ai-coordination')
@Injectable()
export class AICoordinationProcessor extends WorkerHost {
  constructor(
    @Inject(AI_DECISION_REPOSITORY_TOKEN)
    private readonly aiDecisionRepository: IAIDecisionRepository,
    @Inject(GAME_EVENT_REPOSITORY_TOKEN)
    private readonly gameEventRepository: IGameEventRepository,
    @Inject(GAME_REPOSITORY_TOKEN)
    private readonly gameRepository: IGameRepository,
    @Inject(PLAYER_REPOSITORY_TOKEN)
    private readonly playerRepository: IPlayerRepository,
    private readonly aiDecisionService: AIDecisionService,
    private readonly aiPersonaService: AIPersonaService,
    private readonly logger: Logger,
    private readonly cls: ClsService,
  ) {
    super();
    this.logger.setContext(AICoordinationProcessor.name);
  }

  async process(
    job: Job<
      | TeamCoordinationJobData
      | VotingCoordinationJobData
      | NightCoordinationJobData
      | TeamCommunicationJobData,
      any,
      string
    >,
  ): Promise<void> {
    const { requestContext } = job.data;

    return this.cls.run(async () => {
      if (requestContext) {
        this.cls.set('request-context', requestContext);
      }

      this.logger.log(
        `Processing AI coordination job: ${job.id} - ${job.name}`,
      );

      try {
        switch (job.name) {
          case 'team-coordination':
            await this.processTeamCoordination(
              job.data as TeamCoordinationJobData,
            );
            break;
          case 'voting-coordination':
            await this.processVotingCoordination(
              job.data as VotingCoordinationJobData,
            );
            break;
          case 'night-coordination':
            await this.processNightCoordination(
              job.data as NightCoordinationJobData,
            );
            break;
          case 'team-communication':
            await this.processTeamCommunication(
              job.data as TeamCommunicationJobData,
            );
            break;
          default:
            throw new Error(`Unknown coordination job type: ${job.name}`);
        }

        this.logger.log(`AI coordination job completed: ${job.id}`);
      } catch (error) {
        this.logger.error(
          error,
          `Failed to process AI coordination job ${job.id}:`,
        );

        // Log coordination failure event
        await this.logCoordinationEvent(
          job.data.gameId,
          'ai-coordination-failed',
          {
            jobId: job.id,
            jobType: job.name,
            error: error.message,
            participants:
              'participants' in job.data ? job.data.participants : [],
          },
        );

        throw error; // Re-throw to mark job as failed
      }
    });
  }

  private async processTeamCoordination(
    jobData: TeamCoordinationJobData,
  ): Promise<void> {
    const startTime = Date.now();

    this.logger.log(
      `Processing team coordination for ${jobData.teamType} team - Type: ${jobData.coordinationType}`,
    );

    try {
      // Load game and team players
      const game = await this.gameRepository.findByIdWithRelations(
        jobData.gameId,
        { players: true, messages: true },
      );

      if (!game) {
        throw new Error(`Game ${jobData.gameId} not found`);
      }

      const teamPlayers = game.players.filter(
        (p) => jobData.participants.includes(p.id) && p.isAi && p.isAlive,
      );

      if (teamPlayers.length === 0) {
        this.logger.warn(
          `No AI team members found for coordination in game ${jobData.gameId}`,
        );
        return;
      }

      // Execute coordination based on type
      const result = await this.executeCoordination(
        jobData.coordinationType,
        game,
        teamPlayers,
        jobData,
      );

      // Update player strategies based on coordination result
      await this.updateTeamStrategies(teamPlayers, result.teamStrategy);

      // Log successful coordination
      await this.logCoordinationEvent(
        jobData.gameId,
        'ai-team-coordination-completed',
        {
          coordinationType: jobData.coordinationType,
          teamType: jobData.teamType,
          participants: jobData.participants,
          decisionsCount: result.decisions.length,
          processingTime: Date.now() - startTime,
          success: result.success,
          urgencyLevel: jobData.urgencyLevel,
        },
      );

      this.logger.log(
        `Team coordination completed: ${result.decisions.length} decisions made for ${teamPlayers.length} players`,
      );
    } catch (error) {
      this.logger.error(
        error,
        `Team coordination failed for game ${jobData.gameId}`,
      );
      throw error;
    }
  }

  private async processVotingCoordination(
    jobData: VotingCoordinationJobData,
  ): Promise<void> {
    const startTime = Date.now();

    this.logger.log(
      `Processing voting coordination for ${jobData.mafiaPlayerIds.length} mafia members`,
    );

    try {
      // Load game and mafia players
      const game = await this.gameRepository.findByIdWithRelations(
        jobData.gameId,
        { players: true },
      );

      if (!game) {
        throw new Error(`Game ${jobData.gameId} not found`);
      }

      const mafiaPlayers = game.players.filter(
        (p) =>
          jobData.mafiaPlayerIds.includes(p.id) &&
          p.isAi &&
          p.isAlive &&
          p.isMafia(),
      );

      if (mafiaPlayers.length === 0) {
        throw new Error(
          'No alive AI mafia players found for voting coordination',
        );
      }

      // Analyze voting targets and determine strategy
      const votingStrategy = await this.analyzeVotingStrategy(
        game,
        mafiaPlayers,
        jobData.targetCandidates,
        jobData.eliminationGoal,
        jobData.coordinationStrategy,
      );

      // Generate coordinated voting decisions
      const votingDecisions: DecisionResult[] = [];

      for (const player of mafiaPlayers) {
        const votingContext: DecisionContext = {
          game,
          player,
          decisionType: 'vote' as DecisionType,
          gamePhase: 'day_voting',
          availableTargets: jobData.targetCandidates,
          gameState: {
            coordinationStrategy: votingStrategy,
            teamGoal: jobData.eliminationGoal,
            otherMafiaVotes: votingDecisions
              .map((d) => d.target)
              .filter(Boolean),
          },
        };

        const decision =
          await this.aiDecisionService.makeDecision(votingContext);
        votingDecisions.push(decision);

        this.logger.log(
          `Mafia ${player.name} voting decision: ${decision.action} -> ${decision.target}`,
        );
      }

      // Validate coordination effectiveness
      const coordinationEffectiveness = this.evaluateVotingCoordination(
        votingDecisions,
        jobData.coordinationStrategy,
      );

      // Log voting coordination results
      await this.logCoordinationEvent(
        jobData.gameId,
        'ai-voting-coordination-completed',
        {
          mafiaCount: mafiaPlayers.length,
          targetCandidates: jobData.targetCandidates,
          eliminationGoal: jobData.eliminationGoal,
          coordinationStrategy: jobData.coordinationStrategy,
          votingDecisions: votingDecisions.map((d) => ({
            player: d.decision.playerId,
            target: d.target,
            confidence: d.confidence,
          })),
          effectiveness: coordinationEffectiveness,
          processingTime: Date.now() - startTime,
        },
      );

      this.logger.log(
        `Voting coordination completed with ${coordinationEffectiveness.toFixed(2)} effectiveness`,
      );
    } catch (error) {
      this.logger.error(
        error,
        `Voting coordination failed for game ${jobData.gameId}`,
      );
      throw error;
    }
  }

  private async processNightCoordination(
    jobData: NightCoordinationJobData,
  ): Promise<void> {
    const startTime = Date.now();

    this.logger.log(
      `Processing night coordination for ${jobData.mafiaPlayerIds.length} mafia members`,
    );

    try {
      // Load game and mafia players
      const game = await this.gameRepository.findByIdWithRelations(
        jobData.gameId,
        { players: true },
      );

      if (!game) {
        throw new Error(`Game ${jobData.gameId} not found`);
      }

      const mafiaPlayers = game.players.filter(
        (p) =>
          jobData.mafiaPlayerIds.includes(p.id) &&
          p.isAi &&
          p.isAlive &&
          p.isMafia(),
      );

      if (mafiaPlayers.length === 0) {
        throw new Error(
          'No alive AI mafia players found for night coordination',
        );
      }

      // Analyze night targets
      const targetPriorities = await this.analyzeNightTargets(
        game,
        mafiaPlayers,
        jobData.targetAnalysis,
        jobData.killingStrategy,
      );

      // Coordinate killing decision (typically one mafia member performs the kill)
      const killerPlayer = this.selectKiller(mafiaPlayers);
      const nightActionContext: DecisionContext = {
        game,
        player: killerPlayer,
        decisionType: 'night_action' as DecisionType,
        gamePhase: 'night_actions',
        availableTargets: targetPriorities.map((t) => t.target),
        gameState: {
          killingStrategy: jobData.killingStrategy,
          targetPriorities,
          teamRole: 'killer',
        },
      };

      const killingDecision =
        await this.aiDecisionService.makeDecision(nightActionContext);

      // Update other mafia members about the plan
      const coordinationPlan = {
        killer: killerPlayer.id,
        target: killingDecision.target,
        strategy: jobData.killingStrategy,
        backupTargets: targetPriorities.slice(1, 3).map((t) => t.target),
      };

      await this.shareCoordinationPlan(mafiaPlayers, coordinationPlan);

      // Log night coordination results
      await this.logCoordinationEvent(
        jobData.gameId,
        'ai-night-coordination-completed',
        {
          mafiaCount: mafiaPlayers.length,
          killer: killerPlayer.id,
          target: killingDecision.target,
          killingStrategy: jobData.killingStrategy,
          targetPriorities,
          coordinationPlan,
          confidence: killingDecision.confidence,
          processingTime: Date.now() - startTime,
        },
      );

      this.logger.log(
        `Night coordination completed: ${killerPlayer.name} will target ${killingDecision.target}`,
      );
    } catch (error) {
      this.logger.error(
        error,
        `Night coordination failed for game ${jobData.gameId}`,
      );
      throw error;
    }
  }

  private async processTeamCommunication(
    jobData: TeamCommunicationJobData,
  ): Promise<void> {
    const startTime = Date.now();

    this.logger.log(
      `Processing team communication for ${jobData.teamPlayerIds.length} team members - Type: ${jobData.messageType}`,
    );

    try {
      // Load game and team players
      const game = await this.gameRepository.findByIdWithRelations(
        jobData.gameId,
        { players: true },
      );

      if (!game) {
        throw new Error(`Game ${jobData.gameId} not found`);
      }

      const teamPlayers = game.players.filter(
        (p) => jobData.teamPlayerIds.includes(p.id) && p.isAi && p.isAlive,
      );

      if (teamPlayers.length === 0) {
        this.logger.warn(
          `No AI team members found for communication in game ${jobData.gameId}`,
        );
        return;
      }

      // Process communication based on message type
      let communicationResults: any[] = [];

      switch (jobData.messageType) {
        case 'strategy_update':
          communicationResults = await this.processStrategyUpdate(
            teamPlayers,
            jobData.communicationData,
          );
          break;
        case 'role_revealed':
          communicationResults = await this.processRoleReveal(
            teamPlayers,
            jobData.communicationData,
          );
          break;
        case 'coordination_plan':
          communicationResults = await this.processCoordinationPlan(
            teamPlayers,
            jobData.communicationData,
          );
          break;
        default:
          throw new Error(`Unknown communication type: ${jobData.messageType}`);
      }

      // Update player knowledge and strategies
      await this.updateTeamKnowledge(teamPlayers, communicationResults);

      // Log team communication results
      await this.logCoordinationEvent(
        jobData.gameId,
        'ai-team-communication-completed',
        {
          messageType: jobData.messageType,
          teamSize: teamPlayers.length,
          communicationResults,
          processingTime: Date.now() - startTime,
        },
      );

      this.logger.log(
        `Team communication completed for ${teamPlayers.length} members`,
      );
    } catch (error) {
      this.logger.error(
        error,
        `Team communication failed for game ${jobData.gameId}`,
      );
      throw error;
    }
  }

  private async executeCoordination(
    coordinationType: CoordinationType,
    game: any,
    teamPlayers: any[],
    jobData: TeamCoordinationJobData,
  ): Promise<CoordinationResult> {
    const decisions: DecisionResult[] = [];
    let teamStrategy: Record<string, any> = {};
    let communicationPlan: string[] = [];

    switch (coordinationType) {
      case 'voting_coordination':
        const votingResult = await this.coordinateVoting(
          game,
          teamPlayers,
          jobData.contextData,
        );
        decisions.push(...votingResult.decisions);
        teamStrategy = votingResult.strategy;
        communicationPlan = votingResult.communicationPlan;
        break;

      case 'night_planning':
        const nightResult = await this.coordinateNightActions(
          game,
          teamPlayers,
          jobData.contextData,
        );
        decisions.push(...nightResult.decisions);
        teamStrategy = nightResult.strategy;
        communicationPlan = nightResult.communicationPlan;
        break;

      case 'strategy_alignment':
        const alignmentResult = await this.alignTeamStrategy(
          game,
          teamPlayers,
          jobData.contextData,
        );
        teamStrategy = alignmentResult.strategy;
        communicationPlan = alignmentResult.communicationPlan;
        break;

      case 'role_discovery':
        const discoveryResult = await this.coordinateRoleDiscovery(
          game,
          teamPlayers,
          jobData.contextData,
        );
        teamStrategy = discoveryResult.strategy;
        communicationPlan = discoveryResult.communicationPlan;
        break;

      case 'elimination_planning':
        const eliminationResult = await this.planElimination(
          game,
          teamPlayers,
          jobData.contextData,
        );
        decisions.push(...eliminationResult.decisions);
        teamStrategy = eliminationResult.strategy;
        communicationPlan = eliminationResult.communicationPlan;
        break;

      case 'defense_coordination':
        const defenseResult = await this.coordinateDefense(
          game,
          teamPlayers,
          jobData.contextData,
        );
        decisions.push(...defenseResult.decisions);
        teamStrategy = defenseResult.strategy;
        communicationPlan = defenseResult.communicationPlan;
        break;

      default:
        throw new Error(`Unknown coordination type: ${coordinationType}`);
    }

    return {
      coordinationType,
      participants: teamPlayers.map((p) => p.id),
      decisions,
      teamStrategy,
      communicationPlan,
      success:
        decisions.length === 0 || decisions.every((d) => d.confidence > 3),
      processingTime: Date.now() - Date.now(), // Will be calculated by caller
    };
  }

  private async coordinateVoting(
    game: any,
    teamPlayers: any[],
    contextData?: Record<string, any>,
  ): Promise<{
    decisions: DecisionResult[];
    strategy: Record<string, any>;
    communicationPlan: string[];
  }> {
    // Implementation for voting coordination
    const decisions: DecisionResult[] = [];
    const availableTargets = game.players
      .filter(
        (p: any) => p.isAlive && !teamPlayers.some((tp) => tp.id === p.id),
      )
      .map((p: any) => p.name);

    for (const player of teamPlayers) {
      const context: DecisionContext = {
        game,
        player,
        decisionType: 'vote' as DecisionType,
        gamePhase: 'day_voting',
        availableTargets,
        gameState: contextData,
      };

      const decision = await this.aiDecisionService.makeDecision(context);
      decisions.push(decision);
    }

    const strategy = {
      coordinated: true,
      targetFocus: this.findMostVotedTarget(decisions),
      splitStrategy: this.shouldSplitVotes(decisions),
    };

    const communicationPlan = [
      `Coordinate votes on ${strategy.targetFocus}`,
      `${decisions.length} team members participating`,
    ];

    return { decisions, strategy, communicationPlan };
  }

  private async coordinateNightActions(
    game: any,
    teamPlayers: any[],
    contextData?: Record<string, any>,
  ): Promise<{
    decisions: DecisionResult[];
    strategy: Record<string, any>;
    communicationPlan: string[];
  }> {
    // Implementation for night action coordination
    const decisions: DecisionResult[] = [];
    const mafiaPlayers = teamPlayers.filter((p) => p.isMafia());

    if (mafiaPlayers.length > 0) {
      const killer = this.selectKiller(mafiaPlayers);
      const availableTargets = game.players
        .filter((p: any) => p.isAlive && !p.isMafia())
        .map((p: any) => p.name);

      const context: DecisionContext = {
        game,
        player: killer,
        decisionType: 'night_action' as DecisionType,
        gamePhase: 'night_actions',
        availableTargets,
        gameState: contextData,
      };

      const decision = await this.aiDecisionService.makeDecision(context);
      decisions.push(decision);
    }

    const strategy = {
      killer: decisions[0]?.decision.playerId,
      target: decisions[0]?.target,
      coordination: 'night_kill',
    };

    const communicationPlan = [
      `${strategy.killer} will perform night kill`,
      `Target: ${strategy.target}`,
    ];

    return { decisions, strategy, communicationPlan };
  }

  private async alignTeamStrategy(
    game: any,
    teamPlayers: any[],
    contextData?: Record<string, any>,
  ): Promise<{
    strategy: Record<string, any>;
    communicationPlan: string[];
  }> {
    // Analyze current game state and align team strategy
    const mafiaCount = game.getMafiaPlayers().length;
    const citizenCount = game.getCitizenPlayers().length;
    const gamePhase = game.currentPhase;

    const strategy = {
      aggressive: mafiaCount >= citizenCount * 0.4,
      defensive: mafiaCount < citizenCount * 0.3,
      coordination_level: teamPlayers.length > 2 ? 'high' : 'medium',
      priority_targets: this.identifyPriorityTargets(game, teamPlayers),
    };

    const communicationPlan = [
      `Team strategy: ${strategy.aggressive ? 'Aggressive' : strategy.defensive ? 'Defensive' : 'Balanced'}`,
      `Coordination level: ${strategy.coordination_level}`,
      `Priority targets identified: ${strategy.priority_targets.length}`,
    ];

    return { strategy, communicationPlan };
  }

  private async coordinateRoleDiscovery(
    game: any,
    teamPlayers: any[],
    contextData?: Record<string, any>,
  ): Promise<{
    strategy: Record<string, any>;
    communicationPlan: string[];
  }> {
    // Coordinate discovery of other players' roles
    const knownRoles = contextData?.knownRoles || {};
    const suspiciousPlayers = contextData?.suspiciousPlayers || [];

    const strategy = {
      investigation_targets: suspiciousPlayers,
      role_sharing: true,
      information_consolidation: knownRoles,
    };

    const communicationPlan = [
      'Share role discovery information',
      `Investigation targets: ${suspiciousPlayers.join(', ')}`,
      'Consolidate team knowledge',
    ];

    return { strategy, communicationPlan };
  }

  private async planElimination(
    game: any,
    teamPlayers: any[],
    contextData?: Record<string, any>,
  ): Promise<{
    decisions: DecisionResult[];
    strategy: Record<string, any>;
    communicationPlan: string[];
  }> {
    // Plan elimination of specific targets
    const eliminationTargets = contextData?.targets || [];
    const decisions: DecisionResult[] = [];

    if (eliminationTargets.length > 0) {
      for (const player of teamPlayers) {
        const context: DecisionContext = {
          game,
          player,
          decisionType: 'accusation' as DecisionType,
          gamePhase: 'day_discussion',
          availableTargets: eliminationTargets,
          gameState: { eliminationPlan: true, ...contextData },
        };

        const decision = await this.aiDecisionService.makeDecision(context);
        decisions.push(decision);
      }
    }

    const strategy = {
      elimination_targets: eliminationTargets,
      coordinated_accusations: decisions.length > 0,
      success_probability: this.calculateEliminationProbability(
        decisions,
        eliminationTargets,
      ),
    };

    const communicationPlan = [
      `Plan elimination of: ${eliminationTargets.join(', ')}`,
      `${decisions.length} coordinated accusations`,
    ];

    return { decisions, strategy, communicationPlan };
  }

  private async coordinateDefense(
    game: any,
    teamPlayers: any[],
    contextData?: Record<string, any>,
  ): Promise<{
    decisions: DecisionResult[];
    strategy: Record<string, any>;
    communicationPlan: string[];
  }> {
    // Coordinate defense of team members under suspicion
    const defendedPlayers = contextData?.defendedPlayers || [];
    const decisions: DecisionResult[] = [];

    for (const player of teamPlayers) {
      if (!defendedPlayers.includes(player.name)) {
        const context: DecisionContext = {
          game,
          player,
          decisionType: 'discussion' as DecisionType,
          gamePhase: 'day_discussion',
          gameState: { defenseCoordination: true, ...contextData },
        };

        const decision = await this.aiDecisionService.makeDecision(context);
        decisions.push(decision);
      }
    }

    const strategy = {
      defended_players: defendedPlayers,
      defense_coordination: true,
      counter_accusations: decisions.some((d) => d.action === 'counter_accuse'),
    };

    const communicationPlan = [
      `Defend: ${defendedPlayers.join(', ')}`,
      'Coordinate counter-accusations',
      'Maintain team cover',
    ];

    return { decisions, strategy, communicationPlan };
  }

  // Helper methods for coordination analysis

  private async analyzeVotingStrategy(
    game: any,
    mafiaPlayers: any[],
    targetCandidates: string[],
    eliminationGoal: string,
    coordinationStrategy: string,
  ): Promise<Record<string, any>> {
    return {
      primaryTarget: eliminationGoal,
      alternativeTargets: targetCandidates.filter((t) => t !== eliminationGoal),
      votingStyle: coordinationStrategy,
      mafiaCount: mafiaPlayers.length,
      riskLevel: this.calculateVotingRisk(
        mafiaPlayers.length,
        targetCandidates.length,
      ),
    };
  }

  private async analyzeNightTargets(
    game: any,
    mafiaPlayers: any[],
    targetAnalysis: Record<string, any>,
    killingStrategy: string,
  ): Promise<Array<{ target: string; priority: number; reasoning: string }>> {
    const potentialTargets = game.players
      .filter((p: any) => p.isAlive && !p.isMafia())
      .map((p: any) => p.name);

    return potentialTargets
      .map((target) => ({
        target,
        priority: this.calculateTargetPriority(
          target,
          targetAnalysis,
          killingStrategy,
        ),
        reasoning: this.generateTargetReasoning(
          target,
          targetAnalysis,
          killingStrategy,
        ),
      }))
      .sort((a, b) => b.priority - a.priority);
  }

  private selectKiller(mafiaPlayers: any[]): any {
    // Select the most suitable mafia member to perform the kill
    // Priority: highest confidence, best performance history, or random if no clear choice
    return mafiaPlayers.reduce((best, current) => {
      const bestScore =
        (best.responseTime || 10000) + (10 - (best.aiPersonaId || 5)) * 1000;
      const currentScore =
        (current.responseTime || 10000) +
        (10 - (current.aiPersonaId || 5)) * 1000;
      return currentScore < bestScore ? current : best;
    });
  }

  private evaluateVotingCoordination(
    votingDecisions: DecisionResult[],
    coordinationStrategy: string,
  ): number {
    if (votingDecisions.length === 0) return 0;

    const targets = votingDecisions.map((d) => d.target).filter(Boolean);
    const uniqueTargets = new Set(targets);

    switch (coordinationStrategy) {
      case 'consensus':
        return uniqueTargets.size === 1 ? 1.0 : 0.5;
      case 'split_vote':
        return uniqueTargets.size > 1 &&
          uniqueTargets.size <= targets.length / 2
          ? 1.0
          : 0.3;
      case 'bandwagon':
        const mostVoted = this.findMostVotedTarget(votingDecisions);
        const consensusCount = targets.filter((t) => t === mostVoted).length;
        return consensusCount / targets.length;
      default:
        return 0.5;
    }
  }

  private findMostVotedTarget(decisions: DecisionResult[]): string {
    const votes: Record<string, number> = {};
    decisions.forEach((d) => {
      if (d.target) {
        votes[d.target] = (votes[d.target] || 0) + 1;
      }
    });

    return Object.keys(votes).reduce(
      (a, b) => (votes[a] > votes[b] ? a : b),
      Object.keys(votes)[0] || 'none',
    );
  }

  private shouldSplitVotes(decisions: DecisionResult[]): boolean {
    const targets = decisions.map((d) => d.target).filter(Boolean);
    const uniqueTargets = new Set(targets);
    return uniqueTargets.size > 1 && uniqueTargets.size <= targets.length / 2;
  }

  private calculateVotingRisk(
    mafiaCount: number,
    candidateCount: number,
  ): string {
    const ratio = mafiaCount / candidateCount;
    if (ratio > 0.5) return 'high';
    if (ratio > 0.3) return 'medium';
    return 'low';
  }

  private calculateTargetPriority(
    target: string,
    targetAnalysis: Record<string, any>,
    killingStrategy: string,
  ): number {
    const baseScore = Math.random() * 10; // Random base for demonstration

    if (targetAnalysis[target]) {
      const analysis = targetAnalysis[target];
      return (
        baseScore + (analysis.threatLevel || 0) + (analysis.suspicionLevel || 0)
      );
    }

    return baseScore;
  }

  private generateTargetReasoning(
    target: string,
    targetAnalysis: Record<string, any>,
    killingStrategy: string,
  ): string {
    const analysis = targetAnalysis[target];
    if (analysis) {
      return `Target ${target}: Threat level ${analysis.threatLevel || 0}, Strategy: ${killingStrategy}`;
    }
    return `Target ${target}: Selected based on ${killingStrategy} strategy`;
  }

  private identifyPriorityTargets(game: any, teamPlayers: any[]): string[] {
    // Identify high-priority targets (police, doctor, influential players)
    return game.players
      .filter(
        (p: any) =>
          p.isAlive &&
          !teamPlayers.some((tp) => tp.id === p.id) &&
          (p.role === 'police' || p.role === 'doctor' || p.isHost),
      )
      .map((p: any) => p.name);
  }

  private calculateEliminationProbability(
    decisions: DecisionResult[],
    targets: string[],
  ): number {
    if (decisions.length === 0 || targets.length === 0) return 0;

    const avgConfidence =
      decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length;
    const targetFocus = this.findMostVotedTarget(decisions);
    const focusRatio =
      decisions.filter((d) => d.target === targetFocus).length /
      decisions.length;

    return (avgConfidence / 10) * 0.6 + focusRatio * 0.4;
  }

  // Communication and knowledge sharing methods

  private async shareCoordinationPlan(
    players: any[],
    coordinationPlan: Record<string, any>,
  ): Promise<void> {
    // Update each player's strategy with the coordination plan
    for (const player of players) {
      if (player.currentStrategy) {
        const updatedStrategy = {
          ...JSON.parse(player.currentStrategy || '{}'),
          coordinationPlan,
          lastUpdate: new Date().toISOString(),
        };
        player.currentStrategy = JSON.stringify(updatedStrategy);
        await this.playerRepository.save(player);
      }
    }

    this.logger.log(`Shared coordination plan with ${players.length} players`);
  }

  private async processStrategyUpdate(
    teamPlayers: any[],
    communicationData: Record<string, any>,
  ): Promise<any[]> {
    const results = [];

    for (const player of teamPlayers) {
      const updateResult = {
        playerId: player.id,
        previousStrategy: player.currentStrategy,
        newStrategy: communicationData.strategy,
        updateSuccess: true,
      };

      try {
        player.updateStrategy(JSON.stringify(communicationData.strategy));
        await this.playerRepository.save(player);
      } catch (error) {
        updateResult.updateSuccess = false;
        this.logger.error(
          error,
          `Failed to update strategy for player ${player.id}`,
        );
      }

      results.push(updateResult);
    }

    return results;
  }

  private async processRoleReveal(
    teamPlayers: any[],
    communicationData: Record<string, any>,
  ): Promise<any[]> {
    const results = [];
    const revealedRole = communicationData.role;
    const revealedPlayer = communicationData.player;

    for (const player of teamPlayers) {
      const roleInfo = {
        playerId: player.id,
        revealedPlayer,
        revealedRole,
        knowledgeUpdated: true,
      };

      // Update player's knowledge about revealed roles
      try {
        const currentStrategy = JSON.parse(player.currentStrategy || '{}');
        currentStrategy.knownRoles = currentStrategy.knownRoles || {};
        currentStrategy.knownRoles[revealedPlayer] = revealedRole;

        player.updateStrategy(JSON.stringify(currentStrategy));
        await this.playerRepository.save(player);
      } catch (error) {
        roleInfo.knowledgeUpdated = false;
        this.logger.error(
          error,
          `Failed to update role knowledge for player ${player.id}`,
        );
      }

      results.push(roleInfo);
    }

    return results;
  }

  private async processCoordinationPlan(
    teamPlayers: any[],
    communicationData: Record<string, any>,
  ): Promise<any[]> {
    const results = [];
    const plan = communicationData.plan;

    for (const player of teamPlayers) {
      const planResult = {
        playerId: player.id,
        planType: plan.type,
        assignment: plan.assignments?.[player.id],
        acknowledgment: true,
      };

      try {
        const currentStrategy = JSON.parse(player.currentStrategy || '{}');
        currentStrategy.activePlan = plan;
        currentStrategy.myAssignment = plan.assignments?.[player.id];

        player.updateStrategy(JSON.stringify(currentStrategy));
        await this.playerRepository.save(player);
      } catch (error) {
        planResult.acknowledgment = false;
        this.logger.error(
          error,
          `Failed to update coordination plan for player ${player.id}`,
        );
      }

      results.push(planResult);
    }

    return results;
  }

  private async updateTeamStrategies(
    teamPlayers: any[],
    teamStrategy: Record<string, any>,
  ): Promise<void> {
    for (const player of teamPlayers) {
      try {
        const currentStrategy = JSON.parse(player.currentStrategy || '{}');
        const updatedStrategy = {
          ...currentStrategy,
          teamStrategy,
          lastCoordination: new Date().toISOString(),
        };

        player.updateStrategy(JSON.stringify(updatedStrategy));
        await this.playerRepository.save(player);
      } catch (error) {
        this.logger.error(
          error,
          `Failed to update team strategy for player ${player.id}`,
        );
      }
    }

    this.logger.log(`Updated team strategy for ${teamPlayers.length} players`);
  }

  private async updateTeamKnowledge(
    teamPlayers: any[],
    communicationResults: any[],
  ): Promise<void> {
    for (let i = 0; i < teamPlayers.length; i++) {
      const player = teamPlayers[i];
      const result = communicationResults[i];

      if (result && result.knowledgeUpdated !== false) {
        try {
          const currentStrategy = JSON.parse(player.currentStrategy || '{}');
          currentStrategy.lastCommunication = new Date().toISOString();
          currentStrategy.communicationResults = result;

          player.updateStrategy(JSON.stringify(currentStrategy));
          await this.playerRepository.save(player);
        } catch (error) {
          this.logger.error(
            error,
            `Failed to update knowledge for player ${player.id}`,
          );
        }
      }
    }
  }

  private async logCoordinationEvent(
    gameId: number,
    eventType: string,
    eventData: Record<string, any>,
  ): Promise<void> {
    try {
      const gameEvent = this.gameEventRepository.create({
        gameId,
        eventType,
        eventData,
      });

      await this.gameEventRepository.save(gameEvent);
    } catch (error) {
      this.logger.error(error, 'Failed to log coordination event');
      // Don't throw here - logging failure shouldn't break the main process
    }
  }
}

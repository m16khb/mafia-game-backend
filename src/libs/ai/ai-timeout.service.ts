import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AIPersona } from '../../entities/ai-persona.entity';
import { Player } from '../../entities/player.entity';
import { Game } from '../../entities/game.entity';

export interface TimeoutConfig {
  llmTimeout: number;
  decisionTimeout: number;
  queueTimeout: number;
  personaMultiplier: number;
  phaseMultiplier: number;
  warningThreshold: number; // Percentage of timeout (e.g., 0.8 = 80%)
}

export interface TimeoutStats {
  totalTimeouts: number;
  timeoutsByType: Record<string, number>;
  timeoutsByPersona: Record<number, number>;
  timeoutsByPhase: Record<string, number>;
  averageTimeoutDuration: number;
  fallbackDecisionRate: number;
  recoverySuccessRate: number;
}

export interface FallbackDecision {
  action: string;
  target?: string;
  reasoning: string;
  confidence: number;
  isFallback: true;
  timeoutType: string;
}

export interface AIDecisionContext {
  decisionType: string;
  gamePhase: string;
  playerRole: string;
  availableTargets?: string[];
}

export interface TimeoutEvent {
  type: 'llm' | 'decision' | 'queue';
  playerId: number;
  gameId: number;
  phase: string;
  duration: number;
  threshold: number;
  timestamp: Date;
  fallbackUsed: boolean;
}

export interface EarlyWarning {
  playerId: number;
  gameId: number;
  currentDuration: number;
  warningThreshold: number;
  timeRemaining: number;
  timestamp: Date;
}

@Injectable()
export class AITimeoutService implements OnModuleDestroy {
  private readonly logger = new Logger(AITimeoutService.name);
  private readonly activeTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly timeoutWarnings = new Map<string, NodeJS.Timeout>();
  private readonly timeoutStats: TimeoutStats = {
    totalTimeouts: 0,
    timeoutsByType: {},
    timeoutsByPersona: {},
    timeoutsByPhase: {},
    averageTimeoutDuration: 0,
    fallbackDecisionRate: 0,
    recoverySuccessRate: 0,
  };
  private readonly timeoutHistory: TimeoutEvent[] = [];
  private readonly maxHistorySize = 1000;

  private readonly defaultConfig: TimeoutConfig = {
    llmTimeout: 30000, // 30 seconds
    decisionTimeout: 45000, // 45 seconds
    queueTimeout: 60000, // 60 seconds
    personaMultiplier: 1.0,
    phaseMultiplier: 1.0,
    warningThreshold: 0.8, // 80% of timeout
  };

  private readonly personaTimeoutMultipliers: Record<string, number> = {
    analytical: 1.2, // Takes more time to analyze
    quick: 0.8, // Faster decisions
    cautious: 1.3, // Very careful
    impulsive: 0.7, // Quick reactions
    methodical: 1.4, // Systematic approach
    spontaneous: 0.6, // Instant decisions
  };

  private readonly phaseTimeoutMultipliers: Record<string, number> = {
    day_discussion: 1.0,
    day_voting: 0.8, // Voting should be quicker
    night_actions: 1.2, // Night actions need more thought
    result: 0.5, // Results are quick
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.loadConfiguration();
    this.logger.log('AI Timeout Service initialized');
  }

  // Start timeout tracking for a decision
  startTimeout(
    type: 'llm' | 'decision' | 'queue',
    playerId: number,
    gameId: number,
    phase: string,
    persona?: AIPersona,
    customTimeout?: number,
  ): string {
    const timeoutId = this.generateTimeoutId(type, playerId, gameId);
    const timeoutDuration = customTimeout || this.calculateTimeout(type, phase, persona);
    const warningDuration = timeoutDuration * this.defaultConfig.warningThreshold;

    // Set warning timeout
    const warningTimeout = setTimeout(() => {
      this.handleEarlyWarning(timeoutId, playerId, gameId, warningDuration, timeoutDuration);
    }, warningDuration);

    this.timeoutWarnings.set(timeoutId, warningTimeout);

    // Set main timeout
    const mainTimeout = setTimeout(() => {
      this.handleTimeout(type, playerId, gameId, phase, timeoutDuration, persona);
    }, timeoutDuration);

    this.activeTimeouts.set(timeoutId, mainTimeout);

    this.logger.debug(`Started ${type} timeout for player ${playerId} (${timeoutDuration}ms)`);
    return timeoutId;
  }

  // Clear timeout (called when decision completes successfully)
  clearTimeout(timeoutId: string): boolean {
    const hasTimeout = this.activeTimeouts.has(timeoutId);
    const hasWarning = this.timeoutWarnings.has(timeoutId);

    if (hasTimeout) {
      clearTimeout(this.activeTimeouts.get(timeoutId));
      this.activeTimeouts.delete(timeoutId);
    }

    if (hasWarning) {
      clearTimeout(this.timeoutWarnings.get(timeoutId));
      this.timeoutWarnings.delete(timeoutId);
    }

    if (hasTimeout || hasWarning) {
      this.logger.debug(`Cleared timeout: ${timeoutId}`);
      return true;
    }

    return false;
  }

  // Generate fallback decision when timeout occurs
  async generateFallbackDecision(
    context: AIDecisionContext,
    timeoutType: string,
    player: Player,
    game: Game,
  ): Promise<FallbackDecision> {
    this.logger.warn(`Generating fallback decision for player ${player.id} due to ${timeoutType} timeout`);

    const fallbackStrategies = this.getFallbackStrategies(context.decisionType, game.currentPhase);
    const selectedStrategy = this.selectBestFallbackStrategy(fallbackStrategies, player, game);

    const fallbackDecision: FallbackDecision = {
      action: selectedStrategy.action,
      target: selectedStrategy.target,
      reasoning: selectedStrategy.reasoning,
      confidence: selectedStrategy.confidence,
      isFallback: true,
      timeoutType,
    };

    // Record fallback decision
    this.recordFallbackDecision(player.id, game.id, timeoutType);

    this.eventEmitter.emit('ai.timeout.fallback', {
      playerId: player.id,
      gameId: game.id,
      timeoutType,
      fallbackDecision,
    });

    return fallbackDecision;
  }

  // Retry decision with extended timeout
  async retryWithExtendedTimeout(
    originalTimeoutId: string,
    playerId: number,
    gameId: number,
    phase: string,
    persona?: AIPersona,
    extensionMultiplier: number = 1.5,
  ): Promise<string> {
    this.logger.log(`Retrying decision with extended timeout for player ${playerId}`);

    // Clear original timeout
    this.clearTimeout(originalTimeoutId);

    // Start new timeout with extension
    const originalTimeout = this.calculateTimeout('decision', phase, persona);
    const extendedTimeout = originalTimeout * extensionMultiplier;

    return this.startTimeout('decision', playerId, gameId, phase, persona, extendedTimeout);
  }

  // Get timeout statistics
  getTimeoutStats(): TimeoutStats {
    return { ...this.timeoutStats };
  }

  // Get active timeouts count
  getActiveTimeoutsCount(): number {
    return this.activeTimeouts.size;
  }

  // Check if player has active timeout
  hasActiveTimeout(playerId: number, gameId: number): boolean {
    for (const timeoutId of this.activeTimeouts.keys()) {
      if (timeoutId.includes(`${playerId}-${gameId}`)) {
        return true;
      }
    }
    return false;
  }

  // Get timeout configuration for persona and phase
  getTimeoutConfig(phase: string, persona?: AIPersona): TimeoutConfig {
    const config = { ...this.defaultConfig };

    if (persona) {
      const personaMultiplier = this.getPersonaTimeoutMultiplier(persona);
      config.personaMultiplier = personaMultiplier;
      config.llmTimeout *= personaMultiplier;
      config.decisionTimeout *= personaMultiplier;
      config.queueTimeout *= personaMultiplier;
    }

    const phaseMultiplier = this.phaseTimeoutMultipliers[phase] || 1.0;
    config.phaseMultiplier = phaseMultiplier;
    config.llmTimeout *= phaseMultiplier;
    config.decisionTimeout *= phaseMultiplier;
    config.queueTimeout *= phaseMultiplier;

    return config;
  }

  // Monitor timeout patterns
  monitorTimeoutPatterns(): void {
    const recentTimeouts = this.getRecentTimeouts(5 * 60 * 1000); // Last 5 minutes

    if (recentTimeouts.length > 10) {
      this.logger.warn(`High timeout rate detected: ${recentTimeouts.length} timeouts in last 5 minutes`);

      this.eventEmitter.emit('ai.timeout.pattern.high_rate', {
        count: recentTimeouts.length,
        timeWindow: 5 * 60 * 1000,
        timestamp: new Date(),
      });
    }

    // Check for persona-specific timeout patterns
    const timeoutsByPersona = this.groupTimeoutsByPersona(recentTimeouts);
    for (const [personaId, count] of Object.entries(timeoutsByPersona)) {
      if (count > 3) {
        this.logger.warn(`High timeout rate for persona ${personaId}: ${count} timeouts`);

        this.eventEmitter.emit('ai.timeout.pattern.persona', {
          personaId: Number(personaId),
          count,
          timeWindow: 5 * 60 * 1000,
          timestamp: new Date(),
        });
      }
    }
  }

  // Cleanup on module destroy
  onModuleDestroy(): void {
    // Clear all active timeouts
    for (const timeout of this.activeTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.activeTimeouts.clear();

    for (const warning of this.timeoutWarnings.values()) {
      clearTimeout(warning);
    }
    this.timeoutWarnings.clear();

    this.logger.log('AI Timeout Service destroyed');
  }

  // Private methods

  private loadConfiguration(): void {
    this.defaultConfig.llmTimeout = this.configService.get<number>('AI_LLM_TIMEOUT', 30000);
    this.defaultConfig.decisionTimeout = this.configService.get<number>('AI_DECISION_TIMEOUT', 45000);
    this.defaultConfig.queueTimeout = this.configService.get<number>('AI_QUEUE_TIMEOUT', 60000);
    this.defaultConfig.warningThreshold = this.configService.get<number>('AI_WARNING_THRESHOLD', 0.8);
  }

  private generateTimeoutId(type: string, playerId: number, gameId: number): string {
    return `${type}-${playerId}-${gameId}-${Date.now()}`;
  }

  private calculateTimeout(type: 'llm' | 'decision' | 'queue', phase: string, persona?: AIPersona): number {
    let baseTimeout: number;

    switch (type) {
      case 'llm':
        baseTimeout = this.defaultConfig.llmTimeout;
        break;
      case 'decision':
        baseTimeout = this.defaultConfig.decisionTimeout;
        break;
      case 'queue':
        baseTimeout = this.defaultConfig.queueTimeout;
        break;
      default:
        baseTimeout = this.defaultConfig.decisionTimeout;
    }

    // Apply persona multiplier
    if (persona) {
      const personaMultiplier = this.getPersonaTimeoutMultiplier(persona);
      baseTimeout *= personaMultiplier;
    }

    // Apply phase multiplier
    const phaseMultiplier = this.phaseTimeoutMultipliers[phase] || 1.0;
    baseTimeout *= phaseMultiplier;

    return Math.round(baseTimeout);
  }

  private getPersonaTimeoutMultiplier(persona: AIPersona): number {
    // Check for specific traits that affect decision speed
    const traits = persona.traits || [];

    for (const trait of traits) {
      if (this.personaTimeoutMultipliers[trait]) {
        return this.personaTimeoutMultipliers[trait];
      }
    }

    // Default based on communication style
    switch (persona.communicationStyle) {
      case 'analytical':
        return 1.2;
      case 'aggressive':
        return 0.8;
      case 'emotional':
        return 0.9;
      case 'quiet':
        return 1.1;
      default:
        return 1.0;
    }
  }

  private handleEarlyWarning(
    timeoutId: string,
    playerId: number,
    gameId: number,
    warningDuration: number,
    totalTimeout: number,
  ): void {
    const earlyWarning: EarlyWarning = {
      playerId,
      gameId,
      currentDuration: warningDuration,
      warningThreshold: this.defaultConfig.warningThreshold,
      timeRemaining: totalTimeout - warningDuration,
      timestamp: new Date(),
    };

    this.logger.warn(`Early warning: Player ${playerId} approaching timeout (${warningDuration}ms)`);

    this.eventEmitter.emit('ai.timeout.warning', earlyWarning);
  }

  private handleTimeout(
    type: 'llm' | 'decision' | 'queue',
    playerId: number,
    gameId: number,
    phase: string,
    duration: number,
    persona?: AIPersona,
  ): void {
    const timeoutEvent: TimeoutEvent = {
      type,
      playerId,
      gameId,
      phase,
      duration,
      threshold: duration,
      timestamp: new Date(),
      fallbackUsed: false,
    };

    // Record timeout
    this.recordTimeout(timeoutEvent);

    this.logger.error(`Timeout occurred: ${type} for player ${playerId} (${duration}ms)`);

    // Clean up
    const timeoutId = this.generateTimeoutId(type, playerId, gameId);
    this.activeTimeouts.delete(timeoutId);
    this.timeoutWarnings.delete(timeoutId);

    // Emit timeout event
    this.eventEmitter.emit('ai.timeout.occurred', timeoutEvent);
  }

  private getFallbackStrategies(decisionType: string, phase: string) {
    const strategies = {
      vote: [
        { action: 'abstain', reasoning: 'Insufficient information for confident vote', confidence: 0.3 },
        { action: 'vote_random', reasoning: 'Timeout forced random vote', confidence: 0.2 },
        { action: 'follow_majority', reasoning: 'Following majority due to timeout', confidence: 0.4 },
      ],
      night_action: [
        { action: 'skip', reasoning: 'Timeout prevented night action', confidence: 0.3 },
        { action: 'random_target', reasoning: 'Timeout forced random target', confidence: 0.2 },
      ],
      discussion: [
        { action: 'observe', reasoning: 'Listening and observing due to timeout', confidence: 0.4 },
        { action: 'simple_response', reasoning: 'Brief response due to timeout', confidence: 0.3 },
      ],
      accusation: [
        { action: 'dismiss', reasoning: 'Insufficient time to evaluate accusation', confidence: 0.3 },
        { action: 'neutral', reasoning: 'Remaining neutral due to timeout', confidence: 0.4 },
      ],
    };

    return strategies[decisionType] || strategies.discussion;
  }

  private selectBestFallbackStrategy(strategies: any[], player: Player, game: Game) {
    // Select strategy based on game state and player role
    if (game.currentPhase === 'day_voting' && strategies.length > 1) {
      // Prefer abstaining during voting if uncertain
      return strategies.find(s => s.action === 'abstain') || strategies[0];
    }

    if (player.role === 'mafia' && strategies.length > 1) {
      // Mafia should be more decisive
      return strategies.find(s => s.action !== 'abstain') || strategies[0];
    }

    // Default to highest confidence strategy
    return strategies.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );
  }

  private recordTimeout(event: TimeoutEvent): void {
    this.timeoutStats.totalTimeouts++;
    this.timeoutStats.timeoutsByType[event.type] = (this.timeoutStats.timeoutsByType[event.type] || 0) + 1;
    this.timeoutStats.timeoutsByPersona[event.playerId] = (this.timeoutStats.timeoutsByPersona[event.playerId] || 0) + 1;
    this.timeoutStats.timeoutsByPhase[event.phase] = (this.timeoutStats.timeoutsByPhase[event.phase] || 0) + 1;

    // Update average timeout duration
    const totalDuration = this.timeoutHistory.reduce((sum, e) => sum + e.duration, 0) + event.duration;
    this.timeoutStats.averageTimeoutDuration = totalDuration / (this.timeoutHistory.length + 1);

    // Add to history
    this.timeoutHistory.push(event);

    // Maintain history size
    if (this.timeoutHistory.length > this.maxHistorySize) {
      this.timeoutHistory.splice(0, this.timeoutHistory.length - this.maxHistorySize);
    }
  }

  private recordFallbackDecision(playerId: number, gameId: number, timeoutType: string): void {
    const totalDecisions = this.timeoutStats.totalTimeouts;
    const fallbackCount = this.timeoutHistory.filter(e => e.fallbackUsed).length + 1;
    this.timeoutStats.fallbackDecisionRate = fallbackCount / totalDecisions;

    // Mark latest timeout as having used fallback
    const latestTimeout = this.timeoutHistory[this.timeoutHistory.length - 1];
    if (latestTimeout) {
      latestTimeout.fallbackUsed = true;
    }
  }

  private getRecentTimeouts(timeWindowMs: number): TimeoutEvent[] {
    const cutoff = new Date(Date.now() - timeWindowMs);
    return this.timeoutHistory.filter(event => event.timestamp > cutoff);
  }

  private groupTimeoutsByPersona(timeouts: TimeoutEvent[]): Record<string, number> {
    return timeouts.reduce((acc, timeout) => {
      acc[timeout.playerId] = (acc[timeout.playerId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
}
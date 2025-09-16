import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { RedisService } from '../redis/redis.service';
import { LLMService, LLMResponse } from '../llm/llm.service';
import { AIDecisionService, DecisionResult } from './ai-decision.service';
import { AIPersonaService } from './ai-persona.service';

export interface PerformanceMetrics {
  timestamp: number;
  gameId?: number;
  playerId?: number;
  personaId?: number;
  decisionType?: string;
  responseTime: number;
  confidenceScore: number;
  success: boolean;
  llmTokensUsed: number;
  llmCost: number;
  llmModel: string;
  cacheHit: boolean;
  memoryUsage?: number;
  cpuUsage?: number;
}

export interface AggregatedMetrics {
  timeWindow: string;
  totalDecisions: number;
  averageResponseTime: number;
  successRate: number;
  averageConfidence: number;
  totalCost: number;
  totalTokens: number;
  cacheHitRate: number;
  decisionsPerMinute: number;
  errorRate: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
}

export interface PersonaPerformance {
  personaId: number;
  personaName: string;
  totalDecisions: number;
  averageResponseTime: number;
  successRate: number;
  averageConfidence: number;
  strongestDecisionTypes: string[];
  weakestDecisionTypes: string[];
  totalCost: number;
  efficiency: number; // decisions per dollar
}

export interface CostBreakdown {
  totalSpent: number;
  dailySpent: number;
  weeklySpent: number;
  monthlySpent: number;
  spentByModel: Record<string, number>;
  spentByDecisionType: Record<string, number>;
  spentByPersona: Record<string, number>;
  averageCostPerDecision: number;
  budgetUtilization: number;
  projectedMonthlyCost: number;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'critical';
  llmServiceHealth: boolean;
  redisHealth: boolean;
  averageSystemLoad: number;
  memoryUtilization: number;
  activeConnections: number;
  queueHealth: {
    size: number;
    processingRate: number;
    backlog: number;
  };
  alertsActive: number;
  lastHealthCheck: number;
}

export interface AlertConfig {
  name: string;
  type: 'threshold' | 'trend' | 'error';
  enabled: boolean;
  threshold?: number;
  metric: string;
  condition: 'greater_than' | 'less_than' | 'equals' | 'not_equals';
  timeWindow: number; // in minutes
  cooldown: number; // in minutes
  severity: 'low' | 'medium' | 'high' | 'critical';
  webhook?: string;
  email?: string[];
}

export interface PerformanceAlert {
  id: string;
  configName: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: number;
  resolved: boolean;
  resolvedAt?: number;
}

@Injectable()
export class AIPerformanceService {
  private readonly logger = new Logger(AIPerformanceService.name);
  private readonly metricsBuffer: PerformanceMetrics[] = [];
  private readonly alertConfigs = new Map<string, AlertConfig>();
  private readonly activeAlerts = new Map<string, PerformanceAlert>();
  private readonly performanceCache = new Map<string, any>();

  // Configuration
  private readonly bufferSize: number;
  private readonly aggregationInterval: number;
  private readonly alertCheckInterval: number;
  private readonly retentionDays: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly llmService: LLMService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.bufferSize = this.configService.get<number>(
      'AI_METRICS_BUFFER_SIZE',
      1000,
    );
    this.aggregationInterval = this.configService.get<number>(
      'AI_METRICS_AGGREGATION_INTERVAL',
      60000,
    );
    this.alertCheckInterval = this.configService.get<number>(
      'AI_ALERT_CHECK_INTERVAL',
      30000,
    );
    this.retentionDays = this.configService.get<number>(
      'AI_METRICS_RETENTION_DAYS',
      30,
    );

    this.setupDefaultAlerts();
    this.startPerformanceMonitoring();

    this.logger.log('AI Performance Service initialized');
  }

  /**
   * Record a performance metric from AI decision process
   */
  async recordMetric(metric: PerformanceMetrics): Promise<void> {
    try {
      // Add timestamp if not provided
      if (!metric.timestamp) {
        metric.timestamp = Date.now();
      }

      // Store in buffer for immediate processing
      this.metricsBuffer.push(metric);

      // Keep buffer size under control
      if (this.metricsBuffer.length > this.bufferSize) {
        this.metricsBuffer.shift();
      }

      // Store in Redis for persistence and real-time access
      const redisKey = `ai:metrics:${Date.now()}:${Math.random().toString(36).substring(2, 9)}`;
      await this.redisService.setex(redisKey, 86400, JSON.stringify(metric)); // 24 hour expiry

      // Index by different dimensions for quick queries
      await this.indexMetric(metric);

      // Check for real-time alerts
      this.checkRealtimeAlerts(metric);

      this.logger.debug(
        `Recorded performance metric for ${metric.decisionType || 'unknown'} decision`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to record performance metric: ${error.message}`,
      );
    }
  }

  /**
   * Record metrics specifically from AI decision results
   */
  async recordDecisionMetrics(
    decisionResult: DecisionResult,
    llmResponse: LLMResponse,
    gameId: number,
    cacheHit = false,
  ): Promise<void> {
    const metric: PerformanceMetrics = {
      timestamp: Date.now(),
      gameId,
      playerId: decisionResult.decision.playerId,
      personaId: decisionResult.decision.playerId, // Assuming this maps correctly
      decisionType: decisionResult.decision.decisionType,
      responseTime: decisionResult.processingTime,
      confidenceScore: decisionResult.confidence,
      success: decisionResult.decision.wasSuccessful ?? false,
      llmTokensUsed: llmResponse.tokensUsed,
      llmCost: llmResponse.cost,
      llmModel: llmResponse.model,
      cacheHit,
      memoryUsage: process.memoryUsage().heapUsed,
      cpuUsage: process.cpuUsage().user,
    };

    await this.recordMetric(metric);
  }

  /**
   * Get aggregated performance metrics for a time window
   */
  async getAggregatedMetrics(
    timeWindow: 'hour' | 'day' | 'week' | 'month',
    startTime?: number,
    endTime?: number,
  ): Promise<AggregatedMetrics> {
    try {
      const cacheKey = `ai:aggregated:${timeWindow}:${startTime || 'current'}:${endTime || 'current'}`;

      // Check cache first
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const metrics = await this.getMetricsInTimeRange(startTime, endTime);

      if (metrics.length === 0) {
        return this.createEmptyAggregation(timeWindow);
      }

      const aggregated = this.aggregateMetrics(metrics, timeWindow);

      // Cache for 5 minutes
      await this.redisService.setex(cacheKey, 300, JSON.stringify(aggregated));

      return aggregated;
    } catch (error) {
      this.logger.error(`Failed to get aggregated metrics: ${error.message}`);
      return this.createEmptyAggregation(timeWindow);
    }
  }

  /**
   * Get performance metrics by AI persona
   */
  async getPersonaPerformance(
    personaId?: number,
  ): Promise<PersonaPerformance[]> {
    try {
      const cacheKey = `ai:persona_performance:${personaId || 'all'}`;

      // Check cache
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const metrics = await this.getMetricsByPersona(personaId);
      const personaPerformance =
        await this.calculatePersonaPerformance(metrics);

      // Cache for 10 minutes
      await this.redisService.setex(
        cacheKey,
        600,
        JSON.stringify(personaPerformance),
      );

      return personaPerformance;
    } catch (error) {
      this.logger.error(`Failed to get persona performance: ${error.message}`);
      return [];
    }
  }

  /**
   * Get detailed cost breakdown and analysis
   */
  async getCostBreakdown(): Promise<CostBreakdown> {
    try {
      const cacheKey = 'ai:cost_breakdown:current';

      // Check cache
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const now = Date.now();
      const dayStart = new Date().setHours(0, 0, 0, 0);
      const weekStart = now - 7 * 24 * 60 * 60 * 1000;
      const monthStart = now - 30 * 24 * 60 * 60 * 1000;

      const [dailyMetrics, weeklyMetrics, monthlyMetrics] = await Promise.all([
        this.getMetricsInTimeRange(dayStart, now),
        this.getMetricsInTimeRange(weekStart, now),
        this.getMetricsInTimeRange(monthStart, now),
      ]);

      const costBreakdown = this.calculateCostBreakdown(
        dailyMetrics,
        weeklyMetrics,
        monthlyMetrics,
      );

      // Cache for 15 minutes
      await this.redisService.setex(
        cacheKey,
        900,
        JSON.stringify(costBreakdown),
      );

      return costBreakdown;
    } catch (error) {
      this.logger.error(`Failed to get cost breakdown: ${error.message}`);
      return this.createEmptyCostBreakdown();
    }
  }

  /**
   * Get current system health status
   */
  async getSystemHealth(): Promise<SystemHealth> {
    try {
      const [llmStats, queueStatus, redisHealth] = await Promise.all([
        this.llmService.getUsageStats(),
        this.llmService.getQueueStatus(),
        this.checkRedisHealth(),
      ]);

      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      const systemHealth: SystemHealth = {
        status: this.calculateOverallHealth(llmStats, queueStatus, redisHealth),
        llmServiceHealth:
          llmStats.metrics.successfulRequests > 0 ||
          llmStats.metrics.totalRequests === 0,
        redisHealth,
        averageSystemLoad: cpuUsage.user / 1000000, // Convert to seconds
        memoryUtilization: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
        activeConnections: llmStats.concurrentConfig.currentActive,
        queueHealth: {
          size: queueStatus.queueLength,
          processingRate: this.calculateProcessingRate(),
          backlog: queueStatus.oldestRequestAge,
        },
        alertsActive: this.activeAlerts.size,
        lastHealthCheck: Date.now(),
      };

      return systemHealth;
    } catch (error) {
      this.logger.error(`Failed to get system health: ${error.message}`);
      return this.createUnhealthyStatus();
    }
  }

  /**
   * Generate performance report with insights and recommendations
   */
  async generatePerformanceReport(
    timeWindow: 'day' | 'week' | 'month' = 'day',
  ): Promise<{
    summary: AggregatedMetrics;
    personaPerformance: PersonaPerformance[];
    costAnalysis: CostBreakdown;
    systemHealth: SystemHealth;
    insights: string[];
    recommendations: string[];
    trends: {
      responseTime: 'improving' | 'degrading' | 'stable';
      successRate: 'improving' | 'degrading' | 'stable';
      costs: 'increasing' | 'decreasing' | 'stable';
    };
  }> {
    try {
      const [summary, personaPerformance, costAnalysis, systemHealth] =
        await Promise.all([
          this.getAggregatedMetrics(timeWindow),
          this.getPersonaPerformance(),
          this.getCostBreakdown(),
          this.getSystemHealth(),
        ]);

      const insights = this.generateInsights(
        summary,
        personaPerformance,
        costAnalysis,
      );
      const recommendations = this.generateRecommendations(
        summary,
        personaPerformance,
        systemHealth,
      );
      const trends = await this.analyzeTrends(timeWindow);

      return {
        summary,
        personaPerformance,
        costAnalysis,
        systemHealth,
        insights,
        recommendations,
        trends,
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate performance report: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Configure performance alerts
   */
  async configureAlert(config: AlertConfig): Promise<void> {
    try {
      this.alertConfigs.set(config.name, config);

      // Persist alert config to Redis
      await this.redisService.set(
        `ai:alert_config:${config.name}`,
        JSON.stringify(config),
      );

      this.logger.log(`Alert configured: ${config.name} (${config.severity})`);
    } catch (error) {
      this.logger.error(`Failed to configure alert: ${error.message}`);
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    return Array.from(this.activeAlerts.values()).filter(
      (alert) => !alert.resolved,
    );
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string): Promise<boolean> {
    try {
      const alert = this.activeAlerts.get(alertId);
      if (!alert) {
        return false;
      }

      alert.resolved = true;
      alert.resolvedAt = Date.now();

      // Persist resolution
      await this.redisService.set(`ai:alert:${alertId}`, JSON.stringify(alert));

      this.logger.log(`Alert resolved: ${alertId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to resolve alert: ${error.message}`);
      return false;
    }
  }

  /**
   * Get real-time dashboard data
   */
  async getDashboardData(): Promise<{
    realTimeMetrics: {
      currentRPS: number;
      averageResponseTime: number;
      successRate: number;
      activeDecisions: number;
      queueSize: number;
    };
    recentMetrics: PerformanceMetrics[];
    systemStatus: SystemHealth;
    costToday: number;
    topPersonas: PersonaPerformance[];
    activeAlerts: PerformanceAlert[];
  }> {
    try {
      const now = Date.now();
      const fiveMinutesAgo = now - 5 * 60 * 1000;

      const [recentMetrics, systemStatus, costBreakdown, topPersonas] =
        await Promise.all([
          this.getMetricsInTimeRange(fiveMinutesAgo, now),
          this.getSystemHealth(),
          this.getCostBreakdown(),
          this.getPersonaPerformance(),
        ]);

      const realTimeMetrics = {
        currentRPS: recentMetrics.length / 300, // requests per second over 5 minutes
        averageResponseTime:
          recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) /
            recentMetrics.length || 0,
        successRate:
          (recentMetrics.filter((m) => m.success).length /
            recentMetrics.length) *
            100 || 0,
        activeDecisions: systemStatus.activeConnections,
        queueSize: systemStatus.queueHealth.size,
      };

      return {
        realTimeMetrics,
        recentMetrics: recentMetrics.slice(-50), // Last 50 metrics
        systemStatus,
        costToday: costBreakdown.dailySpent,
        topPersonas: topPersonas.slice(0, 5), // Top 5 performers
        activeAlerts: this.getActiveAlerts(),
      };
    } catch (error) {
      this.logger.error(`Failed to get dashboard data: ${error.message}`);
      throw error;
    }
  }

  // Private helper methods

  private async indexMetric(metric: PerformanceMetrics): Promise<void> {
    const indexPromises = [];

    // Index by time (for time-based queries)
    const timeKey = `ai:metrics:time:${Math.floor(metric.timestamp / 60000)}`; // Minute precision
    indexPromises.push(
      this.redisService.lpush(timeKey, JSON.stringify(metric)),
    );
    indexPromises.push(
      this.redisService.expire(timeKey, 86400 * this.retentionDays),
    );

    // Index by persona (if available)
    if (metric.personaId) {
      const personaKey = `ai:metrics:persona:${metric.personaId}`;
      indexPromises.push(
        this.redisService.lpush(personaKey, JSON.stringify(metric)),
      );
      indexPromises.push(
        this.redisService.expire(personaKey, 86400 * this.retentionDays),
      );
    }

    // Index by decision type (if available)
    if (metric.decisionType) {
      const typeKey = `ai:metrics:type:${metric.decisionType}`;
      indexPromises.push(
        this.redisService.lpush(typeKey, JSON.stringify(metric)),
      );
      indexPromises.push(
        this.redisService.expire(typeKey, 86400 * this.retentionDays),
      );
    }

    // Index by game (if available)
    if (metric.gameId) {
      const gameKey = `ai:metrics:game:${metric.gameId}`;
      indexPromises.push(
        this.redisService.lpush(gameKey, JSON.stringify(metric)),
      );
      indexPromises.push(this.redisService.expire(gameKey, 86400 * 7)); // Games expire faster
    }

    await Promise.all(indexPromises);
  }

  private async getMetricsInTimeRange(
    startTime?: number,
    endTime?: number,
  ): Promise<PerformanceMetrics[]> {
    const start = startTime || Date.now() - 24 * 60 * 60 * 1000; // Default to last 24 hours
    const end = endTime || Date.now();

    const metrics: PerformanceMetrics[] = [];

    // Get metrics from buffer (most recent)
    const bufferMetrics = this.metricsBuffer.filter(
      (m) => m.timestamp >= start && m.timestamp <= end,
    );
    metrics.push(...bufferMetrics);

    // Get metrics from Redis for longer time ranges
    const startMinute = Math.floor(start / 60000);
    const endMinute = Math.floor(end / 60000);

    for (let minute = startMinute; minute <= endMinute; minute++) {
      try {
        const timeKey = `ai:metrics:time:${minute}`;
        const rawMetrics = await this.redisService.lrange(timeKey, 0, -1);

        for (const rawMetric of rawMetrics) {
          try {
            const metric = JSON.parse(rawMetric);
            if (metric.timestamp >= start && metric.timestamp <= end) {
              metrics.push(metric);
            }
          } catch (parseError) {
            // Skip invalid JSON
          }
        }
      } catch (error) {
        // Skip missing time windows
      }
    }

    // Remove duplicates and sort by timestamp
    const uniqueMetrics = metrics.filter(
      (metric, index, self) =>
        index ===
        self.findIndex(
          (m) =>
            m.timestamp === metric.timestamp && m.playerId === metric.playerId,
        ),
    );

    return uniqueMetrics.sort((a, b) => a.timestamp - b.timestamp);
  }

  private async getMetricsByPersona(
    personaId?: number,
  ): Promise<PerformanceMetrics[]> {
    if (personaId) {
      const personaKey = `ai:metrics:persona:${personaId}`;
      const rawMetrics = await this.redisService.lrange(personaKey, 0, -1);
      return rawMetrics.map((raw) => JSON.parse(raw));
    }

    // Get all persona metrics
    const personaKeys = await this.redisService.keys('ai:metrics:persona:*');
    const allMetrics: PerformanceMetrics[] = [];

    for (const key of personaKeys) {
      const rawMetrics = await this.redisService.lrange(key, 0, -1);
      allMetrics.push(...rawMetrics.map((raw) => JSON.parse(raw)));
    }

    return allMetrics;
  }

  private aggregateMetrics(
    metrics: PerformanceMetrics[],
    timeWindow: string,
  ): AggregatedMetrics {
    if (metrics.length === 0) {
      return this.createEmptyAggregation(timeWindow);
    }

    const totalDecisions = metrics.length;
    const successfulDecisions = metrics.filter((m) => m.success).length;
    const cacheHits = metrics.filter((m) => m.cacheHit).length;

    const responseTimes = metrics
      .map((m) => m.responseTime)
      .sort((a, b) => a - b);
    const confidenceScores = metrics.map((m) => m.confidenceScore);
    const costs = metrics.map((m) => m.llmCost);
    const tokens = metrics.map((m) => m.llmTokensUsed);

    const timeSpan = Math.max(
      1,
      (Math.max(...metrics.map((m) => m.timestamp)) -
        Math.min(...metrics.map((m) => m.timestamp))) /
        60000,
    ); // minutes

    return {
      timeWindow,
      totalDecisions,
      averageResponseTime:
        responseTimes.reduce((sum, time) => sum + time, 0) / totalDecisions,
      successRate: (successfulDecisions / totalDecisions) * 100,
      averageConfidence:
        confidenceScores.reduce((sum, conf) => sum + conf, 0) / totalDecisions,
      totalCost: costs.reduce((sum, cost) => sum + cost, 0),
      totalTokens: tokens.reduce((sum, tokens) => sum + tokens, 0),
      cacheHitRate: (cacheHits / totalDecisions) * 100,
      decisionsPerMinute: totalDecisions / timeSpan,
      errorRate:
        ((totalDecisions - successfulDecisions) / totalDecisions) * 100,
      p95ResponseTime:
        responseTimes[Math.floor(responseTimes.length * 0.95)] || 0,
      p99ResponseTime:
        responseTimes[Math.floor(responseTimes.length * 0.99)] || 0,
    };
  }

  private async calculatePersonaPerformance(
    metrics: PerformanceMetrics[],
  ): Promise<PersonaPerformance[]> {
    const personaGroups = new Map<number, PerformanceMetrics[]>();

    // Group metrics by persona
    metrics.forEach((metric) => {
      if (metric.personaId) {
        if (!personaGroups.has(metric.personaId)) {
          personaGroups.set(metric.personaId, []);
        }
        personaGroups.get(metric.personaId)!.push(metric);
      }
    });

    const personaPerformance: PersonaPerformance[] = [];

    for (const [personaId, personaMetrics] of personaGroups) {
      const totalDecisions = personaMetrics.length;
      const successfulDecisions = personaMetrics.filter(
        (m) => m.success,
      ).length;
      const totalCost = personaMetrics.reduce((sum, m) => sum + m.llmCost, 0);
      const avgResponseTime =
        personaMetrics.reduce((sum, m) => sum + m.responseTime, 0) /
        totalDecisions;
      const avgConfidence =
        personaMetrics.reduce((sum, m) => sum + m.confidenceScore, 0) /
        totalDecisions;

      // Group by decision type for analysis
      const decisionTypeGroups = new Map<string, PerformanceMetrics[]>();
      personaMetrics.forEach((metric) => {
        if (metric.decisionType) {
          if (!decisionTypeGroups.has(metric.decisionType)) {
            decisionTypeGroups.set(metric.decisionType, []);
          }
          decisionTypeGroups.get(metric.decisionType)!.push(metric);
        }
      });

      // Find strongest and weakest decision types
      const decisionTypePerformance = Array.from(
        decisionTypeGroups.entries(),
      ).map(([type, typeMetrics]) => ({
        type,
        successRate:
          (typeMetrics.filter((m) => m.success).length / typeMetrics.length) *
          100,
        avgConfidence:
          typeMetrics.reduce((sum, m) => sum + m.confidenceScore, 0) /
          typeMetrics.length,
      }));

      const sortedByPerformance = decisionTypePerformance.sort(
        (a, b) =>
          b.successRate + b.avgConfidence - (a.successRate + a.avgConfidence),
      );

      personaPerformance.push({
        personaId,
        personaName: `Persona ${personaId}`, // TODO: Get actual persona name
        totalDecisions,
        averageResponseTime: avgResponseTime,
        successRate: (successfulDecisions / totalDecisions) * 100,
        averageConfidence: avgConfidence,
        strongestDecisionTypes: sortedByPerformance
          .slice(0, 3)
          .map((p) => p.type),
        weakestDecisionTypes: sortedByPerformance.slice(-3).map((p) => p.type),
        totalCost,
        efficiency: totalCost > 0 ? totalDecisions / totalCost : 0,
      });
    }

    return personaPerformance.sort((a, b) => b.efficiency - a.efficiency);
  }

  private calculateCostBreakdown(
    dailyMetrics: PerformanceMetrics[],
    weeklyMetrics: PerformanceMetrics[],
    monthlyMetrics: PerformanceMetrics[],
  ): CostBreakdown {
    const dailySpent = dailyMetrics.reduce((sum, m) => sum + m.llmCost, 0);
    const weeklySpent = weeklyMetrics.reduce((sum, m) => sum + m.llmCost, 0);
    const monthlySpent = monthlyMetrics.reduce((sum, m) => sum + m.llmCost, 0);

    // Group by model
    const spentByModel: Record<string, number> = {};
    monthlyMetrics.forEach((metric) => {
      spentByModel[metric.llmModel] =
        (spentByModel[metric.llmModel] || 0) + metric.llmCost;
    });

    // Group by decision type
    const spentByDecisionType: Record<string, number> = {};
    monthlyMetrics.forEach((metric) => {
      if (metric.decisionType) {
        spentByDecisionType[metric.decisionType] =
          (spentByDecisionType[metric.decisionType] || 0) + metric.llmCost;
      }
    });

    // Group by persona
    const spentByPersona: Record<string, number> = {};
    monthlyMetrics.forEach((metric) => {
      if (metric.personaId) {
        const personaKey = `persona_${metric.personaId}`;
        spentByPersona[personaKey] =
          (spentByPersona[personaKey] || 0) + metric.llmCost;
      }
    });

    const averageCostPerDecision =
      monthlyMetrics.length > 0 ? monthlySpent / monthlyMetrics.length : 0;
    const dailyLimit = this.configService.get<number>(
      'OPENROUTER_DAILY_LIMIT',
      10.0,
    );
    const projectedMonthlyCost = dailySpent * 30; // Simple projection

    return {
      totalSpent: monthlySpent,
      dailySpent,
      weeklySpent,
      monthlySpent,
      spentByModel,
      spentByDecisionType,
      spentByPersona,
      averageCostPerDecision,
      budgetUtilization: (dailySpent / dailyLimit) * 100,
      projectedMonthlyCost,
    };
  }

  private checkRealtimeAlerts(metric: PerformanceMetrics): void {
    for (const [name, config] of this.alertConfigs) {
      if (!config.enabled) continue;

      let shouldAlert = false;
      let value = 0;

      switch (config.metric) {
        case 'response_time':
          value = metric.responseTime;
          shouldAlert = this.evaluateCondition(
            value,
            config.condition,
            config.threshold || 0,
          );
          break;
        case 'confidence':
          value = metric.confidenceScore;
          shouldAlert = this.evaluateCondition(
            value,
            config.condition,
            config.threshold || 0,
          );
          break;
        case 'cost':
          value = metric.llmCost;
          shouldAlert = this.evaluateCondition(
            value,
            config.condition,
            config.threshold || 0,
          );
          break;
        case 'success':
          value = metric.success ? 1 : 0;
          shouldAlert = this.evaluateCondition(
            value,
            config.condition,
            config.threshold || 0,
          );
          break;
      }

      if (shouldAlert) {
        this.triggerAlert(name, config, metric, value);
      }
    }
  }

  private evaluateCondition(
    value: number,
    condition: string,
    threshold: number,
  ): boolean {
    switch (condition) {
      case 'greater_than':
        return value > threshold;
      case 'less_than':
        return value < threshold;
      case 'equals':
        return value === threshold;
      case 'not_equals':
        return value !== threshold;
      default:
        return false;
    }
  }

  private async triggerAlert(
    configName: string,
    config: AlertConfig,
    metric: PerformanceMetrics,
    value: number,
  ): Promise<void> {
    const alertId = `${configName}_${Date.now()}`;

    // Check cooldown
    const existingAlert = Array.from(this.activeAlerts.values()).find(
      (alert) =>
        alert.configName === configName &&
        !alert.resolved &&
        Date.now() - alert.timestamp < config.cooldown * 60 * 1000,
    );

    if (existingAlert) {
      return; // Still in cooldown
    }

    const alert: PerformanceAlert = {
      id: alertId,
      configName,
      severity: config.severity,
      message: `${config.metric} ${config.condition.replace('_', ' ')} ${config.threshold} (actual: ${value})`,
      metric: config.metric,
      value,
      threshold: config.threshold || 0,
      timestamp: Date.now(),
      resolved: false,
    };

    this.activeAlerts.set(alertId, alert);

    // Persist alert
    await this.redisService.set(`ai:alert:${alertId}`, JSON.stringify(alert));

    // Emit event for external handling
    this.eventEmitter.emit('ai.performance.alert', alert);

    this.logger.warn(`Performance alert triggered: ${alert.message}`);
  }

  private setupDefaultAlerts(): void {
    const defaultAlerts: AlertConfig[] = [
      {
        name: 'high_response_time',
        type: 'threshold',
        enabled: true,
        threshold: 30000, // 30 seconds
        metric: 'response_time',
        condition: 'greater_than',
        timeWindow: 5,
        cooldown: 15,
        severity: 'high',
      },
      {
        name: 'low_confidence',
        type: 'threshold',
        enabled: true,
        threshold: 3,
        metric: 'confidence',
        condition: 'less_than',
        timeWindow: 5,
        cooldown: 10,
        severity: 'medium',
      },
      {
        name: 'high_cost_decision',
        type: 'threshold',
        enabled: true,
        threshold: 0.1, // $0.10 per decision
        metric: 'cost',
        condition: 'greater_than',
        timeWindow: 1,
        cooldown: 5,
        severity: 'medium',
      },
    ];

    defaultAlerts.forEach((config) => {
      this.alertConfigs.set(config.name, config);
    });
  }

  private startPerformanceMonitoring(): void {
    // Periodic cleanup of old metrics and alerts
    setInterval(
      async () => {
        await this.cleanupOldData();
      },
      60 * 60 * 1000,
    ); // Every hour

    // Periodic alert checking for trend-based alerts
    setInterval(() => {
      this.checkTrendAlerts();
    }, this.alertCheckInterval);
  }

  private async cleanupOldData(): Promise<void> {
    try {
      const cutoffTime = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;

      // Clean up old metrics from buffer
      const initialBufferSize = this.metricsBuffer.length;
      while (
        this.metricsBuffer.length > 0 &&
        this.metricsBuffer[0].timestamp < cutoffTime
      ) {
        this.metricsBuffer.shift();
      }

      // Clean up resolved alerts older than 7 days
      const alertCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const alertsToRemove: string[] = [];

      for (const [alertId, alert] of this.activeAlerts) {
        if (
          alert.resolved &&
          alert.resolvedAt &&
          alert.resolvedAt < alertCutoff
        ) {
          alertsToRemove.push(alertId);
        }
      }

      alertsToRemove.forEach((alertId) => {
        this.activeAlerts.delete(alertId);
        this.redisService.del(`ai:alert:${alertId}`);
      });

      this.logger.log(
        `Cleanup completed - Removed ${initialBufferSize - this.metricsBuffer.length} old metrics and ${alertsToRemove.length} old alerts`,
      );
    } catch (error) {
      this.logger.error(`Cleanup failed: ${error.message}`);
    }
  }

  private async checkTrendAlerts(): Promise<void> {
    // Implement trend-based alerting (e.g., degrading performance over time)
    // This would analyze metrics over time windows to detect trends
  }

  private async checkRedisHealth(): Promise<boolean> {
    try {
      await this.redisService.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  private calculateOverallHealth(
    llmStats: any,
    queueStatus: any,
    redisHealth: boolean,
  ): 'healthy' | 'degraded' | 'critical' {
    const issues = [];

    if (!redisHealth) issues.push('redis');
    if (queueStatus.queueLength > 20) issues.push('queue_backlog');
    if (llmStats.metrics.errorRate > 10) issues.push('llm_errors');
    if (queueStatus.oldestRequestAge > 60000) issues.push('stale_requests');

    if (issues.length === 0) return 'healthy';
    if (issues.length <= 2) return 'degraded';
    return 'critical';
  }

  private calculateProcessingRate(): number {
    // Calculate requests processed per minute based on recent metrics
    const recentMetrics = this.metricsBuffer.filter(
      (m) => m.timestamp > Date.now() - 60000, // Last minute
    );
    return recentMetrics.length;
  }

  private generateInsights(
    summary: AggregatedMetrics,
    personaPerformance: PersonaPerformance[],
    costAnalysis: CostBreakdown,
  ): string[] {
    const insights: string[] = [];

    if (summary.successRate > 90) {
      insights.push(
        'AI decisions are performing exceptionally well with >90% success rate',
      );
    } else if (summary.successRate < 70) {
      insights.push(
        'AI decision success rate is below optimal threshold (70%)',
      );
    }

    if (summary.cacheHitRate > 30) {
      insights.push(
        `Strong cache utilization (${summary.cacheHitRate.toFixed(1)}%) is reducing costs`,
      );
    }

    if (costAnalysis.budgetUtilization > 80) {
      insights.push(
        'Daily budget utilization is high - consider optimizing model usage',
      );
    }

    const topPersona = personaPerformance[0];
    if (topPersona && topPersona.efficiency > 100) {
      insights.push(
        `${topPersona.personaName} is highly efficient with ${topPersona.efficiency.toFixed(1)} decisions per dollar`,
      );
    }

    return insights;
  }

  private generateRecommendations(
    summary: AggregatedMetrics,
    personaPerformance: PersonaPerformance[],
    systemHealth: SystemHealth,
  ): string[] {
    const recommendations: string[] = [];

    if (summary.averageResponseTime > 15000) {
      recommendations.push(
        'Consider optimizing prompt templates or switching to faster models for routine decisions',
      );
    }

    if (summary.cacheHitRate < 20) {
      recommendations.push(
        'Implement more aggressive caching strategies to reduce LLM API calls',
      );
    }

    if (systemHealth.queueHealth.size > 10) {
      recommendations.push(
        'Consider increasing concurrent request limits or optimizing queue processing',
      );
    }

    const poorPerformers = personaPerformance.filter((p) => p.successRate < 60);
    if (poorPerformers.length > 0) {
      recommendations.push(
        `Review and optimize personas: ${poorPerformers.map((p) => p.personaName).join(', ')}`,
      );
    }

    return recommendations;
  }

  private async analyzeTrends(timeWindow: string): Promise<{
    responseTime: 'improving' | 'degrading' | 'stable';
    successRate: 'improving' | 'degrading' | 'stable';
    costs: 'increasing' | 'decreasing' | 'stable';
  }> {
    // Simple trend analysis - could be enhanced with proper statistical methods
    const now = Date.now();
    const windowMs =
      timeWindow === 'day'
        ? 24 * 60 * 60 * 1000
        : timeWindow === 'week'
          ? 7 * 24 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000;

    const [currentMetrics, previousMetrics] = await Promise.all([
      this.getMetricsInTimeRange(now - windowMs, now),
      this.getMetricsInTimeRange(now - 2 * windowMs, now - windowMs),
    ]);

    const currentSummary = this.aggregateMetrics(currentMetrics, timeWindow);
    const previousSummary = this.aggregateMetrics(previousMetrics, timeWindow);

    return {
      responseTime: this.compareTrend(
        currentSummary.averageResponseTime,
        previousSummary.averageResponseTime,
        false,
      ),
      successRate: this.compareTrend(
        currentSummary.successRate,
        previousSummary.successRate,
        true,
      ),
      costs: this.compareTrend(
        currentSummary.totalCost,
        previousSummary.totalCost,
        false,
      ),
    };
  }

  private compareTrend(
    current: number,
    previous: number,
    higherIsBetter: boolean,
  ): 'improving' | 'degrading' | 'stable' {
    const changePercent = ((current - previous) / previous) * 100;

    if (Math.abs(changePercent) < 5) return 'stable';

    if (higherIsBetter) {
      return changePercent > 0 ? 'improving' : 'degrading';
    } else {
      return changePercent > 0 ? 'degrading' : 'improving';
    }
  }

  // Helper methods for empty states
  private createEmptyAggregation(timeWindow: string): AggregatedMetrics {
    return {
      timeWindow,
      totalDecisions: 0,
      averageResponseTime: 0,
      successRate: 0,
      averageConfidence: 0,
      totalCost: 0,
      totalTokens: 0,
      cacheHitRate: 0,
      decisionsPerMinute: 0,
      errorRate: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
    };
  }

  private createEmptyCostBreakdown(): CostBreakdown {
    return {
      totalSpent: 0,
      dailySpent: 0,
      weeklySpent: 0,
      monthlySpent: 0,
      spentByModel: {},
      spentByDecisionType: {},
      spentByPersona: {},
      averageCostPerDecision: 0,
      budgetUtilization: 0,
      projectedMonthlyCost: 0,
    };
  }

  private createUnhealthyStatus(): SystemHealth {
    return {
      status: 'critical',
      llmServiceHealth: false,
      redisHealth: false,
      averageSystemLoad: 0,
      memoryUtilization: 0,
      activeConnections: 0,
      queueHealth: { size: 0, processingRate: 0, backlog: 0 },
      alertsActive: 0,
      lastHealthCheck: Date.now(),
    };
  }

  // Event handlers for integration with existing services
  @OnEvent('ai.decision.completed')
  async handleDecisionCompleted(event: {
    decisionResult: DecisionResult;
    llmResponse: LLMResponse;
    gameId: number;
    cacheHit: boolean;
  }): Promise<void> {
    await this.recordDecisionMetrics(
      event.decisionResult,
      event.llmResponse,
      event.gameId,
      event.cacheHit,
    );
  }

  @OnEvent('ai.decision.failed')
  async handleDecisionFailed(event: {
    error: Error;
    context: any;
    processingTime: number;
  }): Promise<void> {
    const metric: PerformanceMetrics = {
      timestamp: Date.now(),
      gameId: event.context.gameId,
      playerId: event.context.playerId,
      decisionType: event.context.decisionType,
      responseTime: event.processingTime,
      confidenceScore: 0,
      success: false,
      llmTokensUsed: 0,
      llmCost: 0,
      llmModel: 'unknown',
      cacheHit: false,
    };

    await this.recordMetric(metric);
  }

  // Scheduled tasks
  @Cron(CronExpression.EVERY_HOUR)
  async generateHourlyReport(): Promise<void> {
    try {
      const report = await this.generatePerformanceReport('hour');
      this.logger.log(
        `Hourly AI performance: ${report.summary.totalDecisions} decisions, ${report.summary.successRate.toFixed(1)}% success rate, $${report.costAnalysis.totalSpent.toFixed(4)} spent`,
      );
    } catch (error) {
      this.logger.error(`Failed to generate hourly report: ${error.message}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateDailyReport(): Promise<void> {
    try {
      const report = await this.generatePerformanceReport('day');

      // Emit daily report event for external processing
      this.eventEmitter.emit('ai.performance.daily_report', report);

      this.logger.log(
        `Daily AI performance report generated - ${report.insights.length} insights, ${report.recommendations.length} recommendations`,
      );
    } catch (error) {
      this.logger.error(`Failed to generate daily report: ${error.message}`);
    }
  }
}

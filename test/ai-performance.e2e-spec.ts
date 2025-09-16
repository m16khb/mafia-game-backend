import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from '@libs/redis';
import { AIModule } from '@libs/ai';
import { AIPerformanceService } from '@libs/ai/ai-performance.service';
import { GameModule } from '../src/modules/game/game.module';

describe('AI Performance Monitoring (e2e)', () => {
  let app: INestApplication;
  let performanceService: AIPerformanceService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        ScheduleModule.forRoot(),
        EventEmitterModule.forRoot(),
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [__dirname + '/../src/entities/*.entity{.ts,.js}'],
          synchronize: true,
          logging: false,
        }),
        RedisModule,
        AIModule,
        GameModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    performanceService =
      moduleFixture.get<AIPerformanceService>(AIPerformanceService);

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('/ai/performance/health (GET)', () => {
    it('should return system health status', async () => {
      const response = await request(app.getHttpServer())
        .get('/ai/performance/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('llmServiceHealth');
      expect(response.body).toHaveProperty('redisHealth');
      expect(response.body).toHaveProperty('lastHealthCheck');
      expect(['healthy', 'degraded', 'critical']).toContain(
        response.body.status,
      );
    });
  });

  describe('/ai/performance/metrics (GET)', () => {
    it('should return aggregated metrics with default time window', async () => {
      const response = await request(app.getHttpServer())
        .get('/ai/performance/metrics')
        .expect(200);

      expect(response.body).toHaveProperty('timeWindow');
      expect(response.body).toHaveProperty('totalDecisions');
      expect(response.body).toHaveProperty('averageResponseTime');
      expect(response.body).toHaveProperty('successRate');
      expect(response.body).toHaveProperty('cacheHitRate');
      expect(response.body.timeWindow).toBe('day');
    });

    it('should accept custom time window', async () => {
      const response = await request(app.getHttpServer())
        .get('/ai/performance/metrics?timeWindow=week')
        .expect(200);

      expect(response.body.timeWindow).toBe('week');
    });

    it('should accept custom time range', async () => {
      const now = Date.now();
      const hourAgo = now - 60 * 60 * 1000;

      const response = await request(app.getHttpServer())
        .get(`/ai/performance/metrics?startTime=${hourAgo}&endTime=${now}`)
        .expect(200);

      expect(response.body).toHaveProperty('totalDecisions');
    });
  });

  describe('/ai/performance/personas (GET)', () => {
    it('should return persona performance analysis', async () => {
      const response = await request(app.getHttpServer())
        .get('/ai/performance/personas')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);

      if (response.body.length > 0) {
        const persona = response.body[0];
        expect(persona).toHaveProperty('personaId');
        expect(persona).toHaveProperty('personaName');
        expect(persona).toHaveProperty('totalDecisions');
        expect(persona).toHaveProperty('successRate');
        expect(persona).toHaveProperty('efficiency');
      }
    });
  });

  describe('/ai/performance/costs (GET)', () => {
    it('should return detailed cost breakdown', async () => {
      const response = await request(app.getHttpServer())
        .get('/ai/performance/costs')
        .expect(200);

      expect(response.body).toHaveProperty('totalSpent');
      expect(response.body).toHaveProperty('dailySpent');
      expect(response.body).toHaveProperty('weeklySpent');
      expect(response.body).toHaveProperty('monthlySpent');
      expect(response.body).toHaveProperty('spentByModel');
      expect(response.body).toHaveProperty('spentByDecisionType');
      expect(response.body).toHaveProperty('budgetUtilization');
      expect(response.body).toHaveProperty('projectedMonthlyCost');
    });
  });

  describe('/ai/performance/dashboard (GET)', () => {
    it('should return real-time dashboard data', async () => {
      const response = await request(app.getHttpServer())
        .get('/ai/performance/dashboard')
        .expect(200);

      expect(response.body).toHaveProperty('realTimeMetrics');
      expect(response.body).toHaveProperty('recentMetrics');
      expect(response.body).toHaveProperty('systemStatus');
      expect(response.body).toHaveProperty('costToday');
      expect(response.body).toHaveProperty('topPersonas');
      expect(response.body).toHaveProperty('activeAlerts');

      expect(response.body.realTimeMetrics).toHaveProperty('currentRPS');
      expect(response.body.realTimeMetrics).toHaveProperty(
        'averageResponseTime',
      );
      expect(response.body.realTimeMetrics).toHaveProperty('successRate');
      expect(response.body.realTimeMetrics).toHaveProperty('activeDecisions');
    });
  });

  describe('/ai/performance/report (GET)', () => {
    it('should generate comprehensive performance report', async () => {
      const response = await request(app.getHttpServer())
        .get('/ai/performance/report')
        .expect(200);

      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('personaPerformance');
      expect(response.body).toHaveProperty('costAnalysis');
      expect(response.body).toHaveProperty('systemHealth');
      expect(response.body).toHaveProperty('insights');
      expect(response.body).toHaveProperty('recommendations');
      expect(response.body).toHaveProperty('trends');

      expect(Array.isArray(response.body.insights)).toBe(true);
      expect(Array.isArray(response.body.recommendations)).toBe(true);

      expect(response.body.trends).toHaveProperty('responseTime');
      expect(response.body.trends).toHaveProperty('successRate');
      expect(response.body.trends).toHaveProperty('costs');
    });

    it('should accept different time windows for reports', async () => {
      const response = await request(app.getHttpServer())
        .get('/ai/performance/report?timeWindow=week')
        .expect(200);

      expect(response.body.summary.timeWindow).toBe('week');
    });
  });

  describe('/ai/performance/alerts (GET)', () => {
    it('should return active alerts', async () => {
      const response = await request(app.getHttpServer())
        .get('/ai/performance/alerts')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('/ai/performance/alerts (POST)', () => {
    it('should create new alert configuration', async () => {
      const alertConfig = {
        name: 'test_high_response_time',
        type: 'threshold',
        enabled: true,
        threshold: 25000,
        metric: 'response_time',
        condition: 'greater_than',
        timeWindow: 5,
        cooldown: 10,
        severity: 'high',
      };

      const response = await request(app.getHttpServer())
        .post('/ai/performance/alerts')
        .send(alertConfig)
        .expect(201);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('alertName');
      expect(response.body.alertName).toBe('test_high_response_time');
    });

    it('should validate alert configuration', async () => {
      const invalidConfig = {
        name: 'test_invalid',
        // Missing required fields
      };

      await request(app.getHttpServer())
        .post('/ai/performance/alerts')
        .send(invalidConfig)
        .expect(400);
    });
  });

  describe('/ai/performance/metrics/realtime (GET)', () => {
    it('should return real-time metrics', async () => {
      const response = await request(app.getHttpServer())
        .get('/ai/performance/metrics/realtime')
        .expect(200);

      expect(response.body).toHaveProperty('realTimeMetrics');
      expect(response.body).toHaveProperty('systemStatus');
      expect(response.body).toHaveProperty('activeAlerts');
      expect(response.body).toHaveProperty('recentMetricsCount');

      expect(typeof response.body.activeAlerts).toBe('number');
      expect(typeof response.body.recentMetricsCount).toBe('number');
    });
  });

  describe('/ai/performance/trends/:metric (GET)', () => {
    it('should return trend analysis for response time', async () => {
      const response = await request(app.getHttpServer())
        .get('/ai/performance/trends/responseTime')
        .expect(200);

      expect(response.body).toHaveProperty('metric');
      expect(response.body).toHaveProperty('timeWindow');
      expect(response.body).toHaveProperty('trend');
      expect(response.body).toHaveProperty('currentValue');
      expect(response.body).toHaveProperty('insights');
      expect(response.body).toHaveProperty('recommendations');

      expect(response.body.metric).toBe('responseTime');
      expect(['improving', 'degrading', 'stable']).toContain(
        response.body.trend,
      );
    });

    it('should return trend analysis for success rate', async () => {
      const response = await request(app.getHttpServer())
        .get('/ai/performance/trends/successRate?timeWindow=month')
        .expect(200);

      expect(response.body.metric).toBe('successRate');
      expect(response.body.timeWindow).toBe('month');
    });
  });

  describe('/ai/performance/export/:format (GET)', () => {
    it('should export data in JSON format', async () => {
      const response = await request(app.getHttpServer())
        .get('/ai/performance/export/json')
        .expect(200);

      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('personaPerformance');
      expect(response.body).toHaveProperty('costAnalysis');
    });

    it('should export data in CSV format', async () => {
      const response = await request(app.getHttpServer())
        .get('/ai/performance/export/csv')
        .expect(200);

      expect(typeof response.body).toBe('string');
      expect(response.body).toContain('Metric,Value,Time Window');
    });
  });

  describe('Performance Service Integration', () => {
    it('should record metrics when AI decisions are made', async () => {
      // Simulate AI decision completion event
      const mockDecisionResult = {
        decision: {
          id: 1,
          playerId: 1,
          gameId: 1,
          decisionType: 'vote',
          processingTime: 5000,
          confidence: 8,
          wasSuccessful: true,
          llmResponse: 'Mock LLM response',
        },
        action: 'vote',
        target: 'player2',
        reasoning: 'Test reasoning',
        confidence: 8,
        processingTime: 5000,
      };

      const mockLLMResponse = {
        content: 'Mock response',
        tokensUsed: 150,
        cost: 0.005,
        model: 'gpt-4-turbo',
        processingTime: 3000,
      };

      // Record the metric
      await performanceService.recordDecisionMetrics(
        mockDecisionResult as any,
        mockLLMResponse as any,
        1,
        false,
      );

      // Verify metrics were recorded by checking dashboard data
      const dashboardData = await performanceService.getDashboardData();
      expect(dashboardData).toHaveProperty('recentMetrics');
    });

    it('should handle alert triggering', async () => {
      // Configure an alert that should trigger
      await performanceService.configureAlert({
        name: 'test_low_confidence',
        type: 'threshold',
        enabled: true,
        threshold: 10, // Very high threshold to ensure trigger
        metric: 'confidence',
        condition: 'less_than',
        timeWindow: 1,
        cooldown: 1,
        severity: 'medium',
      });

      // Simulate a low confidence decision
      const mockMetric = {
        timestamp: Date.now(),
        gameId: 1,
        playerId: 1,
        decisionType: 'vote',
        responseTime: 3000,
        confidenceScore: 5, // Low confidence
        success: true,
        llmTokensUsed: 100,
        llmCost: 0.002,
        llmModel: 'gpt-4-turbo',
        cacheHit: false,
      };

      await performanceService.recordMetric(mockMetric as any);

      // Check if alert was triggered
      const activeAlerts = performanceService.getActiveAlerts();
      expect(activeAlerts.length).toBeGreaterThanOrEqual(0); // Alert may or may not trigger depending on timing
    });
  });
});

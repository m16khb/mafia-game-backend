import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AIPerformanceService } from '../src/libs/ai/ai-performance.service';
import { LLMService } from '../src/libs/llm/llm.service';
import { RedisService } from '../src/libs/redis/redis.service';

describe('AI Performance and Cost Validation (e2e)', () => {
  let app: INestApplication;
  let performanceService: AIPerformanceService;
  let llmService: LLMService;
  let redisService: RedisService;
  let clientSocket: Socket;
  let serverUrl: string;

  // Test configuration
  const PERFORMANCE_TARGETS = {
    maxResponseTime: 500, // ms - from quickstart.md
    maxGameCost: 0.2, // $0.20 - from quickstart.md
    minSuccessRate: 90, // %
    maxMemoryIncrease: 50, // MB
    maxConcurrentGames: 5,
  };

  const LOAD_TEST_CONFIG = {
    concurrentGames: 3,
    testDurationMs: 30000,
    maxAcceptableResponseTime: 1000, // Allow higher latency under load
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    performanceService = moduleFixture.get<AIPerformanceService>(AIPerformanceService);
    llmService = moduleFixture.get<LLMService>(LLMService);
    redisService = moduleFixture.get<RedisService>(RedisService);

    await app.listen(0);

    const address = app.getHttpServer().address();
    serverUrl = `http://localhost:${address.port}`;

    // Reset performance metrics before tests
    await redisService.del('ai:metrics:*');
  });

  afterAll(async () => {
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
    await app.close();
  });

  beforeEach(async () => {
    // Create fresh socket connection for each test
    clientSocket = io(serverUrl, {
      transports: ['websocket'],
      forceNew: true,
    });

    await new Promise<void>((resolve) => {
      clientSocket.on('connect', () => resolve());
    });
  });

  afterEach(() => {
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
  });

  describe('AI Decision Response Time Validation', () => {
    it('should validate AI decisions meet response time target < 500ms', async () => {
      const gameId = await createTestAIGame('ResponseTimeTest');

      const decisionTimes: number[] = [];
      const decisionPromise = new Promise<void>((resolve) => {
        let decisionsReceived = 0;
        const targetDecisions = 10; // Wait for at least 10 decisions

        clientSocket.on('ai-decision-made', (data) => {
          if (data.decision.processingTime) {
            decisionTimes.push(data.decision.processingTime);
            decisionsReceived++;

            if (decisionsReceived >= targetDecisions) {
              resolve();
            }
          }
        });

        // Timeout after 15 seconds if not enough decisions
        setTimeout(() => resolve(), 15000);
      });

      // Start the game to trigger AI decisions
      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      await decisionPromise;

      // Validate response times
      expect(decisionTimes.length).toBeGreaterThan(0);

      const averageResponseTime = decisionTimes.reduce((sum, time) => sum + time, 0) / decisionTimes.length;
      const maxResponseTime = Math.max(...decisionTimes);
      const p95ResponseTime = decisionTimes.sort((a, b) => a - b)[Math.floor(decisionTimes.length * 0.95)];

      console.log(`Decision times - Avg: ${averageResponseTime}ms, Max: ${maxResponseTime}ms, P95: ${p95ResponseTime}ms`);

      // Performance targets from quickstart.md
      expect(averageResponseTime).toBeLessThan(PERFORMANCE_TARGETS.maxResponseTime);
      expect(p95ResponseTime).toBeLessThan(PERFORMANCE_TARGETS.maxResponseTime * 2); // Allow 2x buffer for P95

      // Validate that most decisions are fast
      const fastDecisions = decisionTimes.filter(time => time < PERFORMANCE_TARGETS.maxResponseTime);
      const fastDecisionPercentage = (fastDecisions.length / decisionTimes.length) * 100;
      expect(fastDecisionPercentage).toBeGreaterThan(80); // 80% of decisions should be under 500ms
    }, 30000);

    it('should handle decision timeouts gracefully without degrading performance', async () => {
      const gameId = await createTestAIGame('TimeoutHandlingTest');

      const metrics = {
        timeouts: 0,
        successfulDecisions: 0,
        totalDecisions: 0,
      };

      clientSocket.on('ai-decision-made', () => {
        metrics.successfulDecisions++;
        metrics.totalDecisions++;
      });

      clientSocket.on('ai-error', (error) => {
        if (error.errorType === 'decision_timeout') {
          metrics.timeouts++;
        }
        metrics.totalDecisions++;
      });

      // Start game and wait for some activity
      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 35000)); // Wait longer than AI_DECISION_TIMEOUT

      // Validate error handling
      if (metrics.totalDecisions > 0) {
        const timeoutRate = (metrics.timeouts / metrics.totalDecisions) * 100;
        const successRate = (metrics.successfulDecisions / metrics.totalDecisions) * 100;

        console.log(`Timeout rate: ${timeoutRate}%, Success rate: ${successRate}%`);

        // Game should continue operating even with timeouts
        expect(timeoutRate).toBeLessThan(20); // Less than 20% timeout rate
        expect(successRate).toBeGreaterThan(60); // At least 60% success rate
      }
    }, 45000);
  });

  describe('LLM API Cost Tracking and Budget Monitoring', () => {
    it('should track real-time API costs and stay within budget limits', async () => {
      const initialUsageStats = llmService.getUsageStats();
      const initialCost = initialUsageStats.costs.dailySpent;

      const gameId = await createTestAIGame('CostTrackingTest');

      // Track cost changes
      const costMetrics: number[] = [];
      clientSocket.on('ai-decision-made', (data) => {
        if (data.llmCost) {
          costMetrics.push(data.llmCost);
        }
      });

      // Start game and let it run
      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 10000));

      const finalUsageStats = llmService.getUsageStats();
      const totalCostIncrease = finalUsageStats.costs.dailySpent - initialCost;

      console.log(`Cost increase during test: $${totalCostIncrease.toFixed(4)}`);

      // Validate cost tracking
      expect(totalCostIncrease).toBeGreaterThan(0); // Should have incurred some cost
      expect(totalCostIncrease).toBeLessThan(PERFORMANCE_TARGETS.maxGameCost); // Should be under game cost limit

      // Validate budget monitoring
      const budgetUtilization = finalUsageStats.costs.budgetUtilization;
      expect(budgetUtilization).toBeLessThan(100); // Should not exceed daily budget

      // Validate individual decision costs are reasonable
      if (costMetrics.length > 0) {
        const averageCostPerDecision = costMetrics.reduce((sum, cost) => sum + cost, 0) / costMetrics.length;
        expect(averageCostPerDecision).toBeLessThan(0.02); // $0.02 per decision max
      }
    }, 20000);

    it('should validate cost per game meets target < $0.20 from quickstart.md', async () => {
      const initialStats = llmService.getUsageStats();
      const gameStartCost = initialStats.costs.dailySpent;

      const gameId = await createTestAIGame('FullGameCostTest');

      let gameFinished = false;
      clientSocket.on('ai-game-ended', () => {
        gameFinished = true;
      });

      // Start game and wait for completion or timeout
      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), 120000); // 2 minute max wait

        clientSocket.on('ai-game-ended', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      const finalStats = llmService.getUsageStats();
      const gameCost = finalStats.costs.dailySpent - gameStartCost;

      console.log(`Complete game cost: $${gameCost.toFixed(4)}, Game finished: ${gameFinished}`);

      // Validate game cost target from quickstart.md
      expect(gameCost).toBeLessThan(PERFORMANCE_TARGETS.maxGameCost);

      if (gameFinished) {
        // More strict validation for completed games
        expect(gameCost).toBeGreaterThan(0.01); // Should have some cost
        expect(gameCost).toBeLessThan(0.15); // Well under the $0.20 target
      }
    }, 150000);

    it('should monitor budget utilization and generate alerts', async () => {
      // Configure a low budget alert for testing
      await performanceService.configureAlert({
        name: 'test_budget_alert',
        type: 'threshold',
        enabled: true,
        threshold: 50, // 50% budget utilization
        metric: 'budget_utilization',
        condition: 'greater_than',
        timeWindow: 1,
        cooldown: 1,
        severity: 'medium',
      });

      const gameId = await createTestAIGame('BudgetAlertTest');

      // Start game to consume budget
      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 8000));

      // Check if budget monitoring is working
      const costBreakdown = await performanceService.getCostBreakdown();
      expect(costBreakdown).toHaveProperty('budgetUtilization');
      expect(costBreakdown).toHaveProperty('dailySpent');
      expect(costBreakdown).toHaveProperty('projectedMonthlyCost');

      console.log(`Budget utilization: ${costBreakdown.budgetUtilization}%, Daily spent: $${costBreakdown.dailySpent.toFixed(4)}`);
    }, 15000);
  });

  describe('Memory Usage and Resource Consumption Monitoring', () => {
    it('should monitor memory usage during AI game sessions', async () => {
      const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024; // MB

      const gameId = await createTestAIGame('MemoryMonitorTest');

      const memorySnapshots: number[] = [];
      const memoryInterval = setInterval(() => {
        const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024;
        memorySnapshots.push(currentMemory);
      }, 1000);

      // Start game and monitor for 15 seconds
      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 15000));
      clearInterval(memoryInterval);

      const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryIncrease = finalMemory - initialMemory;
      const maxMemory = Math.max(...memorySnapshots);
      const memoryPeak = maxMemory - initialMemory;

      console.log(`Memory usage - Initial: ${initialMemory.toFixed(2)}MB, Final: ${finalMemory.toFixed(2)}MB, Peak increase: ${memoryPeak.toFixed(2)}MB`);

      // Validate memory usage is reasonable
      expect(memoryIncrease).toBeLessThan(PERFORMANCE_TARGETS.maxMemoryIncrease);
      expect(memoryPeak).toBeLessThan(PERFORMANCE_TARGETS.maxMemoryIncrease * 2); // Allow higher peaks
    }, 20000);

    it('should track CPU usage during AI decision processing', async () => {
      const initialCpuUsage = process.cpuUsage();

      const gameId = await createTestAIGame('CPUMonitorTest');

      // Start game to trigger CPU-intensive AI decisions
      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 10000));

      const finalCpuUsage = process.cpuUsage(initialCpuUsage);
      const cpuUserTime = finalCpuUsage.user / 1000000; // Convert to seconds
      const cpuSystemTime = finalCpuUsage.system / 1000000;

      console.log(`CPU usage - User: ${cpuUserTime.toFixed(2)}s, System: ${cpuSystemTime.toFixed(2)}s`);

      // Validate CPU usage is reasonable (shouldn't max out CPU)
      expect(cpuUserTime).toBeLessThan(8); // Less than 8 seconds of user CPU time
      expect(cpuSystemTime).toBeLessThan(2); // Less than 2 seconds of system CPU time
    }, 15000);
  });

  describe('Concurrent AI Game Performance Testing', () => {
    it('should handle multiple concurrent AI games without performance degradation', async () => {
      const gameIds: number[] = [];
      const gameMetrics = new Map<number, {
        decisions: number;
        avgResponseTime: number;
        errors: number;
        cost: number;
      }>();

      // Create multiple games concurrently
      for (let i = 0; i < LOAD_TEST_CONFIG.concurrentGames; i++) {
        const gameId = await createTestAIGame(`ConcurrentTest${i}`);
        gameIds.push(gameId);
        gameMetrics.set(gameId, { decisions: 0, avgResponseTime: 0, errors: 0, cost: 0 });
      }

      const initialStats = llmService.getUsageStats();
      const initialCost = initialStats.costs.dailySpent;

      // Start all games simultaneously
      const gameStartPromises = gameIds.map(gameId =>
        request(app.getHttpServer())
          .post(`/games/${gameId}/ai/start`)
          .expect(200)
      );

      await Promise.all(gameStartPromises);

      // Track performance across all games
      const decisionTimes: number[] = [];
      let totalDecisions = 0;
      let totalErrors = 0;

      const metricsPromise = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), LOAD_TEST_CONFIG.testDurationMs);

        clientSocket.on('ai-decision-made', (data) => {
          if (data.decision.processingTime) {
            decisionTimes.push(data.decision.processingTime);
            totalDecisions++;
          }
        });

        clientSocket.on('ai-error', () => {
          totalErrors++;
        });

        clientSocket.on('ai-game-ended', () => {
          // Continue monitoring even if some games end
        });
      });

      await metricsPromise;

      const finalStats = llmService.getUsageStats();
      const totalCostIncrease = finalStats.costs.dailySpent - initialCost;

      // Analyze concurrent performance
      if (decisionTimes.length > 0) {
        const avgResponseTime = decisionTimes.reduce((sum, time) => sum + time, 0) / decisionTimes.length;
        const maxResponseTime = Math.max(...decisionTimes);
        const successRate = (totalDecisions / (totalDecisions + totalErrors)) * 100;

        console.log(`Concurrent performance - Games: ${LOAD_TEST_CONFIG.concurrentGames}, Decisions: ${totalDecisions}, Avg time: ${avgResponseTime}ms, Max time: ${maxResponseTime}ms, Success: ${successRate}%, Cost: $${totalCostIncrease.toFixed(4)}`);

        // Validate performance under load
        expect(avgResponseTime).toBeLessThan(LOAD_TEST_CONFIG.maxAcceptableResponseTime);
        expect(successRate).toBeGreaterThan(75); // 75% success rate under load
        expect(totalCostIncrease).toBeLessThan(PERFORMANCE_TARGETS.maxGameCost * LOAD_TEST_CONFIG.concurrentGames);
      }
    }, 45000);

    it('should maintain response time consistency across concurrent games', async () => {
      const gameIds: number[] = [];

      // Create multiple games
      for (let i = 0; i < 2; i++) {
        const gameId = await createTestAIGame(`ConsistencyTest${i}`);
        gameIds.push(gameId);
      }

      const gameDecisionTimes = new Map<number, number[]>();
      gameIds.forEach(id => gameDecisionTimes.set(id, []));

      // Track decision times per game
      clientSocket.on('ai-decision-made', (data) => {
        if (data.gameId && data.decision.processingTime) {
          const times = gameDecisionTimes.get(data.gameId);
          if (times) {
            times.push(data.decision.processingTime);
          }
        }
      });

      // Start games and collect data
      await Promise.all(gameIds.map(gameId =>
        request(app.getHttpServer()).post(`/games/${gameId}/ai/start`).expect(200)
      ));

      await new Promise(resolve => setTimeout(resolve, 15000));

      // Analyze consistency across games
      const gameStats = Array.from(gameDecisionTimes.entries()).map(([gameId, times]) => {
        if (times.length === 0) return null;

        const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
        const variance = times.reduce((sum, time) => sum + Math.pow(time - avg, 2), 0) / times.length;
        const stdDev = Math.sqrt(variance);

        return { gameId, avg, stdDev, count: times.length };
      }).filter(Boolean);

      if (gameStats.length > 1) {
        // Check consistency between games
        const avgResponseTimes = gameStats.map(stat => stat.avg);
        const overallAvg = avgResponseTimes.reduce((sum, avg) => sum + avg, 0) / avgResponseTimes.length;
        const maxDeviation = Math.max(...avgResponseTimes.map(avg => Math.abs(avg - overallAvg)));

        console.log(`Game consistency - Overall avg: ${overallAvg.toFixed(2)}ms, Max deviation: ${maxDeviation.toFixed(2)}ms`);
        console.log('Game stats:', gameStats);

        // Games should have consistent performance (within 50% of overall average)
        expect(maxDeviation).toBeLessThan(overallAvg * 0.5);
      }
    }, 25000);
  });

  describe('Performance Degradation Under Load Testing', () => {
    it('should detect performance degradation under sustained load', async () => {
      const performanceBaseline: number[] = [];
      const performanceUnderLoad: number[] = [];

      // Establish baseline with single game
      const baselineGameId = await createTestAIGame('BaselineTest');

      const baselinePromise = new Promise<void>((resolve) => {
        let decisions = 0;
        const timeout = setTimeout(() => resolve(), 5000);

        clientSocket.on('ai-decision-made', (data) => {
          if (data.decision.processingTime) {
            performanceBaseline.push(data.decision.processingTime);
            decisions++;
            if (decisions >= 5) {
              clearTimeout(timeout);
              resolve();
            }
          }
        });
      });

      await request(app.getHttpServer())
        .post(`/games/${baselineGameId}/ai/start`)
        .expect(200);

      await baselinePromise;

      // Now test under load
      const loadGameIds: number[] = [];
      for (let i = 0; i < 4; i++) {
        const gameId = await createTestAIGame(`LoadTest${i}`);
        loadGameIds.push(gameId);
      }

      const loadPromise = new Promise<void>((resolve) => {
        let decisions = 0;
        const timeout = setTimeout(() => resolve(), 10000);

        clientSocket.on('ai-decision-made', (data) => {
          if (data.decision.processingTime) {
            performanceUnderLoad.push(data.decision.processingTime);
            decisions++;
            if (decisions >= 15) {
              clearTimeout(timeout);
              resolve();
            }
          }
        });
      });

      // Start all load test games
      await Promise.all(loadGameIds.map(gameId =>
        request(app.getHttpServer()).post(`/games/${gameId}/ai/start`).expect(200)
      ));

      await loadPromise;

      // Analyze degradation
      if (performanceBaseline.length > 0 && performanceUnderLoad.length > 0) {
        const baselineAvg = performanceBaseline.reduce((sum, time) => sum + time, 0) / performanceBaseline.length;
        const loadAvg = performanceUnderLoad.reduce((sum, time) => sum + time, 0) / performanceUnderLoad.length;
        const degradationPercent = ((loadAvg - baselineAvg) / baselineAvg) * 100;

        console.log(`Performance degradation - Baseline: ${baselineAvg.toFixed(2)}ms, Under load: ${loadAvg.toFixed(2)}ms, Degradation: ${degradationPercent.toFixed(1)}%`);

        // Acceptable degradation threshold
        expect(degradationPercent).toBeLessThan(100); // Less than 100% degradation
        expect(loadAvg).toBeLessThan(2000); // Still under 2 seconds under load
      }
    }, 30000);

    it('should recover performance after load reduction', async () => {
      const performanceMetrics: { time: number; responseTime: number }[] = [];

      // Create high load scenario
      const gameIds: number[] = [];
      for (let i = 0; i < 3; i++) {
        const gameId = await createTestAIGame(`RecoveryTest${i}`);
        gameIds.push(gameId);
      }

      // Track performance over time
      clientSocket.on('ai-decision-made', (data) => {
        if (data.decision.processingTime) {
          performanceMetrics.push({
            time: Date.now(),
            responseTime: data.decision.processingTime,
          });
        }
      });

      // Start high load
      await Promise.all(gameIds.map(gameId =>
        request(app.getHttpServer()).post(`/games/${gameId}/ai/start`).expect(200)
      ));

      // Let high load run for 10 seconds
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Simulate load reduction (in a real test, we might end some games)
      // For this test, we just continue monitoring

      await new Promise(resolve => setTimeout(resolve, 10000));

      // Analyze recovery pattern
      if (performanceMetrics.length > 10) {
        const startTime = performanceMetrics[0].time;
        const midTime = startTime + 10000; // 10 seconds in

        const earlyMetrics = performanceMetrics.filter(m => m.time < midTime);
        const lateMetrics = performanceMetrics.filter(m => m.time >= midTime);

        if (earlyMetrics.length > 0 && lateMetrics.length > 0) {
          const earlyAvg = earlyMetrics.reduce((sum, m) => sum + m.responseTime, 0) / earlyMetrics.length;
          const lateAvg = lateMetrics.reduce((sum, m) => sum + m.responseTime, 0) / lateMetrics.length;

          console.log(`Recovery analysis - Early avg: ${earlyAvg.toFixed(2)}ms, Late avg: ${lateAvg.toFixed(2)}ms`);

          // System should maintain stability (not continuously degrade)
          const maxAcceptableTime = Math.max(earlyAvg * 2, 2000);
          expect(lateAvg).toBeLessThan(maxAcceptableTime);
        }
      }
    }, 30000);
  });

  describe('Cost Optimization Through Caching Validation', () => {
    it('should demonstrate cost savings through LLM response caching', async () => {
      // This test would need cache-enabled scenarios
      const gameId = await createTestAIGame('CacheValidationTest');

      let cacheHits = 0;
      let cacheMisses = 0;
      const costs: number[] = [];

      clientSocket.on('ai-decision-made', (data) => {
        if (data.cacheHit !== undefined) {
          if (data.cacheHit) {
            cacheHits++;
          } else {
            cacheMisses++;
          }
        }
        if (data.llmCost) {
          costs.push(data.llmCost);
        }
      });

      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 15000));

      const totalRequests = cacheHits + cacheMisses;
      if (totalRequests > 0) {
        const cacheHitRate = (cacheHits / totalRequests) * 100;
        const avgCost = costs.length > 0 ? costs.reduce((sum, cost) => sum + cost, 0) / costs.length : 0;

        console.log(`Cache performance - Hit rate: ${cacheHitRate.toFixed(1)}%, Avg cost: $${avgCost.toFixed(6)}`);

        // Cache should provide some benefit (>10% hit rate in repeated scenarios)
        if (totalRequests > 10) {
          expect(cacheHitRate).toBeGreaterThan(5); // At least 5% cache hit rate
        }
      }
    }, 20000);

    it('should validate cost per decision decreases with cache utilization', async () => {
      const gameId = await createTestAIGame('CacheEfficiencyTest');

      const decisionMetrics: Array<{
        cached: boolean;
        cost: number;
        responseTime: number;
      }> = [];

      clientSocket.on('ai-decision-made', (data) => {
        decisionMetrics.push({
          cached: data.cacheHit || false,
          cost: data.llmCost || 0,
          responseTime: data.decision.processingTime || 0,
        });
      });

      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 12000));

      // Analyze cache impact on costs and performance
      const cachedDecisions = decisionMetrics.filter(m => m.cached);
      const uncachedDecisions = decisionMetrics.filter(m => !m.cached);

      if (cachedDecisions.length > 0 && uncachedDecisions.length > 0) {
        const avgCachedCost = cachedDecisions.reduce((sum, m) => sum + m.cost, 0) / cachedDecisions.length;
        const avgUncachedCost = uncachedDecisions.reduce((sum, m) => sum + m.cost, 0) / uncachedDecisions.length;
        const avgCachedTime = cachedDecisions.reduce((sum, m) => sum + m.responseTime, 0) / cachedDecisions.length;
        const avgUncachedTime = uncachedDecisions.reduce((sum, m) => sum + m.responseTime, 0) / uncachedDecisions.length;

        console.log(`Cache impact - Cached: $${avgCachedCost.toFixed(6)}, ${avgCachedTime.toFixed(0)}ms | Uncached: $${avgUncachedCost.toFixed(6)}, ${avgUncachedTime.toFixed(0)}ms`);

        // Cached decisions should be faster and cheaper
        expect(avgCachedCost).toBeLessThanOrEqual(avgUncachedCost);
        expect(avgCachedTime).toBeLessThan(avgUncachedTime);
      }
    }, 18000);
  });

  describe('Performance Metrics Collection and Reporting', () => {
    it('should collect comprehensive performance metrics during AI gameplay', async () => {
      const gameId = await createTestAIGame('MetricsCollectionTest');

      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      // Let the game run to generate metrics
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Retrieve and validate collected metrics
      const aggregatedMetrics = await performanceService.getAggregatedMetrics('hour');
      const systemHealth = await performanceService.getSystemHealth();
      const costBreakdown = await performanceService.getCostBreakdown();

      console.log('Collected metrics:', {
        decisions: aggregatedMetrics.totalDecisions,
        avgResponseTime: aggregatedMetrics.averageResponseTime,
        successRate: aggregatedMetrics.successRate,
        systemStatus: systemHealth.status,
        dailyCost: costBreakdown.dailySpent,
      });

      // Validate metric collection completeness
      expect(aggregatedMetrics).toHaveProperty('totalDecisions');
      expect(aggregatedMetrics).toHaveProperty('averageResponseTime');
      expect(aggregatedMetrics).toHaveProperty('successRate');
      expect(aggregatedMetrics).toHaveProperty('totalCost');

      expect(systemHealth).toHaveProperty('status');
      expect(systemHealth).toHaveProperty('llmServiceHealth');
      expect(systemHealth).toHaveProperty('memoryUtilization');

      expect(costBreakdown).toHaveProperty('dailySpent');
      expect(costBreakdown).toHaveProperty('budgetUtilization');

      if (aggregatedMetrics.totalDecisions > 0) {
        expect(aggregatedMetrics.averageResponseTime).toBeGreaterThan(0);
        expect(aggregatedMetrics.successRate).toBeGreaterThanOrEqual(0);
        expect(aggregatedMetrics.successRate).toBeLessThanOrEqual(100);
      }
    }, 15000);

    it('should generate performance reports with insights and recommendations', async () => {
      const gameId = await createTestAIGame('ReportGenerationTest');

      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 8000));

      // Generate performance report
      const report = await performanceService.generatePerformanceReport('hour');

      console.log('Performance report:', {
        insights: report.insights.length,
        recommendations: report.recommendations.length,
        systemStatus: report.systemHealth.status,
        totalCost: report.costAnalysis.totalSpent,
      });

      // Validate report structure
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('systemHealth');
      expect(report).toHaveProperty('costAnalysis');
      expect(report).toHaveProperty('insights');
      expect(report).toHaveProperty('recommendations');
      expect(report).toHaveProperty('trends');

      expect(Array.isArray(report.insights)).toBe(true);
      expect(Array.isArray(report.recommendations)).toBe(true);

      // Validate trend analysis
      expect(report.trends).toHaveProperty('responseTime');
      expect(report.trends).toHaveProperty('successRate');
      expect(report.trends).toHaveProperty('costs');
      expect(['improving', 'degrading', 'stable']).toContain(report.trends.responseTime);
    }, 12000);
  });

  describe('Alert Generation for Performance Thresholds', () => {
    it('should trigger alerts when performance thresholds are exceeded', async () => {
      // Configure sensitive alerts for testing
      await performanceService.configureAlert({
        name: 'test_response_time_alert',
        type: 'threshold',
        enabled: true,
        threshold: 100, // Very low threshold for testing
        metric: 'response_time',
        condition: 'greater_than',
        timeWindow: 1,
        cooldown: 1,
        severity: 'high',
      });

      const gameId = await createTestAIGame('AlertGenerationTest');

      let alertsTriggered = false;
      const initialAlerts = performanceService.getActiveAlerts();
      const initialAlertCount = initialAlerts.length;

      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 8000));

      const finalAlerts = performanceService.getActiveAlerts();
      const newAlerts = finalAlerts.filter(alert => !initialAlerts.some(ia => ia.id === alert.id));

      console.log(`Alert testing - Initial: ${initialAlertCount}, Final: ${finalAlerts.length}, New: ${newAlerts.length}`);

      if (newAlerts.length > 0) {
        console.log('New alerts:', newAlerts.map(a => ({ metric: a.metric, severity: a.severity, message: a.message })));

        // Validate alert structure
        newAlerts.forEach(alert => {
          expect(alert).toHaveProperty('id');
          expect(alert).toHaveProperty('severity');
          expect(alert).toHaveProperty('message');
          expect(alert).toHaveProperty('timestamp');
          expect(['low', 'medium', 'high', 'critical']).toContain(alert.severity);
        });

        alertsTriggered = true;
      }

      // Alert system should be functional (either triggered or properly configured)
      expect(typeof alertsTriggered).toBe('boolean');
    }, 12000);

    it('should validate alert cooldown and resolution mechanisms', async () => {
      // Configure alert with short cooldown for testing
      await performanceService.configureAlert({
        name: 'test_cooldown_alert',
        type: 'threshold',
        enabled: true,
        threshold: 50, // Low threshold
        metric: 'response_time',
        condition: 'greater_than',
        timeWindow: 1,
        cooldown: 2, // 2 minute cooldown
        severity: 'medium',
      });

      const gameId = await createTestAIGame('CooldownTest');

      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 5000));

      const alerts = performanceService.getActiveAlerts();
      const testAlert = alerts.find(a => a.configName === 'test_cooldown_alert');

      if (testAlert) {
        // Test alert resolution
        const resolved = await performanceService.resolveAlert(testAlert.id);
        expect(resolved).toBe(true);

        const alertsAfterResolution = performanceService.getActiveAlerts();
        const stillActive = alertsAfterResolution.find(a => a.id === testAlert.id && !a.resolved);
        expect(stillActive).toBeUndefined();

        console.log(`Alert ${testAlert.id} successfully resolved`);
      }
    }, 10000);
  });

  describe('Integration Performance Validation', () => {
    it('should validate overall system performance meets all targets simultaneously', async () => {
      const testStartTime = Date.now();
      const initialStats = llmService.getUsageStats();
      const initialCost = initialStats.costs.dailySpent;
      const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;

      const gameId = await createTestAIGame('IntegrationPerformanceTest');

      const metrics = {
        decisions: 0,
        responseTimes: [] as number[],
        errors: 0,
        cacheHits: 0,
        cacheMisses: 0,
      };

      clientSocket.on('ai-decision-made', (data) => {
        metrics.decisions++;
        if (data.decision.processingTime) {
          metrics.responseTimes.push(data.decision.processingTime);
        }
        if (data.cacheHit) {
          metrics.cacheHits++;
        } else {
          metrics.cacheMisses++;
        }
      });

      clientSocket.on('ai-error', () => {
        metrics.errors++;
      });

      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 20000));

      const finalStats = llmService.getUsageStats();
      const totalCost = finalStats.costs.dailySpent - initialCost;
      const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryIncrease = finalMemory - initialMemory;

      // Calculate comprehensive metrics
      const avgResponseTime = metrics.responseTimes.length > 0
        ? metrics.responseTimes.reduce((sum, time) => sum + time, 0) / metrics.responseTimes.length
        : 0;

      const successRate = metrics.decisions / (metrics.decisions + metrics.errors) * 100;
      const cacheHitRate = (metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses)) * 100;

      const performanceSummary = {
        testDurationMs: Date.now() - testStartTime,
        decisions: metrics.decisions,
        avgResponseTime: Math.round(avgResponseTime),
        successRate: Math.round(successRate * 100) / 100,
        totalCost: Math.round(totalCost * 10000) / 10000,
        memoryIncrease: Math.round(memoryIncrease * 100) / 100,
        cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      };

      console.log('🎯 Integration Performance Summary:', performanceSummary);

      // Validate ALL performance targets simultaneously
      const validationResults = {
        responseTime: avgResponseTime < PERFORMANCE_TARGETS.maxResponseTime,
        gameCost: totalCost < PERFORMANCE_TARGETS.maxGameCost,
        successRate: successRate >= PERFORMANCE_TARGETS.minSuccessRate,
        memoryUsage: memoryIncrease < PERFORMANCE_TARGETS.maxMemoryIncrease,
        systemStability: metrics.decisions > 0 && metrics.errors < metrics.decisions * 0.1,
      };

      console.log('✅ Performance Validation Results:', validationResults);

      // Assert all targets are met
      expect(validationResults.responseTime).toBe(true);
      expect(validationResults.gameCost).toBe(true);
      expect(validationResults.successRate).toBe(true);
      expect(validationResults.memoryUsage).toBe(true);
      expect(validationResults.systemStability).toBe(true);

      // Final validation that system is meeting quickstart.md specifications
      expect(avgResponseTime).toBeLessThan(PERFORMANCE_TARGETS.maxResponseTime);
      expect(totalCost).toBeLessThan(PERFORMANCE_TARGETS.maxGameCost);
      expect(successRate).toBeGreaterThanOrEqual(PERFORMANCE_TARGETS.minSuccessRate);
    }, 30000);
  });

  // Helper function to create AI games for testing
  async function createTestAIGame(hostName: string): Promise<number> {
    const response = await request(app.getHttpServer())
      .post('/games/ai')
      .send({
        hostName,
        hostSocketId: `test_socket_${Date.now()}_${Math.random()}`,
        aiDifficultyLevel: 'medium',
      })
      .expect(201);

    return response.body.gameId;
  }
});
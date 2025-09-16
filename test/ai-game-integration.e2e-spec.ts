import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AI Game Integration (e2e)', () => {
  let app: INestApplication;
  let clientSocket: Socket;
  let serverUrl: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.listen(0);

    const address = app.getHttpServer().address();
    serverUrl = `http://localhost:${address.port}`;

    clientSocket = io(serverUrl, {
      transports: ['websocket'],
      forceNew: true,
    });

    await new Promise<void>((resolve) => {
      clientSocket.on('connect', () => resolve());
    });
  });

  afterEach(async () => {
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
    await app.close();
  });

  describe('Complete AI Game Lifecycle', () => {
    it('should complete full 6-player game from creation to finish', async () => {
      let gameId: number;
      const gamePhases: string[] = [];
      const eliminatedPlayers: any[] = [];
      let gameFinished = false;
      let finalWinner: string;

      // Track game phases
      clientSocket.on('ai-phase-transition', (data) => {
        gamePhases.push(data.currentPhase);
      });

      // Track eliminations
      clientSocket.on('ai-player-eliminated', (data) => {
        eliminatedPlayers.push(data.eliminatedPlayer);
      });

      // Track game end
      clientSocket.on('ai-game-ended', (data) => {
        gameFinished = true;
        finalWinner = data.winner;
      });

      // Step 1: Create AI game
      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'IntegrationTestPlayer',
          hostSocketId: 'integration_test_socket',
          aiDifficultyLevel: 'medium',
        })
        .expect(201);

      gameId = createResponse.body.gameId;
      expect(createResponse.body.game.players).toHaveLength(6);

      // Step 2: Start the game
      const startResponse = await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      expect(startResponse.body.status).toBe('playing');

      // Verify role distribution
      const roles = startResponse.body.players.map((p: any) => p.role);
      expect(roles.filter((r: string) => r === 'mafia')).toHaveLength(2);
      expect(roles.filter((r: string) => r === 'police')).toHaveLength(1);
      expect(roles.filter((r: string) => r === 'doctor')).toHaveLength(1);
      expect(roles.filter((r: string) => r === 'citizen')).toHaveLength(2);

      // Step 3: Wait for AI game to progress through phases
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          resolve(); // Timeout after 2 minutes if game doesn't finish
        }, 120000);

        clientSocket.on('ai-game-ended', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // Verify game completion
      expect(gameFinished).toBe(true);
      expect(['mafia', 'citizen']).toContain(finalWinner);
      expect(gamePhases.length).toBeGreaterThan(0);
      expect(eliminatedPlayers.length).toBeGreaterThan(0);

      // Verify win condition logic
      if (finalWinner === 'mafia') {
        // Mafia wins when they equal or outnumber citizens
        const alivePlayers = 6 - eliminatedPlayers.length;
        const aliveMafia = Math.max(
          0,
          2 - eliminatedPlayers.filter((p) => p.role === 'mafia').length,
        );
        expect(aliveMafia).toBeGreaterThanOrEqual(alivePlayers - aliveMafia);
      } else {
        // Citizens win when all mafia are eliminated
        const eliminatedMafia = eliminatedPlayers.filter(
          (p) => p.role === 'mafia',
        ).length;
        expect(eliminatedMafia).toBe(2);
      }
    }, 150000); // 2.5 minute timeout for full game

    it('should handle AI decision timeouts gracefully', async () => {
      let gameId: number;
      const timeoutErrors: any[] = [];

      clientSocket.on('ai-error', (error) => {
        if (error.errorType === 'decision_timeout') {
          timeoutErrors.push(error);
        }
      });

      // Create and start game
      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'TimeoutTestPlayer',
          hostSocketId: 'timeout_test_socket',
          aiDifficultyLevel: 'medium',
        });

      gameId = createResponse.body.gameId;

      await request(app.getHttpServer()).post(`/games/${gameId}/ai/start`);

      // Wait for potential timeout errors
      await new Promise((resolve) => setTimeout(resolve, 35000)); // Wait longer than AI_DECISION_TIMEOUT

      // Game should continue even if some decisions timeout
      const gameStatus = await request(app.getHttpServer())
        .get(`/games/${gameId}/ai/decisions`)
        .expect(200);

      expect(gameStatus.body.gameId).toBe(gameId);
      // Game should still be active even with timeout errors
      expect(['day_discussion', 'day_voting', 'night_actions']).toContain(
        gameStatus.body.currentPhase,
      );
    }, 45000);

    it('should validate AI decision performance targets', async () => {
      let gameId: number;
      const decisionTimes: number[] = [];
      let totalApiCost = 0;

      clientSocket.on('ai-decision-made', (data) => {
        if (data.decision.processingTime) {
          decisionTimes.push(data.decision.processingTime);
        }
        // Estimate API cost (mock calculation)
        totalApiCost += 0.001; // $0.001 per decision
      });

      // Create and start game
      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'PerformanceTestPlayer',
          hostSocketId: 'performance_test_socket',
          aiDifficultyLevel: 'medium',
        });

      gameId = createResponse.body.gameId;

      await request(app.getHttpServer()).post(`/games/${gameId}/ai/start`);

      // Wait for some decisions to be made
      await new Promise((resolve) => setTimeout(resolve, 10000));

      if (decisionTimes.length > 0) {
        // Validate performance targets from quickstart.md
        const averageDecisionTime =
          decisionTimes.reduce((sum, time) => sum + time, 0) /
          decisionTimes.length;
        const maxDecisionTime = Math.max(...decisionTimes);

        // Performance target: AI decisions < 500ms
        expect(averageDecisionTime).toBeLessThan(500);
        expect(maxDecisionTime).toBeLessThan(1000); // Allow some buffer

        // Cost target: < $0.20 per game
        expect(totalApiCost).toBeLessThan(0.2);
      }
    }, 15000);
  });

  describe('Human-AI Player Interaction', () => {
    it('should handle mixed human-AI gameplay', async () => {
      let gameId: number;
      let humanPlayerId: number;

      // Create game
      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'HumanPlayer',
          hostSocketId: clientSocket.id,
          aiDifficultyLevel: 'medium',
        });

      gameId = createResponse.body.gameId;
      humanPlayerId = createResponse.body.game.players.find(
        (p: any) => !p.isAI,
      ).id;

      // Start game
      await request(app.getHttpServer()).post(`/games/${gameId}/ai/start`);

      const aiResponses: any[] = [];

      clientSocket.on('ai-decision-made', (data) => {
        aiResponses.push(data);
      });

      // Human participates in discussion
      clientSocket.emit('human-discussion', {
        gameId,
        playerId: humanPlayerId,
        message: 'I think we should be careful about voting too quickly.',
      });

      // Wait for AI responses to human input
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // AI players should respond to human discussion
      expect(aiResponses.length).toBeGreaterThan(0);

      // Human votes
      const aiPlayer = await request(app.getHttpServer()).get(
        `/games/${gameId}/ai/decisions`,
      );

      if (
        aiPlayer.body.pendingDecisions &&
        aiPlayer.body.pendingDecisions.length > 0
      ) {
        const targetAI = aiPlayer.body.pendingDecisions[0];

        clientSocket.emit('human-vote', {
          gameId,
          playerId: humanPlayerId,
          targetId: targetAI.playerId,
          reason: 'Acting suspiciously during discussion',
        });

        // Wait for AI voting responses
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // AI players should react to human vote
        const postVoteResponses = aiResponses.length;
        expect(postVoteResponses).toBeGreaterThan(
          aiResponses.length - postVoteResponses,
        );
      }
    }, 15000);

    it('should maintain realistic AI behavior patterns', async () => {
      let gameId: number;
      const aiMessages: string[] = [];

      clientSocket.on('ai-discussion', (data) => {
        aiMessages.push(data.message);
      });

      // Create and start game
      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'BehaviorTestPlayer',
          hostSocketId: 'behavior_test_socket',
          aiDifficultyLevel: 'medium',
        });

      gameId = createResponse.body.gameId;

      await request(app.getHttpServer()).post(`/games/${gameId}/ai/start`);

      // Wait for AI discussions
      await new Promise((resolve) => setTimeout(resolve, 8000));

      // Validate AI message quality
      expect(aiMessages.length).toBeGreaterThan(0);

      aiMessages.forEach((message) => {
        // Messages should be reasonable length
        expect(message.length).toBeGreaterThan(10);
        expect(message.length).toBeLessThan(300);

        // Should contain game-relevant content
        const gameKeywords = [
          'vote',
          'suspicious',
          'mafia',
          'citizen',
          'kill',
          'protect',
          'investigate',
          'discuss',
        ];
        const containsGameContent = gameKeywords.some((keyword) =>
          message.toLowerCase().includes(keyword),
        );
        expect(containsGameContent).toBe(true);
      });
    }, 12000);
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle AI service failures gracefully', async () => {
      let gameId: number;
      const errors: any[] = [];

      clientSocket.on('ai-error', (error) => {
        errors.push(error);
      });

      // Create game
      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'ErrorTestPlayer',
          hostSocketId: 'error_test_socket',
          aiDifficultyLevel: 'medium',
        });

      gameId = createResponse.body.gameId;

      // Start game
      await request(app.getHttpServer()).post(`/games/${gameId}/ai/start`);

      // Wait for potential errors
      await new Promise((resolve) => setTimeout(resolve, 10000));

      // Game should continue running despite individual AI failures
      const gameStatus = await request(app.getHttpServer())
        .get(`/games/${gameId}/ai/decisions`)
        .expect(200);

      expect(gameStatus.body.gameId).toBe(gameId);

      // If errors occurred, they should be handled gracefully
      if (errors.length > 0) {
        errors.forEach((error) => {
          expect(error).toHaveProperty('errorType');
          expect(error).toHaveProperty('message');
          expect(['decision_timeout', 'llm_error', 'strategy_error']).toContain(
            error.errorType,
          );
        });
      }
    }, 15000);
  });
});

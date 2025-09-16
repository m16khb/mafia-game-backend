import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AI Game API (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /games/ai', () => {
    it('should create AI-powered mafia game', async () => {
      const createAIGameDto = {
        hostName: 'TestPlayer',
        hostSocketId: 'test_socket_123',
        aiDifficultyLevel: 'medium',
        aiPersonalitySet: 'default',
      };

      const response = await request(app.getHttpServer())
        .post('/games/ai')
        .send(createAIGameDto)
        .expect(201);

      expect(response.body).toHaveProperty('gameId');
      expect(response.body).toHaveProperty('game');
      expect(response.body.game).toHaveProperty('id');
      expect(response.body.game).toHaveProperty('name');
      expect(response.body.game).toHaveProperty('status', 'waiting');
      expect(response.body.game).toHaveProperty('aiPlayerCount', 5);
      expect(response.body.game).toHaveProperty('aiDifficultyLevel', 'medium');
      expect(response.body.game).toHaveProperty('players');
      expect(response.body.game.players).toHaveLength(6); // 1 human + 5 AI

      // Check AI players
      const aiPlayers = response.body.game.players.filter((p: any) => p.isAI);
      expect(aiPlayers).toHaveLength(5);
      aiPlayers.forEach((player: any) => {
        expect(player).toHaveProperty('isAI', true);
        expect(player).toHaveProperty('aiPersona');
        expect(player.aiPersona).toHaveProperty('name');
        expect(player.aiPersona).toHaveProperty('traits');
        expect(player.aiPersona).toHaveProperty('communicationStyle');
        expect(player.aiPersona).toHaveProperty('riskTolerance');
      });
    });

    it('should return 400 for invalid request data', async () => {
      const invalidDto = {
        hostName: '', // Invalid: empty name
        hostSocketId: 'test_socket_123',
        aiDifficultyLevel: 'invalid_level', // Invalid: not in enum
      };

      const response = await request(app.getHttpServer())
        .post('/games/ai')
        .send(invalidDto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('code');
    });
  });

  describe('POST /games/:gameId/ai/start', () => {
    let gameId: number;

    beforeEach(async () => {
      // Create an AI game first
      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'TestPlayer',
          hostSocketId: 'test_socket_123',
          aiDifficultyLevel: 'medium',
        });
      gameId = createResponse.body.gameId;
    });

    it('should start AI-powered game with role assignment', async () => {
      const response = await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      expect(response.body).toHaveProperty('id', gameId);
      expect(response.body).toHaveProperty('status', 'playing');
      expect(response.body).toHaveProperty('currentPhase');
      expect(['day_discussion', 'day_voting', 'night_actions']).toContain(
        response.body.currentPhase,
      );

      // Check that roles are assigned
      expect(response.body).toHaveProperty('players');
      response.body.players.forEach((player: any) => {
        expect(player).toHaveProperty('role');
        expect(['citizen', 'mafia', 'police', 'doctor']).toContain(player.role);
      });

      // Verify proper role distribution
      const roles = response.body.players.map((p: any) => p.role);
      expect(roles.filter((r: string) => r === 'mafia')).toHaveLength(2);
      expect(roles.filter((r: string) => r === 'police')).toHaveLength(1);
      expect(roles.filter((r: string) => r === 'doctor')).toHaveLength(1);
      expect(roles.filter((r: string) => r === 'citizen')).toHaveLength(2);
    });

    it('should return 404 for non-existent game', async () => {
      await request(app.getHttpServer())
        .post('/games/99999/ai/start')
        .expect(404);
    });

    it('should return 409 if game cannot be started', async () => {
      // Start the game first
      await request(app.getHttpServer()).post(`/games/${gameId}/ai/start`);

      // Try to start again (should fail)
      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(409);
    });
  });

  describe('GET /games/:gameId/ai/decisions', () => {
    let gameId: number;

    beforeEach(async () => {
      // Create and start an AI game
      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'TestPlayer',
          hostSocketId: 'test_socket_123',
          aiDifficultyLevel: 'medium',
        });
      gameId = createResponse.body.gameId;

      await request(app.getHttpServer()).post(`/games/${gameId}/ai/start`);
    });

    it('should get AI decision status for current phase', async () => {
      const response = await request(app.getHttpServer())
        .get(`/games/${gameId}/ai/decisions`)
        .expect(200);

      expect(response.body).toHaveProperty('gameId', gameId);
      expect(response.body).toHaveProperty('currentPhase');
      expect(['day_discussion', 'day_voting', 'night_actions']).toContain(
        response.body.currentPhase,
      );
      expect(response.body).toHaveProperty('aiDecisionsComplete');
      expect(typeof response.body.aiDecisionsComplete).toBe('boolean');
      expect(response.body).toHaveProperty('pendingDecisions');
      expect(Array.isArray(response.body.pendingDecisions)).toBe(true);

      // Check pending decision structure
      if (response.body.pendingDecisions.length > 0) {
        response.body.pendingDecisions.forEach((decision: any) => {
          expect(decision).toHaveProperty('playerId');
          expect(decision).toHaveProperty('playerName');
          expect(decision).toHaveProperty('decisionType');
          expect([
            'vote',
            'night_action',
            'discussion',
            'accusation',
          ]).toContain(decision.decisionType);
          expect(decision).toHaveProperty('timeoutIn');
          expect(typeof decision.timeoutIn).toBe('number');
        });
      }
    });

    it('should return 404 for non-existent game', async () => {
      await request(app.getHttpServer())
        .get('/games/99999/ai/decisions')
        .expect(404);
    });
  });

  describe('GET /ai/personas', () => {
    it('should get available AI personas', async () => {
      const response = await request(app.getHttpServer())
        .get('/ai/personas')
        .expect(200);

      expect(response.body).toHaveProperty('personas');
      expect(Array.isArray(response.body.personas)).toBe(true);
      expect(response.body.personas.length).toBeGreaterThan(0);

      // Check persona structure
      response.body.personas.forEach((persona: any) => {
        expect(persona).toHaveProperty('id');
        expect(persona).toHaveProperty('name');
        expect(persona).toHaveProperty('traits');
        expect(Array.isArray(persona.traits)).toBe(true);
        expect(persona).toHaveProperty('communicationStyle');
        expect(['aggressive', 'analytical', 'emotional', 'quiet']).toContain(
          persona.communicationStyle,
        );
        expect(persona).toHaveProperty('riskTolerance');
        expect(['high', 'medium', 'low']).toContain(persona.riskTolerance);
      });
    });
  });

  describe('GET /ai/personas/:personaId/stats', () => {
    it('should get performance statistics for AI persona', async () => {
      // First get available personas
      const personasResponse = await request(app.getHttpServer()).get(
        '/ai/personas',
      );

      const personaId = personasResponse.body.personas[0].id;

      const response = await request(app.getHttpServer())
        .get(`/ai/personas/${personaId}/stats`)
        .expect(200);

      expect(response.body).toHaveProperty('personaId', personaId);
      expect(response.body).toHaveProperty('gamesPlayed');
      expect(typeof response.body.gamesPlayed).toBe('number');
      expect(response.body).toHaveProperty('winRate');
      expect(typeof response.body.winRate).toBe('number');
      expect(response.body.winRate).toBeGreaterThanOrEqual(0);
      expect(response.body.winRate).toBeLessThanOrEqual(1);
      expect(response.body).toHaveProperty('averageDecisionTime');
      expect(typeof response.body.averageDecisionTime).toBe('number');
      expect(response.body).toHaveProperty('rolePerformance');

      // Check role performance structure
      const rolePerformance = response.body.rolePerformance;
      ['mafia', 'citizen', 'police', 'doctor'].forEach((role) => {
        if (rolePerformance[role]) {
          expect(rolePerformance[role]).toHaveProperty('gamesPlayed');
          expect(rolePerformance[role]).toHaveProperty('winRate');
          expect(rolePerformance[role]).toHaveProperty('averageDecisionTime');
        }
      });
    });

    it('should return 404 for non-existent persona', async () => {
      await request(app.getHttpServer())
        .get('/ai/personas/99999/stats')
        .expect(404);
    });
  });
});

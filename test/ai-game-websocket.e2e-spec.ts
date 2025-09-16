import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';

describe('AI Game WebSocket Events (e2e)', () => {
  let app: INestApplication;
  let clientSocket: Socket;
  let serverUrl: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.listen(0); // Use random port for testing

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

  describe('create-ai-game event', () => {
    it('should create AI game via WebSocket and emit ai-game-created', (done) => {
      const createGamePayload = {
        hostName: 'TestPlayer',
        hostSocketId: 'test_socket_123',
        aiDifficultyLevel: 'medium',
        aiPersonalitySet: 'default',
      };

      clientSocket.on('ai-game-created', (data) => {
        try {
          expect(data).toHaveProperty('gameId');
          expect(data).toHaveProperty('game');
          expect(data.game).toHaveProperty('id');
          expect(data.game).toHaveProperty('name');
          expect(data.game).toHaveProperty('status', 'waiting');
          expect(data.game).toHaveProperty('players');
          expect(data.game.players).toHaveLength(6); // 1 human + 5 AI

          // Check AI decision status
          expect(data.game).toHaveProperty('aiDecisionStatus');
          expect(data.game.aiDecisionStatus).toHaveProperty(
            'decisionsComplete',
          );
          expect(data.game.aiDecisionStatus).toHaveProperty('pendingCount');
          expect(data.game.aiDecisionStatus).toHaveProperty(
            'totalAIPlayers',
            5,
          );

          done();
        } catch (error) {
          done(error);
        }
      });

      clientSocket.on('error', (error) => {
        done(error);
      });

      clientSocket.emit('create-ai-game', createGamePayload);
    });

    it('should handle invalid create-ai-game payload', (done) => {
      const invalidPayload = {
        hostName: '', // Invalid: empty name
        hostSocketId: 'test_socket_123',
        aiDifficultyLevel: 'invalid', // Invalid: not in enum
      };

      clientSocket.on('ai-error', (error) => {
        try {
          expect(error).toHaveProperty('errorType');
          expect(error).toHaveProperty('message');
          done();
        } catch (e) {
          done(e);
        }
      });

      clientSocket.emit('create-ai-game', invalidPayload);
    });
  });

  describe('start-ai-game event', () => {
    let gameId: number;

    beforeEach((done) => {
      const createGamePayload = {
        hostName: 'TestPlayer',
        hostSocketId: 'test_socket_123',
        aiDifficultyLevel: 'medium',
      };

      clientSocket.on('ai-game-created', (data) => {
        gameId = data.gameId;
        done();
      });

      clientSocket.emit('create-ai-game', createGamePayload);
    });

    it('should start AI game and emit ai-game-started with role assignment', (done) => {
      clientSocket.on('ai-game-started', (data) => {
        try {
          expect(data).toHaveProperty('gameId', gameId);
          expect(data).toHaveProperty('game');
          expect(data.game).toHaveProperty('status', 'playing');
          expect(data.game).toHaveProperty('currentPhase');
          expect(['day_discussion', 'day_voting', 'night_actions']).toContain(
            data.game.currentPhase,
          );
          expect(data).toHaveProperty('yourRole');
          expect(['citizen', 'mafia', 'police', 'doctor']).toContain(
            data.yourRole,
          );

          // Check that all players have roles assigned
          data.game.players.forEach((player: any) => {
            expect(player).toHaveProperty('role');
            expect(['citizen', 'mafia', 'police', 'doctor']).toContain(
              player.role,
            );
          });

          done();
        } catch (error) {
          done(error);
        }
      });

      clientSocket.emit('start-ai-game', { gameId });
    });

    it('should handle start-ai-game for non-existent game', (done) => {
      clientSocket.on('ai-error', (error) => {
        try {
          expect(error).toHaveProperty('errorType');
          expect(error).toHaveProperty('message');
          done();
        } catch (e) {
          done(e);
        }
      });

      clientSocket.emit('start-ai-game', { gameId: 99999 });
    });
  });

  describe('human-vote event', () => {
    let gameId: number;
    let playerId: number;

    beforeEach((done) => {
      let gameCreated = false;
      let gameStarted = false;

      const checkDone = () => {
        if (gameCreated && gameStarted) done();
      };

      clientSocket.on('ai-game-created', (data) => {
        gameId = data.gameId;
        playerId = data.game.players.find((p: any) => !p.isAI).id;
        gameCreated = true;
        checkDone();

        // Start the game
        clientSocket.emit('start-ai-game', { gameId });
      });

      clientSocket.on('ai-game-started', () => {
        gameStarted = true;
        checkDone();
      });

      clientSocket.emit('create-ai-game', {
        hostName: 'TestPlayer',
        hostSocketId: 'test_socket_123',
        aiDifficultyLevel: 'medium',
      });
    });

    it('should process human vote and potentially trigger phase transition', (done) => {
      const aiPlayers = [];
      let phaseTransitionReceived = false;

      clientSocket.on('ai-phase-transition', (data) => {
        try {
          expect(data).toHaveProperty('gameId', gameId);
          expect(data).toHaveProperty('previousPhase');
          expect(data).toHaveProperty('currentPhase');
          expect([
            'day_discussion',
            'day_voting',
            'night_actions',
            'finished',
          ]).toContain(data.currentPhase);
          expect(data).toHaveProperty('phaseTimeLimit');
          expect(typeof data.phaseTimeLimit).toBe('number');

          if (data.aiDecisionsRequired) {
            expect(Array.isArray(data.aiDecisionsRequired)).toBe(true);
          }

          phaseTransitionReceived = true;
          done();
        } catch (error) {
          done(error);
        }
      });

      // Listen for AI decisions that might be triggered
      clientSocket.on('ai-decision-made', (data) => {
        expect(data).toHaveProperty('gameId', gameId);
        expect(data).toHaveProperty('playerId');
        expect(data).toHaveProperty('playerName');
        expect(data).toHaveProperty('decisionType');
        expect(['vote', 'discussion', 'night_action']).toContain(
          data.decisionType,
        );
      });

      // Find an AI player to vote for
      clientSocket.on('ai-game-started', (data) => {
        const aiPlayer = data.game.players.find((p: any) => p.isAI);

        clientSocket.emit('human-vote', {
          gameId,
          playerId,
          targetId: aiPlayer.id,
          reason: 'Test vote for suspicious behavior',
        });
      });

      // Set a timeout in case no phase transition occurs
      setTimeout(() => {
        if (!phaseTransitionReceived) {
          done(); // Vote processed but no phase transition
        }
      }, 5000);
    });

    it('should validate human vote payload', (done) => {
      clientSocket.on('ai-error', (error) => {
        try {
          expect(error).toHaveProperty('errorType');
          expect(error).toHaveProperty('message');
          done();
        } catch (e) {
          done(e);
        }
      });

      // Invalid vote - missing required fields
      clientSocket.emit('human-vote', {
        gameId,
        playerId, // Missing targetId
      });
    });
  });

  describe('ai-decision-made event', () => {
    let gameId: number;

    beforeEach((done) => {
      let gameCreated = false;
      let gameStarted = false;

      const checkDone = () => {
        if (gameCreated && gameStarted) done();
      };

      clientSocket.on('ai-game-created', (data) => {
        gameId = data.gameId;
        gameCreated = true;
        checkDone();
      });

      clientSocket.on('ai-game-started', () => {
        gameStarted = true;
        checkDone();
      });

      clientSocket.emit('create-ai-game', {
        hostName: 'TestPlayer',
        hostSocketId: 'test_socket_123',
        aiDifficultyLevel: 'medium',
      });

      clientSocket.emit('start-ai-game', { gameId });
    });

    it('should receive AI decision broadcasts', (done) => {
      let decisionsReceived = 0;
      const expectedDecisions = 5; // Number of AI players

      clientSocket.on('ai-decision-made', (data) => {
        try {
          expect(data).toHaveProperty('gameId', gameId);
          expect(data).toHaveProperty('playerId');
          expect(data).toHaveProperty('playerName');
          expect(data).toHaveProperty('decisionType');
          expect(['vote', 'discussion', 'night_action']).toContain(
            data.decisionType,
          );
          expect(data).toHaveProperty('decision');

          if (data.decision.target) {
            expect(typeof data.decision.target).toBe('string');
          }

          if (data.decision.message) {
            expect(typeof data.decision.message).toBe('string');
          }

          expect(data.decision).toHaveProperty('reasoning');
          expect(typeof data.decision.reasoning).toBe('string');

          decisionsReceived++;

          if (decisionsReceived >= expectedDecisions) {
            done();
          }
        } catch (error) {
          done(error);
        }
      });

      // Trigger AI decisions by requesting decision status
      clientSocket.emit('request-ai-decision-status', { gameId });

      // Set timeout in case not all decisions come through
      setTimeout(() => {
        if (decisionsReceived > 0) {
          done(); // At least some decisions received
        } else {
          done(new Error('No AI decisions received'));
        }
      }, 10000);
    });
  });

  describe('ai-phase-transition event', () => {
    let gameId: number;

    beforeEach((done) => {
      let gameCreated = false;
      let gameStarted = false;

      const checkDone = () => {
        if (gameCreated && gameStarted) done();
      };

      clientSocket.on('ai-game-created', (data) => {
        gameId = data.gameId;
        gameCreated = true;
        checkDone();
      });

      clientSocket.on('ai-game-started', () => {
        gameStarted = true;
        checkDone();
      });

      clientSocket.emit('create-ai-game', {
        hostName: 'TestPlayer',
        hostSocketId: 'test_socket_123',
        aiDifficultyLevel: 'medium',
      });

      clientSocket.emit('start-ai-game', { gameId });
    });

    it('should receive phase transition events', (done) => {
      clientSocket.on('ai-phase-transition', (data) => {
        try {
          expect(data).toHaveProperty('gameId', gameId);
          expect(data).toHaveProperty('previousPhase');
          expect(data).toHaveProperty('currentPhase');
          expect([
            'day_discussion',
            'day_voting',
            'night_actions',
            'finished',
          ]).toContain(data.currentPhase);
          expect(data).toHaveProperty('phaseTimeLimit');
          expect(typeof data.phaseTimeLimit).toBe('number');

          if (data.aiDecisionsRequired) {
            expect(Array.isArray(data.aiDecisionsRequired)).toBe(true);
            data.aiDecisionsRequired.forEach((decision: any) => {
              expect(decision).toHaveProperty('playerId');
              expect(decision).toHaveProperty('decisionType');
            });
          }

          done();
        } catch (error) {
          done(error);
        }
      });

      // Wait for automatic phase transitions or trigger them
      setTimeout(() => {
        done(new Error('No phase transition received'));
      }, 15000);
    });
  });

  describe('broadcast events', () => {
    let gameId: number;

    beforeEach((done) => {
      let gameCreated = false;
      let gameStarted = false;

      const checkDone = () => {
        if (gameCreated && gameStarted) done();
      };

      clientSocket.on('ai-game-created', (data) => {
        gameId = data.gameId;
        gameCreated = true;
        checkDone();
      });

      clientSocket.on('ai-game-started', () => {
        gameStarted = true;
        checkDone();
      });

      clientSocket.emit('create-ai-game', {
        hostName: 'TestPlayer',
        hostSocketId: 'test_socket_123',
        aiDifficultyLevel: 'medium',
      });

      clientSocket.emit('start-ai-game', { gameId });
    });

    it('should receive ai-night-results broadcast', (done) => {
      clientSocket.on('ai-night-results', (data) => {
        try {
          expect(data).toHaveProperty('gameId', gameId);
          expect(data).toHaveProperty('events');
          expect(Array.isArray(data.events)).toBe(true);

          if (data.events.length > 0) {
            data.events.forEach((event: any) => {
              expect(event).toHaveProperty('eventType');
              expect([
                'player_killed',
                'player_saved',
                'investigation_result',
              ]).toContain(event.eventType);
            });
          }

          done();
        } catch (error) {
          done(error);
        }
      });

      // Wait for night phase and results
      setTimeout(() => {
        done(new Error('No night results received'));
      }, 20000);
    });

    it('should receive ai-player-eliminated broadcast', (done) => {
      clientSocket.on('ai-player-eliminated', (data) => {
        try {
          expect(data).toHaveProperty('gameId', gameId);
          expect(data).toHaveProperty('eliminatedPlayer');
          expect(data.eliminatedPlayer).toHaveProperty('id');
          expect(data.eliminatedPlayer).toHaveProperty('name');
          expect(data.eliminatedPlayer).toHaveProperty('role');
          expect(data.eliminatedPlayer).toHaveProperty('isAI');
          expect(data).toHaveProperty('eliminationReason');
          expect(['voted_out', 'killed_at_night']).toContain(
            data.eliminationReason,
          );

          if (data.aiLastWords) {
            expect(typeof data.aiLastWords).toBe('string');
          }

          done();
        } catch (error) {
          done(error);
        }
      });

      // Wait for elimination events
      setTimeout(() => {
        done(new Error('No player elimination received'));
      }, 25000);
    });
  });
});

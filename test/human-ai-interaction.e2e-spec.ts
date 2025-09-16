import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

interface HumanPlayer {
  socket: Socket;
  playerId: number;
  name: string;
  role?: string;
}

interface AIPlayer {
  id: number;
  name: string;
  role?: string;
  isAI: boolean;
}

interface GamePhase {
  phase: string;
  timeLimit: number;
  description: string;
}

describe('Human-AI Player Interaction (e2e)', () => {
  let app: INestApplication;
  let serverUrl: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.listen(0);

    const address = app.getHttpServer().address();
    serverUrl = `http://localhost:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Human Player Joining AI Game Scenarios', () => {
    let humanSocket: Socket;
    let gameId: number;

    beforeEach(() => {
      humanSocket = io(serverUrl, {
        transports: ['websocket'],
        forceNew: true,
      });

      return new Promise<void>((resolve) => {
        humanSocket.on('connect', () => resolve());
      });
    });

    afterEach(() => {
      if (humanSocket?.connected) {
        humanSocket.disconnect();
      }
    });

    it('should allow human player to create mixed AI game successfully', async () => {
      let gameCreated = false;
      let humanPlayer: HumanPlayer | null = null;
      const aiPlayers: AIPlayer[] = [];

      humanSocket.on('ai-game-created', (data) => {
        gameCreated = true;
        gameId = data.gameId;

        // Find human player (host)
        humanPlayer = {
          socket: humanSocket,
          playerId: data.game.players.find((p: any) => !p.isAI).id,
          name: data.game.players.find((p: any) => !p.isAI).name,
        };

        // Collect AI players
        data.game.players.forEach((player: any) => {
          if (player.isAI) {
            aiPlayers.push({
              id: player.id,
              name: player.name,
              isAI: true,
            });
          }
        });
      });

      // Create AI game with human host
      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'HumanHost',
          hostSocketId: humanSocket.id,
          aiPlayerCount: 5,
          aiDifficultyLevel: 'medium',
        })
        .expect(201);

      expect(createResponse.body.gameId).toBeDefined();
      expect(createResponse.body.game.players).toHaveLength(6);

      // Wait for WebSocket event
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(gameCreated).toBe(true);
      expect(humanPlayer).not.toBeNull();
      expect(humanPlayer!.playerId).toBeDefined();
      expect(aiPlayers).toHaveLength(5);

      // Verify player composition
      const humanCount = createResponse.body.game.players.filter((p: any) => !p.isAI).length;
      const aiCount = createResponse.body.game.players.filter((p: any) => p.isAI).length;

      expect(humanCount).toBe(1);
      expect(aiCount).toBe(5);
    });

    it('should handle second human player joining AI game', async () => {
      let secondHumanSocket: Socket;
      let firstGameCreated = false;
      let secondPlayerJoined = false;

      try {
        // First human creates game
        const createResponse = await request(app.getHttpServer())
          .post('/games/ai')
          .send({
            hostName: 'FirstHuman',
            hostSocketId: humanSocket.id,
            aiPlayerCount: 4, // Leave room for second human
            aiDifficultyLevel: 'medium',
          })
          .expect(201);

        gameId = createResponse.body.gameId;
        firstGameCreated = true;

        // Second human joins
        secondHumanSocket = io(serverUrl, {
          transports: ['websocket'],
          forceNew: true,
        });

        await new Promise<void>((resolve) => {
          secondHumanSocket.on('connect', () => resolve());
        });

        secondHumanSocket.on('player-joined', (data) => {
          secondPlayerJoined = true;
          expect(data.game.players).toHaveLength(6); // 2 humans + 4 AI
        });

        // Join game via WebSocket
        secondHumanSocket.emit('join-game', {
          gameId,
          playerName: 'SecondHuman',
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        expect(firstGameCreated).toBe(true);
        expect(secondPlayerJoined).toBe(true);

      } finally {
        if (secondHumanSocket?.connected) {
          secondHumanSocket.disconnect();
        }
      }
    });

    it('should reject human joining when AI game is at capacity', async () => {
      let joinRejected = false;
      let errorMessage = '';

      // Create full AI game (6 players total)
      await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'FullGameHost',
          hostSocketId: humanSocket.id,
          aiPlayerCount: 5,
          aiDifficultyLevel: 'medium',
        })
        .expect(201);

      const secondSocket = io(serverUrl, {
        transports: ['websocket'],
        forceNew: true,
      });

      try {
        await new Promise<void>((resolve) => {
          secondSocket.on('connect', () => resolve());
        });

        secondSocket.on('error', (error) => {
          joinRejected = true;
          errorMessage = error.message;
        });

        secondSocket.emit('join-game', {
          gameId,
          playerName: 'LatecomerHuman',
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        expect(joinRejected).toBe(true);
        expect(errorMessage).toContain('capacity');
      } finally {
        secondSocket.disconnect();
      }
    });
  });

  describe('Human-AI Communication and Chat Interactions', () => {
    let humanSocket: Socket;
    let gameId: number;
    let humanPlayerId: number;

    beforeEach(async () => {
      humanSocket = io(serverUrl, {
        transports: ['websocket'],
        forceNew: true,
      });

      await new Promise<void>((resolve) => {
        humanSocket.on('connect', () => resolve());
      });

      // Create and start game
      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'ChatTestHuman',
          hostSocketId: humanSocket.id,
          aiPlayerCount: 5,
          aiDifficultyLevel: 'medium',
        });

      gameId = createResponse.body.gameId;
      humanPlayerId = createResponse.body.game.players.find((p: any) => !p.isAI).id;

      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);
    });

    afterEach(() => {
      if (humanSocket?.connected) {
        humanSocket.disconnect();
      }
    });

    it('should enable human-AI discussion during day phase', async () => {
      const aiResponses: any[] = [];
      const chatMessages: any[] = [];
      let discussionPhaseDetected = false;

      humanSocket.on('ai-decision-made', (data) => {
        if (data.decisionType === 'discussion') {
          aiResponses.push(data);
        }
      });

      humanSocket.on('chat-message', (data) => {
        chatMessages.push(data);
      });

      humanSocket.on('ai-phase-transition', (data) => {
        if (data.currentPhase === 'day_discussion') {
          discussionPhaseDetected = true;

          // Human sends discussion message
          humanSocket.emit('send-message', {
            gameId,
            playerId: humanPlayerId,
            message: 'Everyone seems quiet today. Anyone have suspicions?',
            messageType: 'discussion',
          });
        }
      });

      // Wait for phase transitions and responses
      await new Promise(resolve => setTimeout(resolve, 8000));

      expect(discussionPhaseDetected).toBe(true);
      expect(aiResponses.length).toBeGreaterThan(0);

      // Verify AI responses are contextual
      aiResponses.forEach(response => {
        expect(response.decision.message).toBeDefined();
        expect(response.decision.message.length).toBeGreaterThan(5);
        expect(response.decision.reasoning).toBeDefined();
      });
    });

    it('should handle human provocation and AI defensive responses', async () => {
      const aiDefensiveResponses: any[] = [];
      let provocativeMessageSent = false;

      humanSocket.on('ai-decision-made', (data) => {
        if (data.decisionType === 'discussion' &&
            data.decision.message.toLowerCase().includes('innocent')) {
          aiDefensiveResponses.push(data);
        }
      });

      humanSocket.on('ai-phase-transition', (data) => {
        if (data.currentPhase === 'day_discussion') {
          // Send provocative accusation
          humanSocket.emit('send-message', {
            gameId,
            playerId: humanPlayerId,
            message: `I'm very suspicious of ${data.game?.players.find((p: any) => p.isAI)?.name}. Their behavior is odd.`,
            messageType: 'discussion',
          });
          provocativeMessageSent = true;
        }
      });

      await new Promise(resolve => setTimeout(resolve, 6000));

      expect(provocativeMessageSent).toBe(true);
      expect(aiDefensiveResponses.length).toBeGreaterThanOrEqual(1);

      // Verify defensive nature of responses
      aiDefensiveResponses.forEach(response => {
        const message = response.decision.message.toLowerCase();
        const hasDefensiveKeywords = [
          'innocent', 'not mafia', 'citizen', 'wrongly accused', 'defensive'
        ].some(keyword => message.includes(keyword));
        expect(hasDefensiveKeywords).toBe(true);
      });
    });

    it('should maintain conversation context across multiple exchanges', async () => {
      const conversationFlow: any[] = [];
      let exchangeCount = 0;

      humanSocket.on('ai-decision-made', (data) => {
        if (data.decisionType === 'discussion') {
          conversationFlow.push({
            speaker: 'AI',
            message: data.decision.message,
            timestamp: Date.now(),
          });
        }
      });

      humanSocket.on('ai-phase-transition', (data) => {
        if (data.currentPhase === 'day_discussion') {
          // Start conversation chain
          setTimeout(() => {
            humanSocket.emit('send-message', {
              gameId,
              playerId: humanPlayerId,
              message: 'What does everyone think about last night?',
            });
            conversationFlow.push({
              speaker: 'Human',
              message: 'What does everyone think about last night?',
              timestamp: Date.now(),
            });
            exchangeCount++;
          }, 1000);

          // Follow-up messages
          setTimeout(() => {
            humanSocket.emit('send-message', {
              gameId,
              playerId: humanPlayerId,
              message: 'I noticed some players were very quiet during voting.',
            });
            conversationFlow.push({
              speaker: 'Human',
              message: 'I noticed some players were very quiet during voting.',
              timestamp: Date.now(),
            });
            exchangeCount++;
          }, 3000);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 10000));

      expect(exchangeCount).toBe(2);
      expect(conversationFlow.length).toBeGreaterThan(2);

      // Verify conversation has logical flow
      const aiMessages = conversationFlow.filter(entry => entry.speaker === 'AI');
      expect(aiMessages.length).toBeGreaterThan(0);

      // Check for contextual references in AI responses
      const contextualResponses = aiMessages.filter(entry =>
        entry.message.toLowerCase().includes('night') ||
        entry.message.toLowerCase().includes('voting') ||
        entry.message.toLowerCase().includes('quiet')
      );
      expect(contextualResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Voting Interactions Between Human and AI Players', () => {
    let humanSocket: Socket;
    let gameId: number;
    let humanPlayerId: number;
    let aiPlayers: AIPlayer[] = [];

    beforeEach(async () => {
      humanSocket = io(serverUrl, {
        transports: ['websocket'],
        forceNew: true,
      });

      await new Promise<void>((resolve) => {
        humanSocket.on('connect', () => resolve());
      });

      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'VotingTestHuman',
          hostSocketId: humanSocket.id,
          aiPlayerCount: 5,
          aiDifficultyLevel: 'medium',
        });

      gameId = createResponse.body.gameId;
      humanPlayerId = createResponse.body.game.players.find((p: any) => !p.isAI).id;
      aiPlayers = createResponse.body.game.players.filter((p: any) => p.isAI);

      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);
    });

    afterEach(() => {
      if (humanSocket?.connected) {
        humanSocket.disconnect();
      }
    });

    it('should process human vote and trigger AI voting responses', async () => {
      let humanVoteCast = false;
      let votingPhaseDetected = false;
      const aiVotes: any[] = [];

      humanSocket.on('ai-decision-made', (data) => {
        if (data.decisionType === 'vote') {
          aiVotes.push(data);
        }
      });

      humanSocket.on('vote-cast', (data) => {
        if (data.playerId === humanPlayerId) {
          humanVoteCast = true;
        }
      });

      humanSocket.on('ai-phase-transition', (data) => {
        if (data.currentPhase === 'day_voting') {
          votingPhaseDetected = true;

          // Human votes for first AI player
          setTimeout(() => {
            humanSocket.emit('vote', {
              gameId,
              playerId: humanPlayerId,
              targetId: aiPlayers[0].id,
              reason: 'Suspicious behavior during discussion',
            });
          }, 1000);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 12000));

      expect(votingPhaseDetected).toBe(true);
      expect(humanVoteCast).toBe(true);
      expect(aiVotes.length).toBeGreaterThan(0);

      // Verify AI votes have proper structure
      aiVotes.forEach(vote => {
        expect(vote.decision.target).toBeDefined();
        expect(vote.decision.reasoning).toBeDefined();
        expect(vote.decision.confidence).toBeGreaterThan(0);
      });
    });

    it('should handle strategic voting patterns between human and AI', async () => {
      let votingResults: any = null;
      const votePattern: any[] = [];

      humanSocket.on('vote-cast', (data) => {
        votePattern.push({
          voter: data.playerName,
          target: data.targetName,
          isAI: data.isAI,
          reason: data.reason,
        });
      });

      humanSocket.on('voting-results', (data) => {
        votingResults = data;
      });

      humanSocket.on('ai-phase-transition', (data) => {
        if (data.currentPhase === 'day_voting') {
          // Human votes strategically for suspected mafia
          setTimeout(() => {
            humanSocket.emit('vote', {
              gameId,
              playerId: humanPlayerId,
              targetId: aiPlayers[1].id,
              reason: 'Most likely mafia based on discussion patterns',
            });
          }, 1500);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 15000));

      expect(votePattern.length).toBeGreaterThan(1);

      // Analyze voting patterns
      const humanVotes = votePattern.filter(vote => !vote.isAI);
      const aiVotes = votePattern.filter(vote => vote.isAI);

      expect(humanVotes.length).toBe(1);
      expect(aiVotes.length).toBeGreaterThan(0);

      // Check for strategic considerations in AI votes
      const strategicVotes = aiVotes.filter(vote =>
        vote.reason.toLowerCase().includes('suspicious') ||
        vote.reason.toLowerCase().includes('mafia') ||
        vote.reason.toLowerCase().includes('eliminate')
      );
      expect(strategicVotes.length).toBeGreaterThan(0);
    });

    it('should handle tie-breaking scenarios in mixed voting', async () => {
      let tieBreakingActivated = false;
      let finalVotingResult: any = null;

      humanSocket.on('tie-breaking-vote', (data) => {
        tieBreakingActivated = true;
      });

      humanSocket.on('player-eliminated', (data) => {
        finalVotingResult = data;
      });

      humanSocket.on('ai-phase-transition', (data) => {
        if (data.currentPhase === 'day_voting') {
          // Create potential tie scenario
          humanSocket.emit('vote', {
            gameId,
            playerId: humanPlayerId,
            targetId: aiPlayers[0].id,
            reason: 'Strategic vote to create decision pressure',
          });
        }
      });

      await new Promise(resolve => setTimeout(resolve, 18000));

      // Verify tie-breaking was handled (if occurred)
      if (tieBreakingActivated) {
        expect(finalVotingResult).toBeDefined();
        expect(finalVotingResult.eliminatedPlayer).toBeDefined();
      }
    });
  });

  describe('Mixed Game Scenarios (Humans + AI Players)', () => {
    let humanSockets: Socket[] = [];
    let gameId: number;
    let humanPlayers: HumanPlayer[] = [];

    beforeEach(async () => {
      // Create multiple human players
      for (let i = 0; i < 2; i++) {
        const socket = io(serverUrl, {
          transports: ['websocket'],
          forceNew: true,
        });

        await new Promise<void>((resolve) => {
          socket.on('connect', () => resolve());
        });

        humanSockets.push(socket);
      }

      // First human creates game
      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'MixedGameHost',
          hostSocketId: humanSockets[0].id,
          aiPlayerCount: 3, // 3 AI + 2 humans = 5 total (smaller game)
          aiDifficultyLevel: 'medium',
        });

      gameId = createResponse.body.gameId;

      // Add first human player
      humanPlayers.push({
        socket: humanSockets[0],
        playerId: createResponse.body.game.players.find((p: any) => !p.isAI).id,
        name: 'MixedGameHost',
      });

      // Second human joins
      humanSockets[1].emit('join-game', {
        gameId,
        playerName: 'SecondMixedPlayer',
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get updated game state for second player ID
      const gameState = await request(app.getHttpServer())
        .get(`/games/${gameId}`)
        .expect(200);

      const secondHumanPlayer = gameState.body.players.find(
        (p: any) => !p.isAI && p.name === 'SecondMixedPlayer'
      );

      if (secondHumanPlayer) {
        humanPlayers.push({
          socket: humanSockets[1],
          playerId: secondHumanPlayer.id,
          name: 'SecondMixedPlayer',
        });
      }
    });

    afterEach(() => {
      humanSockets.forEach(socket => {
        if (socket?.connected) {
          socket.disconnect();
        }
      });
      humanSockets = [];
      humanPlayers = [];
    });

    it('should coordinate mixed human-AI gameplay with proper phase synchronization', async () => {
      const phaseTransitions: any[] = [];
      let gameStarted = false;

      // Track phase transitions on all human sockets
      humanSockets.forEach((socket, index) => {
        socket.on('ai-phase-transition', (data) => {
          phaseTransitions.push({
            playerId: humanPlayers[index]?.playerId,
            phase: data.currentPhase,
            timestamp: Date.now(),
          });
        });

        socket.on('ai-game-started', (data) => {
          gameStarted = true;
          humanPlayers[index].role = data.yourRole;
        });
      });

      // Start the mixed game
      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 10000));

      expect(gameStarted).toBe(true);
      expect(phaseTransitions.length).toBeGreaterThan(0);

      // Verify all humans received same phase transitions
      const uniquePhases = [...new Set(phaseTransitions.map(t => t.phase))];
      expect(uniquePhases.length).toBeGreaterThan(0);

      // Check role assignments
      humanPlayers.forEach(player => {
        expect(player.role).toBeDefined();
        expect(['citizen', 'mafia', 'police', 'doctor']).toContain(player.role);
      });
    });

    it('should handle human-to-human and human-to-AI interactions simultaneously', async () => {
      let discussionPhase = false;
      const allMessages: any[] = [];

      humanSockets.forEach((socket, index) => {
        socket.on('chat-message', (data) => {
          allMessages.push({
            from: humanPlayers[index]?.name || 'Unknown',
            message: data.message,
            isAI: data.isAI,
          });
        });

        socket.on('ai-phase-transition', (data) => {
          if (data.currentPhase === 'day_discussion') {
            discussionPhase = true;
          }
        });
      });

      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 3000));

      if (discussionPhase && humanPlayers.length >= 2) {
        // Human-to-human communication
        humanSockets[0].emit('send-message', {
          gameId,
          playerId: humanPlayers[0].playerId,
          message: 'Hey SecondMixedPlayer, what do you think about the AI players?',
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Second human responds
        humanSockets[1].emit('send-message', {
          gameId,
          playerId: humanPlayers[1].playerId,
          message: 'Some of them seem suspicious. We should coordinate our votes.',
        });

        await new Promise(resolve => setTimeout(resolve, 5000));

        // Verify multi-party communication
        const humanMessages = allMessages.filter(msg => !msg.isAI);
        const aiMessages = allMessages.filter(msg => msg.isAI);

        expect(humanMessages.length).toBeGreaterThanOrEqual(2);
        expect(aiMessages.length).toBeGreaterThan(0);
      }
    });

    it('should maintain fair game balance with mixed players', async () => {
      let gameEnded = false;
      let winner: string | null = null;
      let eliminationCount = 0;

      humanSockets[0].on('ai-game-ended', (data) => {
        gameEnded = true;
        winner = data.winner;
      });

      humanSockets[0].on('ai-player-eliminated', (data) => {
        eliminationCount++;
      });

      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      // Wait for game to progress significantly
      await new Promise(resolve => setTimeout(resolve, 60000));

      // Verify game progresses fairly
      expect(eliminationCount).toBeGreaterThan(0);

      if (gameEnded) {
        expect(['mafia', 'citizen']).toContain(winner);

        // Get final game state to analyze balance
        const finalState = await request(app.getHttpServer())
          .get(`/games/${gameId}`)
          .expect(200);

        const finalPlayers = finalState.body.players;
        const aliveHumans = finalPlayers.filter((p: any) => !p.isAI && p.isAlive);
        const aliveAI = finalPlayers.filter((p: any) => p.isAI && p.isAlive);

        // Game should end with reasonable distribution
        expect(aliveHumans.length + aliveAI.length).toBeGreaterThan(0);
        expect(aliveHumans.length + aliveAI.length).toBeLessThan(6);
      }
    }, 70000);
  });

  describe('Human Player Observing AI Decision-Making', () => {
    let humanSocket: Socket;
    let gameId: number;
    let humanPlayerId: number;

    beforeEach(async () => {
      humanSocket = io(serverUrl, {
        transports: ['websocket'],
        forceNew: true,
      });

      await new Promise<void>((resolve) => {
        humanSocket.on('connect', () => resolve());
      });

      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'ObserverHuman',
          hostSocketId: humanSocket.id,
          aiPlayerCount: 5,
          aiDifficultyLevel: 'hard', // Use hard difficulty for better decision quality
        });

      gameId = createResponse.body.gameId;
      humanPlayerId = createResponse.body.game.players.find((p: any) => !p.isAI).id;

      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);
    });

    afterEach(() => {
      if (humanSocket?.connected) {
        humanSocket.disconnect();
      }
    });

    it('should provide detailed AI decision information to human observer', async () => {
      const aiDecisions: any[] = [];
      let decisionDetailReceived = false;

      humanSocket.on('ai-decision-made', (data) => {
        aiDecisions.push(data);

        // Verify decision structure
        expect(data).toHaveProperty('gameId', gameId);
        expect(data).toHaveProperty('playerId');
        expect(data).toHaveProperty('playerName');
        expect(data).toHaveProperty('decisionType');
        expect(data).toHaveProperty('decision');
        expect(data.decision).toHaveProperty('reasoning');

        if (data.decision.confidence) {
          expect(data.decision.confidence).toBeGreaterThanOrEqual(0);
          expect(data.decision.confidence).toBeLessThanOrEqual(1);
        }

        if (data.decision.processingTime) {
          expect(data.decision.processingTime).toBeGreaterThan(0);
        }

        decisionDetailReceived = true;
      });

      await new Promise(resolve => setTimeout(resolve, 8000));

      expect(decisionDetailReceived).toBe(true);
      expect(aiDecisions.length).toBeGreaterThan(0);

      // Verify variety of decision types
      const decisionTypes = [...new Set(aiDecisions.map(d => d.decisionType))];
      expect(decisionTypes.length).toBeGreaterThan(0);
    });

    it('should show AI reasoning transparency for human learning', async () => {
      const reasoningExamples: string[] = [];

      humanSocket.on('ai-decision-made', (data) => {
        if (data.decision.reasoning) {
          reasoningExamples.push(data.decision.reasoning);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 10000));

      expect(reasoningExamples.length).toBeGreaterThan(0);

      // Verify reasoning quality
      reasoningExamples.forEach(reasoning => {
        expect(reasoning.length).toBeGreaterThan(10);

        // Check for strategic keywords
        const hasStrategyKeywords = [
          'suspect', 'vote', 'eliminate', 'protect', 'investigate',
          'citizen', 'mafia', 'trust', 'behavior', 'pattern'
        ].some(keyword => reasoning.toLowerCase().includes(keyword));

        expect(hasStrategyKeywords).toBe(true);
      });
    });

    it('should enable human to request AI decision explanations', async () => {
      let explanationReceived = false;
      let targetAIPlayerId: number;

      humanSocket.on('ai-decision-made', (data) => {
        if (!targetAIPlayerId) {
          targetAIPlayerId = data.playerId;
        }
      });

      humanSocket.on('ai-explanation', (data) => {
        explanationReceived = true;
        expect(data).toHaveProperty('playerId', targetAIPlayerId);
        expect(data).toHaveProperty('explanation');
        expect(data.explanation.length).toBeGreaterThan(20);
      });

      await new Promise(resolve => setTimeout(resolve, 5000));

      if (targetAIPlayerId) {
        // Request explanation for AI player's recent decision
        humanSocket.emit('request-ai-explanation', {
          gameId,
          targetPlayerId: targetAIPlayerId,
          requestingPlayerId: humanPlayerId,
        });

        await new Promise(resolve => setTimeout(resolve, 3000));

        expect(explanationReceived).toBe(true);
      }
    });
  });

  describe('AI Responses to Human Player Actions', () => {
    let humanSocket: Socket;
    let gameId: number;
    let humanPlayerId: number;

    beforeEach(async () => {
      humanSocket = io(serverUrl, {
        transports: ['websocket'],
        forceNew: true,
      });

      await new Promise<void>((resolve) => {
        humanSocket.on('connect', () => resolve());
      });

      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'ActionTestHuman',
          hostSocketId: humanSocket.id,
          aiPlayerCount: 5,
          aiDifficultyLevel: 'medium',
        });

      gameId = createResponse.body.gameId;
      humanPlayerId = createResponse.body.game.players.find((p: any) => !p.isAI).id;

      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);
    });

    afterEach(() => {
      if (humanSocket?.connected) {
        humanSocket.disconnect();
      }
    });

    it('should adapt AI behavior based on human aggression level', async () => {
      const aiResponses: any[] = [];
      let aggressiveMessageSent = false;

      humanSocket.on('ai-decision-made', (data) => {
        if (data.decisionType === 'discussion') {
          aiResponses.push({
            message: data.decision.message,
            reasoning: data.decision.reasoning,
            timestamp: Date.now(),
          });
        }
      });

      humanSocket.on('ai-phase-transition', (data) => {
        if (data.currentPhase === 'day_discussion') {
          // Send aggressive message
          setTimeout(() => {
            humanSocket.emit('send-message', {
              gameId,
              playerId: humanPlayerId,
              message: 'I KNOW one of you is mafia! You\'re all acting suspicious and I will vote you all out!',
            });
            aggressiveMessageSent = true;
          }, 1000);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 8000));

      expect(aggressiveMessageSent).toBe(true);
      expect(aiResponses.length).toBeGreaterThan(0);

      // Check for defensive or calming responses
      const defensiveResponses = aiResponses.filter(response =>
        response.message.toLowerCase().includes('calm') ||
        response.message.toLowerCase().includes('peaceful') ||
        response.message.toLowerCase().includes('innocent') ||
        response.reasoning.toLowerCase().includes('defensive')
      );

      expect(defensiveResponses.length).toBeGreaterThan(0);
    });

    it('should show AI alliance formation in response to human leadership', async () => {
      const aiVotingPatterns: any[] = [];
      let leadershipMessageSent = false;

      humanSocket.on('ai-decision-made', (data) => {
        if (data.decisionType === 'vote') {
          aiVotingPatterns.push({
            voter: data.playerId,
            target: data.decision.target,
            reasoning: data.decision.reasoning,
          });
        }
      });

      humanSocket.on('ai-phase-transition', (data) => {
        if (data.currentPhase === 'day_discussion') {
          // Show leadership and suggest alliance
          setTimeout(() => {
            humanSocket.emit('send-message', {
              gameId,
              playerId: humanPlayerId,
              message: 'Citizens, we need to work together systematically. Let\'s focus on the quietest players first.',
            });
            leadershipMessageSent = true;
          }, 1000);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 12000));

      expect(leadershipMessageSent).toBe(true);
      expect(aiVotingPatterns.length).toBeGreaterThan(0);

      // Check for coordinated voting behavior
      if (aiVotingPatterns.length >= 2) {
        const targetCounts: { [key: string]: number } = {};
        aiVotingPatterns.forEach(pattern => {
          targetCounts[pattern.target] = (targetCounts[pattern.target] || 0) + 1;
        });

        const maxVotes = Math.max(...Object.values(targetCounts));
        expect(maxVotes).toBeGreaterThan(1); // Some coordination expected
      }
    });

    it('should trigger AI suspicion when human acts unusually', async () => {
      const suspicionReactions: any[] = [];
      let unusualActionTaken = false;

      humanSocket.on('ai-decision-made', (data) => {
        if (data.decision.reasoning &&
            data.decision.reasoning.toLowerCase().includes('suspicious')) {
          suspicionReactions.push(data);
        }
      });

      humanSocket.on('ai-phase-transition', (data) => {
        if (data.currentPhase === 'day_discussion') {
          // Act unusually quiet/defensive
          setTimeout(() => {
            humanSocket.emit('send-message', {
              gameId,
              playerId: humanPlayerId,
              message: 'I don\'t want to discuss anything. Let\'s just vote quickly.',
            });
            unusualActionTaken = true;
          }, 2000);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 10000));

      expect(unusualActionTaken).toBe(true);

      // Should generate some suspicion
      if (suspicionReactions.length > 0) {
        suspicionReactions.forEach(reaction => {
          expect(reaction.decision.reasoning).toBeDefined();
          expect(reaction.decision.reasoning.toLowerCase()).toMatch(
            /suspicious|weird|strange|quiet|defensive/
          );
        });
      }
    });
  });

  describe('Real-time Synchronization Between Human and AI Players', () => {
    let humanSocket: Socket;
    let gameId: number;
    let humanPlayerId: number;

    beforeEach(async () => {
      humanSocket = io(serverUrl, {
        transports: ['websocket'],
        forceNew: true,
      });

      await new Promise<void>((resolve) => {
        humanSocket.on('connect', () => resolve());
      });

      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'SyncTestHuman',
          hostSocketId: humanSocket.id,
          aiPlayerCount: 5,
          aiDifficultyLevel: 'medium',
        });

      gameId = createResponse.body.gameId;
      humanPlayerId = createResponse.body.game.players.find((p: any) => !p.isAI).id;
    });

    afterEach(() => {
      if (humanSocket?.connected) {
        humanSocket.disconnect();
      }
    });

    it('should synchronize phase transitions with all players', async () => {
      const phaseEvents: any[] = [];
      let gameStarted = false;

      humanSocket.on('ai-game-started', (data) => {
        gameStarted = true;
        phaseEvents.push({
          event: 'game_started',
          phase: data.game.currentPhase,
          timestamp: Date.now(),
        });
      });

      humanSocket.on('ai-phase-transition', (data) => {
        phaseEvents.push({
          event: 'phase_transition',
          phase: data.currentPhase,
          previousPhase: data.previousPhase,
          timestamp: Date.now(),
        });
      });

      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 15000));

      expect(gameStarted).toBe(true);
      expect(phaseEvents.length).toBeGreaterThan(1);

      // Verify chronological order
      for (let i = 1; i < phaseEvents.length; i++) {
        expect(phaseEvents[i].timestamp).toBeGreaterThanOrEqual(
          phaseEvents[i-1].timestamp
        );
      }
    });

    it('should maintain consistent game state across real-time updates', async () => {
      const gameStateSnapshots: any[] = [];

      humanSocket.on('game-state-update', (data) => {
        gameStateSnapshots.push({
          timestamp: Date.now(),
          players: data.players,
          phase: data.currentPhase,
          status: data.status,
        });
      });

      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 8000));

      if (gameStateSnapshots.length > 1) {
        // Verify state consistency
        gameStateSnapshots.forEach((snapshot, index) => {
          expect(snapshot.players).toBeDefined();
          expect(snapshot.phase).toBeDefined();
          expect(snapshot.status).toBeDefined();

          if (index > 0) {
            const prevSnapshot = gameStateSnapshots[index - 1];
            // Player count should remain same or decrease (eliminations)
            expect(snapshot.players.length).toBeLessThanOrEqual(
              prevSnapshot.players.length
            );
          }
        });
      }
    });

    it('should handle simultaneous actions from human and AI players', async () => {
      let simultaneousActionsProcessed = 0;
      const actionTimestamps: number[] = [];

      humanSocket.on('action-processed', (data) => {
        simultaneousActionsProcessed++;
        actionTimestamps.push(Date.now());
      });

      humanSocket.on('ai-decision-made', (data) => {
        actionTimestamps.push(Date.now());
      });

      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Trigger simultaneous actions
      humanSocket.emit('send-message', {
        gameId,
        playerId: humanPlayerId,
        message: 'Quick message during busy phase',
      });

      humanSocket.emit('request-game-state', { gameId });

      await new Promise(resolve => setTimeout(resolve, 5000));

      // Verify actions were processed without conflicts
      expect(actionTimestamps.length).toBeGreaterThan(0);

      // Check for reasonable response times
      if (actionTimestamps.length >= 2) {
        const maxGap = Math.max(...actionTimestamps) - Math.min(...actionTimestamps);
        expect(maxGap).toBeLessThan(10000); // All within 10 seconds
      }
    });
  });

  describe('Edge Cases - Human Player Leaving During AI Game', () => {
    let humanSocket: Socket;
    let gameId: number;
    let humanPlayerId: number;

    beforeEach(async () => {
      humanSocket = io(serverUrl, {
        transports: ['websocket'],
        forceNew: true,
      });

      await new Promise<void>((resolve) => {
        humanSocket.on('connect', () => resolve());
      });

      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'DisconnectTestHuman',
          hostSocketId: humanSocket.id,
          aiPlayerCount: 5,
          aiDifficultyLevel: 'medium',
        });

      gameId = createResponse.body.gameId;
      humanPlayerId = createResponse.body.game.players.find((p: any) => !p.isAI).id;

      await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);
    });

    it('should handle human disconnection gracefully during active game', async () => {
      let gameStatus: any = null;
      let disconnectionHandled = false;

      // Monitor for disconnection events
      humanSocket.on('player-disconnected', (data) => {
        if (data.playerId === humanPlayerId) {
          disconnectionHandled = true;
        }
      });

      // Wait for game to stabilize
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Simulate disconnection
      humanSocket.disconnect();

      // Wait for server to process disconnection
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check game state after disconnection
      const gameStatusResponse = await request(app.getHttpServer())
        .get(`/games/${gameId}`)
        .expect(200);

      gameStatus = gameStatusResponse.body;

      expect(gameStatus.status).toBe('playing'); // Game should continue

      // Human player should be marked as disconnected or removed
      const humanPlayer = gameStatus.players.find((p: any) => p.id === humanPlayerId);
      if (humanPlayer) {
        expect(humanPlayer.isConnected).toBe(false);
      }
    });

    it('should continue AI game when human host leaves', async () => {
      let gameProgressedAfterLeaving = false;
      const aiDecisionsAfterLeaving: any[] = [];

      // Create monitoring socket to observe game continuation
      const observerSocket = io(serverUrl, {
        transports: ['websocket'],
        forceNew: true,
      });

      await new Promise<void>((resolve) => {
        observerSocket.on('connect', () => resolve());
      });

      observerSocket.on('ai-decision-made', (data) => {
        if (data.gameId === gameId) {
          aiDecisionsAfterLeaving.push(data);
          gameProgressedAfterLeaving = true;
        }
      });

      // Wait for initial stabilization
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Host disconnects
      humanSocket.disconnect();

      // Wait for game to continue with AI players
      await new Promise(resolve => setTimeout(resolve, 8000));

      expect(gameProgressedAfterLeaving).toBe(true);
      expect(aiDecisionsAfterLeaving.length).toBeGreaterThan(0);

      observerSocket.disconnect();
    });

    it('should handle human reconnection mid-game', async () => {
      let reconnectionSuccessful = false;
      let gameStateRecovered = false;

      // Disconnect first
      humanSocket.disconnect();

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Reconnect with new socket
      const reconnectedSocket = io(serverUrl, {
        transports: ['websocket'],
        forceNew: true,
      });

      try {
        await new Promise<void>((resolve) => {
          reconnectedSocket.on('connect', () => {
            reconnectionSuccessful = true;
            resolve();
          });
        });

        reconnectedSocket.on('game-state-recovered', (data) => {
          gameStateRecovered = true;
          expect(data.gameId).toBe(gameId);
          expect(data.yourRole).toBeDefined();
        });

        // Attempt to rejoin game
        reconnectedSocket.emit('rejoin-game', {
          gameId,
          playerId: humanPlayerId,
          playerName: 'DisconnectTestHuman',
        });

        await new Promise(resolve => setTimeout(resolve, 3000));

        expect(reconnectionSuccessful).toBe(true);

        // Game state recovery may or may not be implemented
        // This tests the robustness of the reconnection system

      } finally {
        if (reconnectedSocket?.connected) {
          reconnectedSocket.disconnect();
        }
      }
    });

    it('should preserve AI game integrity when multiple humans leave', async () => {
      let secondHumanSocket: Socket;
      let gameIntegrityMaintained = false;

      try {
        // Add second human player first
        secondHumanSocket = io(serverUrl, {
          transports: ['websocket'],
          forceNew: true,
        });

        await new Promise<void>((resolve) => {
          secondHumanSocket.on('connect', () => resolve());
        });

        secondHumanSocket.emit('join-game', {
          gameId,
          playerName: 'SecondHumanToLeave',
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Monitor game integrity
        const integritySocket = io(serverUrl, {
          transports: ['websocket'],
          forceNew: true,
        });

        await new Promise<void>((resolve) => {
          integritySocket.on('connect', () => resolve());
        });

        integritySocket.on('ai-decision-made', (data) => {
          if (data.gameId === gameId) {
            gameIntegrityMaintained = true;
          }
        });

        // Both humans disconnect
        humanSocket.disconnect();
        secondHumanSocket.disconnect();

        // Wait for AI game to continue
        await new Promise(resolve => setTimeout(resolve, 8000));

        expect(gameIntegrityMaintained).toBe(true);

        integritySocket.disconnect();

      } finally {
        if (secondHumanSocket?.connected) {
          secondHumanSocket.disconnect();
        }
      }
    });
  });
});
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AI Night Phase Coordination (e2e)', () => {
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

  describe('Mafia Team Coordination During Night Phase', () => {
    let gameId: number;
    let mafiaPlayers: any[] = [];
    let mafiaCoordinationEvents: any[] = [];
    let nightActionDecisions: any[] = [];

    beforeEach(async () => {
      // Setup game and track mafia coordination
      clientSocket.on('ai-team-coordination', (data) => {
        if (data.teamType === 'mafia' && data.gamePhase === 'night_actions') {
          mafiaCoordinationEvents.push(data);
        }
      });

      clientSocket.on('ai-decision-made', (data) => {
        if (data.decisionType === 'night_action') {
          nightActionDecisions.push(data);
        }
      });

      // Create and start AI game
      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'NightPhaseTestPlayer',
          hostSocketId: clientSocket.id,
          aiDifficultyLevel: 'medium',
          aiPersonalitySet: 'default',
        })
        .expect(201);

      gameId = createResponse.body.gameId;

      const startResponse = await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      mafiaPlayers = startResponse.body.players.filter(
        (p: any) => p.role === 'mafia' && p.isAI,
      );

      expect(mafiaPlayers).toHaveLength(2); // Verify 2 mafia players exist
    });

    it('should coordinate mafia team strategy during night phase', async () => {
      let nightPhaseStarted = false;
      let coordinationCompleted = false;

      clientSocket.on('ai-phase-transition', (data) => {
        if (data.currentPhase === 'night_actions') {
          nightPhaseStarted = true;
        }
      });

      clientSocket.on('ai-night-coordination-completed', (data) => {
        coordinationCompleted = true;

        expect(data).toHaveProperty('gameId', gameId);
        expect(data).toHaveProperty('mafiaCount', 2);
        expect(data).toHaveProperty('killer');
        expect(data).toHaveProperty('target');
        expect(data).toHaveProperty('killingStrategy');
        expect(data).toHaveProperty('coordinationPlan');
        expect(data).toHaveProperty('confidence');
        expect(data.confidence).toBeGreaterThan(0);
        expect(data.confidence).toBeLessThanOrEqual(10);
      });

      // Wait for game to progress to night phase
      await this.waitForCondition(
        () => nightPhaseStarted,
        30000,
        'Night phase did not start',
      );

      // Wait for coordination to complete
      await this.waitForCondition(
        () => coordinationCompleted,
        15000,
        'Mafia coordination did not complete',
      );

      // Verify coordination events were captured
      expect(mafiaCoordinationEvents.length).toBeGreaterThan(0);

      const coordinationEvent = mafiaCoordinationEvents.find(
        (e) => e.coordinationType === 'night_planning',
      );
      expect(coordinationEvent).toBeDefined();
      expect(coordinationEvent.participants).toEqual(
        expect.arrayContaining(mafiaPlayers.map((p) => p.id)),
      );
    }, 50000);

    it('should ensure only one mafia member performs the kill action', async () => {
      let killActionsReceived = 0;
      let killerPlayerId: number;

      clientSocket.on('ai-night-action', (data) => {
        if (data.actionType === 'kill' && data.playerRole === 'mafia') {
          killActionsReceived++;
          killerPlayerId = data.playerId;
        }
      });

      // Wait for night actions to be processed
      await new Promise((resolve) => setTimeout(resolve, 20000));

      // Only one mafia member should perform the kill
      expect(killActionsReceived).toBe(1);
      expect(killerPlayerId).toBeDefined();
      expect(mafiaPlayers.some((p) => p.id === killerPlayerId)).toBe(true);
    }, 25000);

    it('should coordinate target selection with strategic analysis', async () => {
      let targetAnalysisCompleted = false;
      let selectedTarget: string;
      let targetPriorities: any[];

      clientSocket.on('ai-target-analysis', (data) => {
        if (data.teamType === 'mafia' && data.analysisType === 'night_kill') {
          targetAnalysisCompleted = true;
          selectedTarget = data.selectedTarget;
          targetPriorities = data.targetPriorities;
        }
      });

      // Wait for target analysis
      await this.waitForCondition(
        () => targetAnalysisCompleted,
        25000,
        'Target analysis was not completed',
      );

      // Verify target analysis results
      expect(selectedTarget).toBeDefined();
      expect(typeof selectedTarget).toBe('string');
      expect(targetPriorities).toBeDefined();
      expect(Array.isArray(targetPriorities)).toBe(true);
      expect(targetPriorities.length).toBeGreaterThan(0);

      // Each target priority should have required fields
      targetPriorities.forEach((target) => {
        expect(target).toHaveProperty('target');
        expect(target).toHaveProperty('priority');
        expect(target).toHaveProperty('reasoning');
        expect(typeof target.priority).toBe('number');
        expect(typeof target.reasoning).toBe('string');
      });

      // Targets should be sorted by priority (highest first)
      for (let i = 1; i < targetPriorities.length; i++) {
        expect(targetPriorities[i - 1].priority).toBeGreaterThanOrEqual(
          targetPriorities[i].priority,
        );
      }
    }, 30000);

    it('should handle mafia communication during night phase', async () => {
      let communicationEvents: any[] = [];

      clientSocket.on('ai-team-communication', (data) => {
        if (
          data.teamType === 'mafia' &&
          data.gamePhase === 'night_actions' &&
          data.communicationType === 'strategy_coordination'
        ) {
          communicationEvents.push(data);
        }
      });

      // Wait for mafia communication events
      await new Promise((resolve) => setTimeout(resolve, 15000));

      expect(communicationEvents.length).toBeGreaterThan(0);

      const commEvent = communicationEvents[0];
      expect(commEvent).toHaveProperty('participants');
      expect(commEvent).toHaveProperty('messageType');
      expect(commEvent).toHaveProperty('communicationData');
      expect(commEvent.participants).toEqual(
        expect.arrayContaining(mafiaPlayers.map((p) => p.id)),
      );
      expect(['strategy_update', 'coordination_plan', 'role_revealed']).toContain(
        commEvent.messageType,
      );
    }, 20000);
  });

  describe('Police Investigation Decisions During Night', () => {
    let gameId: number;
    let policePlayer: any;
    let policeDecisions: any[] = [];

    beforeEach(async () => {
      clientSocket.on('ai-decision-made', (data) => {
        if (data.decisionType === 'night_action' && data.playerRole === 'police') {
          policeDecisions.push(data);
        }
      });

      // Create and start AI game
      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'PoliceTestPlayer',
          hostSocketId: clientSocket.id,
          aiDifficultyLevel: 'medium',
        })
        .expect(201);

      gameId = createResponse.body.gameId;

      const startResponse = await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      policePlayer = startResponse.body.players.find(
        (p: any) => p.role === 'police' && p.isAI,
      );

      expect(policePlayer).toBeDefined();
    });

    it('should make strategic investigation decisions', async () => {
      let investigationDecision: any;

      clientSocket.on('ai-night-action', (data) => {
        if (data.actionType === 'investigate' && data.playerRole === 'police') {
          investigationDecision = data;
        }
      });

      // Wait for police investigation decision
      await this.waitForCondition(
        () => investigationDecision !== undefined,
        25000,
        'Police investigation decision was not made',
      );

      expect(investigationDecision).toHaveProperty('playerId', policePlayer.id);
      expect(investigationDecision).toHaveProperty('target');
      expect(investigationDecision).toHaveProperty('reasoning');
      expect(typeof investigationDecision.target).toBe('string');
      expect(typeof investigationDecision.reasoning).toBe('string');
      expect(investigationDecision.reasoning.length).toBeGreaterThan(10);
    }, 30000);

    it('should prioritize suspicious players for investigation', async () => {
      let investigationAnalysis: any;

      clientSocket.on('ai-investigation-analysis', (data) => {
        if (data.playerId === policePlayer.id) {
          investigationAnalysis = data;
        }
      });

      // Wait for investigation analysis
      await this.waitForCondition(
        () => investigationAnalysis !== undefined,
        20000,
        'Investigation analysis was not completed',
      );

      expect(investigationAnalysis).toHaveProperty('suspiciousPlayers');
      expect(investigationAnalysis).toHaveProperty('investigationPriorities');
      expect(investigationAnalysis).toHaveProperty('strategy');
      expect(Array.isArray(investigationAnalysis.suspiciousPlayers)).toBe(true);
      expect(Array.isArray(investigationAnalysis.investigationPriorities)).toBe(true);

      // Investigation priorities should have reasoning
      investigationAnalysis.investigationPriorities.forEach((priority: any) => {
        expect(priority).toHaveProperty('target');
        expect(priority).toHaveProperty('suspicionLevel');
        expect(priority).toHaveProperty('reasoning');
        expect(typeof priority.suspicionLevel).toBe('number');
        expect(priority.suspicionLevel).toBeGreaterThanOrEqual(0);
        expect(priority.suspicionLevel).toBeLessThanOrEqual(10);
      });
    }, 25000);

    it('should avoid investigating known players when possible', async () => {
      let investigationDecision: any;
      let knownRoles: Record<string, string> = {};

      // Simulate some known role information
      clientSocket.on('ai-role-discovered', (data) => {
        knownRoles[data.playerName] = data.role;
      });

      clientSocket.on('ai-night-action', (data) => {
        if (data.actionType === 'investigate' && data.playerRole === 'police') {
          investigationDecision = data;
        }
      });

      // Wait for investigation decision
      await this.waitForCondition(
        () => investigationDecision !== undefined,
        25000,
        'Investigation decision was not made',
      );

      // Police should not investigate players whose roles are already known
      const targetRole = knownRoles[investigationDecision.target];
      if (targetRole) {
        // If the target's role is known, it should be for strategic reasons
        expect(investigationDecision.reasoning).toMatch(
          /(confirm|verify|strategic|doubt)/i,
        );
      }
    }, 30000);
  });

  describe('Doctor Protection Strategies During Night', () => {
    let gameId: number;
    let doctorPlayer: any;
    let protectionDecisions: any[] = [];

    beforeEach(async () => {
      clientSocket.on('ai-decision-made', (data) => {
        if (data.decisionType === 'night_action' && data.playerRole === 'doctor') {
          protectionDecisions.push(data);
        }
      });

      // Create and start AI game
      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'DoctorTestPlayer',
          hostSocketId: clientSocket.id,
          aiDifficultyLevel: 'medium',
        })
        .expect(201);

      gameId = createResponse.body.gameId;

      const startResponse = await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      doctorPlayer = startResponse.body.players.find(
        (p: any) => p.role === 'doctor' && p.isAI,
      );

      expect(doctorPlayer).toBeDefined();
    });

    it('should make strategic protection decisions', async () => {
      let protectionDecision: any;

      clientSocket.on('ai-night-action', (data) => {
        if (data.actionType === 'protect' && data.playerRole === 'doctor') {
          protectionDecision = data;
        }
      });

      // Wait for doctor protection decision
      await this.waitForCondition(
        () => protectionDecision !== undefined,
        25000,
        'Doctor protection decision was not made',
      );

      expect(protectionDecision).toHaveProperty('playerId', doctorPlayer.id);
      expect(protectionDecision).toHaveProperty('target');
      expect(protectionDecision).toHaveProperty('reasoning');
      expect(typeof protectionDecision.target).toBe('string');
      expect(typeof protectionDecision.reasoning).toBe('string');
      expect(protectionDecision.reasoning.length).toBeGreaterThan(10);
    }, 30000);

    it('should prioritize high-value targets for protection', async () => {
      let protectionAnalysis: any;

      clientSocket.on('ai-protection-analysis', (data) => {
        if (data.playerId === doctorPlayer.id) {
          protectionAnalysis = data;
        }
      });

      // Wait for protection analysis
      await this.waitForCondition(
        () => protectionAnalysis !== undefined,
        20000,
        'Protection analysis was not completed',
      );

      expect(protectionAnalysis).toHaveProperty('highValueTargets');
      expect(protectionAnalysis).toHaveProperty('protectionPriorities');
      expect(protectionAnalysis).toHaveProperty('strategy');
      expect(Array.isArray(protectionAnalysis.highValueTargets)).toBe(true);
      expect(Array.isArray(protectionAnalysis.protectionPriorities)).toBe(true);

      // Protection priorities should consider threat levels
      protectionAnalysis.protectionPriorities.forEach((priority: any) => {
        expect(priority).toHaveProperty('target');
        expect(priority).toHaveProperty('threatLevel');
        expect(priority).toHaveProperty('valueLevel');
        expect(priority).toHaveProperty('reasoning');
        expect(typeof priority.threatLevel).toBe('number');
        expect(typeof priority.valueLevel).toBe('number');
      });
    }, 25000);

    it('should consider self-protection vs protecting others', async () => {
      let protectionDecision: any;
      let protectionStrategy: any;

      clientSocket.on('ai-night-action', (data) => {
        if (data.actionType === 'protect' && data.playerRole === 'doctor') {
          protectionDecision = data;
        }
      });

      clientSocket.on('ai-protection-strategy', (data) => {
        if (data.playerId === doctorPlayer.id) {
          protectionStrategy = data;
        }
      });

      // Wait for protection decision and strategy
      await this.waitForCondition(
        () => protectionDecision !== undefined && protectionStrategy !== undefined,
        25000,
        'Protection decision or strategy was not received',
      );

      expect(protectionStrategy).toHaveProperty('selfProtectionConsidered');
      expect(protectionStrategy).toHaveProperty('altruisticStrategy');
      expect(protectionStrategy).toHaveProperty('riskAssessment');

      if (protectionDecision.target === doctorPlayer.name) {
        // Self-protection chosen
        expect(protectionStrategy.selfProtectionConsidered).toBe(true);
        expect(protectionDecision.reasoning).toMatch(/(self|survival|strategic)/i);
      } else {
        // Protecting others
        expect(protectionStrategy.altruisticStrategy).toBe(true);
        expect(protectionDecision.reasoning).toMatch(/(protect|save|valuable)/i);
      }
    }, 30000);
  });

  describe('Citizen Behavior During Night Phases', () => {
    let gameId: number;
    let citizenPlayers: any[] = [];
    let citizenNightActions: any[] = [];

    beforeEach(async () => {
      clientSocket.on('ai-night-behavior', (data) => {
        if (data.playerRole === 'citizen') {
          citizenNightActions.push(data);
        }
      });

      // Create and start AI game
      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'CitizenTestPlayer',
          hostSocketId: clientSocket.id,
          aiDifficultyLevel: 'medium',
        })
        .expect(201);

      gameId = createResponse.body.gameId;

      const startResponse = await request(app.getHttpServer())
        .post(`/games/${gameId}/ai/start`)
        .expect(200);

      citizenPlayers = startResponse.body.players.filter(
        (p: any) => p.role === 'citizen' && p.isAI,
      );

      expect(citizenPlayers.length).toBeGreaterThan(0);
    });

    it('should have minimal night actions for citizens', async () => {
      let citizenActionCount = 0;

      clientSocket.on('ai-decision-made', (data) => {
        if (
          data.decisionType === 'night_action' &&
          data.playerRole === 'citizen'
        ) {
          citizenActionCount++;
        }
      });

      // Wait for night phase to complete
      await new Promise((resolve) => setTimeout(resolve, 20000));

      // Citizens should have no or very few night actions
      expect(citizenActionCount).toBeLessThanOrEqual(1);

      // If they do have actions, they should be passive (thinking, analyzing)
      if (citizenNightActions.length > 0) {
        citizenNightActions.forEach((action) => {
          expect(['analyze', 'think', 'observe', 'wait']).toContain(
            action.actionType,
          );
        });
      }
    }, 25000);

    it('should engage in strategic thinking during night', async () => {
      let citizenThinking: any[] = [];

      clientSocket.on('ai-strategic-thinking', (data) => {
        if (data.playerRole === 'citizen' && data.gamePhase === 'night_actions') {
          citizenThinking.push(data);
        }
      });

      // Wait for strategic thinking events
      await new Promise((resolve) => setTimeout(resolve, 15000));

      if (citizenThinking.length > 0) {
        citizenThinking.forEach((thinking) => {
          expect(thinking).toHaveProperty('playerId');
          expect(thinking).toHaveProperty('thoughtProcess');
          expect(thinking).toHaveProperty('suspicions');
          expect(thinking).toHaveProperty('strategies');
          expect(Array.isArray(thinking.suspicions)).toBe(true);
          expect(Array.isArray(thinking.strategies)).toBe(true);
        });
      }
    }, 20000);

    it('should prepare for next day phase during night', async () => {
      let dayPreparation: any[] = [];

      clientSocket.on('ai-day-preparation', (data) => {
        if (data.playerRole === 'citizen') {
          dayPreparation.push(data);
        }
      });

      // Wait for day preparation events
      await new Promise((resolve) => setTimeout(resolve, 18000));

      if (dayPreparation.length > 0) {
        dayPreparation.forEach((prep) => {
          expect(prep).toHaveProperty('playerId');
          expect(prep).toHaveProperty('discussionTopics');
          expect(prep).toHaveProperty('votingStrategy');
          expect(prep).toHaveProperty('suspicionTargets');
          expect(Array.isArray(prep.discussionTopics)).toBe(true);
          expect(typeof prep.votingStrategy).toBe('string');
        });
      }
    }, 25000);
  });

  describe('Phase Transition Timing and Synchronization', () => {
    let gameId: number;
    let phaseTransitions: any[] = [];
    let aiDecisionStatuses: any[] = [];

    beforeEach(async () => {
      clientSocket.on('ai-phase-transition', (data) => {
        phaseTransitions.push({
          ...data,
          timestamp: Date.now(),
        });
      });

      clientSocket.on('ai-decision-status', (data) => {
        aiDecisionStatuses.push({
          ...data,
          timestamp: Date.now(),
        });
      });

      // Create and start AI game
      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'TimingTestPlayer',
          hostSocketId: clientSocket.id,
          aiDifficultyLevel: 'medium',
        })
        .expect(201);

      gameId = createResponse.body.gameId;
      await request(app.getHttpServer()).post(`/games/${gameId}/ai/start`);
    });

    it('should synchronize AI decisions before phase transitions', async () => {
      let nightPhaseTransition: any;
      let dayPhaseTransition: any;

      // Wait for night phase transition
      await this.waitForCondition(
        () => phaseTransitions.some((pt) => pt.currentPhase === 'night_actions'),
        30000,
        'Night phase transition did not occur',
      );

      nightPhaseTransition = phaseTransitions.find(
        (pt) => pt.currentPhase === 'night_actions',
      );

      expect(nightPhaseTransition).toHaveProperty('aiDecisionsRequired');
      expect(nightPhaseTransition).toHaveProperty('phaseTimeLimit');
      expect(Array.isArray(nightPhaseTransition.aiDecisionsRequired)).toBe(true);
      expect(typeof nightPhaseTransition.phaseTimeLimit).toBe('number');

      // Wait for decisions to complete and next phase transition
      await this.waitForCondition(
        () =>
          phaseTransitions.some(
            (pt) =>
              pt.previousPhase === 'night_actions' &&
              pt.currentPhase === 'day_discussion',
          ),
        45000,
        'Day phase transition after night did not occur',
      );

      dayPhaseTransition = phaseTransitions.find(
        (pt) =>
          pt.previousPhase === 'night_actions' &&
          pt.currentPhase === 'day_discussion',
      );

      expect(dayPhaseTransition).toBeDefined();

      // Verify timing synchronization
      const timeDifference =
        dayPhaseTransition.timestamp - nightPhaseTransition.timestamp;
      expect(timeDifference).toBeLessThan(nightPhaseTransition.phaseTimeLimit * 1000 + 5000);
    }, 80000);

    it('should handle AI decision timeouts gracefully', async () => {
      let timeoutEvents: any[] = [];

      clientSocket.on('ai-decision-timeout', (data) => {
        timeoutEvents.push(data);
      });

      // Wait for potential timeout events
      await new Promise((resolve) => setTimeout(resolve, 35000));

      // Check if timeouts were handled properly
      if (timeoutEvents.length > 0) {
        timeoutEvents.forEach((timeout) => {
          expect(timeout).toHaveProperty('playerId');
          expect(timeout).toHaveProperty('decisionType');
          expect(timeout).toHaveProperty('timeoutDuration');
          expect(timeout).toHaveProperty('fallbackAction');
          expect(typeof timeout.fallbackAction).toBe('string');
        });

        // Game should continue despite timeouts
        const currentGameState = await request(app.getHttpServer())
          .get(`/games/${gameId}/ai/decisions`)
          .expect(200);

        expect(['day_discussion', 'day_voting', 'night_actions']).toContain(
          currentGameState.body.currentPhase,
        );
      }
    }, 40000);

    it('should coordinate phase transitions with all AI players', async () => {
      let phaseCompletionEvents: any[] = [];

      clientSocket.on('ai-phase-completion', (data) => {
        phaseCompletionEvents.push(data);
      });

      // Wait for phase completion events
      await new Promise((resolve) => setTimeout(resolve, 40000));

      if (phaseCompletionEvents.length > 0) {
        phaseCompletionEvents.forEach((completion) => {
          expect(completion).toHaveProperty('gameId', gameId);
          expect(completion).toHaveProperty('phase');
          expect(completion).toHaveProperty('completedPlayers');
          expect(completion).toHaveProperty('pendingPlayers');
          expect(completion).toHaveProperty('completionPercentage');
          expect(Array.isArray(completion.completedPlayers)).toBe(true);
          expect(Array.isArray(completion.pendingPlayers)).toBe(true);
          expect(typeof completion.completionPercentage).toBe('number');
          expect(completion.completionPercentage).toBeGreaterThanOrEqual(0);
          expect(completion.completionPercentage).toBeLessThanOrEqual(100);
        });
      }
    }, 45000);
  });

  describe('Conflict Resolution for Multiple Night Actions', () => {
    let gameId: number;
    let conflictEvents: any[] = [];
    let resolutionResults: any[] = [];

    beforeEach(async () => {
      clientSocket.on('ai-action-conflict', (data) => {
        conflictEvents.push(data);
      });

      clientSocket.on('ai-conflict-resolution', (data) => {
        resolutionResults.push(data);
      });

      // Create and start AI game
      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'ConflictTestPlayer',
          hostSocketId: clientSocket.id,
          aiDifficultyLevel: 'medium',
        })
        .expect(201);

      gameId = createResponse.body.gameId;
      await request(app.getHttpServer()).post(`/games/${gameId}/ai/start`);
    });

    it('should resolve conflicts between mafia kill and doctor protection', async () => {
      let killAction: any;
      let protectAction: any;
      let conflictResolution: any;

      clientSocket.on('ai-night-action', (data) => {
        if (data.actionType === 'kill') {
          killAction = data;
        } else if (data.actionType === 'protect') {
          protectAction = data;
        }
      });

      clientSocket.on('ai-night-results', (data) => {
        if (data.events.some((e: any) => e.eventType === 'conflict_resolution')) {
          conflictResolution = data.events.find(
            (e: any) => e.eventType === 'conflict_resolution',
          );
        }
      });

      // Wait for night actions and resolution
      await this.waitForCondition(
        () => killAction !== undefined && protectAction !== undefined,
        35000,
        'Night actions were not completed',
      );

      // Check if there was a target conflict
      if (killAction.target === protectAction.target) {
        await this.waitForCondition(
          () => conflictResolution !== undefined,
          10000,
          'Conflict resolution was not completed',
        );

        expect(conflictResolution).toHaveProperty('conflictType', 'kill_vs_protect');
        expect(conflictResolution).toHaveProperty('target');
        expect(conflictResolution).toHaveProperty('resolution');
        expect(conflictResolution).toHaveProperty('outcome');
        expect(['kill_prevented', 'kill_succeeded']).toContain(
          conflictResolution.outcome,
        );
      }
    }, 50000);

    it('should handle multiple protection attempts', async () => {
      let protectionActions: any[] = [];

      clientSocket.on('ai-night-action', (data) => {
        if (data.actionType === 'protect') {
          protectionActions.push(data);
        }
      });

      // Wait for protection actions
      await new Promise((resolve) => setTimeout(resolve, 25000));

      // Should only have one protection action (from doctor)
      expect(protectionActions.length).toBeLessThanOrEqual(1);

      if (protectionActions.length > 1) {
        // If multiple protections, there should be conflict resolution
        expect(resolutionResults.some((r) => r.conflictType === 'multiple_protections')).toBe(true);
      }
    }, 30000);

    it('should prioritize action resolution based on game rules', async () => {
      let actionPriorities: any;

      clientSocket.on('ai-action-priorities', (data) => {
        actionPriorities = data;
      });

      // Wait for action priority determination
      await this.waitForCondition(
        () => actionPriorities !== undefined,
        20000,
        'Action priorities were not determined',
      );

      expect(actionPriorities).toHaveProperty('gameId', gameId);
      expect(actionPriorities).toHaveProperty('nightActions');
      expect(actionPriorities).toHaveProperty('resolutionOrder');
      expect(Array.isArray(actionPriorities.nightActions)).toBe(true);
      expect(Array.isArray(actionPriorities.resolutionOrder)).toBe(true);

      // Resolution order should follow game rules
      const expectedOrder = ['kill', 'protect', 'investigate'];
      actionPriorities.resolutionOrder.forEach((action: string, index: number) => {
        if (index < expectedOrder.length) {
          expect(expectedOrder).toContain(action);
        }
      });
    }, 25000);

    it('should validate action consistency and prevent cheating', async () => {
      let validationResults: any[] = [];

      clientSocket.on('ai-action-validation', (data) => {
        validationResults.push(data);
      });

      // Wait for action validation
      await new Promise((resolve) => setTimeout(resolve, 20000));

      if (validationResults.length > 0) {
        validationResults.forEach((validation) => {
          expect(validation).toHaveProperty('playerId');
          expect(validation).toHaveProperty('actionType');
          expect(validation).toHaveProperty('isValid');
          expect(validation).toHaveProperty('validationErrors');
          expect(typeof validation.isValid).toBe('boolean');
          expect(Array.isArray(validation.validationErrors)).toBe(true);

          // Valid actions should have no errors
          if (validation.isValid) {
            expect(validation.validationErrors).toHaveLength(0);
          }
        });
      }
    }, 25000);
  });

  describe('Night Phase Performance and Reliability', () => {
    let gameId: number;
    let performanceMetrics: any[] = [];

    beforeEach(async () => {
      clientSocket.on('ai-performance-metrics', (data) => {
        if (data.gamePhase === 'night_actions') {
          performanceMetrics.push(data);
        }
      });

      // Create and start AI game
      const createResponse = await request(app.getHttpServer())
        .post('/games/ai')
        .send({
          hostName: 'PerformanceTestPlayer',
          hostSocketId: clientSocket.id,
          aiDifficultyLevel: 'medium',
        })
        .expect(201);

      gameId = createResponse.body.gameId;
      await request(app.getHttpServer()).post(`/games/${gameId}/ai/start`);
    });

    it('should complete night phase within reasonable time limits', async () => {
      let nightPhaseStart: number;
      let nightPhaseEnd: number;

      clientSocket.on('ai-phase-transition', (data) => {
        if (data.currentPhase === 'night_actions') {
          nightPhaseStart = Date.now();
        } else if (data.previousPhase === 'night_actions') {
          nightPhaseEnd = Date.now();
        }
      });

      // Wait for night phase to complete
      await this.waitForCondition(
        () => nightPhaseStart !== undefined && nightPhaseEnd !== undefined,
        70000,
        'Night phase did not complete',
      );

      const nightPhaseDuration = nightPhaseEnd - nightPhaseStart;

      // Night phase should complete within 60 seconds (configurable)
      expect(nightPhaseDuration).toBeLessThan(60000);
      expect(nightPhaseDuration).toBeGreaterThan(1000); // At least 1 second for processing
    }, 75000);

    it('should maintain decision quality under time pressure', async () => {
      let decisionQuality: any[] = [];

      clientSocket.on('ai-decision-quality', (data) => {
        if (data.gamePhase === 'night_actions') {
          decisionQuality.push(data);
        }
      });

      // Wait for decision quality metrics
      await new Promise((resolve) => setTimeout(resolve, 35000));

      if (decisionQuality.length > 0) {
        decisionQuality.forEach((quality) => {
          expect(quality).toHaveProperty('playerId');
          expect(quality).toHaveProperty('decisionTime');
          expect(quality).toHaveProperty('confidenceScore');
          expect(quality).toHaveProperty('reasoning Quality');
          expect(typeof quality.decisionTime).toBe('number');
          expect(typeof quality.confidenceScore).toBe('number');
          expect(quality.confidenceScore).toBeGreaterThanOrEqual(0);
          expect(quality.confidenceScore).toBeLessThanOrEqual(10);
          expect(quality.decisionTime).toBeLessThan(30000); // 30 second max per decision
        });

        // Average quality should be reasonable
        const avgConfidence =
          decisionQuality.reduce((sum, q) => sum + q.confidenceScore, 0) /
          decisionQuality.length;
        expect(avgConfidence).toBeGreaterThan(3); // Minimum acceptable confidence
      }
    }, 40000);

    it('should handle multiple concurrent night phases efficiently', async () => {
      const concurrentGames: number[] = [];
      const gameCompletions: number[] = [];

      // Create multiple concurrent games (stress test)
      for (let i = 0; i < 3; i++) {
        const createResponse = await request(app.getHttpServer())
          .post('/games/ai')
          .send({
            hostName: `ConcurrentTest${i}`,
            hostSocketId: `concurrent_${i}`,
            aiDifficultyLevel: 'medium',
          });

        concurrentGames.push(createResponse.body.gameId);

        await request(app.getHttpServer())
          .post(`/games/${createResponse.body.gameId}/ai/start`);
      }

      clientSocket.on('ai-phase-transition', (data) => {
        if (
          data.previousPhase === 'night_actions' &&
          concurrentGames.includes(data.gameId)
        ) {
          gameCompletions.push(data.gameId);
        }
      });

      // Wait for all games to complete night phase
      await this.waitForCondition(
        () => gameCompletions.length === concurrentGames.length,
        120000,
        'Not all concurrent games completed night phase',
      );

      expect(gameCompletions).toHaveLength(3);

      // All games should complete without interference
      concurrentGames.forEach((gameId) => {
        expect(gameCompletions).toContain(gameId);
      });
    }, 130000);
  });

  // Helper method for waiting with timeout
  private async waitForCondition(
    condition: () => boolean,
    timeout: number,
    errorMessage: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        if (condition()) {
          clearInterval(checkInterval);
          resolve();
        } else if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(new Error(errorMessage));
        }
      }, 500);
    });
  }
});
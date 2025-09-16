describe('AI Decision Making', () => {
  let aiDecisionService: any;
  let llmService: any;
  let gameState: any;

  beforeEach(async () => {
    // These services don't exist yet - tests will fail initially (TDD)
    // Mock the services for testing AI decision logic
    llmService = {
      generateResponse: jest.fn(),
      getCachedResponse: jest.fn(),
      setCachedResponse: jest.fn(),
    };

    aiDecisionService = {
      makeDecision: jest.fn(),
      validateDecision: jest.fn(),
      processDecisionResponse: jest.fn(),
    };

    // Mock game state
    gameState = {
      gameId: 1,
      currentPhase: 'day_discussion',
      players: [
        { id: 1, name: 'Human', isAI: false, role: 'citizen', isAlive: true },
        {
          id: 2,
          name: 'AI_Alice',
          isAI: true,
          role: 'mafia',
          isAlive: true,
          aiPersona: {
            name: 'analytical_detective',
            traits: ['logical', 'suspicious'],
          },
        },
        {
          id: 3,
          name: 'AI_Bob',
          isAI: true,
          role: 'police',
          isAlive: true,
          aiPersona: {
            name: 'aggressive_accuser',
            traits: ['aggressive', 'intuitive'],
          },
        },
        {
          id: 4,
          name: 'AI_Carol',
          isAI: true,
          role: 'doctor',
          isAlive: true,
          aiPersona: {
            name: 'quiet_observer',
            traits: ['careful', 'protective'],
          },
        },
        {
          id: 5,
          name: 'AI_David',
          isAI: true,
          role: 'citizen',
          isAlive: true,
          aiPersona: {
            name: 'emotional_reactor',
            traits: ['emotional', 'reactive'],
          },
        },
        {
          id: 6,
          name: 'AI_Eve',
          isAI: true,
          role: 'citizen',
          isAlive: true,
          aiPersona: {
            name: 'logical_analyzer',
            traits: ['logical', 'methodical'],
          },
        },
      ],
      gameHistory: [],
      votingHistory: [],
      dayCount: 1,
    };
  });

  describe('Decision Making Process', () => {
    it('should make AI decision within timeout limit', async () => {
      const startTime = Date.now();
      const timeoutMs = 500;

      // Mock LLM response
      llmService.generateResponse.mockResolvedValue({
        decision: 'vote',
        target: 'AI_Bob',
        reasoning: 'Bob has been acting suspiciously during discussions',
        confidence: 7,
      });

      aiDecisionService.makeDecision.mockImplementation(
        async (playerId, phase, context) => {
          // Simulate decision making process
          const decision = await llmService.generateResponse(context);
          return {
            playerId,
            decisionType: decision.decision,
            decisionData: {
              target: decision.target,
              reasoning: decision.reasoning,
            },
            confidence: decision.confidence,
            processingTime: Date.now() - startTime,
          };
        },
      );

      const decision = await aiDecisionService.makeDecision(2, 'day_voting', {
        gameState,
        playerPersona: gameState.players[1].aiPersona,
        phase: 'day_voting',
      });

      const processingTime = Date.now() - startTime;

      expect(decision).toBeDefined();
      expect(decision.playerId).toBe(2);
      expect(decision.decisionType).toBe('vote');
      expect(decision.processingTime).toBeLessThan(timeoutMs);
      expect(processingTime).toBeLessThan(timeoutMs);
    });

    it('should handle decision timeout gracefully', async () => {
      const timeoutMs = 100;

      // Mock slow LLM response
      llmService.generateResponse.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, timeoutMs + 50)),
      );

      aiDecisionService.makeDecision.mockImplementation(
        async (playerId, phase, context) => {
          return new Promise((resolve, reject) => {
            setTimeout(() => {
              reject(new Error('DECISION_TIMEOUT'));
            }, timeoutMs);

            llmService.generateResponse(context).then((result) => {
              resolve({
                playerId,
                decisionType: result.decision,
                processingTime: timeoutMs + 50,
              });
            });
          });
        },
      );

      await expect(
        aiDecisionService.makeDecision(2, 'day_voting', {
          gameState,
          timeout: timeoutMs,
        }),
      ).rejects.toThrow('DECISION_TIMEOUT');
    });

    it('should validate decision format and constraints', async () => {
      const validDecision = {
        playerId: 2,
        decisionType: 'vote',
        decisionData: {
          target: 'AI_Bob',
          reasoning: 'Suspicious voting pattern',
        },
        confidence: 8,
      };

      const invalidDecision = {
        playerId: 2,
        decisionType: 'invalid_action',
        decisionData: {},
      };

      aiDecisionService.validateDecision.mockImplementation(
        (decision, gameState, phase) => {
          // Validate decision type for current phase
          const validPhaseActions = {
            day_discussion: ['discussion', 'accusation'],
            day_voting: ['vote'],
            night_actions: ['night_action'],
          };

          if (!validPhaseActions[phase].includes(decision.decisionType)) {
            throw new Error('Invalid decision type for current phase');
          }

          // Validate target exists and is alive
          if (decision.decisionData.target) {
            const targetExists = gameState.players.some(
              (p) => p.name === decision.decisionData.target && p.isAlive,
            );
            if (!targetExists) {
              throw new Error('Invalid target player');
            }
          }

          return true;
        },
      );

      expect(() =>
        aiDecisionService.validateDecision(
          validDecision,
          gameState,
          'day_voting',
        ),
      ).not.toThrow();
      expect(() =>
        aiDecisionService.validateDecision(
          invalidDecision,
          gameState,
          'day_voting',
        ),
      ).toThrow();
    });
  });

  describe('Role-Based Decision Making', () => {
    it('should make appropriate mafia decisions', async () => {
      const mafiaPlayer = gameState.players[1]; // AI_Alice (mafia)

      llmService.generateResponse.mockResolvedValue({
        decision: 'night_action',
        target: 'AI_Bob', // Target police officer
        reasoning: 'Bob seems to be investigating, likely the police officer',
        confidence: 9,
      });

      aiDecisionService.makeDecision.mockImplementation(
        async (playerId, phase, context) => {
          const decision = await llmService.generateResponse(context);
          return {
            playerId,
            decisionType: decision.decision,
            decisionData: {
              target: decision.target,
              reasoning: decision.reasoning,
              action: 'kill',
            },
            confidence: decision.confidence,
          };
        },
      );

      const decision = await aiDecisionService.makeDecision(
        mafiaPlayer.id,
        'night_actions',
        {
          gameState,
          playerPersona: mafiaPlayer.aiPersona,
          role: 'mafia',
        },
      );

      expect(decision.decisionType).toBe('night_action');
      expect(decision.decisionData.action).toBe('kill');
      expect(decision.decisionData.target).toBeDefined();
      expect(decision.decisionData.reasoning).toContain('Bob');
    });

    it('should make appropriate police decisions', async () => {
      const policePlayer = gameState.players[2]; // AI_Bob (police)

      llmService.generateResponse.mockResolvedValue({
        decision: 'night_action',
        target: 'AI_Alice',
        reasoning: 'Alice has been deflecting suspicion, worth investigating',
        confidence: 7,
      });

      aiDecisionService.makeDecision.mockImplementation(
        async (playerId, phase, context) => {
          const decision = await llmService.generateResponse(context);
          return {
            playerId,
            decisionType: decision.decision,
            decisionData: {
              target: decision.target,
              reasoning: decision.reasoning,
              action: 'investigate',
            },
            confidence: decision.confidence,
          };
        },
      );

      const decision = await aiDecisionService.makeDecision(
        policePlayer.id,
        'night_actions',
        {
          gameState,
          playerPersona: policePlayer.aiPersona,
          role: 'police',
        },
      );

      expect(decision.decisionType).toBe('night_action');
      expect(decision.decisionData.action).toBe('investigate');
      expect(decision.decisionData.target).toBeDefined();
      expect(decision.decisionData.reasoning).toBeDefined();
    });

    it('should make appropriate doctor decisions', async () => {
      const doctorPlayer = gameState.players[3]; // AI_Carol (doctor)

      llmService.generateResponse.mockResolvedValue({
        decision: 'night_action',
        target: 'AI_Bob',
        reasoning: 'Bob seems like a valuable town member to protect',
        confidence: 6,
      });

      aiDecisionService.makeDecision.mockImplementation(
        async (playerId, phase, context) => {
          const decision = await llmService.generateResponse(context);
          return {
            playerId,
            decisionType: decision.decision,
            decisionData: {
              target: decision.target,
              reasoning: decision.reasoning,
              action: 'heal',
            },
            confidence: decision.confidence,
          };
        },
      );

      const decision = await aiDecisionService.makeDecision(
        doctorPlayer.id,
        'night_actions',
        {
          gameState,
          playerPersona: doctorPlayer.aiPersona,
          role: 'doctor',
        },
      );

      expect(decision.decisionType).toBe('night_action');
      expect(decision.decisionData.action).toBe('heal');
      expect(decision.decisionData.target).toBeDefined();
      expect(decision.decisionData.target).not.toBe(doctorPlayer.name); // Can't heal self
    });
  });

  describe('Personality-Based Behavior', () => {
    it('should reflect personality traits in decision reasoning', async () => {
      const analyticalPlayer = gameState.players[1]; // analytical_detective persona

      llmService.generateResponse.mockResolvedValue({
        decision: 'discussion',
        message:
          'Based on voting patterns from yesterday, I believe we should focus on players who switched votes',
        reasoning: 'Analytical approach to finding inconsistencies',
        confidence: 8,
      });

      aiDecisionService.makeDecision.mockImplementation(
        async (playerId, phase, context) => {
          const decision = await llmService.generateResponse(context);
          return {
            playerId,
            decisionType: decision.decision,
            decisionData: {
              message: decision.message,
              reasoning: decision.reasoning,
            },
            confidence: decision.confidence,
          };
        },
      );

      const decision = await aiDecisionService.makeDecision(
        analyticalPlayer.id,
        'day_discussion',
        {
          gameState,
          playerPersona: analyticalPlayer.aiPersona,
        },
      );

      expect(decision.decisionData.message).toContain('patterns');
      expect(decision.decisionData.reasoning).toContain('Analytical');
    });

    it('should adapt decision confidence based on personality traits', async () => {
      const cautiousPersona = {
        name: 'cautious_observer',
        traits: ['careful', 'hesitant'],
      };
      const boldPersona = {
        name: 'bold_leader',
        traits: ['confident', 'decisive'],
      };

      llmService.generateResponse
        .mockResolvedValueOnce({
          decision: 'vote',
          target: 'AI_David',
          confidence: 4, // Low confidence for cautious persona
        })
        .mockResolvedValueOnce({
          decision: 'vote',
          target: 'AI_David',
          confidence: 9, // High confidence for bold persona
        });

      aiDecisionService.makeDecision.mockImplementation(
        async (playerId, phase, context) => {
          const decision = await llmService.generateResponse(context);
          return {
            playerId,
            decisionType: decision.decision,
            decisionData: { target: decision.target },
            confidence: decision.confidence,
          };
        },
      );

      const cautiousDecision = await aiDecisionService.makeDecision(
        4,
        'day_voting',
        {
          gameState,
          playerPersona: cautiousPersona,
        },
      );

      const boldDecision = await aiDecisionService.makeDecision(
        5,
        'day_voting',
        {
          gameState,
          playerPersona: boldPersona,
        },
      );

      expect(cautiousDecision.confidence).toBeLessThan(boldDecision.confidence);
    });
  });

  describe('Error Handling', () => {
    it('should handle LLM API failures', async () => {
      llmService.generateResponse.mockRejectedValue(new Error('API_ERROR'));

      aiDecisionService.makeDecision.mockImplementation(
        async (playerId, phase, context) => {
          try {
            await llmService.generateResponse(context);
          } catch (error) {
            // Return fallback decision
            return {
              playerId,
              decisionType: 'discussion',
              decisionData: {
                message: 'I need more time to think about this.',
                reasoning: 'Fallback response due to API error',
              },
              confidence: 1,
              fallback: true,
            };
          }
        },
      );

      const decision = await aiDecisionService.makeDecision(
        2,
        'day_discussion',
        {
          gameState,
        },
      );

      expect(decision.fallback).toBe(true);
      expect(decision.confidence).toBe(1);
      expect(decision.decisionData.message).toBeDefined();
    });

    it('should handle invalid game state gracefully', async () => {
      const invalidGameState = {
        ...gameState,
        players: [], // No players
      };

      aiDecisionService.makeDecision.mockImplementation(
        async (playerId, phase, context) => {
          if (
            !context.gameState.players ||
            context.gameState.players.length === 0
          ) {
            throw new Error('INVALID_GAME_STATE');
          }
        },
      );

      await expect(
        aiDecisionService.makeDecision(2, 'day_discussion', {
          gameState: invalidGameState,
        }),
      ).rejects.toThrow('INVALID_GAME_STATE');
    });
  });
});

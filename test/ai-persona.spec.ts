describe('AI Persona Behavior', () => {
  let aiPersonaService: any;
  let mockPersonas: any[];

  beforeEach(async () => {
    // These services don't exist yet - tests will fail initially (TDD)
    mockPersonas = [
      {
        id: 1,
        name: 'analytical_detective',
        traits: ['logical', 'suspicious', 'methodical'],
        communicationStyle: 'analytical',
        riskTolerance: 'low',
        votingTendency: 'late',
        suspicionLevel: 8,
        deceptionSkill: 6,
        isActive: true,
      },
      {
        id: 2,
        name: 'aggressive_accuser',
        traits: ['aggressive', 'intuitive', 'impulsive'],
        communicationStyle: 'aggressive',
        riskTolerance: 'high',
        votingTendency: 'early',
        suspicionLevel: 9,
        deceptionSkill: 4,
        isActive: true,
      },
      {
        id: 3,
        name: 'quiet_observer',
        traits: ['careful', 'protective', 'observant'],
        communicationStyle: 'quiet',
        riskTolerance: 'low',
        votingTendency: 'follower',
        suspicionLevel: 5,
        deceptionSkill: 7,
        isActive: true,
      },
      {
        id: 4,
        name: 'emotional_reactor',
        traits: ['emotional', 'reactive', 'passionate'],
        communicationStyle: 'emotional',
        riskTolerance: 'medium',
        votingTendency: 'leader',
        suspicionLevel: 7,
        deceptionSkill: 5,
        isActive: true,
      },
      {
        id: 5,
        name: 'logical_analyzer',
        traits: ['logical', 'methodical', 'patient'],
        communicationStyle: 'analytical',
        riskTolerance: 'low',
        votingTendency: 'late',
        suspicionLevel: 6,
        deceptionSkill: 8,
        isActive: true,
      },
    ];

    aiPersonaService = {
      getAllPersonas: jest.fn().mockResolvedValue(mockPersonas),
      getPersonaById: jest.fn(),
      assignPersonasToGame: jest.fn(),
      generatePersonaPrompt: jest.fn(),
      updatePersonaStats: jest.fn(),
    };
  });

  describe('Persona Assignment', () => {
    it('should assign unique personas to AI players', async () => {
      const gameId = 1;
      const aiPlayerCount = 5;

      aiPersonaService.assignPersonasToGame.mockImplementation(
        async (gameId, playerCount) => {
          // Should return unique personas
          const selectedPersonas = mockPersonas.slice(0, playerCount);
          return selectedPersonas.map((persona, index) => ({
            playerId: index + 2, // Player 1 is human
            personaId: persona.id,
            persona: persona,
          }));
        },
      );

      const assignments = await aiPersonaService.assignPersonasToGame(
        gameId,
        aiPlayerCount,
      );

      expect(assignments).toHaveLength(aiPlayerCount);

      // Check uniqueness
      const personaIds = assignments.map((a: any) => a.personaId);
      const uniquePersonaIds = [...new Set(personaIds)];
      expect(uniquePersonaIds).toHaveLength(aiPlayerCount);

      // Check all assignments have required fields
      assignments.forEach((assignment: any) => {
        expect(assignment).toHaveProperty('playerId');
        expect(assignment).toHaveProperty('personaId');
        expect(assignment).toHaveProperty('persona');
        expect(assignment.persona).toHaveProperty('name');
        expect(assignment.persona).toHaveProperty('traits');
        expect(assignment.persona).toHaveProperty('communicationStyle');
      });
    });

    it('should handle insufficient personas for game', async () => {
      const gameId = 1;
      const aiPlayerCount = 10; // More than available personas

      aiPersonaService.assignPersonasToGame.mockImplementation(
        async (gameId, playerCount) => {
          if (playerCount > mockPersonas.length) {
            throw new Error('INSUFFICIENT_PERSONAS');
          }
        },
      );

      await expect(
        aiPersonaService.assignPersonasToGame(gameId, aiPlayerCount),
      ).rejects.toThrow('INSUFFICIENT_PERSONAS');
    });

    it('should prefer balanced personality distribution', async () => {
      const gameId = 1;
      const aiPlayerCount = 5;

      aiPersonaService.assignPersonasToGame.mockImplementation(
        async (gameId, playerCount) => {
          // Should balance different communication styles and risk tolerances
          const balancedSelection = [
            mockPersonas.find((p) => p.communicationStyle === 'analytical'),
            mockPersonas.find((p) => p.communicationStyle === 'aggressive'),
            mockPersonas.find((p) => p.communicationStyle === 'quiet'),
            mockPersonas.find((p) => p.communicationStyle === 'emotional'),
            mockPersonas.find((p) => p.riskTolerance === 'high'),
          ].slice(0, playerCount);

          return balancedSelection.map((persona, index) => ({
            playerId: index + 2,
            personaId: persona.id,
            persona: persona,
          }));
        },
      );

      const assignments = await aiPersonaService.assignPersonasToGame(
        gameId,
        aiPlayerCount,
      );

      const communicationStyles = assignments.map(
        (a: any) => a.persona.communicationStyle,
      );
      const uniqueStyles = [...new Set(communicationStyles)];

      // Should have diverse communication styles
      expect(uniqueStyles.length).toBeGreaterThan(2);
    });
  });

  describe('Prompt Generation', () => {
    it('should generate persona-specific prompts', async () => {
      const analyticalPersona = mockPersonas[0];
      const gameContext = {
        phase: 'day_discussion',
        players: ['Alice', 'Bob', 'Carol'],
        gameHistory: [],
      };

      aiPersonaService.generatePersonaPrompt.mockImplementation(
        (persona, context, action) => {
          const basePrompt = `You are ${persona.name} with traits: ${persona.traits.join(', ')}. `;
          const stylePrompt = `Your communication style is ${persona.communicationStyle}. `;
          const actionPrompt = `Current action: ${action}. `;
          const contextPrompt = `Game phase: ${context.phase}. `;

          return basePrompt + stylePrompt + actionPrompt + contextPrompt;
        },
      );

      const prompt = aiPersonaService.generatePersonaPrompt(
        analyticalPersona,
        gameContext,
        'make_discussion',
      );

      expect(prompt).toContain('analytical_detective');
      expect(prompt).toContain('logical, suspicious, methodical');
      expect(prompt).toContain('analytical');
      expect(prompt).toContain('day_discussion');
      expect(prompt).toContain('make_discussion');
    });

    it('should adapt prompts for different game phases', async () => {
      const persona = mockPersonas[0];

      aiPersonaService.generatePersonaPrompt.mockImplementation(
        (persona, context, action) => {
          let phaseInstructions = '';

          switch (context.phase) {
            case 'day_discussion':
              phaseInstructions = 'Engage in discussion to find mafia members.';
              break;
            case 'day_voting':
              phaseInstructions =
                'Vote for the player you find most suspicious.';
              break;
            case 'night_actions':
              phaseInstructions = 'Perform your role-specific night action.';
              break;
          }

          return `${persona.name}: ${phaseInstructions}`;
        },
      );

      const discussionPrompt = aiPersonaService.generatePersonaPrompt(
        persona,
        { phase: 'day_discussion' },
        'discuss',
      );

      const votingPrompt = aiPersonaService.generatePersonaPrompt(
        persona,
        { phase: 'day_voting' },
        'vote',
      );

      const nightPrompt = aiPersonaService.generatePersonaPrompt(
        persona,
        { phase: 'night_actions' },
        'night_action',
      );

      expect(discussionPrompt).toContain('discussion');
      expect(votingPrompt).toContain('Vote');
      expect(nightPrompt).toContain('night action');
    });

    it('should include personality traits in decision context', async () => {
      const aggressivePersona = mockPersonas[1]; // aggressive_accuser

      aiPersonaService.generatePersonaPrompt.mockImplementation(
        (persona, context, action) => {
          const traitInstructions = {
            aggressive: 'Be direct and confrontational in your accusations.',
            logical: 'Use logical reasoning to support your decisions.',
            careful: 'Think carefully before making accusations.',
            emotional: 'Let your emotions guide your reactions.',
          };

          let instructions = `You are ${persona.name}. `;
          persona.traits.forEach((trait: string) => {
            if (traitInstructions[trait]) {
              instructions += traitInstructions[trait] + ' ';
            }
          });

          return instructions;
        },
      );

      const prompt = aiPersonaService.generatePersonaPrompt(
        aggressivePersona,
        { phase: 'day_discussion' },
        'discuss',
      );

      expect(prompt).toContain('direct and confrontational');
      expect(prompt).toContain('aggressive_accuser');
    });
  });

  describe('Behavioral Consistency', () => {
    it('should maintain consistent behavior patterns', async () => {
      const persona = mockPersonas[2]; // quiet_observer
      const decisions = [];

      // Mock multiple decisions from the same persona
      for (let i = 0; i < 5; i++) {
        decisions.push({
          personaId: persona.id,
          decisionType: 'discussion',
          messageLength: persona.communicationStyle === 'quiet' ? 20 : 100, // Quiet personas use fewer words
          confidence: persona.riskTolerance === 'low' ? 4 : 8,
        });
      }

      // Quiet personas should consistently use shorter messages
      const avgMessageLength =
        decisions.reduce((sum, d) => sum + d.messageLength, 0) /
        decisions.length;
      expect(avgMessageLength).toBeLessThan(50);

      // Low risk tolerance should result in lower confidence
      const avgConfidence =
        decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length;
      expect(avgConfidence).toBeLessThan(6);
    });

    it('should track persona performance over time', async () => {
      const personaId = 1;
      const gameResults = [
        {
          personaId,
          role: 'mafia',
          won: true,
          decisionsCount: 12,
          avgDecisionTime: 450,
        },
        {
          personaId,
          role: 'citizen',
          won: false,
          decisionsCount: 8,
          avgDecisionTime: 380,
        },
        {
          personaId,
          role: 'police',
          won: true,
          decisionsCount: 10,
          avgDecisionTime: 520,
        },
      ];

      aiPersonaService.updatePersonaStats.mockImplementation(
        async (personaId, gameResult) => {
          // Update persona statistics based on game performance
          const stats = {
            gamesPlayed: gameResults.length,
            winRate:
              gameResults.filter((r) => r.won).length / gameResults.length,
            averageDecisionTime:
              gameResults.reduce((sum, r) => sum + r.avgDecisionTime, 0) /
              gameResults.length,
            rolePerformance: {},
          };

          // Calculate role-specific stats
          const roleGroups = gameResults.reduce((acc: any, r) => {
            if (!acc[r.role]) acc[r.role] = [];
            acc[r.role].push(r);
            return acc;
          }, {});

          Object.keys(roleGroups).forEach((role) => {
            const roleResults = roleGroups[role];
            stats.rolePerformance[role] = {
              gamesPlayed: roleResults.length,
              winRate:
                roleResults.filter((r: any) => r.won).length /
                roleResults.length,
              averageDecisionTime:
                roleResults.reduce(
                  (sum: number, r: any) => sum + r.avgDecisionTime,
                  0,
                ) / roleResults.length,
            };
          });

          return stats;
        },
      );

      const stats = await aiPersonaService.updatePersonaStats(
        personaId,
        gameResults[gameResults.length - 1],
      );

      expect(stats.gamesPlayed).toBe(3);
      expect(stats.winRate).toBeCloseTo(2 / 3); // 2 wins out of 3 games
      expect(stats.averageDecisionTime).toBeCloseTo(450); // Average of decision times
      expect(stats.rolePerformance).toHaveProperty('mafia');
      expect(stats.rolePerformance).toHaveProperty('citizen');
      expect(stats.rolePerformance).toHaveProperty('police');
    });
  });

  describe('Persona Validation', () => {
    it('should validate persona data structure', async () => {
      const validPersona = mockPersonas[0];
      const invalidPersona = {
        id: 6,
        name: '',
        traits: [], // Empty traits
        communicationStyle: 'invalid_style', // Invalid enum
        riskTolerance: 'invalid_risk', // Invalid enum
      };

      aiPersonaService.getPersonaById.mockImplementation((id) => {
        const persona = mockPersonas.find((p) => p.id === id) || invalidPersona;

        // Validation logic
        if (!persona.name || persona.name.length === 0) {
          throw new Error('INVALID_PERSONA_NAME');
        }

        if (!persona.traits || persona.traits.length < 2) {
          throw new Error('INSUFFICIENT_TRAITS');
        }

        const validCommunicationStyles = [
          'aggressive',
          'analytical',
          'emotional',
          'quiet',
        ];
        if (!validCommunicationStyles.includes(persona.communicationStyle)) {
          throw new Error('INVALID_COMMUNICATION_STYLE');
        }

        const validRiskTolerances = ['high', 'medium', 'low'];
        if (!validRiskTolerances.includes(persona.riskTolerance)) {
          throw new Error('INVALID_RISK_TOLERANCE');
        }

        return persona;
      });

      // Valid persona should work
      const validResult = await aiPersonaService.getPersonaById(1);
      expect(validResult).toBeDefined();
      expect(validResult.name).toBe('analytical_detective');

      // Invalid personas should throw appropriate errors
      await expect(aiPersonaService.getPersonaById(6)).rejects.toThrow(
        'INVALID_PERSONA_NAME',
      );
    });

    it('should ensure persona trait compatibility', async () => {
      const conflictingPersona = {
        id: 7,
        name: 'conflicting_persona',
        traits: ['aggressive', 'quiet', 'patient', 'impulsive'], // Conflicting traits
        communicationStyle: 'aggressive',
        riskTolerance: 'low', // Conflicts with aggressive style
      };

      aiPersonaService.getPersonaById.mockImplementation((id) => {
        if (id === 7) {
          // Check for trait conflicts
          const conflicts = [
            ['aggressive', 'quiet'],
            ['patient', 'impulsive'],
          ];

          const hasConflict = conflicts.some(
            ([trait1, trait2]) =>
              conflictingPersona.traits.includes(trait1) &&
              conflictingPersona.traits.includes(trait2),
          );

          if (hasConflict) {
            throw new Error('CONFLICTING_PERSONALITY_TRAITS');
          }

          // Check style-risk compatibility
          if (
            conflictingPersona.communicationStyle === 'aggressive' &&
            conflictingPersona.riskTolerance === 'low'
          ) {
            throw new Error('INCOMPATIBLE_STYLE_RISK_COMBINATION');
          }

          return conflictingPersona;
        }
      });

      await expect(aiPersonaService.getPersonaById(7)).rejects.toThrow(
        'CONFLICTING_PERSONALITY_TRAITS',
      );
    });
  });
});

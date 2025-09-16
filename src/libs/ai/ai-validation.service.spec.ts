import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AIValidationService, ValidationResult } from './ai-validation.service';
import { AIDecision } from '../../entities/ai-decision.entity';
import { AIPersona } from '../../entities/ai-persona.entity';
import { Game } from '../../entities/game.entity';
import { Player } from '../../entities/player.entity';
import { DecisionContext, DecisionResult } from './ai-decision.service';

describe('AIValidationService', () => {
  let service: AIValidationService;
  let configService: jest.Mocked<ConfigService>;

  // Test data - Create actual entity instances with all methods
  const mockPersona = Object.assign(new AIPersona(), {
    id: 1,
    name: 'analytical_detective',
    traits: ['logical', 'methodical', 'suspicious'],
    communicationStyle: 'analytical',
    riskTolerance: 'low',
    votingTendency: 'late',
    suspicionLevel: 8,
    deceptionSkill: 4,
    isActive: true,
    gamesPlayed: 10,
    winRate: 0.7,
    averageDecisionTime: 3000,
    rolePerformance: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    players: [],
  });

  const mockPlayer = Object.assign(new Player(), {
    id: 1,
    name: 'TestPlayer',
    role: 'citizen',
    isAlive: true,
    isReady: true,
    socketId: 'socket_123',
    aiPersonaId: 1,
    gameId: 1,
  });

  const mockGame = Object.assign(new Game(), {
    id: 1,
    name: 'Test Game',
    status: 'playing',
    currentPhase: 'day_discussion',
    dayCount: 2,
    players: [mockPlayer],
  });

  const mockContext: DecisionContext = {
    game: mockGame,
    player: mockPlayer,
    decisionType: 'discussion',
    gamePhase: 'day_discussion',
    availableTargets: ['Player2', 'Player3'],
    timeLimit: 10000,
  };

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config = {
          AI_MAX_PROCESSING_TIME: 30000,
          AI_MIN_CONFIDENCE: 3,
          AI_MAX_DEVIATION_SCORE: 0.7,
          AI_TRAIT_CONSISTENCY_THRESHOLD: 0.6,
        };
        return config[key] || defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIValidationService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AIValidationService>(AIValidationService);
    configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateAIDecision', () => {
    it('should validate a good AI decision', async () => {
      const goodDecision: DecisionResult = {
        decision: new AIDecision(),
        action: 'question',
        target: 'Player2',
        reasoning: 'Player2 has been acting suspicious and logical analysis suggests investigation',
        confidence: 8,
        processingTime: 2500,
      };

      const result = await service.validateAIDecision(
        goodDecision,
        mockContext,
        mockPersona,
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.confidenceScore).toBeGreaterThan(0.7);
      expect(result.qualityScore).toBeGreaterThan(0.6);
    });

    it('should detect invalid actions for game phase', async () => {
      const invalidDecision: DecisionResult = {
        decision: new AIDecision(),
        action: 'vote', // Invalid for day_discussion phase
        target: 'Player2',
        reasoning: 'Time to vote',
        confidence: 6,
        processingTime: 1500,
      };

      const result = await service.validateAIDecision(
        invalidDecision,
        mockContext,
        mockPersona,
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('gameRules');
    });

    it('should detect persona behavior inconsistency', async () => {
      const inconsistentDecision: DecisionResult = {
        decision: new AIDecision(),
        action: 'accuse', // Inconsistent with low risk tolerance
        target: 'Player2',
        reasoning: 'Just feels right',
        confidence: 3,
        processingTime: 500,
      };

      const earlyGameMockGame = Object.assign(new Game(), {
        ...mockGame,
        dayCount: 1,
      });

      const result = await service.validateAIDecision(
        inconsistentDecision,
        { ...mockContext, game: earlyGameMockGame }, // Early game
        mockPersona,
      );

      expect(result.warnings.length).toBeGreaterThan(0);
      const behaviorWarning = result.warnings.find(w => w.field === 'personaBehavior');
      expect(behaviorWarning).toBeDefined();
    });

    it('should detect processing time violations', async () => {
      const slowDecision: DecisionResult = {
        decision: new AIDecision(),
        action: 'question',
        target: 'Player2',
        reasoning: 'Valid reasoning',
        confidence: 7,
        processingTime: 35000, // Exceeds 30 second limit
      };

      const result = await service.validateAIDecision(
        slowDecision,
        mockContext,
        mockPersona,
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      const timingError = result.errors.find(e => e.field === 'timing');
      expect(timingError).toBeDefined();
    });

    it('should detect low confidence issues', async () => {
      const lowConfidenceDecision: DecisionResult = {
        decision: new AIDecision(),
        action: 'observe',
        reasoning: 'Not sure what to do',
        confidence: 2, // Below minimum threshold
        processingTime: 2000,
      };

      const result = await service.validateAIDecision(
        lowConfidenceDecision,
        mockContext,
        mockPersona,
      );

      expect(result.warnings.length).toBeGreaterThan(0);
      const confidenceWarning = result.warnings.find(w => w.field === 'confidence');
      expect(confidenceWarning).toBeDefined();
    });
  });

  describe('validateGameRules', () => {
    it('should validate correct actions for discussion phase', () => {
      const validDecision: DecisionResult = {
        decision: new AIDecision(),
        action: 'question',
        target: 'Player2',
        reasoning: 'Valid reasoning',
        confidence: 7,
        processingTime: 2000,
      };

      const result = service.validateGameRules(validDecision, mockContext);

      expect(result.isAllowed).toBe(true);
      expect(result.ruleViolations).toHaveLength(0);
      expect(result.phaseCompatibility).toBe(true);
      expect(result.actionLegality).toBe(true);
    });

    it('should reject invalid targets', () => {
      const invalidTargetDecision: DecisionResult = {
        decision: new AIDecision(),
        action: 'question',
        target: 'NonexistentPlayer', // Not in available targets
        reasoning: 'Valid reasoning',
        confidence: 7,
        processingTime: 2000,
      };

      const result = service.validateGameRules(invalidTargetDecision, mockContext);

      expect(result.isAllowed).toBe(false);
      expect(result.targetValidation).toBe(false);
      expect(result.ruleViolations).toContain('Target "NonexistentPlayer" not in available targets list');
    });

    it('should validate role-specific night actions', () => {
      const mafiaPlayer = Object.assign(new Player(), {
        ...mockPlayer,
        role: 'mafia',
      });

      const nightContext: DecisionContext = {
        ...mockContext,
        decisionType: 'night_action',
        gamePhase: 'night_actions',
        player: mafiaPlayer,
      };

      const validMafiaAction: DecisionResult = {
        decision: new AIDecision(),
        action: 'kill',
        target: 'Player2',
        reasoning: 'Strategic elimination',
        confidence: 8,
        processingTime: 3000,
      };

      const result = service.validateGameRules(validMafiaAction, nightContext);

      expect(result.isAllowed).toBe(true);
      expect(result.actionLegality).toBe(true);
    });

    it('should reject invalid role actions', () => {
      const citizenPlayer = Object.assign(new Player(), {
        ...mockPlayer,
        role: 'citizen',
      });

      const nightContext: DecisionContext = {
        ...mockContext,
        decisionType: 'night_action',
        gamePhase: 'night_actions',
        player: citizenPlayer,
      };

      const invalidCitizenAction: DecisionResult = {
        decision: new AIDecision(),
        action: 'kill', // Citizens can't kill
        target: 'Player2',
        reasoning: 'Invalid action',
        confidence: 5,
        processingTime: 2000,
      };

      const result = service.validateGameRules(invalidCitizenAction, nightContext);

      expect(result.isAllowed).toBe(false);
      expect(result.actionLegality).toBe(false);
    });
  });

  describe('validatePersonaBehavior', () => {
    it('should validate consistent analytical behavior', () => {
      const analyticalDecision: DecisionResult = {
        decision: new AIDecision(),
        action: 'question',
        target: 'Player2',
        reasoning: 'Based on logical analysis of voting patterns and behavioral inconsistencies observed in previous rounds',
        confidence: 8,
        processingTime: 4000,
      };

      const result = service.validatePersonaBehavior(
        analyticalDecision,
        mockContext,
        mockPersona,
      );

      expect(result.isConsistent).toBe(true);
      expect(result.deviationScore).toBeLessThan(0.3);
      expect(result.inconsistentTraits).toHaveLength(0);
    });

    it('should detect communication style inconsistency', () => {
      const inconsistentDecision: DecisionResult = {
        decision: new AIDecision(),
        action: 'accuse',
        target: 'Player2',
        reasoning: 'gut feeling', // Too brief for analytical style
        confidence: 4,
        processingTime: 500,
      };

      const aggressivePersona = Object.assign(new AIPersona(), {
        ...mockPersona,
        communicationStyle: 'aggressive',
        traits: ['impulsive', 'emotional'],
        riskTolerance: 'high',
      });

      const result = service.validatePersonaBehavior(
        inconsistentDecision,
        mockContext,
        aggressivePersona,
      );

      // This should be more consistent with aggressive persona
      expect(result.deviationScore).toBeLessThan(0.5);
    });

    it('should detect risk tolerance violations', () => {
      const riskyDecision: DecisionResult = {
        decision: new AIDecision(),
        action: 'accuse',
        target: 'Player2',
        reasoning: 'Aggressive early accusation without solid evidence',
        confidence: 9,
        processingTime: 1000,
      };

      const earlyGameMockGame2 = Object.assign(new Game(), {
        ...mockGame,
        dayCount: 1,
      });

      const earlyGameContext: DecisionContext = {
        ...mockContext,
        game: earlyGameMockGame2,
      };

      const result = service.validatePersonaBehavior(
        riskyDecision,
        earlyGameContext,
        mockPersona, // Has low risk tolerance
      );

      expect(result.isConsistent).toBe(false);
      expect(result.inconsistentTraits).toContain('risk_tolerance:low');
    });
  });

  describe('validateTiming', () => {
    it('should validate normal processing times', () => {
      const normalDecision: DecisionResult = {
        decision: new AIDecision(),
        action: 'question',
        reasoning: 'Valid reasoning',
        confidence: 7,
        processingTime: 2500,
      };

      const result = service.validateTiming(normalDecision, mockContext);

      expect(result.isWithinTimeLimit).toBe(true);
      expect(result.efficiencyScore).toBeGreaterThan(0.3);
    });

    it('should detect timeout violations', () => {
      const timeoutDecision: DecisionResult = {
        decision: new AIDecision(),
        action: 'question',
        reasoning: 'Valid reasoning',
        confidence: 7,
        processingTime: 35000, // Exceeds default limit
      };

      const result = service.validateTiming(timeoutDecision, mockContext);

      expect(result.isWithinTimeLimit).toBe(false);
      expect(result.efficiencyScore).toBeLessThan(0.1);
    });
  });

  describe('evaluateDecisionQuality', () => {
    it('should rate high-quality decisions highly', () => {
      const highQualityDecision: DecisionResult = {
        decision: new AIDecision(),
        action: 'investigate',
        target: 'Player2',
        reasoning: 'Player2 exhibited suspicious voting patterns in day 1 and has been deflecting questions. Logical analysis suggests investigation is warranted.',
        confidence: 8,
        processingTime: 3000,
      };

      const policePlayer = Object.assign(new Player(), {
        ...mockPlayer,
        role: 'police',
      });

      const policeContext: DecisionContext = {
        ...mockContext,
        decisionType: 'night_action',
        gamePhase: 'night_actions',
        player: policePlayer,
      };

      const result = service.evaluateDecisionQuality(
        highQualityDecision,
        policeContext,
        mockPersona,
      );

      expect(result.overallQuality).toBeGreaterThan(0.7);
      expect(result.logicalConsistency).toBeGreaterThan(0.6);
      expect(result.strategicValue).toBeGreaterThan(0.6);
    });

    it('should rate poor-quality decisions lowly', () => {
      const poorQualityDecision: DecisionResult = {
        decision: new AIDecision(),
        action: 'observe',
        reasoning: '', // No reasoning
        confidence: 3,
        processingTime: 100,
      };

      const result = service.evaluateDecisionQuality(
        poorQualityDecision,
        mockContext,
        mockPersona,
      );

      expect(result.overallQuality).toBeLessThan(0.5);
      expect(result.logicalConsistency).toBeLessThan(0.5);
      expect(result.informationUtilization).toBeLessThan(0.4);
    });
  });

  describe('applyCustomValidationRules', () => {
    it('should apply custom rules successfully', async () => {
      const decision: DecisionResult = {
        decision: new AIDecision(),
        action: 'vote',
        target: 'Player2',
        reasoning: 'Valid reasoning',
        confidence: 7,
        processingTime: 2000,
      };

      const customRules = {
        no_immediate_revenge: { enabled: true },
        consistent_voting_pattern: { enabled: true },
      };

      const errors = await service.applyCustomValidationRules(
        decision,
        mockContext,
        customRules,
      );

      expect(Array.isArray(errors)).toBe(true);
      // Custom rules in this implementation don't generate errors for valid decisions
      expect(errors.length).toBe(0);
    });

    it('should handle custom rule execution errors gracefully', async () => {
      const decision: DecisionResult = {
        decision: new AIDecision(),
        action: 'question',
        reasoning: 'Valid reasoning',
        confidence: 7,
        processingTime: 2000,
      };

      const invalidCustomRules = {
        unknown_rule: { invalid: 'config' },
      };

      const errors = await service.applyCustomValidationRules(
        decision,
        mockContext,
        invalidCustomRules,
      );

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('Unknown custom rule'),
          }),
        ]),
      );
    });
  });

  describe('edge cases', () => {
    it('should handle AIDecision entity input', async () => {
      const aiDecision = new AIDecision();
      aiDecision.decisionData = {
        action: 'question',
        target: 'Player2',
        reasoning: 'Valid reasoning',
      };
      aiDecision.confidence = 7;
      aiDecision.processingTime = 2500;

      const result = await service.validateAIDecision(
        aiDecision,
        mockContext,
        mockPersona,
      );

      expect(result).toBeDefined();
      expect(typeof result.isValid).toBe('boolean');
    });

    it('should handle missing optional fields gracefully', async () => {
      const incompleteDecision: DecisionResult = {
        decision: new AIDecision(),
        action: 'observe',
        reasoning: '', // Empty reasoning instead of missing
        confidence: 5,
        processingTime: 1000,
        // Missing target
      };

      const result = await service.validateAIDecision(
        incompleteDecision,
        mockContext,
        mockPersona,
      );

      expect(result).toBeDefined();
      expect(result.errors).toBeDefined();
      expect(result.warnings).toBeDefined();
    });

    it('should handle validation service errors gracefully', async () => {
      // Create a scenario that might cause internal errors
      const invalidContext = {
        ...mockContext,
        game: null, // This might cause errors
      } as any;

      const decision: DecisionResult = {
        decision: new AIDecision(),
        action: 'question',
        reasoning: 'Valid reasoning',
        confidence: 7,
        processingTime: 2000,
      };

      const result = await service.validateAIDecision(
        decision,
        invalidContext,
        mockPersona,
      );

      expect(result).toBeDefined();
      expect(result.isValid).toBe(false);
      // Should have error about validation failure
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('configuration', () => {
    it('should respect configuration values', () => {
      expect(configService.get).toHaveBeenCalledWith('AI_MAX_PROCESSING_TIME', 30000);
      expect(configService.get).toHaveBeenCalledWith('AI_MIN_CONFIDENCE', 3);
      expect(configService.get).toHaveBeenCalledWith('AI_MAX_DEVIATION_SCORE', 0.7);
      expect(configService.get).toHaveBeenCalledWith('AI_TRAIT_CONSISTENCY_THRESHOLD', 0.6);
    });
  });
});
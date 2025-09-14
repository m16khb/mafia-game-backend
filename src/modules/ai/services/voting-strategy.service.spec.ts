import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@libs/logger';
import { VotingStrategyService } from './voting-strategy.service';
import { Game, GameRole } from '../../../entities/game.entity';
import { Player } from '../../../entities/player.entity';
import { AIPersona, PersonalityTraits } from '../types/ai-persona.types';
import { SuspicionData } from '../types/suspicion.types';
import { VotingDecision, ExplanationStyle } from '../types/voting-strategy.types';

describe('투표 전략 서비스', () => {
  let service: VotingStrategyService;
  let mockLogger: jest.Mocked<Logger>;

  const createMockGame = (playerCount: number = 6): Game => {
    const game = new Game();
    game.id = 1;
    game.currentPhase = 'voting';
    game.dayCount = 2;
    game.status = 'playing';
    game.players = [];
    return game;
  };

  const createMockPlayer = (id: number, role: GameRole, isAlive: boolean = true): Player => {
    const player = new Player();
    player.id = id;
    player.name = `Player${id}`;
    player.role = role;
    player.isAlive = isAlive;
    player.isAi = true;
    return player;
  };

  const createMockPersona = (personalityOverrides?: Partial<PersonalityTraits>): AIPersona => {
    return {
      id: 'test-persona',
      name: 'TestPersona',
      personality: {
        aggression: 0.5,
        caution: 0.5,
        trust: 0.5,
        leadership: 0.5,
        analytical: 0.5,
        emotional: 0.5,
        ...personalityOverrides
      },
      playStyle: {
        votingPattern: 'analytical',
        discussionLevel: 'active',
        suspicionThreshold: 0.5,
        teamplayPreference: 0.5
      },
      communicationStyle: {
        formality: 0.5,
        verbosity: 0.5,
        directness: 0.5,
        responsiveness: 0.5,
        quickness: 0.5
      },
      suspicionBehavior: {
        investigateFrequency: 0.5,
        shareFindings: 0.5,
        accusationCaution: 0.5,
        responseToAccusation: 0.5
      }
    };
  };

  const createMockSuspicionData = (level: number = 0.5): SuspicionData => {
    return {
      level,
      reasons: [
        {
          type: 'chat_analysis',
          description: 'Suspicious behavior detected',
          intensity: level,
          confidence: 0.7,
          timestamp: new Date()
        }
      ],
      history: [],
      lastUpdated: new Date(),
      confidence: 0.7
    };
  };

  beforeEach(async () => {
    const mockLoggerInstance = {
      setContext: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VotingStrategyService,
        {
          provide: Logger,
          useValue: mockLoggerInstance
        }
      ]
    }).compile();

    service = module.get<VotingStrategyService>(VotingStrategyService);
    mockLogger = module.get(Logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('서비스가 정의되어야 함', () => {
    expect(service).toBeDefined();
  });

  describe('투표 결정 계산', () => {
    it('마피아 플레이어가 시민을 타겟으로 선택해야 함', async () => {
      const game = createMockGame();
      const mafiaPlayer = createMockPlayer(1, 'mafia');
      const citizenPlayer = createMockPlayer(2, 'citizen');
      const policePlayer = createMockPlayer(3, 'police');
      
      game.players = [mafiaPlayer, citizenPlayer, policePlayer];
      jest.spyOn(game, 'getAlivePlayers').mockReturnValue([mafiaPlayer, citizenPlayer, policePlayer]);

      const persona = createMockPersona({ aggression: 0.8 });
      const suspicionData = new Map([
        [2, createMockSuspicionData(0.3)],
        [3, createMockSuspicionData(0.7)]
      ]);

      const decision = await service.calculateVote(mafiaPlayer, persona, game, suspicionData);

      expect(decision).toBeDefined();
      expect(decision.target.id).not.toBe(mafiaPlayer.id);
      expect(decision.confidence).toBeGreaterThan(0);
      expect(decision.reasoning).toContain('Player');
      expect(mockLogger.log).toHaveBeenCalledWith('Calculating vote for player Player1 (mafia)');
    });

    it('시민 플레이어가 의심도가 높은 플레이어를 선택해야 함', async () => {
      const game = createMockGame();
      const citizenPlayer = createMockPlayer(1, 'citizen');
      const suspectedPlayer = createMockPlayer(2, 'citizen');
      const normalPlayer = createMockPlayer(3, 'citizen');
      
      game.players = [citizenPlayer, suspectedPlayer, normalPlayer];
      jest.spyOn(game, 'getAlivePlayers').mockReturnValue([citizenPlayer, suspectedPlayer, normalPlayer]);

      const persona = createMockPersona({ analytical: 0.9 });
      const suspicionData = new Map([
        [2, createMockSuspicionData(0.9)], // 높은 의심도
        [3, createMockSuspicionData(0.2)]  // 낮은 의심도
      ]);

      const decision = await service.calculateVote(citizenPlayer, persona, game, suspicionData);

      expect(decision.target.id).toBe(2); // 의심도가 높은 플레이어 선택
      expect(decision.confidence).toBeGreaterThan(0.1);
    });

    it('경찰 플레이어가 분석적 접근을 해야 함', async () => {
      const game = createMockGame();
      const policePlayer = createMockPlayer(1, 'police');
      const suspectedMafia = createMockPlayer(2, 'citizen'); // 실제로는 마피아로 의심
      const citizenPlayer = createMockPlayer(3, 'citizen');
      
      game.players = [policePlayer, suspectedMafia, citizenPlayer];
      jest.spyOn(game, 'getAlivePlayers').mockReturnValue([policePlayer, suspectedMafia, citizenPlayer]);

      const persona = createMockPersona({ analytical: 0.9, caution: 0.8 });
      const suspicionData = new Map([
        [2, createMockSuspicionData(0.8)],
        [3, createMockSuspicionData(0.2)]
      ]);

      const decision = await service.calculateVote(policePlayer, persona, game, suspicionData);

      expect(decision).toBeDefined();
      expect(decision.target.id).toBe(2);
      expect(decision.confidence).toBeDefined();
    });

    it('의사 플레이어가 신중한 투표를 해야 함', async () => {
      const game = createMockGame();
      const doctorPlayer = createMockPlayer(1, 'doctor');
      const player2 = createMockPlayer(2, 'citizen');
      const player3 = createMockPlayer(3, 'citizen');
      
      game.players = [doctorPlayer, player2, player3];
      jest.spyOn(game, 'getAlivePlayers').mockReturnValue([doctorPlayer, player2, player3]);

      const persona = createMockPersona({ caution: 0.9, analytical: 0.7 });
      const suspicionData = new Map([
        [2, createMockSuspicionData(0.6)],
        [3, createMockSuspicionData(0.4)]
      ]);

      const decision = await service.calculateVote(doctorPlayer, persona, game, suspicionData);

      expect(decision).toBeDefined();
      expect(decision.confidence).toBeLessThan(0.9); // 신중함으로 인한 낮은 확신도
    });
  });

  describe('성격에 따른 투표 전략', () => {
    it('공격적인 성격이 더 높은 확신도를 가져야 함', async () => {
      const game = createMockGame();
      const player = createMockPlayer(1, 'citizen');
      const target = createMockPlayer(2, 'citizen');
      
      game.players = [player, target];
      jest.spyOn(game, 'getAlivePlayers').mockReturnValue([player, target]);

      const aggressivePersona = createMockPersona({ aggression: 0.9 });
      const cautiousPersona = createMockPersona({ aggression: 0.1, caution: 0.9 });
      
      const suspicionData = new Map([[2, createMockSuspicionData(0.6)]]);

      const aggressiveDecision = await service.calculateVote(player, aggressivePersona, game, suspicionData);
      const cautiousDecision = await service.calculateVote(player, cautiousPersona, game, suspicionData);

      expect(aggressiveDecision.confidence).toBeGreaterThan(cautiousDecision.confidence);
    });

    it('분석적인 성격이 더 상세한 추론을 제공해야 함', async () => {
      const game = createMockGame();
      const player = createMockPlayer(1, 'citizen');
      const target = createMockPlayer(2, 'citizen');
      
      game.players = [player, target];
      jest.spyOn(game, 'getAlivePlayers').mockReturnValue([player, target]);

      const analyticalPersona = createMockPersona({ analytical: 0.9 });
      const suspicionData = new Map([[2, createMockSuspicionData(0.7)]]);

      const decision = await service.calculateVote(player, analyticalPersona, game, suspicionData);

      expect(decision.shouldExplain).toBe(true);
      expect(decision.reasoning).toBeDefined();
      expect(decision.reasoning.length).toBeGreaterThan(10);
    });
  });

  describe('투표 설명 생성', () => {
    it('투표 설명이 성격에 맞게 생성되어야 함', async () => {
      const game = createMockGame();
      const player = createMockPlayer(1, 'citizen');
      const target = createMockPlayer(2, 'citizen');
      
      game.players = [player, target];
      jest.spyOn(game, 'getAlivePlayers').mockReturnValue([player, target]);

      const persona = createMockPersona({ 
        analytical: 0.9,
        emotional: 0.3
      });
      
      const suspicionData = new Map([[2, createMockSuspicionData(0.8)]]);
      const decision = await service.calculateVote(player, persona, game, suspicionData);

      const votingContext = {
        game,
        voter: player,
        persona,
        phase: game.currentPhase,
        candidates: [target],
        suspicionData,
        gameContext: {
          phase: game.currentPhase,
          dayCount: game.dayCount,
          alivePlayersCount: 2,
          recentEvents: []
        },
        existingVotes: new Map(),
        timeRemaining: 60,
        additionalInfo: {}
      };

      const explanation = await service.generateVoteExplanation(decision, votingContext);

      expect(explanation).toBeDefined();
      expect(explanation.mainExplanation).toContain('Player2');
      expect(explanation.keyReasons).toHaveLength(2);
      expect(explanation.emotionalTone).toBeDefined();
      expect(['neutral', 'confident', 'hesitant', 'defensive', 'aggressive']).toContain(explanation.emotionalTone);
    });

    it('높은 확신도에서는 자신감 있는 톤이어야 함', async () => {
      const game = createMockGame();
      const player = createMockPlayer(1, 'citizen');
      const target = createMockPlayer(2, 'citizen');
      
      game.players = [player, target];
      jest.spyOn(game, 'getAlivePlayers').mockReturnValue([player, target]);

      const confidentPersona = createMockPersona({ aggression: 0.8, leadership: 0.9 });
      const suspicionData = new Map([[2, createMockSuspicionData(0.95)]]);
      
      const decision = await service.calculateVote(player, confidentPersona, game, suspicionData);
      
      // 확신도를 인위적으로 높게 설정
      decision.confidence = 0.9;

      const votingContext = {
        game,
        voter: player,
        persona: confidentPersona,
        phase: game.currentPhase,
        candidates: [target],
        suspicionData,
        gameContext: {
          phase: game.currentPhase,
          dayCount: game.dayCount,
          alivePlayersCount: 2,
          recentEvents: []
        },
        existingVotes: new Map(),
        timeRemaining: 60,
        additionalInfo: {}
      };

      const explanation = await service.generateVoteExplanation(decision, votingContext);

      expect(['confident', 'aggressive']).toContain(explanation.emotionalTone);
    });
  });

  describe('투표 시뮬레이션', () => {
    it('투표 시뮬레이션이 여러 시나리오를 생성해야 함', async () => {
      const game = createMockGame();
      const player = createMockPlayer(1, 'citizen');
      const target1 = createMockPlayer(2, 'citizen');
      const target2 = createMockPlayer(3, 'citizen');
      
      game.players = [player, target1, target2];
      jest.spyOn(game, 'getAlivePlayers').mockReturnValue([player, target1, target2]);

      const persona = createMockPersona();
      const suspicionData = new Map([
        [2, createMockSuspicionData(0.6)],
        [3, createMockSuspicionData(0.4)]
      ]);

      const votingContext = {
        game,
        voter: player,
        persona,
        phase: game.currentPhase,
        candidates: [target1, target2],
        suspicionData,
        gameContext: {
          phase: game.currentPhase,
          dayCount: game.dayCount,
          alivePlayersCount: 3,
          recentEvents: []
        },
        existingVotes: new Map(),
        timeRemaining: 60,
        additionalInfo: {}
      };

      const simulation = await service.simulateVoting(votingContext, 3);

      expect(simulation).toBeDefined();
      expect(simulation.scenarios).toHaveLength(3);
      expect(simulation.optimalChoice).toBeDefined();
      expect(simulation.confidence).toBeGreaterThan(0);
      expect(simulation.simulationId).toBeDefined();
      expect(mockLogger.log).toHaveBeenCalledWith('Running voting simulation with 3 scenarios');
    });
  });

  describe('역할별 전략 차이', () => {
    it('마피아와 시민의 투표 전략이 달라야 함', async () => {
      const game = createMockGame();
      const mafiaPlayer = createMockPlayer(1, 'mafia');
      const citizenPlayer = createMockPlayer(2, 'citizen');
      const targetPlayer = createMockPlayer(3, 'citizen');
      
      game.players = [mafiaPlayer, citizenPlayer, targetPlayer];
      jest.spyOn(game, 'getAlivePlayers').mockReturnValue([mafiaPlayer, citizenPlayer, targetPlayer]);

      const persona = createMockPersona();
      const suspicionData = new Map([[3, createMockSuspicionData(0.5)]]);

      const mafiaDecision = await service.calculateVote(mafiaPlayer, persona, game, suspicionData);
      const citizenDecision = await service.calculateVote(citizenPlayer, persona, game, suspicionData);

      // 마피아는 시민을 제거하려 하고, 시민은 의심스러운 플레이어를 제거하려 함
      expect([citizenPlayer.id, targetPlayer.id]).toContain(mafiaDecision.target.id);
      expect([citizenPlayer.id, targetPlayer.id]).toContain(citizenDecision.target.id);
    });

    it('경찰이 조사 결과를 활용한 전략을 사용해야 함', async () => {
      const game = createMockGame();
      const policePlayer = createMockPlayer(1, 'police');
      const suspectedPlayer = createMockPlayer(2, 'citizen');
      
      // 경찰이 조사를 통해 높은 의심을 가진 상황
      game.players = [policePlayer, suspectedPlayer];
      jest.spyOn(game, 'getAlivePlayers').mockReturnValue([policePlayer, suspectedPlayer]);

      const persona = createMockPersona({ analytical: 0.9 });
      const suspicionData = new Map([[2, createMockSuspicionData(0.9)]]);

      const decision = await service.calculateVote(policePlayer, persona, game, suspicionData);

      expect(decision.confidence).toBeGreaterThan(0.1); // 조사 결과에 기반한 확신
      expect(decision.shouldExplain).toBe(true); // 경찰은 근거를 제시하려 함
    });
  });

  describe('게임 상황에 따른 적응', () => {
    it('게임 후반부에 더 적극적인 투표를 해야 함', async () => {
      const game = createMockGame();
      game.dayCount = 5; // 후반부
      
      const player = createMockPlayer(1, 'citizen');
      const target = createMockPlayer(2, 'citizen');
      
      game.players = [player, target];
      jest.spyOn(game, 'getAlivePlayers').mockReturnValue([player, target]);

      const persona = createMockPersona({ caution: 0.8 });
      const suspicionData = new Map([[2, createMockSuspicionData(0.5)]]);

      const decision = await service.calculateVote(player, persona, game, suspicionData);

      expect(decision).toBeDefined();
      expect(decision.priority).toBeGreaterThan(5); // 후반부에는 높은 우선순위
    });

    it('플레이어가 적을 때 더 신중해야 함', async () => {
      const game = createMockGame();
      const player1 = createMockPlayer(1, 'citizen');
      const player2 = createMockPlayer(2, 'citizen');
      
      game.players = [player1, player2]; // 2명만 남은 상황
      jest.spyOn(game, 'getAlivePlayers').mockReturnValue([player1, player2]);

      const persona = createMockPersona();
      const suspicionData = new Map([[2, createMockSuspicionData(0.4)]]);

      const decision = await service.calculateVote(player1, persona, game, suspicionData);

      expect(decision.confidence).toBeLessThan(0.8); // 신중함으로 인한 낮은 확신도
    });
  });

  describe('오류 처리', () => {
    it('빈 후보 목록에서도 안전하게 처리해야 함', async () => {
      const game = createMockGame();
      const player = createMockPlayer(1, 'citizen');
      
      game.players = [player]; // 자기 혼자만 남은 상황
      jest.spyOn(game, 'getAlivePlayers').mockReturnValue([player]);

      const persona = createMockPersona();
      const suspicionData = new Map();

      await expect(
        service.calculateVote(player, persona, game, suspicionData)
      ).resolves.toBeDefined();
    });

    it('의심 데이터가 없어도 정상 동작해야 함', async () => {
      const game = createMockGame();
      const player = createMockPlayer(1, 'citizen');
      const target = createMockPlayer(2, 'citizen');
      
      game.players = [player, target];
      jest.spyOn(game, 'getAlivePlayers').mockReturnValue([player, target]);

      const persona = createMockPersona();
      const suspicionData = new Map(); // 빈 의심 데이터

      const decision = await service.calculateVote(player, persona, game, suspicionData);

      expect(decision).toBeDefined();
      expect(decision.target).toBeDefined();
      expect(decision.confidence).toBeGreaterThan(0);
    });
  });

  describe('전략 업데이트 및 학습', () => {
    it('투표 결과를 통한 학습이 에러 없이 동작해야 함', () => {
      const player = createMockPlayer(1, 'citizen');
      const target = createMockPlayer(2, 'citizen');
      
      const decision: VotingDecision = {
        target,
        confidence: 0.7,
        reasoning: 'Test reasoning',
        shouldExplain: true,
        priority: 7,
        expectedOutcome: {
          type: 'elimination',
          probability: 0.8,
          teamImpact: { mafiaImpact: -1, citizenImpact: 1, explanation: 'Test' },
          gameStateChange: { suspicionChanges: [], informationReveal: [], allianceChanges: [] }
        },
        alternatives: []
      };

      const actualOutcome = { eliminated: target };
      const gameResult = { winner: 'citizen' };

      expect(() => {
        service.learnFromVotingResult(player, decision, actualOutcome, gameResult);
      }).not.toThrow();
    });

    it('역할별 전략 업데이트가 정상 동작해야 함', () => {
      const newStrategy = {
        name: 'Updated Strategy',
        description: 'Updated description',
        applicableRoles: ['citizen'] as GameRole[],
        priorities: ['eliminate_suspicious'] as any[],
        riskTolerance: 0.6,
        analysisDepth: 0.7,
        teamworkFactor: 0.8,
        suspicionThreshold: 0.4,
        strategicConsiderations: []
      };

      expect(() => {
        service.updateRoleStrategy('citizen', newStrategy);
      }).not.toThrow();

      expect(mockLogger.log).toHaveBeenCalledWith('Updating voting strategy for role: citizen');
    });
  });
});
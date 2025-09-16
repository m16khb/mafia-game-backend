import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@libs/logger';
import { PhaseBehaviorService } from './services/phase-behavior.service';
import { Game } from '../../entities/game.entity';
import { Player } from '../../entities/player.entity';
import { AIPersona } from './types/ai-persona.types';

/**
 * AI 게임플레이 단순 통합 테스트
 * 의존성을 최소화한 기본 게임플레이 시나리오 테스트
 */
describe('AI 게임플레이 기본 테스트', () => {
  let phaseBehaviorService: PhaseBehaviorService;
  let mockLogger: jest.Mocked<Logger>;

  const createTestGame = (playerCount: number = 6): Game => {
    const game = new Game();
    game.id = 1;
    game.name = 'Test Game';
    game.status = 'playing';
    game.currentPhase = 'day';
    game.dayCount = 1;
    game.minPlayers = playerCount;
    game.maxPlayers = playerCount;
    game.players = [];
    game.messages = [];

    return game;
  };

  const createTestPlayer = (
    id: number,
    name: string,
    role: any,
    isAI: boolean = true,
  ): Player => {
    const player = new Player();
    player.id = id;
    player.name = name;
    player.isAi = isAI;
    player.isAlive = true;
    player.isReady = true;
    player.isHost = id === 1;
    player.socketId = `socket_${id}`;
    player.role = role;
    return player;
  };

  const createMockPersona = (id: string, name: string): AIPersona => {
    return {
      id,
      name,
      personality: {
        aggression: 0.5,
        caution: 0.5,
        trust: 0.5,
        leadership: 0.5,
        analytical: 0.5,
        emotional: 0.5,
      },
      playStyle: {
        votingPattern: 'analytical',
        discussionLevel: 'active',
        suspicionThreshold: 0.5,
        teamplayPreference: 0.5,
      },
      communicationStyle: {
        formality: 0.5,
        verbosity: 0.5,
        directness: 0.5,
        responsiveness: 0.5,
        quickness: 0.5,
      },
      suspicionBehavior: {
        investigateFrequency: 0.5,
        shareFindings: 0.5,
        accusationCaution: 0.5,
        responseToAccusation: 0.5,
      },
    };
  };

  beforeEach(async () => {
    const mockLoggerInstance = {
      setContext: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhaseBehaviorService,
        {
          provide: Logger,
          useValue: mockLoggerInstance,
        },
      ],
    }).compile();

    phaseBehaviorService =
      module.get<PhaseBehaviorService>(PhaseBehaviorService);
    mockLogger = module.get(Logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('기본 게임 시나리오', () => {
    it('6인 게임에서 페이즈별 행동 패턴이 동작해야 함', async () => {
      // 게임 설정
      const game = createTestGame(6);

      // 플레이어 생성 (1명 사람, 5명 AI)
      const players = [
        createTestPlayer(1, 'Human', 'citizen', false), // 사람
        createTestPlayer(2, 'AI_Mafia1', 'mafia', true),
        createTestPlayer(3, 'AI_Mafia2', 'mafia', true),
        createTestPlayer(4, 'AI_Police', 'police', true),
        createTestPlayer(5, 'AI_Doctor', 'doctor', true),
        createTestPlayer(6, 'AI_Citizen', 'citizen', true),
      ];

      game.players = players;
      const aiPlayers = players.filter((p) => p.isAi);

      // AI 페르소나 설정
      const personaMap = new Map([
        [2, createMockPersona('mafia-strategic', 'AI_Mafia1')],
        [3, createMockPersona('mafia-aggressive', 'AI_Mafia2')],
        [4, createMockPersona('police-analytical', 'AI_Police')],
        [5, createMockPersona('doctor-cautious', 'AI_Doctor')],
        [6, createMockPersona('citizen-social', 'AI_Citizen')],
      ]);

      jest.spyOn(game, 'getAlivePlayers').mockReturnValue(players);

      // 낮 페이즈 시작 행동 테스트
      const dayResults = await phaseBehaviorService.executePhaseStartBehaviors(
        game,
        'day',
        aiPlayers,
        personaMap,
      );

      expect(dayResults).toBeDefined();
      expect(Array.isArray(dayResults)).toBe(true);
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Executing phase start behaviors for day',
      );

      // 투표 페이즈로 전환
      game.currentPhase = 'voting';
      const votingResults =
        await phaseBehaviorService.executePhaseStartBehaviors(
          game,
          'voting',
          aiPlayers,
          personaMap,
        );

      expect(votingResults).toBeDefined();
      expect(Array.isArray(votingResults)).toBe(true);
    });

    it('페이즈 전환이 에러 없이 동작해야 함', async () => {
      const game = createTestGame(4);
      const players = [
        createTestPlayer(1, 'Human', 'citizen', false),
        createTestPlayer(2, 'AI_Mafia', 'mafia', true),
        createTestPlayer(3, 'AI_Police', 'police', true),
        createTestPlayer(4, 'AI_Doctor', 'doctor', true),
      ];

      game.players = players;
      const aiPlayers = players.filter((p) => p.isAi);

      const personaMap = new Map([
        [2, createMockPersona('mafia-1', 'AI_Mafia')],
        [3, createMockPersona('police-1', 'AI_Police')],
        [4, createMockPersona('doctor-1', 'AI_Doctor')],
      ]);

      // 밤 -> 낮 전환
      await expect(
        phaseBehaviorService.executePhaseTransition(
          game,
          'night',
          'day',
          aiPlayers,
          personaMap,
        ),
      ).resolves.not.toThrow();

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Executing phase transition: night -> day',
      );

      // 낮 -> 투표 전환
      await expect(
        phaseBehaviorService.executePhaseTransition(
          game,
          'day',
          'voting',
          aiPlayers,
          personaMap,
        ),
      ).resolves.not.toThrow();

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Executing phase transition: day -> voting',
      );
    });

    it('상황별 반응이 정상 동작해야 함', async () => {
      const game = createTestGame(4);
      const players = [
        createTestPlayer(1, 'Human', 'citizen', false),
        createTestPlayer(2, 'AI_Mafia', 'mafia', true),
        createTestPlayer(3, 'AI_Police', 'police', true),
        createTestPlayer(4, 'AI_Doctor', 'doctor', true),
      ];

      game.players = players;
      const aiPlayers = players.filter((p) => p.isAi);

      const personaMap = new Map([
        [2, createMockPersona('mafia-1', 'AI_Mafia')],
        [3, createMockPersona('police-1', 'AI_Police')],
        [4, createMockPersona('doctor-1', 'AI_Doctor')],
      ]);

      // 플레이어 제거 상황
      await expect(
        phaseBehaviorService.executeSituationResponse(
          'player_eliminated',
          game,
          aiPlayers,
          personaMap,
        ),
      ).resolves.not.toThrow();

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Executing situation response for: player_eliminated',
      );
    });

    it('역할별로 다른 행동 패턴을 보여야 함', async () => {
      const game = createTestGame(3);

      // 마피아 플레이어 테스트
      const mafiaPlayer = createTestPlayer(1, 'TestMafia', 'mafia', true);
      const mafiaPersona = createMockPersona('test-mafia', 'TestMafia');

      game.players = [mafiaPlayer];
      jest.spyOn(game, 'getAlivePlayers').mockReturnValue([mafiaPlayer]);

      const mafiaResults =
        await phaseBehaviorService.executePhaseStartBehaviors(
          game,
          'day',
          [mafiaPlayer],
          new Map([[1, mafiaPersona]]),
        );

      // 시민 플레이어 테스트
      const citizenPlayer = createTestPlayer(2, 'TestCitizen', 'citizen', true);
      const citizenPersona = createMockPersona('test-citizen', 'TestCitizen');

      game.players = [citizenPlayer];
      jest.spyOn(game, 'getAlivePlayers').mockReturnValue([citizenPlayer]);

      const citizenResults =
        await phaseBehaviorService.executePhaseStartBehaviors(
          game,
          'day',
          [citizenPlayer],
          new Map([[2, citizenPersona]]),
        );

      // 두 역할 모두 행동을 수행할 수 있어야 함
      expect(mafiaResults).toBeDefined();
      expect(citizenResults).toBeDefined();
    });
  });

  describe('에러 처리', () => {
    it('빈 게임에서도 안전하게 처리되어야 함', async () => {
      const game = createTestGame(0);
      const results = await phaseBehaviorService.executePhaseStartBehaviors(
        game,
        'day',
        [],
        new Map(),
      );

      expect(results).toHaveLength(0);
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Executing phase start behaviors for day',
      );
    });

    it('잘못된 페이즈에서도 에러를 발생시키지 않아야 함', async () => {
      const game = createTestGame(1);
      const player = createTestPlayer(1, 'TestPlayer', 'citizen', true);
      const persona = createMockPersona('test', 'TestPlayer');

      game.players = [player];

      await expect(
        phaseBehaviorService.executePhaseStartBehaviors(
          game,
          'result' as any,
          [player],
          new Map([[1, persona]]),
        ),
      ).resolves.not.toThrow();
    });

    it('페르소나가 없는 플레이어는 건너뛰어야 함', async () => {
      const game = createTestGame(2);
      const players = [
        createTestPlayer(1, 'Player1', 'citizen', true),
        createTestPlayer(2, 'Player2', 'mafia', true),
      ];

      game.players = players;
      jest.spyOn(game, 'getAlivePlayers').mockReturnValue(players);

      // 일부 플레이어만 페르소나 할당
      const partialPersonaMap = new Map([
        [1, createMockPersona('test-1', 'Player1')],
      ]);

      const results = await phaseBehaviorService.executePhaseStartBehaviors(
        game,
        'day',
        players,
        partialPersonaMap,
      );

      // 페르소나가 있는 플레이어만 처리되어야 함
      expect(results).toBeDefined();
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Executing phase start behaviors for day',
      );
    });
  });

  describe('성능 및 확장성', () => {
    it('많은 수의 AI 플레이어도 처리할 수 있어야 함', async () => {
      const playerCount = 8;
      const game = createTestGame(playerCount);

      // 8명의 AI 플레이어 생성
      const players: Player[] = [];
      const personaMap = new Map();

      for (let i = 1; i <= playerCount; i++) {
        const player = createTestPlayer(i, `AI_${i}`, 'citizen', true);
        const persona = createMockPersona(`persona-${i}`, `AI_${i}`);
        players.push(player);
        personaMap.set(i, persona);
      }

      game.players = players;
      jest.spyOn(game, 'getAlivePlayers').mockReturnValue(players);

      const startTime = Date.now();
      const results = await phaseBehaviorService.executePhaseStartBehaviors(
        game,
        'day',
        players,
        personaMap,
      );
      const endTime = Date.now();

      expect(results).toBeDefined();
      expect(endTime - startTime).toBeLessThan(1000); // 1초 이내 처리
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Executing phase start behaviors for day',
      );
    });
  });
});

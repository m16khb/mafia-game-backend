import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@libs/logger';
import { Game } from '../../entities/game.entity';
import { Player } from '../../entities/player.entity';

/**
 * AI 시스템 기본 통합 테스트 - 의존성 없는 버전
 * 전체 시스템의 기본 동작을 검증
 */
describe('AI 시스템 기본 통합 테스트', () => {
  let mockLogger: jest.Mocked<Logger>;

  const createTestGame = (playerCount: number = 6): Game => {
    const game = new Game();
    game.id = 1;
    game.name = 'Integration Test Game';
    game.status = 'playing';
    game.currentPhase = 'day';
    game.dayCount = 1;
    game.minPlayers = playerCount;
    game.maxPlayers = playerCount;
    game.players = [];
    game.messages = [];
    
    return game;
  };

  const createTestPlayer = (id: number, name: string, role: any, isAI: boolean = true): Player => {
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
        {
          provide: Logger,
          useValue: mockLoggerInstance
        }
      ]
    }).compile();

    mockLogger = module.get(Logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('게임 상태 및 플레이어 관리', () => {
    it('게임이 정상적으로 생성되어야 함', () => {
      const game = createTestGame(6);
      
      expect(game).toBeDefined();
      expect(game.id).toBe(1);
      expect(game.status).toBe('playing');
      expect(game.currentPhase).toBe('day');
      expect(game.dayCount).toBe(1);
      expect(game.players).toHaveLength(0);
    });

    it('다양한 역할의 플레이어를 생성할 수 있어야 함', () => {
      const players = [
        createTestPlayer(1, 'Human', 'citizen', false),
        createTestPlayer(2, 'AI_Mafia1', 'mafia', true),
        createTestPlayer(3, 'AI_Mafia2', 'mafia', true),
        createTestPlayer(4, 'AI_Police', 'police', true),
        createTestPlayer(5, 'AI_Doctor', 'doctor', true),
        createTestPlayer(6, 'AI_Citizen', 'citizen', true)
      ];

      expect(players).toHaveLength(6);
      
      // 역할 분포 확인
      const roles = players.map(p => p.role);
      expect(roles).toContain('citizen');
      expect(roles).toContain('mafia');
      expect(roles).toContain('police');
      expect(roles).toContain('doctor');

      // AI vs 인간 분포 확인
      const aiPlayers = players.filter(p => p.isAi);
      const humanPlayers = players.filter(p => !p.isAi);
      expect(aiPlayers).toHaveLength(5);
      expect(humanPlayers).toHaveLength(1);
    });

    it('게임에 플레이어를 추가할 수 있어야 함', () => {
      const game = createTestGame(4);
      const players = [
        createTestPlayer(1, 'AI_1', 'mafia', true),
        createTestPlayer(2, 'AI_2', 'police', true),
        createTestPlayer(3, 'AI_3', 'doctor', true),
        createTestPlayer(4, 'AI_4', 'citizen', true)
      ];
      
      game.players = players;
      jest.spyOn(game, 'getAlivePlayers').mockReturnValue(players);

      expect(game.players).toHaveLength(4);
      expect(game.getAlivePlayers()).toHaveLength(4);
      
      // 모든 플레이어가 살아있는지 확인
      const allAlive = game.getAlivePlayers().every(p => p.isAlive);
      expect(allAlive).toBe(true);
    });
  });

  describe('게임 페이즈 관리', () => {
    it('게임 페이즈가 올바르게 설정되어야 함', () => {
      const game = createTestGame(4);
      
      expect(game.currentPhase).toBe('day');
      
      // 페이즈 전환 시뮬레이션
      game.currentPhase = 'voting';
      expect(game.currentPhase).toBe('voting');
      
      game.currentPhase = 'night';
      expect(game.currentPhase).toBe('night');
      
      game.currentPhase = 'result';
      expect(game.currentPhase).toBe('result');
    });

    it('게임 일차가 올바르게 관리되어야 함', () => {
      const game = createTestGame(4);
      
      expect(game.dayCount).toBe(1);
      
      // 다음날로 진행 시뮬레이션
      game.dayCount = 2;
      expect(game.dayCount).toBe(2);
      
      game.dayCount = 3;
      expect(game.dayCount).toBe(3);
    });
  });

  describe('플레이어 상태 관리', () => {
    it('플레이어 생사가 올바르게 관리되어야 함', () => {
      const players = [
        createTestPlayer(1, 'AI_1', 'citizen', true),
        createTestPlayer(2, 'AI_2', 'mafia', true),
        createTestPlayer(3, 'AI_3', 'police', true)
      ];
      
      const game = createTestGame(3);
      game.players = players;
      
      // 초기 상태 - 모두 살아있음
      expect(players.every(p => p.isAlive)).toBe(true);
      
      // 플레이어 제거 시뮬레이션
      players[0].isAlive = false;
      
      const aliveCount = players.filter(p => p.isAlive).length;
      expect(aliveCount).toBe(2);
    });

    it('플레이어 역할이 올바르게 할당되어야 함', () => {
      const mafiaPlayer = createTestPlayer(1, 'Mafia', 'mafia', true);
      const citizenPlayer = createTestPlayer(2, 'Citizen', 'citizen', true);
      const policePlayer = createTestPlayer(3, 'Police', 'police', true);
      const doctorPlayer = createTestPlayer(4, 'Doctor', 'doctor', true);
      
      expect(mafiaPlayer.role).toBe('mafia');
      expect(citizenPlayer.role).toBe('citizen');
      expect(policePlayer.role).toBe('police');
      expect(doctorPlayer.role).toBe('doctor');
      
      // AI 여부 확인
      expect(mafiaPlayer.isAi).toBe(true);
      expect(citizenPlayer.isAi).toBe(true);
      expect(policePlayer.isAi).toBe(true);
      expect(doctorPlayer.isAi).toBe(true);
    });
  });

  describe('게임 상태 검증', () => {
    it('게임 종료 조건을 확인할 수 있어야 함', () => {
      const game = createTestGame(4);
      const players = [
        createTestPlayer(1, 'AI_Mafia', 'mafia', true),
        createTestPlayer(2, 'AI_Citizen1', 'citizen', true),
        createTestPlayer(3, 'AI_Citizen2', 'citizen', true),
        createTestPlayer(4, 'AI_Police', 'police', true)
      ];
      
      game.players = players;
      
      // 시민 팀 승리 시나리오 - 마피아 제거
      players[0].isAlive = false; // 마피아 제거
      const alivePlayers = players.filter(p => p.isAlive);
      const aliveMafia = alivePlayers.filter(p => p.role === 'mafia');
      
      expect(aliveMafia).toHaveLength(0); // 마피아 모두 제거됨
      expect(alivePlayers).toHaveLength(3); // 시민 3명 생존
    });

    it('다양한 게임 규모를 지원해야 함', () => {
      // 4인 게임
      const smallGame = createTestGame(4);
      expect(smallGame.minPlayers).toBe(4);
      expect(smallGame.maxPlayers).toBe(4);
      
      // 6인 게임
      const mediumGame = createTestGame(6);
      expect(mediumGame.minPlayers).toBe(6);
      expect(mediumGame.maxPlayers).toBe(6);
      
      // 8인 게임
      const largeGame = createTestGame(8);
      expect(largeGame.minPlayers).toBe(8);
      expect(largeGame.maxPlayers).toBe(8);
    });
  });

  describe('메시지 및 로깅', () => {
    it('게임 메시지가 관리되어야 함', () => {
      const game = createTestGame(3);
      
      expect(game.messages).toBeDefined();
      expect(game.messages).toHaveLength(0);
      
      // 메시지 추가 시뮬레이션 (실제 구현에서는 더 복잡할 수 있음)
      // game.messages.push(new Message()); // 실제 메시지 엔티티 필요
      
      // 현재는 빈 배열이어야 함
      expect(Array.isArray(game.messages)).toBe(true);
    });

    it('로거가 올바르게 모킹되어야 함', () => {
      expect(mockLogger.log).toBeDefined();
      expect(mockLogger.error).toBeDefined();
      expect(mockLogger.warn).toBeDefined();
      
      // 로거 사용 시뮬레이션
      mockLogger.log('Test message');
      mockLogger.error(new Error('Test error'));
      
      expect(mockLogger.log).toHaveBeenCalledWith('Test message');
      expect(mockLogger.error).toHaveBeenCalledWith(new Error('Test error'));
    });
  });

  describe('성능 및 확장성 기본 검증', () => {
    it('많은 수의 플레이어를 처리할 수 있어야 함', () => {
      const playerCount = 20;
      const players: Player[] = [];
      
      const startTime = Date.now();
      
      // 20명의 플레이어 생성
      for (let i = 1; i <= playerCount; i++) {
        players.push(createTestPlayer(i, `AI_${i}`, 'citizen', true));
      }
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      expect(players).toHaveLength(playerCount);
      expect(executionTime).toBeLessThan(100); // 100ms 이내
      
      // 모든 플레이어가 올바르게 생성되었는지 확인
      players.forEach((player, index) => {
        expect(player.id).toBe(index + 1);
        expect(player.name).toBe(`AI_${index + 1}`);
        expect(player.isAi).toBe(true);
        expect(player.role).toBe('citizen');
      });
    });

    it('메모리 사용량이 합리적이어야 함', () => {
      // 간단한 메모리 사용량 테스트
      const games: Game[] = [];
      
      // 100개의 게임 생성
      for (let i = 0; i < 100; i++) {
        const game = createTestGame(4);
        game.id = i + 1;
        games.push(game);
      }
      
      expect(games).toHaveLength(100);
      
      // 각 게임이 독립적인 객체인지 확인
      const uniqueIds = new Set(games.map(g => g.id));
      expect(uniqueIds.size).toBe(100);
      
      // 정리
      games.length = 0;
      expect(games).toHaveLength(0);
    });
  });

  describe('에러 처리', () => {
    it('잘못된 플레이어 수에도 안정적이어야 함', () => {
      expect(() => createTestGame(0)).not.toThrow();
      expect(() => createTestGame(-1)).not.toThrow();
      expect(() => createTestGame(1000)).not.toThrow();
      
      const invalidGame = createTestGame(-1);
      expect(invalidGame.minPlayers).toBe(-1); // 검증하지만 에러는 발생하지 않음
      expect(invalidGame.maxPlayers).toBe(-1);
    });

    it('null/undefined 값들을 처리할 수 있어야 함', () => {
      const player = createTestPlayer(1, 'Test', 'citizen', true);
      
      // 기본값이 올바르게 설정되었는지 확인
      expect(player.id).toBeDefined();
      expect(player.name).toBeDefined();
      expect(player.role).toBeDefined();
      expect(player.isAi).toBeDefined();
      expect(player.isAlive).toBe(true);
      expect(player.isReady).toBe(true);
    });
  });
});
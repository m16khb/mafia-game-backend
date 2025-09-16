import { Test, TestingModule } from '@nestjs/testing';
import { AIPersonaService } from './ai-persona.service';
import { Player } from '../../../entities/player.entity';
import { AI_PERSONAS } from '../data/ai-personas.data';
import { Logger } from '@libs/logger';
import { PLAYER_REPOSITORY_TOKEN } from '@libs/repositories';

/**
 * AI 페르소나 서비스의 전체 기능을 테스트합니다.
 * 페르소나 할당, 조회, 관리 등의 핵심 기능들을 검증합니다.
 */
describe('AI 페르소나 서비스', () => {
  let service: AIPersonaService;

  const mockLogger = {
    setContext: jest.fn(),
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  };

  const mockPlayerRepository = {
    findById: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIPersonaService,
        {
          provide: Logger,
          useValue: mockLogger,
        },
        {
          provide: PLAYER_REPOSITORY_TOKEN,
          useValue: mockPlayerRepository,
        },
      ],
    }).compile();

    service = module.get<AIPersonaService>(AIPersonaService);
  });

  afterEach(() => {
    service.clearAllAssignments();
  });

  /**
   * 서비스가 올바르게 초기화되는지 확인합니다.
   */
  it('서비스가 정의되어야 함', () => {
    expect(service).toBeDefined();
  });

  describe('랜덤 페르소나 할당', () => {
    /**
     * AI 플레이어에게만 페르소나가 할당되고 인간 플레이어는 제외되는지 테스트합니다.
     */
    it('AI 플레이어에게만 페르소나를 할당해야 함', () => {
      const players = [
        createMockPlayer(1, 'Human1', false),
        createMockPlayer(2, 'AI1', true),
        createMockPlayer(3, 'AI2', true),
        createMockPlayer(4, 'Human2', false),
      ];

      const assignments = service.assignRandomPersonas(players);

      expect(assignments.size).toBe(2); // Only 2 AI players
      expect(assignments.has(2)).toBe(true);
      expect(assignments.has(3)).toBe(true);
      expect(assignments.has(1)).toBe(false);
      expect(assignments.has(4)).toBe(false);
    });

    /**
     * 가능한 경우 각 AI 플레이어에게 고유한 페르소나가 할당되는지 테스트합니다.
     * 중복 할당을 방지하는 로직을 검증합니다.
     */
    it('가능한 경우 고유한 페르소나를 할당해야 함', () => {
      const players = [
        createMockPlayer(1, 'AI1', true),
        createMockPlayer(2, 'AI2', true),
        createMockPlayer(3, 'AI3', true),
      ];

      const assignments = service.assignRandomPersonas(players);
      const assignedPersonas = Array.from(assignments.values());
      const personaIds = assignedPersonas.map((p) => p.id);

      expect(new Set(personaIds).size).toBe(personaIds.length);
    });

    /**
     * 사용 가능한 페르소나보다 AI 플레이어가 더 많을 때 처리 방식을 테스트합니다.
     * 페르소나 재사용 로직이 올바르게 동작하는지 확인합니다.
     */
    it('페르소나보다 AI 플레이어가 더 많을 때도 처리해야 함', () => {
      const players = Array.from({ length: 10 }, (_, i) =>
        createMockPlayer(i + 1, `AI${i + 1}`, true),
      );

      const assignments = service.assignRandomPersonas(players);

      expect(assignments.size).toBe(10);
      // 일부 페르소나가 재사용되어야 함
      const assignedPersonas = Array.from(assignments.values());
      expect(assignedPersonas.length).toBe(10);
    });

    /**
     * 페르소나가 할당된 후 플레이어의 이름이 페르소나 이름으로 변경되는지 테스트합니다.
     */
    it('플레이어 이름을 페르소나 이름으로 업데이트해야 함', () => {
      const players = [createMockPlayer(1, 'AI1', true)];

      service.assignRandomPersonas(players);

      expect(AI_PERSONAS.map((p) => p.name)).toContain(players[0].name);
    });
  });

  describe('getPersonaFromMemory', () => {
    /**
     * 메모리에서 플레이어에게 할당된 페르소나를 올바르게 반환하는지 테스트합니다.
     * 동기식 메모리 접근만 수행합니다.
     */
    it('should return assigned persona for a player from memory', () => {
      const players = [createMockPlayer(1, 'AI1', true)];
      const assignments = service.assignRandomPersonas(players);

      const persona = service.getPersonaFromMemory(1);

      expect(persona).toEqual(assignments.get(1));
    });

    /**
     * 페르소나가 할당되지 않은 플레이어에 대해 undefined를 반환하는지 테스트합니다.
     */
    it('should return undefined for non-assigned player', () => {
      const persona = service.getPersonaFromMemory(999);

      expect(persona).toBeUndefined();
    });
  });

  describe('getPersona', () => {
    /**
     * 메모리에서 페르소나를 올바르게 반환하는지 테스트합니다.
     * 비동기 메서드이지만 메모리에 있는 경우 DB 접근 없이 즐시 반환합니다.
     */
    it('should return assigned persona for a player from memory', async () => {
      const players = [createMockPlayer(1, 'AI1', true)];
      const assignments = service.assignRandomPersonas(players);

      const persona = await service.getPersona(1);

      expect(persona).toEqual(assignments.get(1));
    });

    /**
     * 존재하지 않는 플레이어 ID에 대해 undefined를 반환하는지 테스트합니다.
     * 데이터베이스 조회까지 수행하여 철저하게 검증합니다.
     */
    it('should return undefined for non-assigned player', async () => {
      mockPlayerRepository.findById.mockResolvedValue(null);

      const persona = await service.getPersona(999);

      expect(persona).toBeUndefined();
    });

    /**
     * 메모리에 없는 페르소나를 데이터베이스에서 조회하여 반환하는지 테스트합니다.
     * DB 조회 후 메모리에 캐싱하는 로직도 검증합니다.
     */
    it('should fetch persona from database if not in memory', async () => {
      const mockPlayer = createMockPlayer(1, 'AI1', true);
      mockPlayer.aiPersonaId = 1;
      mockPlayerRepository.findById.mockResolvedValue(mockPlayer);

      const persona = await service.getPersona(1);

      expect(persona).toBeDefined();
      expect(persona?.id).toBe('detective-holmes');
      expect(mockPlayerRepository.findById).toHaveBeenCalledWith(1);
    });
  });

  describe('getPersonaById', () => {
    /**
     * 유효한 페르소나 ID로 페르소나 정보를 올바르게 조회하는지 테스트합니다.
     */
    it('should return persona by ID', () => {
      const persona = service.getPersonaById('detective-holmes');

      expect(persona).toBeDefined();
      expect(persona?.id).toBe('detective-holmes');
      expect(persona?.name).toBe('홈즈');
    });

    /**
     * 잘못된 페르소나 ID에 대해 undefined를 반환하는지 테스트합니다.
     */
    it('should return undefined for invalid ID', () => {
      const persona = service.getPersonaById('invalid-id');

      expect(persona).toBeUndefined();
    });
  });

  describe('getAllPersonas', () => {
    /**
     * 모든 사용 가능한 페르소나 목록을 반환하는지 테스트합니다.
     */
    it('should return all available personas', () => {
      const personas = service.getAllPersonas();

      expect(personas).toHaveLength(AI_PERSONAS.length);
      expect(personas).toEqual(AI_PERSONAS);
    });

    /**
     * 페르소나 배열의 복사본을 반환하여 원본 데이터의 변경을 방지하는지 테스트합니다.
     */
    it('should return a copy of personas array', () => {
      const personas = service.getAllPersonas();
      personas.push({} as any);

      expect(service.getAllPersonas()).toHaveLength(AI_PERSONAS.length);
    });
  });

  describe('removePersonaAssignment', () => {
    /**
     * 기존 페르소나 할당을 성공적으로 제거하는지 테스트합니다.
     */
    it('should remove existing assignment', () => {
      const players = [createMockPlayer(1, 'AI1', true)];
      service.assignRandomPersonas(players);

      const removed = service.removePersonaAssignment(1);

      expect(removed).toBe(true);
      expect(service.getPersonaFromMemory(1)).toBeUndefined();
    });

    /**
     * 존재하지 않는 할당을 제거하려고 할 때 false를 반환하는지 테스트합니다.
     */
    it('should return false for non-existing assignment', () => {
      const removed = service.removePersonaAssignment(999);

      expect(removed).toBe(false);
    });
  });

  describe('describePersonality', () => {
    /**
     * 분석적 성향이 높은 페르소나의 성격을 올바르게 설명하는지 테스트합니다.
     */
    it('should describe high analytical personality', () => {
      const holmesPersona = AI_PERSONAS.find(
        (p) => p.id === 'detective-holmes',
      )!;
      const description = service.describePersonality(holmesPersona);

      expect(description).toContain('분석적');
    });

    /**
     * 공격적 성향이 높은 페르소나의 성격을 올바르게 설명하는지 테스트합니다.
     */
    it('should describe aggressive personality', () => {
      const aggressivePersona = AI_PERSONAS.find(
        (p) => p.personality.aggression > 0.7,
      )!;
      const description = service.describePersonality(aggressivePersona);

      expect(description).toContain('공격적');
    });

    /**
     * 그리 뛰어나지 않는 균형 잡힌 성격에 대해 기본값을 반환하는지 테스트합니다.
     */
    it('should return default for balanced personality', () => {
      const balancedPersona = {
        ...AI_PERSONAS[0],
        personality: {
          aggression: 0.5,
          caution: 0.5,
          trust: 0.5,
          leadership: 0.5,
          analytical: 0.5,
          emotional: 0.5,
        },
      };

      const description = service.describePersonality(balancedPersona);

      expect(description).toBe('평범함');
    });
  });

  describe('describePlayStyle', () => {
    /**
     * 페르소나의 플레이 스타일 구성 요소들을 올바르게 설명하는지 테스트합니다.
     * (투표성향, 대화수준, 의심임계값, 팀플레이 선호도)
     */
    it('should describe play style components', () => {
      const persona = AI_PERSONAS[0];
      const description = service.describePlayStyle(persona);

      expect(description).toContain('투표성향:');
      expect(description).toContain('대화수준:');
      expect(description).toContain('의심임계값:');
      expect(description).toContain('팀플레이:');
    });

    /**
     * 투표 패턴이 올바른 한글로 번역되는지 테스트합니다.
     */
    it('should translate voting patterns correctly', () => {
      const analyticalPersona = AI_PERSONAS.find(
        (p) => p.playStyle.votingPattern === 'analytical',
      )!;
      const description = service.describePlayStyle(analyticalPersona);

      expect(description).toContain('분석적');
    });
  });

  describe('clearAllAssignments', () => {
    /**
     * 모든 페르소나 할당을 완전히 지우는지 테스트합니다.
     * 게임 종료 시 메모리 정리를 위한 기능입니다.
     */
    it('should clear all persona assignments', () => {
      const players = [
        createMockPlayer(1, 'AI1', true),
        createMockPlayer(2, 'AI2', true),
      ];
      service.assignRandomPersonas(players);

      service.clearAllAssignments();

      expect(service.getPersonaFromMemory(1)).toBeUndefined();
      expect(service.getPersonaFromMemory(2)).toBeUndefined();
    });
  });
});

/**
 * 테스트용 Mock Player 객체를 생성합니다.
 * @param id - 플레이어 ID
 * @param name - 플레이어 이름
 * @param isAI - AI 플레이어 여부
 * @returns 테스트용 Player 인스턴스
 */
function createMockPlayer(id: number, name: string, isAI: boolean): Player {
  const player = new Player();
  player.id = id;
  player.name = name;
  player.isAi = isAI;
  return player;
}

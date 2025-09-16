import { Test, TestingModule } from '@nestjs/testing';
import { RoleSpecificPromptsService } from './role-specific-prompts.service';
import { Logger } from '@libs/logger';
import { Game, GameRole } from '../../../entities/game.entity';
import { Player } from '../../../entities/player.entity';
import { AI_PERSONAS } from '../data/ai-personas.data';
import { GamePromptContext } from '../types/prompt-context.types';

/**
 * RoleSpecificPromptsService의 역할별 프롬프트 생성 기능을 테스트합니다.
 * 마피아, 경찰, 의사, 시민 각각의 특화된 프롬프트가 올바르게 생성되는지 검증합니다.
 */
describe('역할별 프롬프트 서비스', () => {
  let service: RoleSpecificPromptsService;

  const mockLogger = {
    setContext: jest.fn(),
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleSpecificPromptsService,
        {
          provide: Logger,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<RoleSpecificPromptsService>(
      RoleSpecificPromptsService,
    );
  });

  /**
   * 서비스가 올바르게 초기화되는지 확인합니다.
   */
  it('서비스가 정의되어야 함', () => {
    expect(service).toBeDefined();
  });

  describe('마피아 프롬프트 생성', () => {
    /**
     * 마피아 역할의 기본 프롬프트가 올바르게 생성되는지 테스트합니다.
     * 위장 전략, 동료 정보, 제거 목표 등이 포함되어야 합니다.
     */
    it('마피아 기본 프롬프트를 생성해야 함', () => {
      const game = createMockGame();
      const mafiaPlayer = createMockPlayer(1, 'Mafia1', 'mafia', true);
      const persona = AI_PERSONAS[0];

      const context: GamePromptContext = {
        game,
        player: mafiaPlayer,
        persona,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const prompt = service.getMafiaPrompt(context);

      expect(prompt).toContain('마피아 역할 특수 지침');
      expect(prompt).toContain('주 목표');
      expect(prompt).toContain('위장');
      expect(prompt).toContain('동료 마피아 정보');
      expect(prompt).toContain('절대 정체를 드러내지 마세요');
    });

    /**
     * 마피아 동료가 있는 경우와 혼자 남은 경우의 프롬프트가 다른지 테스트합니다.
     * 팀플레이와 개별 행동의 전략이 달라져야 합니다.
     */
    it('동료 마피아 상황에 따라 다른 프롬프트를 생성해야 함', () => {
      const gameWithTeam = createMockGame();
      gameWithTeam.players = [
        createMockPlayer(1, 'Mafia1', 'mafia', true),
        createMockPlayer(2, 'Mafia2', 'mafia', true),
        createMockPlayer(3, 'Citizen1', 'citizen', true),
        createMockPlayer(4, 'Citizen2', 'citizen', true),
      ];

      const gameAlone = createMockGame();
      gameAlone.players = [
        createMockPlayer(1, 'Mafia1', 'mafia', true),
        createMockPlayer(3, 'Citizen1', 'citizen', true),
        createMockPlayer(4, 'Citizen2', 'citizen', true),
        createMockPlayer(5, 'Citizen3', 'citizen', true),
      ];

      const mafiaPlayer = createMockPlayer(1, 'Mafia1', 'mafia', true);
      const persona = AI_PERSONAS[0];

      const teamContext: GamePromptContext = {
        game: gameWithTeam,
        player: mafiaPlayer,
        persona,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const aloneContext: GamePromptContext = {
        game: gameAlone,
        player: mafiaPlayer,
        persona,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const teamPrompt = service.getMafiaPrompt(teamContext);
      const alonePrompt = service.getMafiaPrompt(aloneContext);

      expect(teamPrompt).toContain('Mafia2');
      expect(teamPrompt).toContain('동료들과 상의');
      expect(alonePrompt).toContain('모든 동료가 제거되었습니다');
      expect(alonePrompt).toContain('혼자 결정');
    });

    /**
     * 마피아가 우세한 상황과 열세한 상황에서 다른 전략을 제시하는지 테스트합니다.
     * 게임 상황에 맞는 적절한 전략이 제공되어야 합니다.
     */
    it('게임 상황에 따른 마피아 전략을 제시해야 함', () => {
      const dominantGame = createMockGame();
      dominantGame.players = [
        createMockPlayer(1, 'Mafia1', 'mafia', true),
        createMockPlayer(2, 'Mafia2', 'mafia', true),
        createMockPlayer(3, 'Citizen1', 'citizen', true),
      ];

      const desperateGame = createMockGame();
      desperateGame.players = [
        createMockPlayer(1, 'Mafia1', 'mafia', true),
        createMockPlayer(3, 'Citizen1', 'citizen', true),
        createMockPlayer(4, 'Citizen2', 'citizen', true),
        createMockPlayer(5, 'Citizen3', 'citizen', true),
      ];

      const mafiaPlayer = createMockPlayer(1, 'Mafia1', 'mafia', true);
      const persona = AI_PERSONAS[0];

      const dominantContext: GamePromptContext = {
        game: dominantGame,
        player: mafiaPlayer,
        persona,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const desperateContext: GamePromptContext = {
        game: desperateGame,
        player: mafiaPlayer,
        persona,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const dominantPrompt = service.getMafiaPrompt(dominantContext);
      const desperatePrompt = service.getMafiaPrompt(desperateContext);

      expect(dominantPrompt).toContain('승리 직전');
      expect(desperatePrompt).toContain('위험한 상황');
    });
  });

  describe('경찰 프롬프트 생성', () => {
    /**
     * 경찰 역할의 기본 프롬프트가 올바르게 생성되는지 테스트합니다.
     * 조사 전략, 정보 공유 방법, 정체 보호 등이 포함되어야 합니다.
     */
    it('경찰 기본 프롬프트를 생성해야 함', () => {
      const game = createMockGame();
      const policePlayer = createMockPlayer(1, 'Police1', 'police', true);
      const persona = AI_PERSONAS[0];

      const context: GamePromptContext = {
        game,
        player: policePlayer,
        persona,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const prompt = service.getPolicePrompt(context);

      expect(prompt).toContain('경찰 역할 특수 지침');
      expect(prompt).toContain('마피아를 모두 찾아내어 제거하기');
      expect(prompt).toContain('조사 대상 선정 가이드라인');
      expect(prompt).toContain('정보 공유 전략');
      expect(prompt).toContain('조사 결과를 공개할 때는 신중하게');
    });

    /**
     * 경찰의 성격에 따른 조사 및 정보 공유 전략이 다른지 테스트합니다.
     * 신중한 성격과 적극적인 성격의 접근 방식이 달라야 합니다.
     */
    it('성격에 따른 경찰 전략을 제시해야 함', () => {
      const game = createMockGame();
      const policePlayer = createMockPlayer(1, 'Police1', 'police', true);

      const cautiousPersona = {
        ...AI_PERSONAS[0],
        personality: {
          ...AI_PERSONAS[0].personality,
          caution: 0.9,
          aggression: 0.2,
        },
      };

      const aggressivePersona = {
        ...AI_PERSONAS[0],
        personality: {
          ...AI_PERSONAS[0].personality,
          caution: 0.2,
          aggression: 0.9,
        },
      };

      const cautiousContext: GamePromptContext = {
        game,
        player: policePlayer,
        persona: cautiousPersona,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const aggressiveContext: GamePromptContext = {
        game,
        player: policePlayer,
        persona: aggressivePersona,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const cautiousPrompt = service.getPolicePrompt(cautiousContext);
      const aggressivePrompt = service.getPolicePrompt(aggressiveContext);

      expect(cautiousPrompt).toContain('신중한 공개 전략');
      expect(aggressivePrompt).toContain('적극적 공개 전략');
    });
  });

  describe('의사 프롬프트 생성', () => {
    /**
     * 의사 역할의 기본 프롬프트가 올바르게 생성되는지 테스트합니다.
     * 보호 전략, 예측 방법, 정체 은폐 등이 포함되어야 합니다.
     */
    it('의사 기본 프롬프트를 생성해야 함', () => {
      const game = createMockGame();
      const doctorPlayer = createMockPlayer(1, 'Doctor1', 'doctor', true);
      const persona = AI_PERSONAS[0];

      const context: GamePromptContext = {
        game,
        player: doctorPlayer,
        persona,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const prompt = service.getDoctorPrompt(context);

      expect(prompt).toContain('의사 역할 특수 지침');
      expect(prompt).toContain('중요한 시민들을 보호');
      expect(prompt).toContain('보호 대상 우선순위');
      expect(prompt).toContain('정체 은폐 전략');
      expect(prompt).toContain('의사는 마피아의 1순위 제거 대상');
    });

    /**
     * 의사의 보호 우선순위가 올바르게 제시되는지 테스트합니다.
     * 경찰 > 영향력 있는 시민 > 기타 순서로 우선순위가 있어야 합니다.
     */
    it('보호 우선순위를 제시해야 함', () => {
      const game = createMockGame();
      const doctorPlayer = createMockPlayer(1, 'Doctor1', 'doctor', true);
      const persona = AI_PERSONAS[0];

      const context: GamePromptContext = {
        game,
        player: doctorPlayer,
        persona,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const prompt = service.getDoctorPrompt(context);

      expect(prompt).toContain('경찰');
      expect(prompt).toContain('영향력 있는 시민');
      expect(prompt).toContain('우선순위');
      expect(prompt.indexOf('경찰')).toBeLessThan(
        prompt.indexOf('영향력 있는 시민'),
      );
    });
  });

  describe('시민 프롬프트 생성', () => {
    /**
     * 시민 역할의 기본 프롬프트가 올바르게 생성되는지 테스트합니다.
     * 협력 전략, 정보 수집, 논리적 추론 등이 포함되어야 합니다.
     */
    it('시민 기본 프롬프트를 생성해야 함', () => {
      const game = createMockGame();
      const citizenPlayer = createMockPlayer(1, 'Citizen1', 'citizen', true);
      const persona = AI_PERSONAS[0];

      const context: GamePromptContext = {
        game,
        player: citizenPlayer,
        persona,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const prompt = service.getCitizenPrompt(context);

      expect(prompt).toContain('시민 역할 특수 지침');
      expect(prompt).toContain('마피아를 찾아내어 모두 제거하기');
      expect(prompt).toContain('정보 수집 방법');
      expect(prompt).toContain('논리적 추론 가이드');
      expect(prompt).toContain('협력 전략');
      expect(prompt).toContain('시민의 힘은 협력에 있습니다');
    });

    /**
     * 시민의 의심 대상 분석 방법이 제시되는지 테스트합니다.
     * 행동 패턴, 투표 성향, 정보 회피 등의 분석 기준이 있어야 합니다.
     */
    it('의심 대상 분석 방법을 제시해야 함', () => {
      const game = createMockGame();
      const citizenPlayer = createMockPlayer(1, 'Citizen1', 'citizen', true);
      const persona = AI_PERSONAS[0];

      const context: GamePromptContext = {
        game,
        player: citizenPlayer,
        persona,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const prompt = service.getCitizenPrompt(context);

      expect(prompt).toContain('의심 대상 분석 방법');
      expect(prompt).toContain('행동 패턴');
      expect(prompt).toContain('투표 성향');
      expect(prompt).toContain('정보 회피');
      expect(prompt).toContain('시간 패턴');
    });
  });

  describe('야간 행동 프롬프트', () => {
    /**
     * 역할별로 다른 야간 행동 프롬프트가 생성되는지 테스트합니다.
     * 마피아는 제거, 경찰은 조사, 의사는 보호 프롬프트가 나와야 합니다.
     */
    it('역할별 야간 행동 프롬프트를 생성해야 함', () => {
      const game = createMockGame();
      const persona = AI_PERSONAS[0];

      const mafiaPlayer = createMockPlayer(1, 'Mafia1', 'mafia', true);
      const policePlayer = createMockPlayer(2, 'Police1', 'police', true);
      const doctorPlayer = createMockPlayer(3, 'Doctor1', 'doctor', true);
      const citizenPlayer = createMockPlayer(4, 'Citizen1', 'citizen', true);

      const mafiaContext: GamePromptContext = {
        game,
        player: mafiaPlayer,
        persona,
        phase: 'night',
        recentEvents: [],
        gameHistory: '',
      };

      const policeContext: GamePromptContext = {
        game,
        player: policePlayer,
        persona,
        phase: 'night',
        recentEvents: [],
        gameHistory: '',
      };

      const doctorContext: GamePromptContext = {
        game,
        player: doctorPlayer,
        persona,
        phase: 'night',
        recentEvents: [],
        gameHistory: '',
      };

      const citizenContext: GamePromptContext = {
        game,
        player: citizenPlayer,
        persona,
        phase: 'night',
        recentEvents: [],
        gameHistory: '',
      };

      const mafiaPrompt = service.getNightActionPrompt(mafiaContext);
      const policePrompt = service.getNightActionPrompt(policeContext);
      const doctorPrompt = service.getNightActionPrompt(doctorContext);
      const citizenPrompt = service.getNightActionPrompt(citizenContext);

      expect(mafiaPrompt).toContain('야간 제거');
      expect(policePrompt).toContain('야간 조사');
      expect(doctorPrompt).toContain('야간 보호');
      expect(citizenPrompt).toContain('아무 행동도 할 수 없습니다');
    });

    /**
     * 야간 행동 프롬프트가 JSON 응답 형식을 요구하는지 테스트합니다.
     * 구조화된 결정이 필요한 야간 행동은 JSON 형식이어야 합니다.
     */
    it('야간 행동에 JSON 응답 형식을 요구해야 함', () => {
      const game = createMockGame();
      const mafiaPlayer = createMockPlayer(1, 'Mafia1', 'mafia', true);
      const persona = AI_PERSONAS[0];

      const context: GamePromptContext = {
        game,
        player: mafiaPlayer,
        persona,
        phase: 'night',
        recentEvents: [],
        gameHistory: '',
      };

      const prompt = service.getNightActionPrompt(context);

      expect(prompt).toContain('JSON 응답 형식:');
      expect(prompt).toContain('"job":');
      expect(prompt).toContain('"target":');
      expect(prompt).toContain('"reasoning":');
    });
  });

  describe('페르소나 기반 전략 차별화', () => {
    /**
     * 같은 역할이라도 페르소나에 따라 다른 전략이 제시되는지 테스트합니다.
     * 공격적인 마피아와 신중한 마피아의 접근 방식이 달라야 합니다.
     */
    it('페르소나별로 다른 전략을 제시해야 함', () => {
      const game = createMockGame();
      const mafiaPlayer = createMockPlayer(1, 'Mafia1', 'mafia', true);

      const aggressivePersona = {
        ...AI_PERSONAS[0],
        personality: {
          ...AI_PERSONAS[0].personality,
          aggression: 0.9,
          caution: 0.1,
        },
      };

      const cautiousPersona = {
        ...AI_PERSONAS[0],
        personality: {
          ...AI_PERSONAS[0].personality,
          aggression: 0.1,
          caution: 0.9,
        },
      };

      const aggressiveContext: GamePromptContext = {
        game,
        player: mafiaPlayer,
        persona: aggressivePersona,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const cautiousContext: GamePromptContext = {
        game,
        player: mafiaPlayer,
        persona: cautiousPersona,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const aggressivePrompt = service.getMafiaPrompt(aggressiveContext);
      const cautiousPrompt = service.getMafiaPrompt(cautiousContext);

      expect(aggressivePrompt).toContain('적극적으로');
      expect(cautiousPrompt).toContain('방어적으로');
      expect(aggressivePrompt).not.toEqual(cautiousPrompt);
    });
  });

  describe('위험 요소 분석', () => {
    /**
     * 마피아 프롬프트에서 경찰과 의사 등 위험 요소를 올바르게 식별하는지 테스트합니다.
     * 특수 역할 플레이어들이 위협으로 표시되어야 합니다.
     */
    it('마피아 위험 요소를 식별해야 함', () => {
      const game = createMockGame();
      game.players = [
        createMockPlayer(1, 'Mafia1', 'mafia', true),
        createMockPlayer(2, 'Police1', 'police', true),
        createMockPlayer(3, 'Doctor1', 'doctor', true),
        createMockPlayer(4, 'Citizen1', 'citizen', true),
      ];

      const mafiaPlayer = game.players[0];
      const persona = AI_PERSONAS[0];

      const context: GamePromptContext = {
        game,
        player: mafiaPlayer,
        persona,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const prompt = service.getMafiaPrompt(context);

      expect(prompt).toContain('위험 요소 분석');
      expect(prompt).toContain('Police1');
      expect(prompt).toContain('Doctor1');
      expect(prompt).toContain('경찰');
      expect(prompt).toContain('의사');
    });
  });
});

// 테스트 헬퍼 함수들

function createMockGame(): Game {
  const game = new Game();
  game.id = 1;
  game.name = 'Test Game';
  game.status = 'playing';
  game.currentPhase = 'day';
  game.dayCount = 1;
  game.remainingTime = 300;
  game.players = [
    createMockPlayer(1, 'Player1', 'mafia', true),
    createMockPlayer(2, 'Player2', 'citizen', true),
    createMockPlayer(3, 'Player3', 'police', true),
    createMockPlayer(4, 'Player4', 'doctor', true),
  ];
  game.messages = [];
  return game;
}

function createMockPlayer(
  id: number,
  name: string,
  role: GameRole,
  isAlive: boolean,
): Player {
  const player = new Player();
  player.id = id;
  player.name = name;
  player.role = role;
  player.isAlive = isAlive;
  player.isAi = true;
  return player;
}

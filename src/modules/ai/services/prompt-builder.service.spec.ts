import { Test, TestingModule } from '@nestjs/testing';
import { PromptBuilderService } from './prompt-builder.service';
import { Logger } from '@libs/logger';
import { Game, GameRole } from '../../../entities/game.entity';
import { Player } from '../../../entities/player.entity';
import { Message } from '../../../entities/message.entity';
import { AI_PERSONAS } from '../data/ai-personas.data';
import { GamePromptContext, ChatPromptContext, VotePromptContext } from '../types/prompt-context.types';

/**
 * PromptBuilderService의 프롬프트 생성 기능을 테스트합니다.
 * 게임 상황별, 역할별 프롬프트가 올바르게 생성되는지 검증합니다.
 */
describe('프롬프트 빌더 서비스', () => {
  let service: PromptBuilderService;

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
        PromptBuilderService,
        {
          provide: Logger,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<PromptBuilderService>(PromptBuilderService);
  });

  /**
   * 서비스가 올바르게 초기화되는지 확인합니다.
   */
  it('서비스가 정의되어야 함', () => {
    expect(service).toBeDefined();
  });

  describe('게임 상태 프롬프트 생성', () => {
    /**
     * 기본 게임 상태 프롬프트가 필요한 모든 정보를 포함하는지 테스트합니다.
     * 게임 정보, 플레이어 정보, 페르소나 정보가 모두 포함되어야 합니다.
     */
    it('기본 게임 상태 프롬프트를 생성해야 함', () => {
      const game = createMockGame();
      const player = createMockPlayer(1, 'AI1', 'mafia', true);
      const persona = AI_PERSONAS[0];
      
      const context: GamePromptContext = {
        game,
        player,
        persona,
        phase: 'day',
        recentEvents: [],
        gameHistory: 'Test game history',
      };

      const prompt = service.buildGameStatePrompt(context);

      expect(prompt).toContain('게임 상황 정보');
      expect(prompt).toContain('1일차');
      expect(prompt).toContain(persona.name);
      expect(prompt).toContain('마피아');
      expect(prompt).toContain('행동 지침');
    });

    /**
     * 다른 페이즈에서 프롬프트가 적절히 변경되는지 테스트합니다.
     * 낮과 밤, 투표 시간의 지침이 달라져야 합니다.
     */
    it('페이즈별로 다른 프롬프트를 생성해야 함', () => {
      const game = createMockGame();
      const player = createMockPlayer(1, 'AI1', 'mafia', true);
      const persona = AI_PERSONAS[0];

      const dayContext: GamePromptContext = {
        game,
        player,
        persona,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const nightContext: GamePromptContext = {
        game,
        player,
        persona,
        phase: 'night',
        recentEvents: [],
        gameHistory: '',
      };

      const dayPrompt = service.buildGameStatePrompt(dayContext);
      const nightPrompt = service.buildGameStatePrompt(nightContext);

      expect(dayPrompt).toContain('낮 토론');
      expect(nightPrompt).toContain('밤');
      expect(dayPrompt).not.toEqual(nightPrompt);
    });

    /**
     * 역할별로 다른 지침이 제공되는지 테스트합니다.
     * 마피아와 시민은 완전히 다른 목표와 전략을 가져야 합니다.
     */
    it('역할별로 다른 지침을 제공해야 함', () => {
      const game = createMockGame();
      const mafiaPlayer = createMockPlayer(1, 'AI1', 'mafia', true);
      const citizenPlayer = createMockPlayer(2, 'AI2', 'citizen', true);
      const persona = AI_PERSONAS[0];

      const mafiaContext: GamePromptContext = {
        game,
        player: mafiaPlayer,
        persona,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const citizenContext: GamePromptContext = {
        game,
        player: citizenPlayer,
        persona,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const mafiaPrompt = service.buildGameStatePrompt(mafiaContext);
      const citizenPrompt = service.buildGameStatePrompt(citizenContext);

      expect(mafiaPrompt).toContain('위장');
      expect(citizenPrompt).toContain('협력');
      expect(mafiaPrompt).not.toEqual(citizenPrompt);
    });
  });

  describe('채팅 프롬프트 생성', () => {
    /**
     * 채팅 상황에 맞는 프롬프트가 생성되는지 테스트합니다.
     * 대화 맥락과 최근 채팅 내역이 포함되어야 합니다.
     */
    it('채팅 상황 프롬프트를 생성해야 함', () => {
      const game = createMockGame();
      const player = createMockPlayer(1, 'AI1', 'citizen', true);
      const persona = AI_PERSONAS[0];
      const recentMessages = [createMockMessage(2, 'Player2', '안녕하세요!')];

      const context: ChatPromptContext = {
        gameState: {
          game,
          player,
          persona,
          phase: 'day',
          recentEvents: [],
          gameHistory: '',
        },
        conversationContext: {
          currentTopic: 'small_talk',
          participants: [1, 2],
          conversationStart: new Date(),
          emotionalTone: 'neutral',
        },
        recentChat: recentMessages,
        chatTrigger: 'response_to_message',
      };

      const prompt = service.buildChatPrompt(context);

      expect(prompt).toContain('현재 대화 상황');
      expect(prompt).toContain('최근 채팅 내역');
      expect(prompt).toContain('Player2: 안녕하세요!');
      expect(prompt).toContain('채팅 생성 지침');
    });

    /**
     * 특정 메시지에 대한 응답 프롬프트가 올바르게 생성되는지 테스트합니다.
     * 응답할 메시지가 명확히 표시되어야 합니다.
     */
    it('특정 메시지에 대한 응답 프롬프트를 생성해야 함', () => {
      const game = createMockGame();
      const player = createMockPlayer(1, 'AI1', 'citizen', true);
      const persona = AI_PERSONAS[0];
      const referencedMessage = createMockMessage(2, 'Player2', '누구를 의심하시나요?');

      const context: ChatPromptContext = {
        gameState: {
          game,
          player,
          persona,
          phase: 'day',
          recentEvents: [],
          gameHistory: '',
        },
        conversationContext: {
          currentTopic: 'suspicion_sharing',
          participants: [1, 2],
          conversationStart: new Date(),
          emotionalTone: 'tense',
        },
        recentChat: [],
        referencedMessage,
        chatTrigger: 'response_to_message',
      };

      const prompt = service.buildChatPrompt(context);

      expect(prompt).toContain('응답할 메시지');
      expect(prompt).toContain('누구를 의심하시나요?');
      expect(prompt).toContain('Player2');
    });

    /**
     * 대화 주제와 감정 톤이 프롬프트에 반영되는지 테스트합니다.
     * 의심 공유와 잡담은 다른 톤으로 처리되어야 합니다.
     */
    it('대화 주제와 감정 톤을 반영해야 함', () => {
      const game = createMockGame();
      const player = createMockPlayer(1, 'AI1', 'citizen', true);
      const persona = AI_PERSONAS[0];

      const suspiciousContext: ChatPromptContext = {
        gameState: {
          game,
          player,
          persona,
          phase: 'day',
          recentEvents: [],
          gameHistory: '',
        },
        conversationContext: {
          currentTopic: 'suspicion_sharing',
          participants: [1, 2],
          conversationStart: new Date(),
          emotionalTone: 'accusatory',
        },
        recentChat: [],
        chatTrigger: 'spontaneous',
      };

      const casualContext: ChatPromptContext = {
        ...suspiciousContext,
        conversationContext: {
          ...suspiciousContext.conversationContext,
          currentTopic: 'small_talk',
          emotionalTone: 'neutral',
        },
      };

      const suspiciousPrompt = service.buildChatPrompt(suspiciousContext);
      const casualPrompt = service.buildChatPrompt(casualContext);

      expect(suspiciousPrompt).toContain('의심 공유');
      expect(suspiciousPrompt).toContain('비난하는');
      expect(casualPrompt).toContain('잡담');
      expect(casualPrompt).toContain('중립적');
    });
  });

  describe('투표 프롬프트 생성', () => {
    /**
     * 투표 상황에 맞는 프롬프트가 생성되는지 테스트합니다.
     * 투표 후보자 정보와 현재 투표 현황이 포함되어야 합니다.
     */
    it('투표 상황 프롬프트를 생성해야 함', () => {
      const game = createMockGame();
      const player = createMockPlayer(1, 'AI1', 'citizen', true);
      const persona = AI_PERSONAS[0];
      const candidates = [
        createMockPlayer(2, 'Player2', 'citizen', true),
        createMockPlayer(3, 'Player3', 'mafia', true),
      ];

      const context: VotePromptContext = {
        gameState: {
          game,
          player,
          persona,
          phase: 'vote',
          recentEvents: [],
          gameHistory: '',
        },
        voteCandidates: candidates,
        currentVotes: [],
        suspicionData: new Map([[2, 0.3], [3, 0.7]]),
        timeRemaining: 60,
      };

      const prompt = service.buildVotePrompt(context);

      expect(prompt).toContain('투표 상황');
      expect(prompt).toContain('60초');
      expect(prompt).toContain('Player2, Player3');
      expect(prompt).toContain('의심도 분석');
      expect(prompt).toContain('투표 전략 가이드');
    });

    /**
     * 의심도 데이터가 투표 프롬프트에 올바르게 반영되는지 테스트합니다.
     * 높은 의심도와 낮은 의심도가 구별되어 표시되어야 합니다.
     */
    it('의심도 데이터를 반영해야 함', () => {
      const game = createMockGame();
      const player = createMockPlayer(1, 'AI1', 'citizen', true);
      const persona = AI_PERSONAS[0];
      const candidates = [createMockPlayer(2, 'Player2', 'citizen', true)];

      const highSuspicionContext: VotePromptContext = {
        gameState: {
          game,
          player,
          persona,
          phase: 'vote',
          recentEvents: [],
          gameHistory: '',
        },
        voteCandidates: candidates,
        currentVotes: [],
        suspicionData: new Map([[2, 0.9]]),
        timeRemaining: 60,
      };

      const lowSuspicionContext: VotePromptContext = {
        ...highSuspicionContext,
        suspicionData: new Map([[2, 0.1]]),
      };

      const highPrompt = service.buildVotePrompt(highSuspicionContext);
      const lowPrompt = service.buildVotePrompt(lowSuspicionContext);

      expect(highPrompt).toContain('90%');
      expect(lowPrompt).toContain('10%');
      expect(highPrompt).toContain('매우 의심스러움');
      expect(lowPrompt).toContain('의심 없음');
    });

    /**
     * JSON 응답 형식이 요구되는지 테스트합니다.
     * 투표 결정은 구조화된 응답이 필요합니다.
     */
    it('JSON 응답 형식을 요구해야 함', () => {
      const game = createMockGame();
      const player = createMockPlayer(1, 'AI1', 'citizen', true);
      const persona = AI_PERSONAS[0];
      const candidates = [createMockPlayer(2, 'Player2', 'citizen', true)];

      const context: VotePromptContext = {
        gameState: {
          game,
          player,
          persona,
          phase: 'vote',
          recentEvents: [],
          gameHistory: '',
        },
        voteCandidates: candidates,
        currentVotes: [],
        suspicionData: new Map(),
        timeRemaining: 60,
      };

      const prompt = service.buildVotePrompt(context);

      expect(prompt).toContain('JSON 형식:');
      expect(prompt).toContain('"job": "투표 결정"');
      expect(prompt).toContain('"target"');
      expect(prompt).toContain('"reasoning"');
    });
  });

  describe('페르소나 기반 커스터마이제이션', () => {
    /**
     * 페르소나의 성격 특성이 프롬프트에 반영되는지 테스트합니다.
     * 분석적인 성격과 감정적인 성격의 프롬프트가 달라야 합니다.
     */
    it('페르소나 성격을 반영해야 함', () => {
      const game = createMockGame();
      const player = createMockPlayer(1, 'AI1', 'citizen', true);
      
      const analyticalPersona = AI_PERSONAS.find(p => p.personality.analytical > 0.8);
      const emotionalPersona = AI_PERSONAS.find(p => p.personality.emotional > 0.8);

      const analyticalContext: GamePromptContext = {
        game,
        player,
        persona: analyticalPersona!,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const emotionalContext: GamePromptContext = {
        game,
        player,
        persona: emotionalPersona!,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const analyticalPrompt = service.buildGameStatePrompt(analyticalContext);
      const emotionalPrompt = service.buildGameStatePrompt(emotionalContext);

      expect(analyticalPrompt).toContain('분석적');
      expect(emotionalPrompt).toContain('감정');
      expect(analyticalPrompt).not.toEqual(emotionalPrompt);
    });

    /**
     * 플레이 스타일이 프롬프트에 반영되는지 테스트합니다.
     * 공격적인 스타일과 방어적인 스타일의 지침이 달라야 합니다.
     */
    it('플레이 스타일을 반영해야 함', () => {
      const game = createMockGame();
      const player = createMockPlayer(1, 'AI1', 'citizen', true);

      const aggressivePersona = {
        ...AI_PERSONAS[0],
        playStyle: {
          ...AI_PERSONAS[0].playStyle,
          votingPattern: 'aggressive' as const,
        },
      };

      const defensivePersona = {
        ...AI_PERSONAS[0],
        playStyle: {
          ...AI_PERSONAS[0].playStyle,
          votingPattern: 'defensive' as const,
        },
      };

      const aggressiveContext: GamePromptContext = {
        game,
        player,
        persona: aggressivePersona,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const defensiveContext: GamePromptContext = {
        game,
        player,
        persona: defensivePersona,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const aggressivePrompt = service.buildGameStatePrompt(aggressiveContext);
      const defensivePrompt = service.buildGameStatePrompt(defensiveContext);

      expect(aggressivePrompt).toContain('공격적');
      expect(defensivePrompt).toContain('방어적');
    });
  });

  describe('게임 진행 상황 분석', () => {
    /**
     * 게임의 현재 상황이 올바르게 분석되는지 테스트합니다.
     * 마피아와 시민의 수에 따른 위험도 평가가 포함되어야 합니다.
     */
    it('마피아 우세 상황을 감지해야 함', () => {
      const game = createMockGame();
      // 마피아 2명, 시민 2명으로 설정하여 마피아 우세 상황 생성
      game.players = [
        createMockPlayer(1, 'Mafia1', 'mafia', true),
        createMockPlayer(2, 'Mafia2', 'mafia', true),
        createMockPlayer(3, 'Citizen1', 'citizen', true),
        createMockPlayer(4, 'Citizen2', 'citizen', true),
      ];

      const player = game.players[0]; // 마피아 플레이어
      const persona = AI_PERSONAS[0];

      const context: GamePromptContext = {
        game,
        player,
        persona,
        phase: 'day',
        recentEvents: [],
        gameHistory: '',
      };

      const prompt = service.buildGameStatePrompt(context);

      expect(prompt).toContain('마피아가 우세');
      expect(prompt).toContain('긴급 상황');
    });

    /**
     * 최근 이벤트가 프롬프트에 포함되는지 테스트합니다.
     * 플레이어 사망이나 역할 공개 등의 중요한 이벤트가 표시되어야 합니다.
     */
    it('최근 이벤트를 포함해야 함', () => {
      const game = createMockGame();
      const player = createMockPlayer(1, 'AI1', 'citizen', true);
      const persona = AI_PERSONAS[0];

      const recentEvents = [
        {
          type: 'player_death' as const,
          description: 'Player2가 마피아에 의해 제거되었습니다',
          timestamp: new Date(),
          involvedPlayerIds: [2],
        },
      ];

      const context: GamePromptContext = {
        game,
        player,
        persona,
        phase: 'day',
        recentEvents,
        gameHistory: '',
      };

      const prompt = service.buildGameStatePrompt(context);

      expect(prompt).toContain('최근 주요 이벤트');
      expect(prompt).toContain('Player2가 마피아에 의해 제거되었습니다');
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

function createMockPlayer(id: number, name: string, role: GameRole, isAlive: boolean): Player {
  const player = new Player();
  player.id = id;
  player.name = name;
  player.role = role;
  player.isAlive = isAlive;
  player.isAi = true;
  return player;
}

function createMockMessage(senderId: number, senderName: string, content: string): Message {
  const message = new Message();
  message.id = Date.now();
  message.senderId = senderId;
  message.senderName = senderName;
  message.content = content;
  message.type = 'chat';
  message.createdAt = new Date();
  return message;
}
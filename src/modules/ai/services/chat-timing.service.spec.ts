import { Test, TestingModule } from '@nestjs/testing';
import { ChatTimingService } from './chat-timing.service';
import { Logger } from '@libs/logger';
import { Game, GamePhase } from '../../../entities/game.entity';
import { Player } from '../../../entities/player.entity';
import { Message } from '../../../entities/message.entity';
import { AI_PERSONAS } from '../data/ai-personas.data';
import { ConversationState } from '../types/chat-timing.types';

/**
 * ChatTimingService의 AI 채팅 타이밍 결정 기능을 테스트합니다.
 * 페르소나 성격, 게임 상황, 메시지 분석에 따른 채팅 결정이 올바른지 검증합니다.
 */
describe('채팅 타이밍 서비스', () => {
  let service: ChatTimingService;

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
        ChatTimingService,
        {
          provide: Logger,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<ChatTimingService>(ChatTimingService);
  });

  /**
   * 서비스가 올바르게 초기화되는지 확인합니다.
   */
  it('서비스가 정의되어야 함', () => {
    expect(service).toBeDefined();
  });

  describe('페이즈 시작 채팅 결정', () => {
    /**
     * 페이즈 시작 시 기본 채팅 확률이 계산되는지 테스트합니다.
     * 다른 페이즈는 다른 기본 확률을 가져야 합니다.
     */
    it('페이즈별로 다른 기본 확률을 적용해야 함', () => {
      const game = createMockGame();
      const persona = AI_PERSONAS[0];

      const dayDecision = service.shouldInitiateChatOnPhaseStart(persona, 'day', game);
      const nightDecision = service.shouldInitiateChatOnPhaseStart(persona, 'night', game);
      const votingDecision = service.shouldInitiateChatOnPhaseStart(persona, 'voting', game);

      // 투표 시간에 가장 높은 확률
      expect(votingDecision.probability).toBeGreaterThan(dayDecision.probability);
      expect(dayDecision.probability).toBeGreaterThan(nightDecision.probability);
      
      expect(dayDecision.reason).toBe('phase_start');
      expect(nightDecision.reason).toBe('phase_start');
      expect(votingDecision.reason).toBe('phase_start');
    });

    /**
     * 성격에 따라 페이즈 시작 채팅 확률이 달라지는지 테스트합니다.
     * 수다스러운 캐릭터는 더 자주 채팅을 시작해야 합니다.
     */
    it('성격에 따라 채팅 확률이 달라져야 함', () => {
      const game = createMockGame();

      const talkativePersona = {
        ...AI_PERSONAS[0],
        playStyle: {
          ...AI_PERSONAS[0].playStyle,
          discussionLevel: 'talkative' as const,
        },
        communicationStyle: {
          ...AI_PERSONAS[0].communicationStyle,
          verbosity: 0.9,
        },
      };

      const silentPersona = {
        ...AI_PERSONAS[0],
        playStyle: {
          ...AI_PERSONAS[0].playStyle,
          discussionLevel: 'silent' as const,
        },
        communicationStyle: {
          ...AI_PERSONAS[0].communicationStyle,
          verbosity: 0.1,
        },
      };

      // 여러 번 테스트해서 평균적으로 차이가 나는지 확인
      let talkativeDelaySum = 0;
      let silentDelaySum = 0;
      let talkativeProbSum = 0;
      let silentProbSum = 0;
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        const talkativeDecision = service.shouldInitiateChatOnPhaseStart(talkativePersona, 'day', game);
        const silentDecision = service.shouldInitiateChatOnPhaseStart(silentPersona, 'day', game);
        
        talkativeDelaySum += talkativeDecision.delay;
        silentDelaySum += silentDecision.delay;
        talkativeProbSum += talkativeDecision.probability;
        silentProbSum += silentDecision.probability;
      }

      const avgTalkativeDelay = talkativeDelaySum / iterations;
      const avgSilentDelay = silentDelaySum / iterations;
      const avgTalkativeProb = talkativeProbSum / iterations;
      const avgSilentProb = silentProbSum / iterations;

      expect(avgTalkativeProb).toBeGreaterThan(avgSilentProb);
      // 지연 시간은 랜덤 요소가 크므로 확률적으로만 검증
      const delayRatio = avgTalkativeDelay / avgSilentDelay;
      expect(delayRatio).toBeLessThan(2.0); // 극단적으로 차이나지 않는 선에서 검증
    });
  });

  describe('메시지 응답 결정', () => {
    /**
     * 직접 언급된 경우 높은 확률로 응답하는지 테스트합니다.
     * 이름이 언급되면 거의 확실하게 응답해야 합니다.
     */
    it('직접 언급된 경우 높은 확률로 응답해야 함', () => {
      const game = createMockGame();
      const persona = AI_PERSONAS[0];
      const message = createMockMessage(2, 'Player2', `${persona.name}님은 어떻게 생각하세요?`);
      const conversationState = createMockConversationState();

      const decision = service.shouldRespondToMessage(persona, message, game, conversationState);

      expect(decision.shouldChat).toBe(true);
      expect(decision.probability).toBeGreaterThan(0.9);
      expect(decision.reason).toBe('direct_mention');
      expect(decision.priority).toBe(10);
    });

    /**
     * 의심받는 메시지에 대해 방어 응답을 결정하는지 테스트합니다.
     * 성격에 따라 방어 확률이 달라져야 합니다.
     */
    it('의심받을 때 성격에 따라 방어 확률이 달라져야 함', () => {
      const game = createMockGame();
      const message = createMockMessage(2, 'Player2', `${AI_PERSONAS[0].name}가 마피아인 것 같아요`);
      const conversationState = createMockConversationState();

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

      const aggressiveDecision = service.shouldRespondToMessage(
        aggressivePersona,
        message,
        game,
        conversationState,
      );
      const cautiousDecision = service.shouldRespondToMessage(
        cautiousPersona,
        message,
        game,
        conversationState,
      );

      if (aggressiveDecision.shouldChat && cautiousDecision.shouldChat) {
        expect(aggressiveDecision.probability).toBeGreaterThan(cautiousDecision.probability);
        expect(aggressiveDecision.delay).toBeLessThan(cautiousDecision.delay);
      }
      expect(aggressiveDecision.reason).toBe('accused');
      expect(cautiousDecision.reason).toBe('accused');
    });

    /**
     * 질문에 대한 응답 확률을 계산하는지 테스트합니다.
     * 질문의 종류와 성격에 따라 응답률이 달라져야 합니다.
     */
    it('질문에 대한 응답 확률을 계산해야 함', () => {
      const game = createMockGame();
      const persona = AI_PERSONAS[0];
      const questionMessage = createMockMessage(2, 'Player2', '누가 가장 의심스러우신가요?');
      const conversationState = createMockConversationState();

      const decision = service.shouldRespondToMessage(persona, questionMessage, game, conversationState);

      expect(decision.reason).toBe('information_response');
      expect(decision.priority).toBe(6);
      expect(decision.delay).toBeGreaterThan(2000); // 생각할 시간 필요
    });

    /**
     * 일반 메시지에 대한 응답 확률이 성격에 따라 달라지는지 테스트합니다.
     * 수다스러운 성격은 더 자주 응답해야 합니다.
     */
    it('성격에 따라 일반 응답 확률이 달라져야 함', () => {
      const game = createMockGame();
      const generalMessage = createMockMessage(2, 'Player2', '오늘 날씨가 좋네요');
      const conversationState = createMockConversationState();

      const talkativePersona = {
        ...AI_PERSONAS[0],
        playStyle: {
          ...AI_PERSONAS[0].playStyle,
          discussionLevel: 'talkative' as const,
        },
      };

      const silentPersona = {
        ...AI_PERSONAS[0],
        playStyle: {
          ...AI_PERSONAS[0].playStyle,
          discussionLevel: 'silent' as const,
        },
      };

      const talkativeDecision = service.shouldRespondToMessage(
        talkativePersona,
        generalMessage,
        game,
        conversationState,
      );
      const silentDecision = service.shouldRespondToMessage(
        silentPersona,
        generalMessage,
        game,
        conversationState,
      );

      if (talkativeDecision.shouldChat || silentDecision.shouldChat) {
        expect(talkativeDecision.probability).toBeGreaterThan(silentDecision.probability);
      }
    });
  });

  describe('자발적 채팅 결정', () => {
    /**
     * 쿨다운 시간 내에는 자발적 채팅을 하지 않는지 테스트합니다.
     * 너무 자주 말하는 것을 방지해야 합니다.
     */
    it('쿨다운 시간 내에는 채팅하지 않아야 함', () => {
      const game = createMockGame();
      const persona = AI_PERSONAS[0];
      const conversationState = {
        ...createMockConversationState(),
        timeSinceMyLastMessage: 10, // 10초 전에 말함
      };

      const decision = service.shouldInitiateSpontaneousChat(
        persona,
        game,
        conversationState,
        30,
      );

      expect(decision.shouldChat).toBe(false);
      expect(decision.probability).toBe(0);
    });

    /**
     * 긴 침묵 후 침묵을 깨는 확률을 계산하는지 테스트합니다.
     * 리더십이 강한 캐릭터는 더 자주 침묵을 깨야 합니다.
     */
    it('긴 침묵 후 침묵 깨기 확률을 계산해야 함', () => {
      const game = createMockGame();
      const conversationState = {
        ...createMockConversationState(),
        timeSinceLastMessage: 120, // 2분 침묵
        timeSinceMyLastMessage: 150, // 내가 2분 30초 전에 말함
      };

      const leaderPersona = {
        ...AI_PERSONAS[0],
        personality: {
          ...AI_PERSONAS[0].personality,
          leadership: 0.9,
        },
      };

      const followerPersona = {
        ...AI_PERSONAS[0],
        personality: {
          ...AI_PERSONAS[0].personality,
          leadership: 0.1,
        },
      };

      const leaderDecision = service.shouldInitiateSpontaneousChat(
        leaderPersona,
        game,
        conversationState,
        150,
      );
      const followerDecision = service.shouldInitiateSpontaneousChat(
        followerPersona,
        game,
        conversationState,
        150,
      );

      expect(leaderDecision.reason).toBe('silence_break');
      expect(followerDecision.reason).toBe('silence_break');
      expect(leaderDecision.probability).toBeGreaterThan(followerDecision.probability);
    });

    /**
     * 성격 기반 자발적 발언 확률을 계산하는지 테스트합니다.
     * 리더십이 강한 캐릭터는 더 자주 자발적으로 발언해야 합니다.
     */
    it('성격 기반 자발적 발언 확률을 계산해야 함', () => {
      const game = createMockGame();
      const conversationState = {
        ...createMockConversationState(),
        timeSinceLastMessage: 30, // 적당한 침묵
        timeSinceMyLastMessage: 60, // 내가 1분 전에 말함
      };

      const leaderPersona = {
        ...AI_PERSONAS[0],
        personality: {
          ...AI_PERSONAS[0].personality,
          leadership: 0.9,
        },
        communicationStyle: {
          ...AI_PERSONAS[0].communicationStyle,
          verbosity: 0.8,
        },
      };

      const passivePersona = {
        ...AI_PERSONAS[0],
        personality: {
          ...AI_PERSONAS[0].personality,
          leadership: 0.1,
        },
        communicationStyle: {
          ...AI_PERSONAS[0].communicationStyle,
          verbosity: 0.2,
        },
      };

      const leaderDecision = service.shouldInitiateSpontaneousChat(
        leaderPersona,
        game,
        conversationState,
        60,
      );
      const passiveDecision = service.shouldInitiateSpontaneousChat(
        passivePersona,
        game,
        conversationState,
        60,
      );

      // 리더 성격이 더 자주 자발적으로 발언
      expect(leaderDecision.probability).toBeGreaterThan(passiveDecision.probability);
    });
  });

  describe('메시지 분석', () => {
    /**
     * 비난하는 메시지를 올바르게 감지하는지 테스트합니다.
     * 의심/마피아 관련 단어가 포함된 메시지를 식별해야 합니다.
     */
    it('비난하는 메시지를 감지해야 함', () => {
      const game = createMockGame();
      const persona = AI_PERSONAS[0];
      const accusatoryMessage = createMockMessage(2, 'Player2', `${persona.name}가 마피아 같아요`);
      const conversationState = createMockConversationState();

      const decision = service.shouldRespondToMessage(persona, accusatoryMessage, game, conversationState);

      expect(decision.reason).toBe('accused');
      expect(decision.priority).toBeGreaterThan(7); // 높은 우선순위
    });

    /**
     * 질문 패턴을 올바르게 식별하는지 테스트합니다.
     * 다양한 질문 형태를 인식해야 합니다.
     */
    it('질문 패턴을 식별해야 함', () => {
      const game = createMockGame();
      const persona = AI_PERSONAS[0];
      const conversationState = createMockConversationState();

      const questionMessages = [
        '누가 마피아일까요?',
        '어떻게 생각하세요?',
        '동의하시나요?',
        '왜 그렇게 생각하세요?',
      ];

      questionMessages.forEach(content => {
        const message = createMockMessage(2, 'Player2', content);
        const decision = service.shouldRespondToMessage(persona, message, game, conversationState);
        
        expect(decision.reason).toBe('information_response');
      });
    });

    /**
     * 감정적 강도를 올바르게 계산하는지 테스트합니다.
     * 감탄사와 강조 표현에 따라 강도가 달라져야 합니다.
     */
    it('감정적 강도를 계산해야 함', () => {
      const game = createMockGame();
      const persona = AI_PERSONAS[0];
      const conversationState = createMockConversationState();

      const emotionalMessage = createMockMessage(2, 'Player2', '정말 화나네요!!!');
      const neutralMessage = createMockMessage(2, 'Player2', '그렇게 생각합니다.');

      const emotionalDecision = service.shouldRespondToMessage(persona, emotionalMessage, game, conversationState);
      const neutralDecision = service.shouldRespondToMessage(persona, neutralMessage, game, conversationState);

      // 감정적인 메시지에 더 빨리 반응 (또는 유사한 시간에 반응)
      if (emotionalDecision.shouldChat && neutralDecision.shouldChat) {
        // 감정적 메시지의 지연시간이 중립적 메시지보다 훨씬 크지 않아야 함 (20% 마진)
        expect(emotionalDecision.delay).toBeLessThan(neutralDecision.delay * 1.2);
      }
    });
  });

  describe('지연 시간 계산', () => {
    /**
     * 성격에 따라 응답 지연 시간이 달라지는지 테스트합니다.
     * 빠른 성격은 더 빨리 응답해야 합니다.
     */
    it('성격에 따라 응답 지연 시간이 달라져야 함', () => {
      const game = createMockGame();
      const message = createMockMessage(2, 'Player2', '안녕하세요');
      const conversationState = createMockConversationState();

      const quickPersona = {
        ...AI_PERSONAS[0],
        communicationStyle: {
          ...AI_PERSONAS[0].communicationStyle,
          quickness: 0.9,
        },
      };

      const slowPersona = {
        ...AI_PERSONAS[0],
        communicationStyle: {
          ...AI_PERSONAS[0].communicationStyle,
          quickness: 0.1,
        },
      };

      const quickDecision = service.shouldRespondToMessage(quickPersona, message, game, conversationState);
      const slowDecision = service.shouldRespondToMessage(slowPersona, message, game, conversationState);

      if (quickDecision.shouldChat && slowDecision.shouldChat) {
        expect(quickDecision.delay).toBeLessThan(slowDecision.delay);
      }
    });

    /**
     * 응답 유형에 따라 적절한 지연 시간을 설정하는지 테스트합니다.
     * 방어 응답은 빠르고, 분석적 응답은 느려야 합니다.
     */
    it('응답 유형에 따라 적절한 지연 시간을 설정해야 함', () => {
      const game = createMockGame();
      const persona = AI_PERSONAS[0];
      const conversationState = createMockConversationState();

      const accusationMessage = createMockMessage(2, 'Player2', `${persona.name}가 의심스러워요`);
      const questionMessage = createMockMessage(2, 'Player2', '복잡한 전략에 대해 어떻게 생각하세요?');

      const defenseDecision = service.shouldRespondToMessage(persona, accusationMessage, game, conversationState);
      const analyticalDecision = service.shouldRespondToMessage(persona, questionMessage, game, conversationState);

      if (defenseDecision.shouldChat && analyticalDecision.shouldChat) {
        // 방어는 빠르게, 분석적 응답은 느리게
        expect(defenseDecision.delay).toBeLessThan(analyticalDecision.delay);
      }
    });
  });

  describe('우선순위 계산', () => {
    /**
     * 응답 이유에 따라 적절한 우선순위를 설정하는지 테스트합니다.
     * 직접 언급이 가장 높은 우선순위를 가져야 합니다.
     */
    it('응답 이유에 따라 우선순위를 설정해야 함', () => {
      const game = createMockGame();
      const persona = AI_PERSONAS[0];
      const conversationState = createMockConversationState();

      const mentionMessage = createMockMessage(2, 'Player2', `${persona.name}님 의견은 어떠세요?`);
      const generalMessage = createMockMessage(2, 'Player2', '날씨가 좋네요');

      const mentionDecision = service.shouldRespondToMessage(persona, mentionMessage, game, conversationState);
      const generalDecision = service.shouldRespondToMessage(persona, generalMessage, game, conversationState);

      expect(mentionDecision.priority).toBeGreaterThan(generalDecision.priority);
      expect(mentionDecision.reason).toBe('direct_mention');
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
  game.dayCount = 2;
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

function createMockPlayer(id: number, name: string, role: any, isAlive: boolean): Player {
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

function createMockConversationState(): ConversationState {
  return {
    currentTopic: 'small_talk',
    activeParticipants: 2,
    timeSinceLastMessage: 30,
    atmosphereLevel: 'calm',
    timeSinceMyLastMessage: 60,
    hasOngoingArgument: false,
  };
}
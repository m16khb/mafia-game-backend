import { Injectable, Inject } from '@nestjs/common';
import { Logger } from '@libs/logger';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Game, GamePhase } from '../../../entities/game.entity';
import { Player } from '../../../entities/player.entity';
import { Message } from '../../../entities/message.entity';
import { AIPersona } from '../types/ai-persona.types';
import { AIPersonaService } from './ai-persona.service';
import { PromptBuilderService } from './prompt-builder.service';
import { ChatTimingService } from './chat-timing.service';
import {
  ChatGenerationContext,
  ChatResponse,
  ConversationState,
  AtmosphereLevel,
  ChatTriggerReason,
  MessageTopic,
  EmotionState,
} from '../types/chat-timing.types';
import { ChatPromptContext } from '../types/prompt-context.types';

/**
 * AI 채팅 시스템의 메인 컨트롤러
 * 게임 이벤트에 반응하여 AI 플레이어들의 채팅을 관리하고 생성
 */
@Injectable()
export class AIChatService {
  private readonly activeChatTimers = new Map<number, NodeJS.Timeout>();
  private readonly conversationStates = new Map<number, ConversationState>();

  constructor(
    private readonly logger: Logger,
    private readonly aiPersonaService: AIPersonaService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly chatTimingService: ChatTimingService,
    private readonly eventEmitter: EventEmitter2,
    // LLM 서비스는 추후 주입받도록 구현
  ) {
    this.logger.setContext(AIChatService.name);
  }

  /**
   * 게임 페이즈 시작 시 AI 채팅을 처리합니다.
   * @param game 현재 게임
   * @param phase 시작된 페이즈
   */
  async processGamePhaseStart(game: Game, phase: GamePhase): Promise<void> {
    this.logger.log(`Processing phase start: ${phase} for game ${game.id}`);

    // 대화 상태 업데이트
    this.updateConversationState(game.id, phase);

    const aiPlayers = game.players.filter((p) => p.isAi && p.isAlive);

    for (const player of aiPlayers) {
      try {
        const persona = await this.aiPersonaService.getPersona(player.id);
        if (!persona) {
          this.logger.warn(`No persona found for AI player ${player.id}`);
          continue;
        }

        // 페이즈 시작 시 채팅 결정
        const chatDecision =
          this.chatTimingService.shouldInitiateChatOnPhaseStart(
            persona,
            phase,
            game,
          );

        if (chatDecision.shouldChat) {
          this.scheduleChatGeneration(
            game,
            player,
            persona,
            'phase_start',
            chatDecision.delay,
          );
        }
      } catch (error) {
        this.logger.error(
          error,
          `Failed to process phase start chat for player ${player.id}`,
        );
      }
    }
  }

  /**
   * 플레이어 채팅에 대한 AI 응답을 처리합니다.
   * @param game 현재 게임
   * @param originalMessage 원본 메시지
   */
  async respondToPlayerChat(
    game: Game,
    originalMessage: Message,
  ): Promise<void> {
    this.logger.log(
      `Processing chat response for message: ${originalMessage.content}`,
    );

    // 대화 상태 업데이트
    this.updateConversationStateWithMessage(game.id, originalMessage);

    const aiPlayers = game.players.filter(
      (p) => p.isAi && p.isAlive && p.id !== originalMessage.senderId,
    );
    const conversationState = this.getConversationState(game.id);

    for (const player of aiPlayers) {
      try {
        const persona = await this.aiPersonaService.getPersona(player.id);
        if (!persona) continue;

        // 메시지 응답 결정
        const chatDecision = this.chatTimingService.shouldRespondToMessage(
          persona,
          originalMessage,
          game,
          conversationState,
        );

        if (chatDecision.shouldChat) {
          this.scheduleChatGeneration(
            game,
            player,
            persona,
            chatDecision.reason,
            chatDecision.delay,
            originalMessage,
          );
        }
      } catch (error) {
        this.logger.error(
          error,
          `Failed to process chat response for player ${player.id}`,
        );
      }
    }
  }

  /**
   * 자발적 AI 채팅을 처리합니다. (백그라운드 프로세스)
   * @param game 현재 게임
   */
  async processSpontaneousChats(game: Game): Promise<void> {
    if (game.status !== 'playing') return;

    const aiPlayers = game.players.filter((p) => p.isAi && p.isAlive);
    const conversationState = this.getConversationState(game.id);
    const now = Date.now();

    for (const player of aiPlayers) {
      try {
        const persona = await this.aiPersonaService.getPersona(player.id);
        if (!persona) continue;

        // 이미 예약된 채팅이 있으면 건너뛰기
        if (this.activeChatTimers.has(player.id)) continue;

        const timeSinceLastActivity = this.getTimeSinceLastActivity(
          player.id,
          game,
        );

        // 자발적 채팅 결정
        const chatDecision =
          this.chatTimingService.shouldInitiateSpontaneousChat(
            persona,
            game,
            conversationState,
            timeSinceLastActivity,
          );

        if (chatDecision.shouldChat) {
          this.scheduleChatGeneration(
            game,
            player,
            persona,
            chatDecision.reason,
            chatDecision.delay,
          );
        }
      } catch (error) {
        this.logger.error(
          error,
          `Failed to process spontaneous chat for player ${player.id}`,
        );
      }
    }
  }

  /**
   * 채팅 생성을 스케줄링합니다.
   */
  private scheduleChatGeneration(
    game: Game,
    player: Player,
    persona: AIPersona,
    trigger: ChatTriggerReason,
    delay: number,
    referencedMessage?: Message,
  ): void {
    // 기존 타이머가 있으면 취소
    this.cancelScheduledChat(player.id);

    const timer = setTimeout(async () => {
      try {
        await this.generateAndSendChat(
          game,
          player,
          persona,
          trigger,
          referencedMessage,
        );
      } catch (error) {
        this.logger.error(
          error,
          `Failed to generate chat for player ${player.id}`,
        );
      } finally {
        this.activeChatTimers.delete(player.id);
      }
    }, delay);

    this.activeChatTimers.set(player.id, timer);
    this.logger.debug(
      `Scheduled chat for player ${player.id} in ${delay}ms (reason: ${trigger})`,
    );
  }

  /**
   * 예약된 채팅을 취소합니다.
   */
  private cancelScheduledChat(playerId: number): void {
    const timer = this.activeChatTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.activeChatTimers.delete(playerId);
    }
  }

  /**
   * 실제 채팅을 생성하고 전송합니다.
   */
  private async generateAndSendChat(
    game: Game,
    player: Player,
    persona: AIPersona,
    trigger: ChatTriggerReason,
    referencedMessage?: Message,
  ): Promise<void> {
    try {
      const context = this.buildChatGenerationContext(
        game,
        player,
        persona,
        trigger,
        referencedMessage,
      );

      const chatResponse = await this.generateChatContent(context);

      if (chatResponse.content && chatResponse.content.trim()) {
        await this.sendAIMessage(game.id, player.id, chatResponse);

        // 후속 메시지가 필요한 경우 스케줄링
        if (chatResponse.needsFollowUp && chatResponse.nextMessageDelay) {
          this.scheduleChatGeneration(
            game,
            player,
            persona,
            'personality_driven',
            chatResponse.nextMessageDelay,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        error,
        `Failed to generate and send chat for player ${player.id}`,
      );
    }
  }

  /**
   * 채팅 생성 컨텍스트를 구성합니다.
   */
  private buildChatGenerationContext(
    game: Game,
    player: Player,
    persona: AIPersona,
    trigger: ChatTriggerReason,
    referencedMessage?: Message,
  ): ChatGenerationContext {
    const recentMessages = this.getRecentMessages(game, 10);
    const conversationState = this.getConversationState(game.id);

    return {
      game,
      player,
      persona,
      trigger,
      referencedMessage,
      recentMessages,
      conversationState,
    };
  }

  /**
   * 채팅 내용을 생성합니다.
   */
  private async generateChatContent(
    context: ChatGenerationContext,
  ): Promise<ChatResponse> {
    try {
      // 채팅 프롬프트 구성
      const chatPromptContext: ChatPromptContext = {
        gameState: {
          game: context.game,
          player: context.player,
          persona: context.persona,
          phase: context.game.currentPhase as any,
          recentEvents: [], // TODO: 실제 이벤트 데이터
          gameHistory: '', // TODO: 실제 히스토리
        },
        conversationContext: {
          currentTopic: this.mapMessageTopicToConversationTopic(
            context.conversationState.currentTopic,
          ),
          participants: [context.player.id], // TODO: 실제 참여자 목록
          conversationStart: new Date(
            Date.now() - context.conversationState.timeSinceLastMessage * 1000,
          ),
          emotionalTone: this.mapAtmosphereToTone(
            context.conversationState.atmosphereLevel,
          ),
        },
        recentChat: context.recentMessages,
        referencedMessage: context.referencedMessage,
        chatTrigger: this.mapChatTriggerReasonToChatTrigger(context.trigger),
      };

      const prompt = this.promptBuilderService.buildChatPrompt(
        chatPromptContext,
        {
          requireJsonResponse: true,
          maxLength: 80,
          emotionalIntensity: this.getEmotionalIntensityForTrigger(
            context.trigger,
          ),
        },
      );

      // TODO: LLM 서비스 호출
      // const llmResponse = await this.llmService.generate({
      //   provider: 'open-router',
      //   prompt,
      //   message: '상황에 맞는 자연스러운 채팅을 생성해주세요.',
      // });

      // 임시로 하드코딩된 응답 (실제로는 LLM에서 생성)
      const mockResponse = this.generateMockChatResponse(context);

      return mockResponse;
    } catch (error) {
      this.logger.error(error, 'Failed to generate chat content');
      throw error;
    }
  }

  /**
   * 임시 모크 채팅 응답을 생성합니다. (LLM 서비스 구현 전까지 사용)
   */
  private generateMockChatResponse(
    context: ChatGenerationContext,
  ): ChatResponse {
    const { persona, trigger, referencedMessage } = context;

    let content = '';
    let emotion: EmotionState = 'neutral';

    switch (trigger) {
      case 'phase_start':
        content = this.generatePhaseStartMessage(
          persona,
          context.game.currentPhase as GamePhase,
        );
        emotion = 'confident';
        break;
      case 'direct_mention':
        content = `네, 저를 부르셨나요?`;
        emotion = 'neutral';
        break;
      case 'accused':
        content = this.generateDefenseMessage(persona);
        emotion = 'defensive';
        break;
      case 'share_suspicion':
        content = this.generateSuspicionMessage(persona);
        emotion = 'suspicious';
        break;
      case 'vote_persuasion':
        content = this.generatePersuasionMessage(persona);
        emotion = 'confident';
        break;
      default:
        content = this.generatePersonalityDrivenMessage(persona);
        emotion = 'neutral';
    }

    return {
      content,
      type: 'chat',
      emotion,
      confidence: 0.7 + Math.random() * 0.3,
      needsFollowUp: Math.random() < 0.2,
      nextMessageDelay:
        Math.random() < 0.2 ? 5000 + Math.random() * 10000 : undefined,
    };
  }

  /**
   * 페이즈 시작 메시지를 생성합니다.
   */
  private generatePhaseStartMessage(
    persona: AIPersona,
    phase: GamePhase,
  ): string {
    const messages = {
      day: [
        '새로운 하루가 시작됐네요.',
        '오늘은 누가 의심스럽나요?',
        '어제 밤에 무슨 일이 있었을까요?',
      ],
      night: ['조용한 밤이 왔네요...', '모두 조심하세요.'],
      voting: [
        '드디어 투표 시간입니다.',
        '신중하게 결정해야겠어요.',
        '누구에게 투표할지 고민되네요.',
      ],
      result: ['결과가 궁금하네요.', '어떻게 될까요?'],
    };

    const phaseMessages = messages[phase] || messages.day;
    const randomMessage =
      phaseMessages[Math.floor(Math.random() * phaseMessages.length)];

    return this.addPersonalityToMessage(randomMessage, persona);
  }

  /**
   * 방어 메시지를 생성합니다.
   */
  private generateDefenseMessage(persona: AIPersona): string {
    const defenseMessages = [
      '저는 마피아가 아닙니다!',
      '억울해요, 저를 왜 의심하시나요?',
      '증거도 없이 의심하시면 안 되죠.',
      '저는 시민이에요!',
      '다른 사람을 의심해보세요.',
    ];

    const randomMessage =
      defenseMessages[Math.floor(Math.random() * defenseMessages.length)];
    return this.addPersonalityToMessage(randomMessage, persona);
  }

  /**
   * 의심 표현 메시지를 생성합니다.
   */
  private generateSuspicionMessage(persona: AIPersona): string {
    const suspicionMessages = [
      '뭔가 이상한 점이 있네요.',
      '조금 의심스럽긴 하네요.',
      '행동이 수상해 보여요.',
      '말이 앞뒤가 안 맞는 것 같은데요?',
      '너무 조용하지 않나요?',
    ];

    const randomMessage =
      suspicionMessages[Math.floor(Math.random() * suspicionMessages.length)];
    return this.addPersonalityToMessage(randomMessage, persona);
  }

  /**
   * 설득 메시지를 생성합니다.
   */
  private generatePersuasionMessage(persona: AIPersona): string {
    const persuasionMessages = [
      '이 사람에게 투표하는 게 좋을 것 같아요.',
      '다시 한번 생각해보세요.',
      '제 의견에 동의하시나요?',
      '논리적으로 생각해보면...',
      '모두가 협력해야 해요.',
    ];

    const randomMessage =
      persuasionMessages[Math.floor(Math.random() * persuasionMessages.length)];
    return this.addPersonalityToMessage(randomMessage, persona);
  }

  /**
   * 성격 기반 일반 메시지를 생성합니다.
   */
  private generatePersonalityDrivenMessage(persona: AIPersona): string {
    const generalMessages = [
      '음... 어려운 상황이네요.',
      '다들 어떻게 생각하세요?',
      '상황을 정리해볼까요?',
      '뭔가 놓친 게 있을까요?',
      '조금 더 신중하게 접근해보죠.',
    ];

    const randomMessage =
      generalMessages[Math.floor(Math.random() * generalMessages.length)];
    return this.addPersonalityToMessage(randomMessage, persona);
  }

  /**
   * 페르소나 성격을 메시지에 반영합니다.
   */
  private addPersonalityToMessage(message: string, persona: AIPersona): string {
    let finalMessage = message;

    // 공격적인 성격
    if (persona.personality.aggression > 0.7) {
      finalMessage = finalMessage.replace(/\.$/, '!');
    }

    // 감정적인 성격
    if (persona.personality.emotional > 0.7) {
      if (Math.random() < 0.3) {
        finalMessage += ' ㅠㅠ';
      }
    }

    // 신중한 성격
    if (persona.personality.caution > 0.7) {
      finalMessage = finalMessage.replace(/!$/, '.');
      if (Math.random() < 0.3) {
        finalMessage = '혹시 ' + finalMessage;
      }
    }

    // 분석적인 성격
    if (persona.personality.analytical > 0.7 && Math.random() < 0.3) {
      finalMessage = '논리적으로 보면 ' + finalMessage;
    }

    return finalMessage;
  }

  /**
   * AI 메시지를 전송합니다.
   */
  private async sendAIMessage(
    gameId: number,
    playerId: number,
    chatResponse: ChatResponse,
  ): Promise<void> {
    try {
      // TODO: GameService나 MessageService를 통해 실제 메시지 저장 및 브로드캐스트
      this.logger.log(`AI Player ${playerId} says: "${chatResponse.content}"`);

      // WebSocket으로 메시지 브로드캐스트
      this.eventEmitter.emit('ai.message.sent', {
        gameId,
        playerId,
        content: chatResponse.content,
        type: chatResponse.type,
        emotion: chatResponse.emotion,
      });
    } catch (error) {
      this.logger.error(
        error,
        `Failed to send AI message for player ${playerId}`,
      );
    }
  }

  /**
   * 대화 상태를 업데이트합니다.
   */
  private updateConversationState(gameId: number, phase: GamePhase): void {
    const currentState =
      this.conversationStates.get(gameId) || this.getDefaultConversationState();

    const updatedState: ConversationState = {
      ...currentState,
      currentTopic: this.getPhaseDefaultTopic(phase),
      timeSinceLastMessage: 0,
      atmosphereLevel: this.getPhaseDefaultAtmosphere(phase),
    };

    this.conversationStates.set(gameId, updatedState);
  }

  /**
   * 메시지와 함께 대화 상태를 업데이트합니다.
   */
  private updateConversationStateWithMessage(
    gameId: number,
    message: Message,
  ): void {
    const currentState =
      this.conversationStates.get(gameId) || this.getDefaultConversationState();

    const topic = this.classifyMessageTopic(message.content);
    const atmosphere = this.updateAtmosphereLevel(
      currentState.atmosphereLevel,
      message,
    );

    const updatedState: ConversationState = {
      ...currentState,
      currentTopic: topic,
      timeSinceLastMessage: 0,
      atmosphereLevel: atmosphere,
      activeParticipants: currentState.activeParticipants + 1,
      hasOngoingArgument: this.detectArgument(message.content),
    };

    this.conversationStates.set(gameId, updatedState);
  }

  /**
   * 대화 상태를 가져옵니다.
   */
  private getConversationState(gameId: number): ConversationState {
    return (
      this.conversationStates.get(gameId) || this.getDefaultConversationState()
    );
  }

  /**
   * 기본 대화 상태를 반환합니다.
   */
  private getDefaultConversationState(): ConversationState {
    return {
      currentTopic: 'small_talk',
      activeParticipants: 0,
      timeSinceLastMessage: 0,
      atmosphereLevel: 'calm',
      timeSinceMyLastMessage: 0,
      hasOngoingArgument: false,
    };
  }

  // 유틸리티 메서드들

  private getRecentMessages(game: Game, limit: number): Message[] {
    return (game.messages || [])
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .reverse();
  }

  private getTimeSinceLastActivity(playerId: number, game: Game): number {
    const playerMessages = (game.messages || [])
      .filter((m) => m.senderId === playerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (playerMessages.length === 0) return Infinity;

    const lastMessage = playerMessages[0];
    return (Date.now() - lastMessage.createdAt.getTime()) / 1000;
  }

  private mapAtmosphereToTone(
    atmosphere: AtmosphereLevel,
  ): 'neutral' | 'tense' | 'accusatory' | 'defensive' | 'cooperative' {
    switch (atmosphere) {
      case 'heated':
        return 'accusatory';
      case 'tense':
        return 'tense';
      case 'suspicious':
        return 'tense';
      case 'panicked':
        return 'defensive';
      case 'analytical':
        return 'neutral';
      default:
        return 'neutral';
    }
  }

  private mapMessageTopicToConversationTopic(
    topic: MessageTopic,
  ):
    | 'role_discussion'
    | 'suspicion_sharing'
    | 'vote_coordination'
    | 'defense_argument'
    | 'information_sharing'
    | 'small_talk'
    | 'strategy_discussion' {
    switch (topic) {
      case 'role_hint':
        return 'role_discussion';
      case 'suspicion':
        return 'suspicion_sharing';
      case 'vote_discussion':
        return 'vote_coordination';
      case 'defense':
        return 'defense_argument';
      case 'information':
        return 'information_sharing';
      case 'strategy':
        return 'strategy_discussion';
      default:
        return 'small_talk';
    }
  }

  private mapChatTriggerReasonToChatTrigger(
    reason: ChatTriggerReason,
  ):
    | 'phase_start'
    | 'response_to_message'
    | 'spontaneous'
    | 'accusation_defense'
    | 'information_share'
    | 'vote_persuasion'
    | 'role_hint' {
    switch (reason) {
      case 'phase_start':
        return 'phase_start';
      case 'direct_mention':
      case 'information_response':
        return 'response_to_message';
      case 'accused':
      case 'defend_self':
        return 'accusation_defense';
      case 'share_suspicion':
        return 'information_share';
      case 'vote_persuasion':
        return 'vote_persuasion';
      case 'role_hint':
        return 'role_hint';
      default:
        return 'spontaneous';
    }
  }

  private getEmotionalIntensityForTrigger(
    trigger: ChatTriggerReason,
  ): 'low' | 'medium' | 'high' {
    switch (trigger) {
      case 'accused':
      case 'defend_self':
        return 'high';
      case 'direct_mention':
      case 'vote_persuasion':
        return 'medium';
      default:
        return 'low';
    }
  }

  private getPhaseDefaultTopic(phase: GamePhase): MessageTopic {
    switch (phase) {
      case 'day':
        return 'suspicion';
      case 'voting':
        return 'vote_discussion';
      case 'night':
        return 'small_talk';
      case 'result':
        return 'information';
      default:
        return 'small_talk';
    }
  }

  private getPhaseDefaultAtmosphere(phase: GamePhase): AtmosphereLevel {
    switch (phase) {
      case 'day':
        return 'analytical';
      case 'voting':
        return 'tense';
      case 'night':
        return 'calm';
      case 'result':
        return 'tense';
      default:
        return 'calm';
    }
  }

  private classifyMessageTopic(content: string): MessageTopic {
    if (content.includes('의심') || content.includes('수상'))
      return 'suspicion';
    if (content.includes('투표') || content.includes('찍'))
      return 'vote_discussion';
    if (content.includes('마피아') || content.includes('시민'))
      return 'accusation';
    if (content.includes('경찰') || content.includes('의사'))
      return 'role_hint';
    if (
      content.includes('방어') ||
      content.includes('아니') ||
      content.includes('억울')
    )
      return 'defense';
    if (
      content.includes('동의') ||
      content.includes('맞아') ||
      content.includes('지지')
    )
      return 'support';
    return 'small_talk';
  }

  private updateAtmosphereLevel(
    current: AtmosphereLevel,
    message: Message,
  ): AtmosphereLevel {
    const content = message.content.toLowerCase();

    if (content.includes('마피아') && content.includes('!')) return 'heated';
    if (content.includes('의심') || content.includes('수상'))
      return 'suspicious';
    if (content.includes('?') && content.includes('투표')) return 'tense';
    if (content.includes('분석') || content.includes('논리'))
      return 'analytical';

    return current; // 변화가 없으면 현재 상태 유지
  }

  private detectArgument(content: string): boolean {
    const argumentPatterns = ['아니야', '틀렸', '반대', '잘못', '그렇지 않'];
    return argumentPatterns.some((pattern) => content.includes(pattern));
  }

  /**
   * 게임 종료 시 정리 작업을 수행합니다.
   */
  cleanup(gameId: number): void {
    // 활성 타이머 정리
    const game = { id: gameId }; // 실제로는 게임 객체를 받아야 함
    // const aiPlayers = game.players?.filter(p => p.isAi) || [];

    // aiPlayers.forEach(player => {
    //   this.cancelScheduledChat(player.id);
    // });

    // 대화 상태 정리
    this.conversationStates.delete(gameId);

    this.logger.log(`Cleaned up AI chat service for game ${gameId}`);
  }
}

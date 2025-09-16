import { Injectable } from '@nestjs/common';
import { Logger } from '@libs/logger';
import { AIPersona } from '../types/ai-persona.types';
import { Message } from '../../../entities/message.entity';
import { Game, GamePhase } from '../../../entities/game.entity';
import { Player } from '../../../entities/player.entity';
import {
  ChatDecision,
  ChatTriggerReason,
  ConversationPattern,
  MessageAnalysis,
  MessageTopic,
  ConversationState,
  AtmosphereLevel,
  ChatPatternConfig,
  PersonalityModifiers,
  SituationModifiers,
} from '../types/chat-timing.types';

/**
 * AI 채팅 타이밍과 참여 결정을 관리하는 서비스
 * 페르소나 성격, 게임 상황, 대화 흐름을 분석하여 적절한 채팅 타이밍을 결정
 */
@Injectable()
export class ChatTimingService {
  private readonly chatPatternConfig: ChatPatternConfig;

  constructor(private readonly logger: Logger) {
    this.logger.setContext(ChatTimingService.name);
    this.chatPatternConfig = this.initializeChatPatternConfig();
  }

  /**
   * 페이즈 시작 시 채팅을 시작해야 하는지 결정합니다.
   * @param persona AI 페르소나
   * @param phase 현재 게임 페이즈
   * @param game 게임 상태
   */
  shouldInitiateChatOnPhaseStart(
    persona: AIPersona,
    phase: GamePhase,
    game: Game,
  ): ChatDecision {
    const baseChance = this.getBaseChatChance(phase);
    const personalityModifier = this.getPersonalityChatModifier(persona);
    const situationModifier = this.getSituationModifier(game, phase);

    const finalProbability =
      baseChance * personalityModifier * situationModifier;
    const shouldChat = Math.random() < finalProbability;

    return {
      shouldChat,
      probability: finalProbability,
      reason: 'phase_start',
      delay: this.calculateInitiationDelay(persona, phase),
      priority: this.calculatePriority('phase_start', persona),
    };
  }

  /**
   * 메시지에 응답해야 하는지 결정합니다.
   * @param persona AI 페르소나
   * @param message 원본 메시지
   * @param game 현재 게임 상태
   * @param conversationState 대화 상태
   */
  shouldRespondToMessage(
    persona: AIPersona,
    message: Message,
    game: Game,
    conversationState: ConversationState,
  ): ChatDecision {
    const messageAnalysis = this.analyzeMessage(message, persona, game);

    // 의심받는 경우가 직접 언급보다 우선 (더 중요한 상황)
    if (messageAnalysis.accusatory) {
      const defenseProbability =
        0.8 *
        (1 - persona.personality.caution + persona.personality.aggression);
      return {
        shouldChat: Math.random() < defenseProbability,
        probability: defenseProbability,
        reason: 'accused',
        delay: this.calculateDefenseDelay(persona),
        priority: 9,
      };
    }

    // 직접 언급된 경우 높은 확률로 응답
    if (messageAnalysis.directMention) {
      return {
        shouldChat: true,
        probability: 0.95,
        reason: 'direct_mention',
        delay: this.calculateResponseDelay(persona, messageAnalysis),
        priority: 10,
      };
    }

    // 질문에 대한 응답
    if (messageAnalysis.isQuestion && messageAnalysis.expectsResponse) {
      const responseProbability = this.calculateQuestionResponseProbability(
        persona,
        messageAnalysis,
      );
      return {
        shouldChat: Math.random() < responseProbability,
        probability: responseProbability,
        reason: 'information_response',
        delay: this.calculateThinkingDelay(persona, messageAnalysis),
        priority: 6,
      };
    }

    // 성격 기반 일반적인 응답 확률
    const generalResponseProbability = this.calculateGeneralResponseProbability(
      persona,
      messageAnalysis,
      conversationState,
    );

    const reason = this.determineResponseReason(
      messageAnalysis,
      conversationState,
    );

    return {
      shouldChat: Math.random() < generalResponseProbability,
      probability: generalResponseProbability,
      reason,
      delay: this.calculateGeneralDelay(persona, reason),
      priority: this.calculatePriority(reason, persona),
    };
  }

  /**
   * 자발적으로 채팅을 시작할지 결정합니다.
   * @param persona AI 페르소나
   * @param game 현재 게임 상태
   * @param conversationState 대화 상태
   * @param timeSinceLastActivity 마지막 활동 이후 경과 시간
   */
  shouldInitiateSpontaneousChat(
    persona: AIPersona,
    game: Game,
    conversationState: ConversationState,
    timeSinceLastActivity: number,
  ): ChatDecision {
    // 너무 자주 말하는 것 방지
    if (
      conversationState.timeSinceMyLastMessage <
      this.getMinimumCooldown(persona)
    ) {
      return {
        shouldChat: false,
        probability: 0,
        reason: 'personality_driven',
        delay: 0,
        priority: 0,
      };
    }

    // 침묵이 길어진 경우
    if (
      conversationState.timeSinceLastMessage > this.getSilenceThreshold(persona)
    ) {
      const silenceBreakProbability = this.calculateSilenceBreakProbability(
        persona,
        conversationState,
      );
      return {
        shouldChat: Math.random() < silenceBreakProbability,
        probability: silenceBreakProbability,
        reason: 'silence_break',
        delay: this.calculateSpontaneousDelay(persona),
        priority: 4,
      };
    }

    // 성격 기반 자발적 발언
    const spontaneousProbability = this.calculateSpontaneousProbability(
      persona,
      game,
      conversationState,
    );

    const reason = this.determineSpontaneousReason(
      persona,
      game,
      conversationState,
    );

    return {
      shouldChat: Math.random() < spontaneousProbability,
      probability: spontaneousProbability,
      reason,
      delay: this.calculateSpontaneousDelay(persona),
      priority: this.calculatePriority(reason, persona),
    };
  }

  /**
   * 메시지를 분석하여 응답 필요성을 판단합니다.
   */
  private analyzeMessage(
    message: Message,
    persona: AIPersona,
    game: Game,
  ): MessageAnalysis {
    const content = message.content.toLowerCase();
    const senderName = message.senderName;
    const myName = this.getMyName(persona, game).toLowerCase();

    const directMention =
      content.includes(myName) || content.includes('@' + myName);
    const accusatory = this.isAccusatoryMessage(content, myName);

    return {
      directMention,
      accusatory,
      isQuestion:
        content.includes('?') || this.containsQuestionPatterns(content),
      requestsInformation: this.requestsInformation(content),
      emotionalIntensity: this.calculateEmotionalIntensity(content),
      topic: this.classifyMessageTopic(content),
      expectsResponse: this.expectsResponse(content, senderName),
    };
  }

  /**
   * 메시지가 의심/비난하는 내용인지 판단합니다.
   */
  private isAccusatoryMessage(content: string, myName: string): boolean {
    const accusatoryPatterns = [
      `${myName}.*의심`,
      `${myName}.*마피아`,
      `${myName}.*수상`,
      '의심스럽.*' + myName,
      '마피아.*' + myName,
      '투표.*' + myName,
    ];

    const simplePatterns = [
      content.includes(myName) && content.includes('마피아'),
      content.includes(myName) && content.includes('의심'),
      content.includes(myName) && content.includes('수상'),
    ];

    return (
      accusatoryPatterns.some((pattern) => {
        const regex = new RegExp(pattern, 'i');
        return regex.test(content);
      }) || simplePatterns.some(Boolean)
    );
  }

  /**
   * 질문 패턴을 포함하는지 확인합니다.
   */
  private containsQuestionPatterns(content: string): boolean {
    const questionPatterns = [
      '누구',
      '어디',
      '언제',
      '왜',
      '어떻게',
      '뭐',
      '무엇',
      '어떤',
      '몇',
      '어느',
      '생각해?',
      '어때?',
      '맞아?',
      '아닌가?',
      '그렇지?',
      '알아?',
      '봤어?',
    ];

    return questionPatterns.some((pattern) => content.includes(pattern));
  }

  /**
   * 정보를 요구하는 메시지인지 판단합니다.
   */
  private requestsInformation(content: string): boolean {
    const infoRequestPatterns = [
      '알려줘',
      '말해줘',
      '설명해',
      '어떻게 생각',
      '의견',
      '생각',
      '판단',
      '추측',
      '예상',
    ];

    return infoRequestPatterns.some((pattern) => content.includes(pattern));
  }

  /**
   * 감정적 강도를 계산합니다.
   */
  private calculateEmotionalIntensity(content: string): number {
    let intensity = 0;

    // 감탄사와 강조 표현
    const emphasisPatterns = [
      '!',
      '!!',
      '\\?\\?\\?',
      '진짜',
      '정말',
      '완전',
      '너무',
    ];
    emphasisPatterns.forEach((pattern) => {
      const matches = (content.match(new RegExp(pattern, 'g')) || []).length;
      intensity += matches * 0.2;
    });

    // 감정적 단어들
    const emotionalWords = [
      '화나',
      '짜증',
      '미치',
      '열받',
      '좋아',
      '싫어',
      '무서',
      '걱정',
    ];
    emotionalWords.forEach((word) => {
      if (content.includes(word)) intensity += 0.3;
    });

    return Math.min(1.0, intensity);
  }

  /**
   * 메시지 주제를 분류합니다.
   */
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
    if (
      content.includes('모르') ||
      content.includes('헷갈') ||
      content.includes('복잡')
    )
      return 'confusion';
    if (content.includes('전략') || content.includes('계획')) return 'strategy';
    if (content.includes('정보') || content.includes('단서'))
      return 'information';
    if (
      content.includes('안녕') ||
      content.includes('날씨') ||
      content.includes('재미')
    )
      return 'small_talk';

    return 'small_talk'; // 기본값
  }

  /**
   * 응답을 기대하는 메시지인지 판단합니다.
   */
  private expectsResponse(content: string, senderName: string): boolean {
    // 질문이거나 의견을 구하는 경우
    return (
      content.includes('?') ||
      content.includes('어떻게 생각') ||
      content.includes('의견') ||
      content.includes('어때') ||
      content.includes('맞아')
    );
  }

  /**
   * 질문에 대한 응답 확률을 계산합니다.
   */
  private calculateQuestionResponseProbability(
    persona: AIPersona,
    analysis: MessageAnalysis,
  ): number {
    let baseProbability = 0.6;

    // 성격 기반 수정
    if (persona.communicationStyle.responsiveness) {
      baseProbability *= 1 + persona.communicationStyle.responsiveness;
    }

    // 주제에 따른 수정
    if (analysis.topic === 'accusation' || analysis.topic === 'suspicion') {
      baseProbability *= 1.5; // 의심/비난에는 더 적극적으로 응답
    }

    // 정보 요청에 대한 응답 성향
    if (analysis.requestsInformation) {
      baseProbability *= 0.5 + persona.personality.trust; // 신뢰도에 따라 정보 공유 의향
    }

    return Math.min(1.0, baseProbability);
  }

  /**
   * 일반적인 응답 확률을 계산합니다.
   */
  private calculateGeneralResponseProbability(
    persona: AIPersona,
    analysis: MessageAnalysis,
    conversationState: ConversationState,
  ): number {
    let baseProbability = 0.3;

    // 성격에 따른 기본 수정
    baseProbability *= 0.5 + persona.communicationStyle.responsiveness || 0.5;

    // 대화 수준에 따른 수정
    if (persona.playStyle.discussionLevel === 'talkative') {
      baseProbability *= 1.8;
    } else if (persona.playStyle.discussionLevel === 'active') {
      baseProbability *= 1.4;
    } else if (persona.playStyle.discussionLevel === 'moderate') {
      baseProbability *= 1.0;
    } else {
      // silent
      baseProbability *= 0.3;
    }

    // 감정적 강도에 따른 반응
    if (analysis.emotionalIntensity > 0.5) {
      baseProbability *= 1 + persona.personality.emotional;
    }

    // 대화 분위기에 따른 수정
    switch (conversationState.atmosphereLevel) {
      case 'heated':
        baseProbability *= 1 + persona.personality.aggression;
        break;
      case 'tense':
        baseProbability *= 1 + persona.personality.caution * 0.5;
        break;
      case 'analytical':
        baseProbability *= 1 + persona.personality.analytical;
        break;
      case 'casual':
        baseProbability *= 1.2;
        break;
    }

    return Math.min(1.0, baseProbability);
  }

  /**
   * 응답 이유를 결정합니다.
   */
  private determineResponseReason(
    analysis: MessageAnalysis,
    state: ConversationState,
  ): ChatTriggerReason {
    if (analysis.topic === 'accusation') return 'defend_other';
    if (analysis.topic === 'suspicion') return 'share_suspicion';
    if (analysis.topic === 'vote_discussion') return 'vote_persuasion';
    if (analysis.topic === 'information') return 'information_response';
    if (state.hasOngoingArgument) return 'bandwagon';

    return 'personality_driven';
  }

  /**
   * 자발적 발언 확률을 계산합니다.
   */
  private calculateSpontaneousProbability(
    persona: AIPersona,
    game: Game,
    conversationState: ConversationState,
  ): number {
    let baseProbability = 0.1;

    // 성격 기반 수정
    if (persona.personality.leadership > 0.7) {
      baseProbability *= 2.0; // 리더십이 강한 캐릭터는 자주 발언
    }

    if (persona.communicationStyle.verbosity > 0.7) {
      baseProbability *= 1.8; // 수다스러운 캐릭터
    }

    // 역할 기반 수정 (역할을 알 수 없으므로 생략하거나 다른 방식으로 판단)

    // 게임 진행 상황에 따른 수정
    const alivePlayers = game.players?.filter((p) => p.isAlive) || [];
    if (alivePlayers.length <= 4) {
      baseProbability *= 1.5; // 후반부에는 더 적극적
    }

    return Math.min(0.3, baseProbability); // 최대 30%로 제한
  }

  /**
   * 자발적 발언 이유를 결정합니다.
   */
  private determineSpontaneousReason(
    persona: AIPersona,
    game: Game,
    conversationState: ConversationState,
  ): ChatTriggerReason {
    if (persona.personality.leadership > 0.7) return 'vote_persuasion';
    if (persona.personality.analytical > 0.7) return 'share_suspicion';
    if (conversationState.currentTopic === 'small_talk')
      return 'personality_driven';

    return 'game_progress';
  }

  /**
   * 침묵 깨기 확률을 계산합니다.
   */
  private calculateSilenceBreakProbability(
    persona: AIPersona,
    conversationState: ConversationState,
  ): number {
    let probability = 0.2;

    // 리더십이 강한 캐릭터는 침묵을 깨려고 함
    probability *= 1 + persona.personality.leadership;

    // 수다스러운 캐릭터도 침묵을 견디지 못함
    if (persona.communicationStyle.verbosity > 0.6) {
      probability *= 1.5;
    }

    // 침묵이 길수록 확률 증가
    const silenceMultiplier = Math.min(
      3.0,
      conversationState.timeSinceLastMessage / 60,
    );
    probability *= silenceMultiplier;

    return Math.min(0.8, probability);
  }

  // 지연 시간 계산 메서드들

  /**
   * 페이즈 시작 시 채팅 시작 지연 시간을 계산합니다.
   */
  private calculateInitiationDelay(
    persona: AIPersona,
    phase: GamePhase,
  ): number {
    const baseDelay = 3000; // 3초
    const personalityFactor = 2 - (persona.communicationStyle.quickness || 0.5);
    const randomFactor = 0.5 + Math.random() * 1.5;

    return Math.floor(baseDelay * personalityFactor * randomFactor);
  }

  /**
   * 메시지 응답 지연 시간을 계산합니다.
   */
  private calculateResponseDelay(
    persona: AIPersona,
    analysis: MessageAnalysis,
  ): number {
    let baseDelay = 2000; // 2초

    // 직접 언급된 경우 더 빠르게 응답
    if (analysis.directMention) {
      baseDelay *= 0.7;
    }

    // 감정적 강도에 따른 수정
    if (analysis.emotionalIntensity > 0.5) {
      baseDelay *= 0.8; // 감정적인 메시지에는 더 빨리 반응
    }

    // 성격에 따른 수정
    const personalityFactor = 2 - (persona.communicationStyle.quickness || 0.5);
    const randomFactor = 0.3 + Math.random() * 0.7;

    return Math.floor(baseDelay * personalityFactor * randomFactor);
  }

  /**
   * 방어 응답 지연 시간을 계산합니다.
   */
  private calculateDefenseDelay(persona: AIPersona): number {
    const baseDelay = 1500; // 1.5초 (방어는 빠르게)

    // 공격적인 성격은 더 빠르게 방어
    const aggressionFactor = 1.5 - persona.personality.aggression;
    const randomFactor = 0.5 + Math.random() * 0.8;

    return Math.floor(baseDelay * aggressionFactor * randomFactor);
  }

  /**
   * 생각하는 시간이 필요한 응답의 지연 시간을 계산합니다.
   */
  private calculateThinkingDelay(
    persona: AIPersona,
    analysis: MessageAnalysis,
  ): number {
    const baseDelay = 4000; // 4초

    // 분석적인 성격은 더 오래 생각
    const analyticalFactor = 1 + persona.personality.analytical * 0.5;

    // 복잡한 질문일수록 더 오래 생각
    const complexityFactor = analysis.requestsInformation ? 1.3 : 1.0;

    const randomFactor = 0.7 + Math.random() * 0.6;

    return Math.floor(
      baseDelay * analyticalFactor * complexityFactor * randomFactor,
    );
  }

  /**
   * 일반적인 지연 시간을 계산합니다.
   */
  private calculateGeneralDelay(
    persona: AIPersona,
    reason: ChatTriggerReason,
  ): number {
    const baseDelays: Record<ChatTriggerReason, number> = {
      phase_start: 3000,
      direct_mention: 2000,
      accused: 1500,
      defend_self: 1500,
      defend_other: 3000,
      share_suspicion: 4000,
      vote_persuasion: 3500,
      information_response: 4000,
      personality_driven: 5000,
      silence_break: 2000,
      bandwagon: 2500,
      role_hint: 6000,
      game_progress: 3000,
    };

    const baseDelay = baseDelays[reason] || 3000;
    const personalityFactor = 2 - (persona.communicationStyle.quickness || 0.5);
    const randomFactor = 0.5 + Math.random();

    return Math.floor(baseDelay * personalityFactor * randomFactor);
  }

  /**
   * 자발적 발언 지연 시간을 계산합니다.
   */
  private calculateSpontaneousDelay(persona: AIPersona): number {
    const baseDelay = 8000; // 8초
    const personalityFactor = 2 - (persona.communicationStyle.quickness || 0.3);
    const randomFactor = 0.3 + Math.random() * 1.4;

    return Math.floor(baseDelay * personalityFactor * randomFactor);
  }

  /**
   * 우선순위를 계산합니다.
   */
  private calculatePriority(
    reason: ChatTriggerReason,
    persona: AIPersona,
  ): number {
    const basePriorities: Record<ChatTriggerReason, number> = {
      direct_mention: 10,
      accused: 9,
      defend_self: 9,
      phase_start: 7,
      vote_persuasion: 6,
      defend_other: 5,
      information_response: 5,
      share_suspicion: 4,
      bandwagon: 3,
      personality_driven: 2,
      silence_break: 2,
      role_hint: 1,
      game_progress: 1,
    };

    let priority = basePriorities[reason] || 1;

    // 성격에 따른 우선순위 수정
    if (reason === 'vote_persuasion' && persona.personality.leadership > 0.7) {
      priority += 2;
    }

    if (reason === 'share_suspicion' && persona.personality.analytical > 0.7) {
      priority += 1;
    }

    return priority;
  }

  // 유틸리티 메서드들

  private getBaseChatChance(phase: GamePhase): number {
    return this.chatPatternConfig.baseChatProbabilities[phase] || 0.3;
  }

  private getPersonalityChatModifier(persona: AIPersona): number {
    const config = this.chatPatternConfig.personalityModifiers;
    let modifier = 1.0;

    modifier *=
      1 +
      (persona.communicationStyle.verbosity || 0.5) *
        config.verbosityMultiplier;
    modifier *=
      1 + persona.personality.emotional * config.emotionalResponseMultiplier;
    modifier *=
      1 + persona.personality.leadership * config.leadershipMultiplier;

    return modifier;
  }

  private getSituationModifier(game: Game, phase: GamePhase): number {
    let modifier = 1.0;
    const config = this.chatPatternConfig.situationModifiers;

    // 게임 진행 단계에 따른 수정
    if (game.dayCount <= 2) {
      modifier *= config.earlyGame;
    } else if (game.dayCount >= 4) {
      modifier *= config.lateGame;
    }

    // 생존자 수에 따른 수정
    const alivePlayers = game.players?.filter((p) => p.isAlive).length || 6;
    if (alivePlayers <= 4) {
      modifier *= config.criticalSituation;
    }

    return modifier;
  }

  private getMinimumCooldown(persona: AIPersona): number {
    // 성격에 따라 15초~60초의 쿨다운
    const baseSeconds = 30;
    const personalityFactor = 2 - (persona.communicationStyle.verbosity || 0.5);
    return baseSeconds * personalityFactor;
  }

  private getSilenceThreshold(persona: AIPersona): number {
    // 성격에 따라 60초~180초의 침묵 임계값
    const baseSeconds = 120;
    const personalityFactor =
      1.5 - (persona.communicationStyle.verbosity || 0.5);
    return baseSeconds * personalityFactor;
  }

  private getMyName(persona: AIPersona, game: Game): string {
    // 게임에서 실제 플레이어 이름을 찾아야 하지만, 일단 페르소나 이름 사용
    return persona.name;
  }

  /**
   * 채팅 패턴 설정을 초기화합니다.
   */
  private initializeChatPatternConfig(): ChatPatternConfig {
    return {
      baseChatProbabilities: {
        day: 0.4,
        night: 0.1,
        voting: 0.6,
        result: 0.3,
        day_discussion: 0.4,
        day_voting: 0.6,
        night_actions: 0.1,
      },
      personalityModifiers: {
        verbosityMultiplier: 0.8,
        emotionalResponseMultiplier: 0.5,
        leadershipMultiplier: 0.6,
        aggressionMultiplier: 0.4,
      },
      roleModifiers: {
        mafia: 0.8,
        police: 1.0,
        doctor: 0.9,
        citizen: 1.1,
      },
      situationModifiers: {
        whenSuspected: 1.8,
        whenOthersSuspected: 1.3,
        nearVoteDeadline: 2.0,
        earlyGame: 0.8,
        lateGame: 1.4,
        criticalSituation: 1.6,
      },
    };
  }
}

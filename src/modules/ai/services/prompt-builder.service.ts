import { Injectable } from '@nestjs/common';
import { Logger } from '@libs/logger';
import {
  GamePromptContext,
  ChatPromptContext,
  VotePromptContext,
  PromptTemplateOptions,
  ConversationTopic,
  ChatTrigger,
} from '../types/prompt-context.types';
import { AIPersona, PersonalityTraits } from '../types/ai-persona.types';
import { Player } from '../../../entities/player.entity';
import { Game } from '../../../entities/game.entity';

/**
 * AI를 위한 상황별 프롬프트를 생성하는 서비스
 * 게임 상황, 플레이어 역할, AI 페르소나에 따라 맞춤형 프롬프트를 제공
 */
@Injectable()
export class PromptBuilderService {
  constructor(private readonly logger: Logger) {
    this.logger.setContext(PromptBuilderService.name);
  }

  /**
   * 게임 상태 기반 기본 프롬프트를 생성합니다.
   * @param context 게임 프롬프트 컨텍스트
   * @param options 프롬프트 템플릿 옵션
   */
  buildGameStatePrompt(
    context: GamePromptContext,
    options: PromptTemplateOptions = {},
  ): string {
    const { game, player, persona, phase, recentEvents } = context;

    return `
## 🎮 게임 상황 정보
- **현재 페이즈**: ${this.translatePhase(phase)}
- **게임 일차**: ${game.dayCount}일차
- **생존자 수**: ${game.players.filter((p) => p.isAlive).length}명 / ${game.players.length}명
- **당신의 역할**: ${this.translateRole(player.role)}
- **당신의 정체성**: ${persona.name}
- **현재 시간**: ${new Date().toLocaleTimeString('ko-KR')}

## 🧠 당신의 성격과 특성
${this.describePersonality(persona)}

## 📈 게임 진행 상황
${this.buildGameProgressSummary(game, player)}

## 🔍 최근 주요 이벤트
${
  recentEvents.length > 0
    ? recentEvents.map((event) => `- ${event.description}`).join('\n')
    : '- 특별한 이벤트가 없었습니다.'
}

## 🎯 현재 상황 분석
${this.analyzeCurrentSituation(game, player, persona)}

## 📋 행동 지침
${this.getActionGuidelines(phase, player.role, persona)}

---
**중요**: 당신은 ${persona.name}입니다. 이 성격과 상황에 맞게 자연스럽고 인간적으로 행동하세요.
모든 응답은 한국어로, 실제 사람이 하는 것처럼 완벽하지 않고 감정이 담긴 표현을 사용하세요.
    `.trim();
  }

  /**
   * 채팅 상황에 맞는 프롬프트를 생성합니다.
   * @param context 채팅 프롬프트 컨텍스트
   * @param options 프롬프트 템플릿 옵션
   */
  buildChatPrompt(
    context: ChatPromptContext,
    options: PromptTemplateOptions = {},
  ): string {
    const {
      gameState,
      conversationContext,
      recentChat,
      referencedMessage,
      chatTrigger,
    } = context;
    const basePrompt = this.buildGameStatePrompt(gameState, options);

    return `
${basePrompt}

## 💬 현재 대화 상황
- **대화 주제**: ${this.translateConversationTopic(conversationContext.currentTopic)}
- **대화 분위기**: ${this.translateEmotionalTone(conversationContext.emotionalTone)}
- **채팅 생성 이유**: ${this.translateChatTrigger(chatTrigger)}

## 📝 최근 채팅 내역
${
  recentChat.length > 0
    ? recentChat
        .slice(-5)
        .map((msg) => `${msg.senderName}: ${msg.content}`)
        .join('\n')
    : '- 아직 대화가 시작되지 않았습니다.'
}

${
  referencedMessage
    ? `
## 💭 응답할 메시지
${referencedMessage.senderName}: "${referencedMessage.content}"
`
    : ''
}

## 🎯 채팅 생성 지침
${this.getChatGuidelines(chatTrigger, gameState.persona, conversationContext)}

**응답 형식**:
- 길이: ${options.maxLength || '20-80'}자 사이
- 톤: ${this.getPersonalityChatTone(gameState.persona)}
- 감정: ${options.emotionalIntensity || 'medium'} 강도

${
  options.requireJsonResponse
    ? `
JSON 형식으로 응답하세요:
{
  "job": "채팅 응답",
  "response": "실제 채팅 메시지",
  "emotion": "현재 감정 상태",
  "confidence": 0.8
}
`
    : '자연스러운 채팅 메시지로 응답하세요.'
}
    `.trim();
  }

  /**
   * 투표 상황에 맞는 프롬프트를 생성합니다.
   * @param context 투표 프롬프트 컨텍스트
   * @param options 프롬프트 템플릿 옵션
   */
  buildVotePrompt(
    context: VotePromptContext,
    options: PromptTemplateOptions = {},
  ): string {
    const {
      gameState,
      voteCandidates,
      currentVotes,
      suspicionData,
      timeRemaining,
    } = context;
    const basePrompt = this.buildGameStatePrompt(gameState, options);

    return `
${basePrompt}

## 🗳️ 투표 상황
- **남은 시간**: ${timeRemaining}초
- **투표 대상자**: ${voteCandidates.map((p) => p.name).join(', ')}
- **현재 투표 현황**: ${this.buildVoteStatusSummary(currentVotes, gameState.game.players)}

## 🤔 의심도 분석
${this.buildSuspicionAnalysis(voteCandidates, suspicionData, gameState.persona)}

## 🎯 투표 전략 가이드
${this.getVotingStrategy(gameState.player.role, gameState.persona)}

## 📊 후보자별 분석
${voteCandidates
  .map((candidate) =>
    this.analyzeCandidateForVoting(
      candidate,
      gameState,
      suspicionData.get(candidate.id) || 0,
    ),
  )
  .join('\n\n')}

**투표 결정 요청**:
위 정보를 종합하여 가장 적절한 투표 대상을 선택하고, 그 이유를 설명하세요.

JSON 형식:
{
  "job": "투표 결정",
  "target": "플레이어_이름",
  "targetId": 플레이어_ID,
  "reasoning": "투표 이유 설명",
  "confidence": 0.8,
  "shouldExplain": true/false
}
    `.trim();
  }

  /**
   * 페르소나의 성격을 자연스럽게 설명합니다.
   */
  private describePersonality(persona: AIPersona): string {
    const traits = [];

    if (persona.personality.analytical > 0.7) {
      traits.push('논리적이고 분석적인 사고를 선호');
    }
    if (persona.personality.aggression > 0.6) {
      traits.push('적극적이고 공격적인 성향');
    }
    if (persona.personality.caution > 0.7) {
      traits.push('신중하고 조심스러운 접근');
    }
    if (persona.personality.trust > 0.7) {
      traits.push('다른 사람을 잘 믿는 편');
    } else if (persona.personality.trust < 0.4) {
      traits.push('의심이 많고 경계하는 편');
    }
    if (persona.personality.leadership > 0.6) {
      traits.push('리더십을 발휘하려는 경향');
    }
    if (persona.personality.emotional > 0.6) {
      traits.push('감정 표현이 풍부');
    }

    return `**${persona.name}의 성격**: ${traits.join(', ')}하는 특징을 가지고 있습니다.

**플레이 스타일**:
- 투표 성향: ${this.translateVotingPattern(persona.playStyle.votingPattern)}
- 대화 수준: ${this.translateDiscussionLevel(persona.playStyle.discussionLevel)}
- 의심 시작점: ${Math.round(persona.playStyle.suspicionThreshold * 100)}%
- 팀플레이 선호: ${Math.round(persona.playStyle.teamplayPreference * 100)}%`;
  }

  /**
   * 현재 게임 상황을 분석합니다.
   */
  private analyzeCurrentSituation(
    game: Game,
    player: Player,
    persona: AIPersona,
  ): string {
    const analysis = [];

    const alivePlayers = game.players.filter((p) => p.isAlive);
    const mafiaCount = alivePlayers.filter((p) => p.role === 'mafia').length;
    const citizenCount = alivePlayers.filter((p) => p.role !== 'mafia').length;

    analysis.push(`현재 마피아 ${mafiaCount}명, 시민 ${citizenCount}명이 생존`);

    if (player.role === 'mafia') {
      const otherMafia = alivePlayers.filter(
        (p) => p.role === 'mafia' && p.id !== player.id,
      );
      if (otherMafia.length > 0) {
        analysis.push(
          `동료 마피아: ${otherMafia.map((p) => p.name).join(', ')}`,
        );
      }
    }

    if (mafiaCount >= citizenCount) {
      analysis.push('⚠️ 마피아가 우세한 상황 - 긴급 상황!');
    } else if (mafiaCount === 1) {
      analysis.push('마피아가 1명만 남음 - 시민들에게 유리한 상황');
    }

    return analysis.join('\n');
  }

  /**
   * 페이즈와 역할에 따른 행동 지침을 제공합니다.
   */
  private getActionGuidelines(
    phase: 'day' | 'night' | 'vote' | 'result',
    role: string,
    persona: AIPersona,
  ): string {
    const guidelines = [];

    // 페이즈별 기본 지침
    switch (phase) {
      case 'day':
        guidelines.push('💡 정보를 공유하고 의심스러운 점을 논의할 시간');
        guidelines.push('🗣️ 다른 플레이어들과 대화하며 상황을 파악하세요');
        break;
      case 'vote':
        guidelines.push('🗳️ 신중하게 투표 대상을 결정해야 할 시간');
        guidelines.push('⏰ 제한 시간 내에 결정을 내려야 합니다');
        break;
      case 'night':
        if (role === 'mafia') {
          guidelines.push('🌙 동료들과 상의하여 제거 대상을 결정하세요');
        } else if (role === 'police') {
          guidelines.push('🔍 조사할 대상을 신중히 선택하세요');
        } else if (role === 'doctor') {
          guidelines.push('⚕️ 보호할 대상을 결정하세요');
        }
        break;
    }

    // 역할별 추가 지침
    switch (role) {
      case 'mafia':
        guidelines.push('🎭 시민으로 위장하되, 동료를 보호하세요');
        guidelines.push('🎯 의심받지 않도록 자연스럽게 행동하세요');
        break;
      case 'police':
        guidelines.push('🕵️ 정체를 숨기며 마피아를 찾아내세요');
        guidelines.push('📊 조사 결과를 효과적으로 활용하세요');
        break;
      case 'doctor':
        guidelines.push('🛡️ 중요한 플레이어를 보호하세요');
        guidelines.push('🤐 역할이 드러나지 않도록 주의하세요');
        break;
      case 'citizen':
        guidelines.push('👥 다른 시민들과 협력하여 마피아를 찾으세요');
        guidelines.push('🧐 논리적 근거를 바탕으로 의심하세요');
        break;
    }

    return guidelines.join('\n');
  }

  /**
   * 게임 진행 상황을 요약합니다.
   */
  private buildGameProgressSummary(game: Game, player: Player): string {
    const summary = [];

    if (game.dayCount === 1) {
      summary.push('게임이 시작되었습니다.');
    } else {
      summary.push(`${game.dayCount}일차가 진행 중입니다.`);
    }

    const deadPlayers = game.players.filter((p) => !p.isAlive);
    if (deadPlayers.length > 0) {
      summary.push(
        `제거된 플레이어: ${deadPlayers.map((p) => `${p.name}(${this.translateRole(p.role)})`).join(', ')}`,
      );
    }

    return summary.join(' ');
  }

  /**
   * 채팅 생성 지침을 제공합니다.
   */
  private getChatGuidelines(
    trigger: ChatTrigger,
    persona: AIPersona,
    conversationContext: any,
  ): string {
    const guidelines = [];

    switch (trigger) {
      case 'phase_start':
        guidelines.push(
          '새로운 페이즈가 시작되었을 때의 자연스러운 반응을 보이세요',
        );
        break;
      case 'response_to_message':
        guidelines.push('상대방의 메시지에 적절히 반응하세요');
        break;
      case 'accusation_defense':
        guidelines.push('의심받는 상황에서 자연스럽게 방어하세요');
        break;
      case 'information_share':
        guidelines.push('가진 정보를 전략적으로 공유하세요');
        break;
      case 'vote_persuasion':
        guidelines.push('다른 플레이어들을 설득하려고 시도하세요');
        break;
    }

    if (persona.communicationStyle.directness > 0.7) {
      guidelines.push('직설적이고 명확하게 표현하세요');
    } else {
      guidelines.push('돌려서 말하거나 암시적으로 표현하세요');
    }

    return guidelines.join('\n');
  }

  /**
   * 투표 전략을 제공합니다.
   */
  private getVotingStrategy(role: string, persona: AIPersona): string {
    const strategies = [];

    // 역할별 기본 전략
    switch (role) {
      case 'mafia':
        strategies.push('🎭 시민들이 서로를 의심하도록 유도하세요');
        strategies.push('🎯 위험한 시민(경찰, 의사)을 우선 제거하세요');
        strategies.push('🤝 동료 마피아를 보호하되 의심받지 않게 하세요');
        break;
      case 'police':
        strategies.push('🔍 조사 결과를 바탕으로 투표하세요');
        strategies.push('🎯 확실한 마피아가 있다면 적극 추진하세요');
        strategies.push('🛡️ 정체가 들키지 않도록 조심하세요');
        break;
      case 'doctor':
        strategies.push('🤔 논리적 근거가 있는 플레이어에게 투표하세요');
        strategies.push('👥 다른 시민들의 의견을 참고하세요');
        break;
      case 'citizen':
        strategies.push('🧐 의심스러운 행동을 보인 플레이어를 선택하세요');
        strategies.push('👂 다른 플레이어들의 의견을 종합하세요');
        break;
    }

    // 성격별 수정
    if (persona.personality.analytical > 0.7) {
      strategies.push('📊 논리적 근거를 바탕으로 신중히 결정하세요');
    }
    if (persona.personality.aggression > 0.6) {
      strategies.push('💪 확신이 서면 적극적으로 추진하세요');
    }

    return strategies.join('\n');
  }

  // 유틸리티 메서드들
  private translatePhase(phase: string): string {
    const translations = {
      day: '낮 토론',
      night: '밤',
      vote: '투표',
      result: '결과 발표',
    };
    return translations[phase] || phase;
  }

  private translateRole(role: string): string {
    const translations = {
      mafia: '마피아',
      police: '경찰',
      doctor: '의사',
      citizen: '시민',
    };
    return translations[role] || role;
  }

  private translateVotingPattern(pattern: string): string {
    const translations = {
      aggressive: '공격적',
      defensive: '방어적',
      analytical: '분석적',
      random: '즉흥적',
    };
    return translations[pattern] || pattern;
  }

  private translateDiscussionLevel(level: string): string {
    const translations = {
      silent: '조용함',
      moderate: '보통',
      active: '활발함',
      talkative: '수다스러움',
    };
    return translations[level] || level;
  }

  private translateConversationTopic(topic: ConversationTopic): string {
    const translations = {
      role_discussion: '역할 논의',
      suspicion_sharing: '의심 공유',
      vote_coordination: '투표 조율',
      defense_argument: '방어 논증',
      information_sharing: '정보 공유',
      small_talk: '잡담',
      strategy_discussion: '전략 논의',
    };
    return translations[topic] || topic;
  }

  private translateEmotionalTone(tone: string): string {
    const translations = {
      neutral: '중립적',
      tense: '긴장된',
      accusatory: '비난하는',
      defensive: '방어적',
      cooperative: '협력적',
    };
    return translations[tone] || tone;
  }

  private translateChatTrigger(trigger: ChatTrigger): string {
    const translations = {
      phase_start: '페이즈 시작',
      response_to_message: '메시지 응답',
      spontaneous: '자발적 발언',
      accusation_defense: '의심에 대한 방어',
      information_share: '정보 공유',
      vote_persuasion: '투표 설득',
      role_hint: '역할 암시',
    };
    return translations[trigger] || trigger;
  }

  private getPersonalityChatTone(persona: AIPersona): string {
    const tones = [];

    if (persona.communicationStyle.formality > 0.6) {
      tones.push('정중한');
    } else {
      tones.push('친근한');
    }

    if (persona.communicationStyle.directness > 0.6) {
      tones.push('직설적인');
    } else {
      tones.push('완곡한');
    }

    return tones.join(', ') + ' 톤';
  }

  private buildVoteStatusSummary(
    currentVotes: any[],
    players: Player[],
  ): string {
    if (currentVotes.length === 0) {
      return '아직 투표가 시작되지 않았습니다.';
    }

    const voteCounts = new Map();
    currentVotes.forEach((vote) => {
      const target = players.find((p) => p.id === vote.targetId);
      if (target) {
        voteCounts.set(target.name, (voteCounts.get(target.name) || 0) + 1);
      }
    });

    return Array.from(voteCounts.entries())
      .map(([name, count]) => `${name}: ${count}표`)
      .join(', ');
  }

  private buildSuspicionAnalysis(
    candidates: Player[],
    suspicionData: Map<number, number>,
    persona: AIPersona,
  ): string {
    return candidates
      .map((candidate) => {
        const suspicionLevel = suspicionData.get(candidate.id) || 0;
        const suspicionText = this.getSuspicionLevelText(suspicionLevel);
        return `- ${candidate.name}: ${suspicionText} (${Math.round(suspicionLevel * 100)}%)`;
      })
      .join('\n');
  }

  private getSuspicionLevelText(level: number): string {
    if (level < 0.2) return '의심 없음';
    if (level < 0.4) return '약간 의심';
    if (level < 0.6) return '보통 의심';
    if (level < 0.8) return '강하게 의심';
    return '매우 의심스러움';
  }

  private analyzeCandidateForVoting(
    candidate: Player,
    gameState: GamePromptContext,
    suspicionLevel: number,
  ): string {
    return `**${candidate.name}**
- 의심도: ${Math.round(suspicionLevel * 100)}%
- 생존 상태: ${candidate.isAlive ? '생존' : '사망'}
- 최근 행동: ${this.getRecentBehaviorSummary(candidate)}`;
  }

  private getRecentBehaviorSummary(player: Player): string {
    // 실제 구현에서는 플레이어의 최근 행동을 분석
    return '활발한 대화 참여';
  }
}

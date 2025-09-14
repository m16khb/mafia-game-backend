# Mafia Game AI Implementation Plan

## 현재 상황 분석

### 기존 구현 상태
- ✅ **LLM 서비스**: OpenRouter 기반으로 구현 완료
- ✅ **게임 엔티티**: 역할, 페이즈, 플레이어 관리 완료
- ✅ **기본 구조**: 프롬프트, 메시지 전달 가능
- 🔄 **현재 문제**: 단순 JSON 스키마 응답으로는 실제 마피아 게임 수준 부족

### 필요한 개발 범위
실제 사람과 비슷한 수준의 마피아 AI 구현을 위해 다음 영역의 고도화 필요:

1. **AI 페르소나 시스템**
2. **상황별 프롬프트 엔지니어링**
3. **채팅 상호작용 시스템**
4. **의심/추리 논리 엔진**
5. **투표 전략 시스템**

---

## 🎯 Phase 1: AI 페르소나 & 성격 시스템 (우선순위: HIGH)

### 목표
각 AI 플레이어가 고유한 성격과 행동 패턴을 가지도록 구현

### 구현 계획

#### 1.1 AI 페르소나 정의
```typescript
// src/modules/ai/types/ai-persona.types.ts
export interface AIPersona {
  id: string;
  name: string;
  personality: PersonalityTraits;
  playStyle: PlayStyle;
  communicationStyle: CommunicationStyle;
  suspicionBehavior: SuspicionBehavior;
}

export interface PersonalityTraits {
  aggression: number;      // 0-1: 공격적 성향
  caution: number;         // 0-1: 신중함
  trust: number;           // 0-1: 타인 신뢰도
  leadership: number;      // 0-1: 리더십
  analytical: number;      // 0-1: 분석적 사고
  emotional: number;       // 0-1: 감정적 반응
}

export interface PlayStyle {
  votingPattern: 'aggressive' | 'defensive' | 'analytical' | 'random';
  discussionLevel: 'silent' | 'moderate' | 'active' | 'talkative';
  suspicionThreshold: number;  // 의심 시작 임계값
  teamplayPreference: number; // 팀플레이 선호도
}
```

#### 1.2 페르소나 컬렉션 생성
```typescript
// src/modules/ai/data/ai-personas.data.ts
export const AI_PERSONAS: AIPersona[] = [
  {
    id: 'detective-holmes',
    name: '홈즈',
    personality: { aggression: 0.3, caution: 0.8, trust: 0.4, leadership: 0.7, analytical: 0.9, emotional: 0.2 },
    playStyle: { votingPattern: 'analytical', discussionLevel: 'active', suspicionThreshold: 0.3, teamplayPreference: 0.6 },
    communicationStyle: { formality: 0.8, verbosity: 0.7, directness: 0.8 },
    suspicionBehavior: { investigateFrequency: 0.8, shareFindings: 0.7, accusationCaution: 0.8 }
  },
  {
    id: 'social-butterfly',
    name: '소셜이',
    personality: { aggression: 0.2, caution: 0.4, trust: 0.8, leadership: 0.5, analytical: 0.4, emotional: 0.8 },
    playStyle: { votingPattern: 'defensive', discussionLevel: 'talkative', suspicionThreshold: 0.6, teamplayPreference: 0.9 },
    communicationStyle: { formality: 0.2, verbosity: 0.9, directness: 0.3 },
    suspicionBehavior: { investigateFrequency: 0.3, shareFindings: 0.9, accusationCaution: 0.4 }
  },
  // ... 더 많은 페르소나
];
```

#### 1.3 페르소나 서비스 구현
```typescript
// src/modules/ai/services/ai-persona.service.ts
@Injectable()
export class AIPersonaService {
  assignRandomPersonas(players: Player[]): Map<number, AIPersona> {
    const aiPlayers = players.filter(p => p.isAI);
    const availablePersonas = [...AI_PERSONAS];
    const assignments = new Map<number, AIPersona>();
    
    aiPlayers.forEach(player => {
      const randomIndex = Math.floor(Math.random() * availablePersonas.length);
      const persona = availablePersonas.splice(randomIndex, 1)[0];
      assignments.set(player.id, persona);
      
      // 플레이어 이름을 페르소나 이름으로 업데이트
      player.name = persona.name;
    });
    
    return assignments;
  }
}
```

---

## 🎯 Phase 2: 상황별 프롬프트 시스템 (우선순위: HIGH)

### 목표
게임 상황(페이즈, 역할, 이벤트)에 따른 정교한 프롬프트 생성

### 구현 계획

#### 2.1 프롬프트 템플릿 엔진
```typescript
// src/modules/ai/services/prompt-builder.service.ts
@Injectable()
export class PromptBuilderService {
  
  buildGameStatePrompt(context: GamePromptContext): string {
    const { game, player, persona, phase, recentEvents } = context;
    
    return `
## 게임 상황
- 현재 페이즈: ${phase}
- 일차: ${game.dayCount}
- 생존자: ${game.getAlivePlayers().length}명
- 당신의 역할: ${player.role}
- 당신의 성격: ${this.describePersonality(persona)}

## 최근 이벤트
${recentEvents.map(event => `- ${event.description}`).join('\n')}

## 현재 상황 분석
${this.analyzeCurrentSituation(game, player, persona)}

## 행동 지침
${this.getActionGuidelines(phase, player.role, persona)}

당신은 ${persona.name}입니다. 이 성격과 상황에 맞게 자연스럽게 행동하세요.
    `;
  }

  buildChatPrompt(context: ChatPromptContext): string {
    const { message, gameState, persona, recentChat } = context;
    
    return `
${this.buildGameStatePrompt(gameState)}

## 최근 채팅
${recentChat.slice(-5).map(msg => `${msg.player}: ${msg.content}`).join('\n')}

## 응답 요청
다른 플레이어가 말했습니다: "${message}"

당신의 성격(${persona.name})에 맞게 자연스럽고 인간적인 응답을 생성하세요.
응답은 한국어로, 20-80자 사이로 작성하세요.

JSON 형식:
{
  "job": "채팅 응답",
  "response": "실제 채팅 메시지"
}
    `;
  }
}
```

#### 2.2 역할별 특수 프롬프트
```typescript
// src/modules/ai/services/role-specific-prompts.service.ts
@Injectable()
export class RoleSpecificPromptsService {

  getMafiaPrompt(context: GamePromptContext): string {
    return `
## 마피아 역할 지침
- 당신은 마피아입니다. 시민으로 위장해야 합니다.
- 동료 마피아: ${context.game.getMafiaPlayers().filter(p => p.id !== context.player.id).map(p => p.name).join(', ')}
- 밤에는 누구를 제거할지 결정해야 합니다.
- 낮에는 의심받지 않도록 행동하세요.
- 투표할 때는 시민이 제거되도록 유도하세요.

## 마피아 전략 (${context.persona.name} 스타일)
${this.getMafiaStrategy(context.persona)}
    `;
  }

  getPolicePrompt(context: GamePromptContext): string {
    return `
## 경찰 역할 지침
- 당신은 경찰입니다. 마피아를 찾아야 합니다.
- 밤에는 한 명을 조사할 수 있습니다.
- 조사 결과를 어떻게 활용할지 신중히 결정하세요.
- 정체가 드러나면 마피아의 주요 타겟이 됩니다.

## 경찰 전략 (${context.persona.name} 스타일)
${this.getPoliceStrategy(context.persona)}
    `;
  }
}
```

---

## 🎯 Phase 3: 실시간 채팅 시스템 (우선순위: HIGH)

### 목표
자연스럽고 상황에 맞는 AI 채팅 구현

### 구현 계획

#### 3.1 AI 채팅 컨트롤러
```typescript
// src/modules/ai/controllers/ai-chat.controller.ts
@Injectable()
export class AIChatService {
  
  async processGamePhaseStart(game: Game, phase: GamePhase): Promise<void> {
    const aiPlayers = game.players.filter(p => p.isAI && p.isAlive);
    
    // 페이즈 시작 시 일부 AI가 자연스럽게 채팅 시작
    for (const player of aiPlayers) {
      const persona = this.aiPersonaService.getPersona(player.id);
      const shouldSpeak = this.shouldInitiateChatOnPhaseStart(persona, phase);
      
      if (shouldSpeak) {
        setTimeout(async () => {
          await this.generateAndSendChat(game, player, persona, 'phase_start');
        }, this.calculateDelay(persona));
      }
    }
  }

  async respondToPlayerChat(game: Game, originalMessage: Message): Promise<void> {
    const aiPlayers = game.players.filter(p => p.isAI && p.isAlive);
    
    for (const player of aiPlayers) {
      const persona = this.aiPersonaService.getPersona(player.id);
      const shouldRespond = this.shouldRespondToMessage(persona, originalMessage, game);
      
      if (shouldRespond) {
        setTimeout(async () => {
          await this.generateAndSendChat(game, player, persona, 'response', originalMessage);
        }, this.calculateResponseDelay(persona));
      }
    }
  }

  private async generateAndSendChat(
    game: Game, 
    player: Player, 
    persona: AIPersona, 
    context: ChatContext,
    referencedMessage?: Message
  ): Promise<void> {
    try {
      const prompt = this.promptBuilder.buildChatPrompt({
        game,
        player,
        persona,
        context,
        referencedMessage,
        recentChat: game.messages.slice(-10)
      });

      const response = await this.llmService.generate({
        provider: 'open-router',
        prompt,
        message: `상황에 맞는 채팅을 생성해주세요.`
      });

      // 메시지를 게임에 추가하고 브로드캐스트
      await this.gameService.addAIMessage(game.id, player.id, response);
      
    } catch (error) {
      this.logger.error(error, `Failed to generate AI chat for player ${player.id}`);
    }
  }
}
```

#### 3.2 채팅 타이밍 시스템
```typescript
// src/modules/ai/services/chat-timing.service.ts
@Injectable()
export class ChatTimingService {
  
  shouldInitiateChatOnPhaseStart(persona: AIPersona, phase: GamePhase): boolean {
    const baseChance = this.getBaseChatChance(phase);
    const personalityModifier = this.getPersonalityChatModifier(persona);
    
    return Math.random() < (baseChance * personalityModifier);
  }

  shouldRespondToMessage(
    persona: AIPersona, 
    message: Message, 
    game: Game
  ): boolean {
    // 직접 언급된 경우
    if (message.content.includes(persona.name)) return true;
    
    // 의심받는 내용인 경우
    if (this.isAccusationMessage(message)) {
      return Math.random() < persona.suspicionBehavior.responseToAccusation;
    }
    
    // 성격에 따른 일반적인 응답 확률
    return Math.random() < (persona.communicationStyle.responsiveness || 0.3);
  }

  calculateDelay(persona: AIPersona): number {
    // 성격에 따른 응답 딜레이 계산
    const baseDelay = 2000; // 2초
    const personalityFactor = 1 - (persona.communicationStyle.quickness || 0.5);
    const randomFactor = 0.5 + Math.random();
    
    return Math.floor(baseDelay * personalityFactor * randomFactor);
  }
}
```

---

## 🎯 Phase 4: 추리 & 의심 시스템 (우선순위: MEDIUM)

### 목표
AI가 게임 상황을 분석하고 논리적으로 추리하는 시스템

### 구현 계획

#### 4.1 의심 추적 시스템
```typescript
// src/modules/ai/services/suspicion-tracker.service.ts
@Injectable()
export class SuspicionTrackerService {
  private suspicionMap: Map<number, Map<number, SuspicionData>> = new Map();

  updateSuspicion(
    suspectingPlayerId: number,
    suspectedPlayerId: number,
    reason: SuspicionReason,
    intensity: number
  ): void {
    const playerSuspicions = this.suspicionMap.get(suspectingPlayerId) || new Map();
    const currentSuspicion = playerSuspicions.get(suspectedPlayerId) || {
      level: 0,
      reasons: [],
      history: []
    };

    currentSuspicion.level = Math.min(1, currentSuspicion.level + intensity);
    currentSuspicion.reasons.push(reason);
    currentSuspicion.history.push({
      timestamp: new Date(),
      reason,
      intensityChange: intensity
    });

    playerSuspicions.set(suspectedPlayerId, currentSuspicion);
    this.suspicionMap.set(suspectingPlayerId, playerSuspicions);
  }

  analyzeVotingPattern(game: Game, playerId: number): SuspicionUpdate[] {
    const player = game.players.find(p => p.id === playerId);
    const updates: SuspicionUpdate[] = [];

    // 투표 패턴 분석 로직
    // 예: 항상 같은 사람에게 투표하는 경우
    // 예: 마피아가 제거될 뻔할 때 다른 곳에 투표하는 경우

    return updates;
  }
}

interface SuspicionData {
  level: number; // 0-1
  reasons: SuspicionReason[];
  history: SuspicionHistoryEntry[];
}

interface SuspicionReason {
  type: 'voting_pattern' | 'chat_analysis' | 'night_survival' | 'role_claim' | 'defense_pattern';
  description: string;
  confidence: number;
}
```

#### 4.2 행동 패턴 분석
```typescript
// src/modules/ai/services/behavior-analyzer.service.ts
@Injectable()
export class BehaviorAnalyzerService {

  analyzeChatBehavior(player: Player, messages: Message[]): BehaviorAnalysis {
    const playerMessages = messages.filter(m => m.playerId === player.id);
    
    return {
      verbosity: this.calculateVerbosity(playerMessages),
      topicAvoidance: this.detectTopicAvoidance(playerMessages),
      defensiveness: this.measureDefensiveness(playerMessages),
      accusationPattern: this.analyzeAccusationPattern(playerMessages),
      timePattern: this.analyzeTimingPatterns(playerMessages)
    };
  }

  generateSuspicionPrompt(
    suspectingPlayer: Player,
    suspectedPlayer: Player,
    suspicionData: SuspicionData,
    gameContext: Game
  ): string {
    return `
## 의심 분석 요청

당신은 ${suspectingPlayer.name}이고, ${suspectedPlayer.name}을(를) 의심하고 있습니다.

### 의심 근거
${suspicionData.reasons.map(r => `- ${r.description} (확신도: ${r.confidence})`).join('\n')}

### 현재 의심 레벨: ${Math.round(suspicionData.level * 100)}%

게임 상황을 고려하여 이 플레이어에 대한 의심을 어떻게 표현할지 결정하세요.
직접 의심을 드러낼지, 아니면 간접적으로 접근할지 선택하고,
자연스러운 채팅 메시지를 생성하세요.
    `;
  }
}
```

---

## 🎯 Phase 5: 고급 투표 전략 시스템 (우선순위: MEDIUM)

### 목표
역할별, 성격별 최적 투표 전략 구현

### 구현 계획

#### 5.1 투표 전략 엔진
```typescript
// src/modules/ai/services/voting-strategy.service.ts
@Injectable()
export class VotingStrategyService {

  async calculateVote(
    voter: Player,
    persona: AIPersona,
    game: Game,
    suspicionData: Map<number, SuspicionData>
  ): Promise<VotingDecision> {
    
    const strategy = this.getVotingStrategy(voter.role, persona);
    const candidates = game.getAlivePlayers().filter(p => p.id !== voter.id);
    
    const scoredCandidates = candidates.map(candidate => ({
      player: candidate,
      score: this.calculateVotingScore(candidate, voter, suspicionData, strategy, game)
    }));

    scoredCandidates.sort((a, b) => b.score - a.score);
    
    return {
      target: scoredCandidates[0].player,
      confidence: scoredCandidates[0].score,
      reasoning: this.generateVotingReasoning(scoredCandidates[0], strategy),
      shouldExplain: this.shouldExplainVote(persona, scoredCandidates[0].score)
    };
  }

  private getVotingStrategy(role: GameRole, persona: AIPersona): VotingStrategy {
    const baseStrategy = this.roleStrategies[role];
    
    return {
      ...baseStrategy,
      riskTolerance: persona.personality.aggression,
      analysisDepth: persona.personality.analytical,
      teamworkFactor: persona.playStyle.teamplayPreference,
      suspicionThreshold: persona.playStyle.susicionThreshold
    };
  }

  async generateVoteExplanation(
    voter: Player,
    target: Player,
    reasoning: string,
    persona: AIPersona
  ): Promise<string> {
    const prompt = `
당신은 ${voter.name}이고, ${target.name}에게 투표하기로 결정했습니다.

투표 근거: ${reasoning}
당신의 성격: ${persona.personality}

이 투표에 대한 자연스러운 설명을 생성하세요. 
너무 완벽하지 않고, 실제 사람이 말하는 것처럼 작성하세요.
    `;

    return await this.llmService.generate({
      provider: 'open-router',
      prompt,
      message: '투표 설명을 생성해주세요'
    });
  }
}
```

#### 5.2 역할별 투표 전략
```typescript
const ROLE_VOTING_STRATEGIES = {
  mafia: {
    priority: ['eliminate_threats', 'avoid_suspicion', 'protect_teammates'],
    riskAssessment: 'high',
    coordinationLevel: 'team_based'
  },
  police: {
    priority: ['use_investigation_results', 'eliminate_suspected_mafia', 'protect_identity'],
    riskAssessment: 'medium',
    coordinationLevel: 'individual'
  },
  doctor: {
    priority: ['protect_key_players', 'eliminate_threats', 'stay_hidden'],
    riskAssessment: 'low',
    coordinationLevel: 'individual'
  },
  citizen: {
    priority: ['follow_evidence', 'trust_confirmed_roles', 'eliminate_suspicious'],
    riskAssessment: 'medium',
    coordinationLevel: 'group_consensus'
  }
};
```

---

## 🎯 Phase 6: 고급 기능 및 최적화 (우선순위: LOW)

### 6.1 학습 시스템
- 게임 결과 분석 및 전략 개선
- 플레이어 패턴 학습
- 동적 난이도 조절

### 6.2 감정 상태 시뮬레이션
- 스트레스/긴장도 시뮬레이션
- 게임 진행에 따른 감정 변화
- 감정에 따른 행동 변화

### 6.3 고급 대화 시스템
- 다중 턴 대화 처리
- 문맥 이해 및 참조
- 농담/유머 요소 추가

---

## 📋 구현 순서 및 일정

### Week 1-2: Foundation
- [x] Phase 1: AI 페르소나 시스템 구현
- [x] Phase 2: 기본 프롬프트 시스템 구현
- [x] 기본 테스트 환경 구축

### Week 3-4: Core Interaction
- [x] Phase 3: 실시간 채팅 시스템 구현
- [x] 페이즈별 AI 행동 패턴 구현
- [x] 기본적인 게임 플레이 테스트

### Week 5-6: Intelligence
- [x] Phase 4: 추리 & 의심 시스템 구현
- [x] Phase 5: 투표 전략 시스템 구현
- [x] 전체 시스템 통합 테스트

### Week 7-8: Polish & Optimization
- [ ] 성능 최적화
- [ ] 버그 수정 및 안정화
- [ ] 실제 플레이 테스트 및 튜닝

---

## 🛠 기술적 고려사항

### 성능 최적화
- **LLM 호출 최적화**: 캐싱, 배치 처리, 지연 로딩
- **메모리 관리**: 게임 종료 시 AI 상태 정리
- **응답 시간**: 실시간 채팅을 위한 응답 속도 보장

### 확장성
- **다양한 LLM 지원**: 추상화를 통한 여러 provider 지원
- **모듈화**: 각 AI 기능의 독립적 개발/테스트 가능
- **설정 가능**: 게임별 AI 난이도/성격 조절 가능

### 모니터링
- **AI 행동 로깅**: 디버깅을 위한 상세 로그
- **성능 메트릭**: 응답 시간, 성공률 등 측정
- **게임 품질**: AI 플레이어의 게임 만족도 측정

---

## 🎮 예상 결과물

최종적으로 다음과 같은 수준의 AI 플레이어 구현 목표:

1. **자연스러운 대화**: 실제 사람처럼 맥락에 맞는 채팅
2. **전략적 사고**: 역할과 상황에 맞는 논리적 판단
3. **개성 있는 캐릭터**: 각기 다른 성격의 플레이어들
4. **학습 능력**: 게임이 진행되며 상황 파악 능력 향상
5. **재미 요소**: 예측 불가능하지만 합리적인 행동

이를 통해 혼자서도, 또는 부족한 인원으로도 완전한 마피아 게임을 즐길 수 있는 시스템을 구축합니다.
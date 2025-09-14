import { Injectable } from '@nestjs/common';
import { Logger } from '@libs/logger';
import { GamePromptContext, ChatPromptContext, VotePromptContext } from '../types/prompt-context.types';
import { AIPersona, PersonalityTraits } from '../types/ai-persona.types';
import { Player } from '../../../entities/player.entity';

/**
 * 역할별 특수한 프롬프트를 생성하는 서비스
 * 마피아, 경찰, 의사, 시민 각각의 고유한 상황과 전략에 맞는 프롬프트 제공
 */
@Injectable()
export class RoleSpecificPromptsService {
  constructor(private readonly logger: Logger) {
    this.logger.setContext(RoleSpecificPromptsService.name);
  }

  /**
   * 마피아 역할에 특화된 프롬프트를 생성합니다.
   * @param context 게임 프롬프트 컨텍스트
   */
  getMafiaPrompt(context: GamePromptContext): string {
    const { game, player, persona } = context;
    const otherMafia = game.players.filter(
      p => p.role === 'mafia' && p.id !== player.id && p.isAlive
    );

    return `
## 🎭 마피아 역할 특수 지침

### 기본 임무
- **주 목표**: 모든 시민을 제거하여 마피아가 과반수가 되도록 하기
- **부 목표**: 마지막까지 정체를 숨기고 살아남기
- **핵심 전략**: 시민으로 완벽하게 위장하면서 동료 보호

### 동료 마피아 정보
${otherMafia.length > 0 
  ? `- **생존 동료**: ${otherMafia.map(p => p.name).join(', ')}`
  : '- **동료 상태**: 모든 동료가 제거되었습니다 (혼자 남음)'
}
- **팀 상황**: ${this.analyzeMafiaTeamStatus(game)}

### 위험 요소 분석
${this.analyzeThreatLevels(game, player)}

### 마피아 전략 (${persona.name} 스타일)
${this.getMafiaStrategy(persona, game, otherMafia.length)}

### 위장 기법
${this.getMafiaDisguiseTechniques(persona)}

### 투표 가이드라인
- **우선 순위**: 경찰 > 의사 > 영향력 있는 시민
- **회피 대상**: 동료 마피아 (단, 의심받지 않는 선에서)
- **전술**: 시민들 간의 갈등을 조장하여 분열 유도

### 야간 행동 지침
${otherMafia.length > 0 
  ? '- 동료들과 상의하여 최적의 제거 대상 결정\n- 각자의 의견을 존중하되 최종적으로 합의 도출'
  : '- 혼자 결정해야 하므로 신중하게 판단\n- 다음날 의심받지 않을 대상 우선 고려'
}

---
**⚠️ 중요 주의사항**: 절대 정체를 드러내지 마세요. 모든 행동과 발언은 "시민"의 관점에서 해야 합니다.
    `.trim();
  }

  /**
   * 경찰 역할에 특화된 프롬프트를 생성합니다.
   * @param context 게임 프롬프트 컨텍스트
   */
  getPolicePrompt(context: GamePromptContext): string {
    const { game, player, persona } = context;

    return `
## 🕵️ 경찰 역할 특수 지침

### 기본 임무
- **주 목표**: 마피아를 모두 찾아내어 제거하기
- **부 목표**: 정체를 숨기면서 시민들을 보호하기
- **핵심 전략**: 조사 결과를 효과적으로 활용하되 의심받지 않기

### 현재 상황 분석
- **조사 완료**: [이전 조사 결과들을 여기에 표시]
- **확인된 마피아**: [확인된 마피아 목록]
- **의심 대상**: [강하게 의심되는 플레이어들]

### 경찰 전략 (${persona.name} 스타일)
${this.getPoliceStrategy(persona, game)}

### 조사 대상 선정 가이드라인
${this.getInvestigationGuidelines(persona, game)}

### 정보 공유 전략
${this.getInformationSharingStrategy(persona)}

### 위험 관리
- **정체 노출 위험도**: ${this.assessIdentityRisk(player, game)}
- **마피아의 타겟 가능성**: ${this.assessTargetRisk(player, game)}
- **보호 필요도**: 높음 (의사의 보호가 필요한 상황)

### 투표 전략
- **조사 결과 활용**: 확인된 마피아를 우선적으로 제거
- **설득 방법**: 논리적 근거를 제시하되 정체 노출 위험 최소화
- **동맹 구축**: 신뢰할 수 있는 시민들과 은밀한 협력

### 야간 조사 지침
${this.getNightInvestigationGuidance(game, persona)}

---
**⚠️ 중요 주의사항**: 조사 결과를 공개할 때는 신중하게. 마피아들이 당신을 노릴 수 있습니다.
    `.trim();
  }

  /**
   * 의사 역할에 특화된 프롬프트를 생성합니다.
   * @param context 게임 프롬프트 컨텍스트
   */
  getDoctorPrompt(context: GamePromptContext): string {
    const { game, player, persona } = context;

    return `
## ⚕️ 의사 역할 특수 지침

### 기본 임무
- **주 목표**: 중요한 시민들을 보호하여 마피아 척결 지원
- **부 목표**: 정체를 완전히 숨기고 살아남기
- **핵심 전략**: 마피아의 공격을 예측하여 핵심 인물 보호

### 현재 상황 분석
- **보호 이력**: [이전 보호 대상들과 결과]
- **실패한 공격**: [마피아의 공격을 막은 횟수]
- **위험 인물**: [마피아가 노릴 가능성이 높은 플레이어들]

### 의사 전략 (${persona.name} 스타일)
${this.getDoctorStrategy(persona, game)}

### 보호 대상 우선순위
${this.getProtectionPriorities(game)}

### 예측 및 분석
${this.getPredictionGuidance(persona)}

### 정체 은폐 전략
- **행동 패턴**: 일반 시민과 구별되지 않도록 행동
- **발언 주의**: 의료 관련 지식이나 보호 의도 드러내지 않기
- **투표 참여**: 자연스럽게 토론에 참여하되 두드러지지 않게

### 심리전 대응
- **의심 회피**: 너무 정확한 예측은 피하기
- **연기 기법**: 가끔 틀린 추측을 하여 일반 시민처럼 보이기
- **감정 표현**: 자연스러운 당황이나 혼란 표현

### 야간 보호 지침
${this.getNightProtectionGuidance(game, persona)}

---
**⚠️ 중요 주의사항**: 절대 정체를 드러내지 마세요. 의사는 마피아의 1순위 제거 대상입니다.
    `.trim();
  }

  /**
   * 시민 역할에 특화된 프롬프트를 생성합니다.
   * @param context 게임 프롬프트 컨텍스트
   */
  getCitizenPrompt(context: GamePromptContext): string {
    const { game, player, persona } = context;

    return `
## 👥 시민 역할 특수 지침

### 기본 임무
- **주 목표**: 마피아를 찾아내어 모두 제거하기
- **부 목표**: 다른 시민들과 협력하여 정보 수집 및 분석
- **핵심 전략**: 논리적 추론과 협력을 통한 마피아 색출

### 현재 상황 분석
- **의심 대상들**: [현재 의심하고 있는 플레이어들]
- **신뢰 관계**: [믿을 만한 플레이어들]
- **정보 수집**: [지금까지 얻은 단서들]

### 시민 전략 (${persona.name} 스타일)
${this.getCitizenStrategy(persona, game)}

### 정보 수집 방법
${this.getInformationGatheringMethods(persona)}

### 논리적 추론 가이드
${this.getLogicalReasoningGuide(persona)}

### 협력 전략
- **동맹 구축**: 신뢰할 수 있는 시민들과 정보 공유
- **집단 지성**: 여러 관점을 종합하여 판단
- **역할 추측**: 은밀하게 경찰이나 의사 파악 시도

### 투표 전략
${this.getCitizenVotingStrategy(persona, game)}

### 의심 대상 분석 방법
- **행동 패턴**: 일관성 없는 행동이나 발언 주목
- **투표 성향**: 마피아에게 유리한 투표를 하는지 관찰
- **정보 회피**: 중요한 질문을 피하거나 애매하게 답하는지 확인
- **시간 패턴**: 발언 타이밍이나 반응 속도 분석

### 생존 전략
- **눈에 띄지 않기**: 마피아의 타겟이 되지 않도록 적당히 활동
- **가치 있는 시민**: 경찰이나 의사로 오해받지 않도록 주의
- **균형 유지**: 너무 소극적이거나 적극적이지 않게

---
**💡 팁**: 시민의 힘은 협력에 있습니다. 혼자보다는 다른 시민들과 함께 추론하세요.
    `.trim();
  }

  /**
   * 야간 행동에 특화된 프롬프트를 생성합니다.
   * @param context 게임 프롬프트 컨텍스트
   */
  getNightActionPrompt(context: GamePromptContext): string {
    const { player } = context;

    switch (player.role) {
      case 'mafia':
        return this.getMafiaNightPrompt(context);
      case 'police':
        return this.getPoliceNightPrompt(context);
      case 'doctor':
        return this.getDoctorNightPrompt(context);
      default:
        return '밤 동안은 아무 행동도 할 수 없습니다. 다른 플레이어들의 행동을 기다리세요.';
    }
  }

  /**
   * 마피아의 야간 행동 프롬프트
   */
  private getMafiaNightPrompt(context: GamePromptContext): string {
    const { game, persona } = context;
    const targets = game.players.filter(p => p.isAlive && p.role !== 'mafia');

    return `
## 🌙 마피아 야간 행동

### 제거 대상 후보
${targets.map(target => 
  `- **${target.name}**: ${this.analyzeEliminationTarget(target, game)}`
).join('\n')}

### 전략적 고려사항
${this.getMafiaEliminationStrategy(persona, game)}

### 결정 프로세스
1. 각 후보의 위험도 평가
2. 다음날 의심받을 가능성 고려
3. 팀 전략에 미치는 영향 분석
4. 최종 대상 선택 및 이유 제시

JSON 응답 형식:
{
  "job": "야간 제거",
  "target": "플레이어_이름",
  "targetId": 플레이어_ID,
  "reasoning": "제거 이유"
}
    `.trim();
  }

  /**
   * 경찰의 야간 조사 프롬프트
   */
  private getPoliceNightPrompt(context: GamePromptContext): string {
    const { game, persona } = context;
    const suspects = game.players.filter(p => p.isAlive && p.id !== context.player.id);

    return `
## 🔍 경찰 야간 조사

### 조사 대상 후보
${suspects.map(suspect => 
  `- **${suspect.name}**: ${this.analyzeInvestigationTarget(suspect, game)}`
).join('\n')}

### 조사 전략
${this.getInvestigationStrategy(persona, game)}

JSON 응답 형식:
{
  "job": "야간 조사",
  "target": "플레이어_이름", 
  "targetId": 플레이어_ID,
  "reasoning": "조사 이유"
}
    `.trim();
  }

  /**
   * 의사의 야간 보호 프롬프트
   */
  private getDoctorNightPrompt(context: GamePromptContext): string {
    const { game, persona } = context;
    const protectionTargets = game.players.filter(p => p.isAlive);

    return `
## ⚕️ 의사 야간 보호

### 보호 대상 후보
${protectionTargets.map(target => 
  `- **${target.name}**: ${this.analyzeProtectionTarget(target, game)}`
).join('\n')}

### 보호 전략
${this.getProtectionStrategy(persona, game)}

JSON 응답 형식:
{
  "job": "야간 보호",
  "target": "플레이어_이름",
  "targetId": 플레이어_ID, 
  "reasoning": "보호 이유"
}
    `.trim();
  }

  // Private helper methods

  private analyzeMafiaTeamStatus(game: any): string {
    const aliveMafia = game.players.filter(p => p.role === 'mafia' && p.isAlive).length;
    const aliveCitizens = game.players.filter(p => p.role !== 'mafia' && p.isAlive).length;
    
    if (aliveMafia >= aliveCitizens) {
      return '승리 직전 - 신중하게 마무리하세요';
    } else if (aliveMafia === 1) {
      return '위험한 상황 - 더욱 조심스럽게 행동하세요';
    } else {
      return '안정적인 상황 - 계획대로 진행하세요';
    }
  }

  private analyzeThreatLevels(game: any, player: Player): string {
    const threats = [];
    const alivePlayers = game.players.filter(p => p.isAlive && p.id !== player.id);
    
    alivePlayers.forEach(p => {
      if (p.role === 'police') {
        threats.push(`${p.name} - 경찰 (최고 위험)`);
      } else if (p.role === 'doctor') {
        threats.push(`${p.name} - 의사 (높은 위험)`);
      }
    });

    return threats.length > 0 
      ? threats.join('\n')
      : '현재 특별한 위협 요소가 확인되지 않음';
  }

  private getMafiaStrategy(persona: AIPersona, game: any, teamSize: number): string {
    const strategies = [];
    
    if (persona.personality.aggression > 0.7) {
      strategies.push('🗡️ 적극적으로 시민들을 공격하고 의심을 유도');
    } else {
      strategies.push('🛡️ 방어적으로 행동하며 의심을 피하는 것에 집중');
    }

    if (persona.personality.analytical > 0.6) {
      strategies.push('📊 논리적 근거를 제시하여 신뢰도 높이기');
    }

    if (teamSize > 0) {
      strategies.push('🤝 동료와의 협조를 통한 체계적 접근');
    } else {
      strategies.push('🎭 혼자만의 완벽한 연기에 의존');
    }

    return strategies.join('\n');
  }

  private getMafiaDisguiseTechniques(persona: AIPersona): string {
    const techniques = [];
    
    if (persona.personality.emotional > 0.6) {
      techniques.push('😱 적절한 감정 표현으로 시민처럼 보이기');
    }
    
    if (persona.personality.trust > 0.5) {
      techniques.push('🤝 다른 플레이어들을 적극적으로 믿는 척하기');
    } else {
      techniques.push('🤔 적절한 의심을 표현하여 자연스럽게 보이기');
    }

    techniques.push('💬 시민의 관점에서 일관된 발언 유지');
    techniques.push('🎯 가끔 다른 마피아도 의심하는 척하기 (단, 과하지 않게)');

    return techniques.join('\n');
  }

  private getPoliceStrategy(persona: AIPersona, game: any): string {
    const strategies = [];
    
    if (persona.personality.caution > 0.7) {
      strategies.push('🔒 정보 공개를 신중하게 하여 정체 보호');
    } else {
      strategies.push('📢 적극적인 정보 공개로 시민들 결집');
    }

    if (persona.personality.leadership > 0.6) {
      strategies.push('👑 은밀하게 시민들을 이끌어 마피아 척결');
    }

    strategies.push('🕵️ 행동 패턴 분석을 통한 마피아 색출');
    
    return strategies.join('\n');
  }

  private getInvestigationGuidelines(persona: AIPersona, game: any): string {
    const guidelines = [];
    
    if (persona.personality.analytical > 0.7) {
      guidelines.push('📊 논리적 근거가 강한 대상 우선');
    } else {
      guidelines.push('🎯 직감적으로 의심스러운 대상 우선');
    }

    guidelines.push('🔍 행동이 수상한 플레이어');
    guidelines.push('💭 발언에 일관성이 없는 플레이어');
    guidelines.push('🗳️ 투표 패턴이 이상한 플레이어');

    return guidelines.join('\n');
  }

  private getInformationSharingStrategy(persona: AIPersona): string {
    if (persona.personality.caution > 0.7) {
      return `🤐 **신중한 공개 전략**
- 확실한 증거가 있을 때만 공개
- 간접적인 힌트로 시작
- 다른 시민들의 반응을 보고 단계적 공개`;
    } else {
      return `📢 **적극적 공개 전략**
- 조사 결과를 빠르게 공유
- 시민들의 협력을 적극 요청
- 리더십을 발휘하여 마피아 척결 주도`;
    }
  }

  private getDoctorStrategy(persona: AIPersona, game: any): string {
    const strategies = [];
    
    if (persona.personality.analytical > 0.7) {
      strategies.push('🧠 논리적 분석을 통한 마피아 타겟 예측');
    } else {
      strategies.push('💭 직감을 활용한 보호 대상 선택');
    }

    if (persona.personality.caution > 0.6) {
      strategies.push('🛡️ 안전한 선택을 통한 확실한 보호');
    } else {
      strategies.push('🎲 위험을 감수하더라도 핵심 인물 보호');
    }

    return strategies.join('\n');
  }

  private getProtectionPriorities(game: any): string {
    return `
1. **경찰** - 마피아 색출의 핵심 인물
2. **영향력 있는 시민** - 토론을 이끄는 플레이어
3. **신뢰도 높은 플레이어** - 다른 시민들이 믿는 인물
4. **자신** - 마지막 수단으로 자기 보호`;
  }

  private getCitizenStrategy(persona: AIPersona, game: any): string {
    const strategies = [];
    
    if (persona.personality.analytical > 0.7) {
      strategies.push('📊 논리적 분석을 통한 체계적 접근');
    }
    
    if (persona.personality.leadership > 0.6) {
      strategies.push('👑 다른 시민들을 조율하여 효과적인 협력');
    }

    if (persona.personality.trust > 0.6) {
      strategies.push('🤝 다른 시민들과의 적극적인 정보 공유');
    } else {
      strategies.push('🔍 독립적인 분석 후 신중한 판단');
    }

    return strategies.join('\n');
  }

  // 더 많은 헬퍼 메서드들...
  private assessIdentityRisk(player: Player, game: any): string {
    return '보통'; // 실제로는 복잡한 분석 로직
  }

  private assessTargetRisk(player: Player, game: any): string {
    return '높음'; // 실제로는 복잡한 분석 로직
  }

  private getNightInvestigationGuidance(game: any, persona: AIPersona): string {
    return '의심도가 높은 플레이어를 우선 조사하되, 예측 가능한 선택은 피하세요.';
  }

  private getNightProtectionGuidance(game: any, persona: AIPersona): string {
    return '마피아가 노릴 가능성이 높은 핵심 인물을 보호하세요.';
  }

  private getInformationGatheringMethods(persona: AIPersona): string {
    return '대화를 통한 정보 수집, 행동 패턴 관찰, 투표 성향 분석';
  }

  private getLogicalReasoningGuide(persona: AIPersona): string {
    return '가설 설정 → 증거 수집 → 논리적 검증 → 결론 도출';
  }

  private getCitizenVotingStrategy(persona: AIPersona, game: any): string {
    return '논리적 근거가 있는 대상에게 투표하되, 다른 시민들의 의견도 종합적으로 고려';
  }

  private analyzeEliminationTarget(target: Player, game: any): string {
    return `위험도 분석 및 제거 효과 예상`; // 실제 구현 필요
  }

  private getMafiaEliminationStrategy(persona: AIPersona, game: any): string {
    return '전략적 고려사항들'; // 실제 구현 필요
  }

  private analyzeInvestigationTarget(target: Player, game: any): string {
    return `조사 우선도 및 예상 결과`; // 실제 구현 필요
  }

  private getInvestigationStrategy(persona: AIPersona, game: any): string {
    return '조사 전략'; // 실제 구현 필요
  }

  private analyzeProtectionTarget(target: Player, game: any): string {
    return `보호 필요도 및 마피아 타겟 가능성`; // 실제 구현 필요
  }

  private getProtectionStrategy(persona: AIPersona, game: any): string {
    return '보호 전략'; // 실제 구현 필요
  }

  private getPredictionGuidance(persona: AIPersona): string {
    return '마피아의 다음 행동 예측을 위한 분석 방법';
  }
}
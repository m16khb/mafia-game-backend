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
  suspicionThreshold: number;  // 의심 시작 임계값 (0-1)
  teamplayPreference: number;  // 팀플레이 선호도 (0-1)
}

export interface CommunicationStyle {
  formality: number;        // 0-1: 격식도
  verbosity: number;        // 0-1: 말 많음
  directness: number;       // 0-1: 직설적
  responsiveness: number;   // 0-1: 응답 적극성
  quickness: number;        // 0-1: 응답 속도
}

export interface SuspicionBehavior {
  investigateFrequency: number;    // 0-1: 조사 빈도
  shareFindings: number;           // 0-1: 발견사항 공유
  accusationCaution: number;       // 0-1: 고발 신중도
  responseToAccusation: number;    // 0-1: 의심받을 때 응답 확률
}
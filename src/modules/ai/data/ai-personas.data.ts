import { AIPersona } from '../types/ai-persona.types';

export const AI_PERSONAS: AIPersona[] = [
  {
    id: 'detective-holmes',
    name: '홈즈',
    personality: {
      aggression: 0.3,
      caution: 0.8,
      trust: 0.4,
      leadership: 0.7,
      analytical: 0.9,
      emotional: 0.2
    },
    playStyle: {
      votingPattern: 'analytical',
      discussionLevel: 'active',
      suspicionThreshold: 0.3,
      teamplayPreference: 0.6
    },
    communicationStyle: {
      formality: 0.8,
      verbosity: 0.7,
      directness: 0.8,
      responsiveness: 0.7,
      quickness: 0.6
    },
    suspicionBehavior: {
      investigateFrequency: 0.8,
      shareFindings: 0.7,
      accusationCaution: 0.8,
      responseToAccusation: 0.9
    }
  },
  {
    id: 'social-butterfly',
    name: '소셜이',
    personality: {
      aggression: 0.2,
      caution: 0.4,
      trust: 0.8,
      leadership: 0.5,
      analytical: 0.4,
      emotional: 0.8
    },
    playStyle: {
      votingPattern: 'defensive',
      discussionLevel: 'talkative',
      suspicionThreshold: 0.6,
      teamplayPreference: 0.9
    },
    communicationStyle: {
      formality: 0.2,
      verbosity: 0.9,
      directness: 0.3,
      responsiveness: 0.8,
      quickness: 0.8
    },
    suspicionBehavior: {
      investigateFrequency: 0.3,
      shareFindings: 0.9,
      accusationCaution: 0.4,
      responseToAccusation: 0.7
    }
  },
  {
    id: 'strategic-thinker',
    name: '전략가',
    personality: {
      aggression: 0.6,
      caution: 0.7,
      trust: 0.3,
      leadership: 0.8,
      analytical: 0.8,
      emotional: 0.3
    },
    playStyle: {
      votingPattern: 'aggressive',
      discussionLevel: 'moderate',
      suspicionThreshold: 0.4,
      teamplayPreference: 0.7
    },
    communicationStyle: {
      formality: 0.6,
      verbosity: 0.5,
      directness: 0.9,
      responsiveness: 0.6,
      quickness: 0.4
    },
    suspicionBehavior: {
      investigateFrequency: 0.7,
      shareFindings: 0.5,
      accusationCaution: 0.6,
      responseToAccusation: 0.8
    }
  },
  {
    id: 'quiet-observer',
    name: '관찰자',
    personality: {
      aggression: 0.1,
      caution: 0.9,
      trust: 0.5,
      leadership: 0.2,
      analytical: 0.7,
      emotional: 0.4
    },
    playStyle: {
      votingPattern: 'defensive',
      discussionLevel: 'silent',
      suspicionThreshold: 0.7,
      teamplayPreference: 0.4
    },
    communicationStyle: {
      formality: 0.7,
      verbosity: 0.2,
      directness: 0.6,
      responsiveness: 0.3,
      quickness: 0.3
    },
    suspicionBehavior: {
      investigateFrequency: 0.6,
      shareFindings: 0.3,
      accusationCaution: 0.9,
      responseToAccusation: 0.5
    }
  },
  {
    id: 'hot-headed',
    name: '급진이',
    personality: {
      aggression: 0.9,
      caution: 0.2,
      trust: 0.4,
      leadership: 0.6,
      analytical: 0.3,
      emotional: 0.9
    },
    playStyle: {
      votingPattern: 'aggressive',
      discussionLevel: 'active',
      suspicionThreshold: 0.2,
      teamplayPreference: 0.5
    },
    communicationStyle: {
      formality: 0.1,
      verbosity: 0.8,
      directness: 0.9,
      responsiveness: 0.9,
      quickness: 0.9
    },
    suspicionBehavior: {
      investigateFrequency: 0.4,
      shareFindings: 0.8,
      accusationCaution: 0.2,
      responseToAccusation: 0.9
    }
  },
  {
    id: 'team-player',
    name: '팀웍이',
    personality: {
      aggression: 0.4,
      caution: 0.6,
      trust: 0.7,
      leadership: 0.4,
      analytical: 0.5,
      emotional: 0.6
    },
    playStyle: {
      votingPattern: 'defensive',
      discussionLevel: 'moderate',
      suspicionThreshold: 0.5,
      teamplayPreference: 0.9
    },
    communicationStyle: {
      formality: 0.4,
      verbosity: 0.6,
      directness: 0.5,
      responsiveness: 0.7,
      quickness: 0.5
    },
    suspicionBehavior: {
      investigateFrequency: 0.5,
      shareFindings: 0.8,
      accusationCaution: 0.7,
      responseToAccusation: 0.6
    }
  }
];
import {
  PromptCategory,
  PromptRoleType,
} from '../../../entities/prompt-template.entity';

export interface DefaultPromptTemplate {
  name: string;
  category: PromptCategory;
  roleType: PromptRoleType;
  template: string;
  parameters: string[];
  version: string;
  description?: string;
  aiPersonaId?: number;
}

export const DEFAULT_PROMPT_TEMPLATES: DefaultPromptTemplate[] = [
  // VOTING PROMPTS
  {
    name: 'voting_citizen_analytical',
    category: 'voting',
    roleType: 'citizen',
    template: `You are a citizen in a Mafia game playing as {{playerInfo}}.

PERSONALITY: {{personalityContext}}

CURRENT SITUATION:
- Game Phase: {{gamePhase}}
- Day: {{dayCount}}
- Players alive: {{gameState}}
- Available targets: {{availableActions}}

Your goal is to identify and vote out the mafia members. Analyze the discussion and voting patterns carefully.

Based on your personality and the current situation, who do you want to vote for and why?

Respond in JSON format:
{
  "action": "vote",
  "target": "PlayerName",
  "reasoning": "Brief explanation of your reasoning",
  "confidence": 7
}

If you want to abstain, use "action": "abstain" and omit the target.`,
    parameters: [
      'personalityContext',
      'gameState',
      'playerInfo',
      'availableActions',
      'gamePhase',
      'dayCount',
    ],
    version: '1.0',
    description: 'Analytical voting template for citizen role',
  },

  {
    name: 'voting_mafia_coordination',
    category: 'voting',
    roleType: 'mafia',
    template: `You are a MAFIA member in a Mafia game playing as {{playerInfo}}.

PERSONALITY: {{personalityContext}}

CURRENT SITUATION:
- Game Phase: {{gamePhase}}
- Day: {{dayCount}}
- Players alive: {{gameState}}
- Available targets: {{availableActions}}

MAFIA STRATEGY: You need to blend in with citizens while protecting your mafia teammates. Avoid being too obvious in defending other mafia members. Try to redirect suspicion toward innocent citizens.

Based on your role and personality, who do you want to vote for?

Respond in JSON format:
{
  "action": "vote",
  "target": "PlayerName",
  "reasoning": "Public reasoning that doesn't expose your mafia identity",
  "confidence": 6
}`,
    parameters: [
      'personalityContext',
      'gameState',
      'playerInfo',
      'availableActions',
      'gamePhase',
      'dayCount',
    ],
    version: '1.0',
    description: 'Coordination-focused voting template for mafia role',
  },

  {
    name: 'voting_police_investigation',
    category: 'voting',
    roleType: 'police',
    template: `You are the POLICE officer in a Mafia game playing as {{playerInfo}}.

PERSONALITY: {{personalityContext}}

CURRENT SITUATION:
- Game Phase: {{gamePhase}}
- Day: {{dayCount}}
- Players alive: {{gameState}}
- Available targets: {{availableActions}}

POLICE STRATEGY: You have special investigation abilities. Use your knowledge from night investigations to guide voting decisions. Be careful not to reveal your role too obviously.

Based on your investigations and observations, who do you want to vote for?

Respond in JSON format:
{
  "action": "vote",
  "target": "PlayerName",
  "reasoning": "Reasoning based on observations and investigations",
  "confidence": 8
}`,
    parameters: [
      'personalityContext',
      'gameState',
      'playerInfo',
      'availableActions',
      'gamePhase',
      'dayCount',
    ],
    version: '1.0',
    description: 'Investigation-based voting template for police role',
  },

  // ROLE ACTION PROMPTS
  {
    name: 'night_action_mafia_kill',
    category: 'role_action',
    roleType: 'mafia',
    template: `You are a MAFIA member during the night phase playing as {{playerInfo}}.

PERSONALITY: {{personalityContext}}

CURRENT SITUATION:
- Game Phase: {{gamePhase}}
- Day: {{dayCount}}
- Players alive: {{gameState}}
- Available targets: {{availableActions}}

NIGHT ACTION: Choose who to eliminate. Consider:
1. Who poses the biggest threat to the mafia?
2. Who might have special roles (police, doctor)?
3. Who is leading discussions against the mafia?

Choose your target carefully:

Respond in JSON format:
{
  "action": "kill",
  "target": "PlayerName",
  "reasoning": "Internal reasoning for mafia coordination",
  "confidence": 7
}

If you want to skip the kill, use "action": "skip".`,
    parameters: [
      'personalityContext',
      'gameState',
      'playerInfo',
      'availableActions',
      'gamePhase',
      'dayCount',
    ],
    version: '1.0',
    description: 'Night kill action template for mafia role',
  },

  {
    name: 'night_action_police_investigate',
    category: 'role_action',
    roleType: 'police',
    template: `You are the POLICE officer during the night phase playing as {{playerInfo}}.

PERSONALITY: {{personalityContext}}

CURRENT SITUATION:
- Game Phase: {{gamePhase}}
- Day: {{dayCount}}
- Players alive: {{gameState}}
- Available targets: {{availableActions}}

INVESTIGATION ACTION: Choose someone to investigate tonight. Consider:
1. Who seemed most suspicious during today's discussion?
2. Who might be coordinating with other suspicious players?
3. Who would give you the most valuable information?

Choose your investigation target:

Respond in JSON format:
{
  "action": "investigate",
  "target": "PlayerName",
  "reasoning": "Why you want to investigate this person",
  "confidence": 8
}

If you want to skip investigating, use "action": "skip".`,
    parameters: [
      'personalityContext',
      'gameState',
      'playerInfo',
      'availableActions',
      'gamePhase',
      'dayCount',
    ],
    version: '1.0',
    description: 'Investigation action template for police role',
  },

  {
    name: 'night_action_doctor_heal',
    category: 'role_action',
    roleType: 'doctor',
    template: `You are the DOCTOR during the night phase playing as {{playerInfo}}.

PERSONALITY: {{personalityContext}}

CURRENT SITUATION:
- Game Phase: {{gamePhase}}
- Day: {{dayCount}}
- Players alive: {{gameState}}
- Available targets: {{availableActions}}

HEALING ACTION: Choose someone to protect tonight. Consider:
1. Who might be targeted by the mafia?
2. Who has been vocal against suspicious players?
3. Who seems to have important information or special roles?

Choose your protection target:

Respond in JSON format:
{
  "action": "heal",
  "target": "PlayerName",
  "reasoning": "Why you want to protect this person",
  "confidence": 6
}

If you want to skip healing, use "action": "skip".`,
    parameters: [
      'personalityContext',
      'gameState',
      'playerInfo',
      'availableActions',
      'gamePhase',
      'dayCount',
    ],
    version: '1.0',
    description: 'Healing action template for doctor role',
  },

  // DISCUSSION PROMPTS
  {
    name: 'discussion_general_citizen',
    category: 'discussion',
    roleType: 'citizen',
    template: `You are a citizen in a Mafia game playing as {{playerInfo}}.

PERSONALITY: {{personalityContext}}

CURRENT SITUATION:
- Game Phase: {{gamePhase}}
- Day: {{dayCount}}
- Players alive: {{gameState}}

DISCUSSION: Share your thoughts about who might be suspicious and why. As a citizen, your goal is to find the mafia members through discussion and analysis.

Based on your personality and observations, what do you want to say?

Respond in JSON format:
{
  "action": "discuss",
  "message": "Your message to the group",
  "reasoning": "Internal reasoning for this comment",
  "confidence": 5
}

Keep your message natural and consistent with your personality. Don't be too analytical unless that fits your character.`,
    parameters: [
      'personalityContext',
      'gameState',
      'playerInfo',
      'gamePhase',
      'dayCount',
    ],
    version: '1.0',
    description: 'General discussion template for citizen role',
  },

  {
    name: 'discussion_defense_any',
    category: 'discussion',
    roleType: 'any',
    template: `You are being accused or suspected in a Mafia game playing as {{playerInfo}}.

PERSONALITY: {{personalityContext}}

CURRENT SITUATION:
- Game Phase: {{gamePhase}}
- Day: {{dayCount}}
- Players alive: {{gameState}}
- You are being accused of: {{accusationDetails}}

DEFENSE: You need to defend yourself against suspicion. Consider your role and personality when crafting your response.

How do you defend yourself?

Respond in JSON format:
{
  "action": "defend",
  "message": "Your defense message",
  "reasoning": "Why this defense fits your role and personality",
  "confidence": 7
}

Make your defense believable and consistent with your established personality and behavior patterns.`,
    parameters: [
      'personalityContext',
      'gameState',
      'playerInfo',
      'gamePhase',
      'dayCount',
      'accusationDetails',
    ],
    version: '1.0',
    description: 'Defense template for any role when under suspicion',
  },

  // COORDINATION PROMPTS
  {
    name: 'coordination_mafia_strategy',
    category: 'coordination',
    roleType: 'mafia',
    template: `You are a MAFIA member coordinating with other mafia during {{gamePhase}} as {{playerInfo}}.

PERSONALITY: {{personalityContext}}

CURRENT SITUATION:
- Game Phase: {{gamePhase}}
- Day: {{dayCount}}
- Players alive: {{gameState}}
- Mafia team status: {{teamStatus}}

STRATEGY COORDINATION: Plan your next moves with the mafia team. Consider:
1. Who to target or eliminate
2. How to deflect suspicion
3. How to coordinate votes
4. How to protect teammates

What's your strategic input?

Respond in JSON format:
{
  "action": "coordinate",
  "strategy": "Your strategic suggestion",
  "priority_targets": ["Player1", "Player2"],
  "reasoning": "Strategic reasoning for mafia team",
  "confidence": 8
}`,
    parameters: [
      'personalityContext',
      'gameState',
      'playerInfo',
      'gamePhase',
      'dayCount',
      'teamStatus',
    ],
    version: '1.0',
    description: 'Strategy coordination template for mafia role',
  },
];

// Helper function to create template entities
export function createDefaultPromptTemplates() {
  return DEFAULT_PROMPT_TEMPLATES.map((template) => ({
    name: template.name,
    category: template.category,
    roleType: template.roleType,
    template: template.template,
    parameters: template.parameters,
    version: template.version,
    description: template.description,
    aiPersonaId: template.aiPersonaId,
    isActive: true,
    usageCount: 0,
    averageQualityScore: null,
    successRate: 0.5, // Default neutral success rate
    performanceScore: 5.0, // Default neutral performance
    lastUsedAt: null,
  }));
}

import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AIPersonaService } from './services/ai-persona.service';
import { PromptBuilderService } from './services/prompt-builder.service';
import { RoleSpecificPromptsService } from './services/role-specific-prompts.service';
import { ChatTimingService } from './services/chat-timing.service';
import { AIChatService } from './services/ai-chat.service';
import { PhaseBehaviorService } from './services/phase-behavior.service';
import { SuspicionTrackerService } from './services/suspicion-tracker.service';
import { VotingStrategyService } from './services/voting-strategy.service';
import { LoggerModule } from '@libs/logger';
import { PlayerModule } from '../player/player.module';

@Module({
  imports: [LoggerModule, PlayerModule, EventEmitterModule],
  providers: [
    AIPersonaService,
    PromptBuilderService,
    RoleSpecificPromptsService,
    ChatTimingService,
    AIChatService,
    PhaseBehaviorService,
    SuspicionTrackerService,
    VotingStrategyService,
  ],
  exports: [
    AIPersonaService,
    PromptBuilderService,
    RoleSpecificPromptsService,
    ChatTimingService,
    AIChatService,
    PhaseBehaviorService,
    SuspicionTrackerService,
    VotingStrategyService,
  ],
})
export class AIModule {}

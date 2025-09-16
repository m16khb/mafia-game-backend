import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LLMModule } from '../llm';
import { RedisModule } from '../redis';
import { AIPersona } from '../../entities/ai-persona.entity';
import { AIDecision } from '../../entities/ai-decision.entity';
import { PromptTemplate } from '../../entities/prompt-template.entity';
import { AIPersonaService } from './ai-persona.service';
import { AIDecisionService } from './ai-decision.service';
import { AIService } from './ai.service';
import { AICacheService } from './ai-cache.service';
import { AIPerformanceService } from './ai-performance.service';
import { AIValidationService } from './ai-validation.service';
import {
  AI_PERSONA_REPOSITORY_TOKEN,
  AI_DECISION_REPOSITORY_TOKEN,
  PROMPT_TEMPLATE_REPOSITORY_TOKEN,
  AIPersonaRepository,
  AIDecisionRepository,
  PromptTemplateRepository,
} from '../repositories';

const aiPersonaRepositoryProvider = {
  provide: AI_PERSONA_REPOSITORY_TOKEN,
  useClass: AIPersonaRepository,
};

const aiDecisionRepositoryProvider = {
  provide: AI_DECISION_REPOSITORY_TOKEN,
  useClass: AIDecisionRepository,
};

const promptTemplateRepositoryProvider = {
  provide: PROMPT_TEMPLATE_REPOSITORY_TOKEN,
  useClass: PromptTemplateRepository,
};

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 20,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),
    LLMModule,
    RedisModule,
    TypeOrmModule.forFeature([AIPersona, AIDecision, PromptTemplate]),
  ],
  providers: [
    AIPersonaRepository,
    AIDecisionRepository,
    PromptTemplateRepository,
    aiPersonaRepositoryProvider,
    aiDecisionRepositoryProvider,
    promptTemplateRepositoryProvider,
    AIPersonaService,
    AIDecisionService,
    AIService,
    AICacheService,
    AIPerformanceService,
    AIValidationService,
  ],
  exports: [
    AIPersonaService,
    AIDecisionService,
    AIService,
    AICacheService,
    AIPerformanceService,
    AIValidationService,
  ],
})
export class AIModule {}

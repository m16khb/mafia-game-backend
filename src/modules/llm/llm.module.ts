import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { LlmController } from './llm.controller';
import { LLM_SERVICES } from './providers/llm.constants';
import { OpenRouterLlmService } from './providers/open-router.llm.service';

@Module({
  controllers: [LlmController],
  providers: [
    LlmService,
    OpenRouterLlmService,
    {
      provide: LLM_SERVICES,
      useFactory: (...services) => services,
      inject: [OpenRouterLlmService],
    },
  ],
  exports: [LlmService, LLM_SERVICES],
})
export class LlmModule {}

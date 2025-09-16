import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LLMService } from './llm.service';
import { PromptTemplateService } from './prompt-template.service';
import { PromptTemplate } from '../../entities/prompt-template.entity';
import {
  PROMPT_TEMPLATE_REPOSITORY_TOKEN,
  PromptTemplateRepository,
} from '../repositories';

const promptTemplateRepositoryProvider = {
  provide: PROMPT_TEMPLATE_REPOSITORY_TOKEN,
  useClass: PromptTemplateRepository,
};

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([PromptTemplate])],
  providers: [
    PromptTemplateRepository,
    promptTemplateRepositoryProvider,
    LLMService,
    PromptTemplateService,
  ],
  exports: [LLMService, PromptTemplateService],
})
export class LLMModule {}

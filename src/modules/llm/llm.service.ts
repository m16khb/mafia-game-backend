import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LlmAbstractService } from './providers/llm.abstract.service';
import { LLM_SERVICES } from './providers/llm.constants';

@Injectable()
export class LlmService {
  private services: Map<string, LlmAbstractService> = new Map();
  private readonly logger = new Logger(LlmService.name);

  constructor(
    @Inject(LLM_SERVICES) private readonly llmServices: LlmAbstractService[],
  ) {
    llmServices.forEach((service) => {
      this.services.set(service.provider, service);
      this.logger.log(`LLM service '${service.provider}' registered.`);
    });
  }

  async generate(request: {
    provider: string;
    prompt: string;
    message: string;
  }): Promise<string> {
    const { provider, prompt, message } = request;

    const service = this.services.get(provider);
    if (!service) {
      throw new NotFoundException(`LLM provider '${provider}' not found.`);
    }
    return service.generate({ prompt, message });
  }
}

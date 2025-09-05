import { Injectable, Logger } from '@nestjs/common';
import { LlmAbstractService } from './llm.abstract.service';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OpenRouterLlmService extends LlmAbstractService {
  readonly provider = 'open-router';
  private readonly logger = new Logger(OpenRouterLlmService.name);
  private readonly openRouterClient: OpenAI;

  constructor(private readonly configService: ConfigService) {
    super();
    this.openRouterClient = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: this.configService.get<string>('OPEN_ROUTER_API_KEY'),
    });
  }

  async generate(request: { prompt: string; message: string }): Promise<string> {
    this.logger.log(
      `OpenRouter chat request: ${JSON.stringify(request, null, 2)}`,
    );
    const { prompt, message } = request;

    const response = await this.openRouterClient.chat.completions.create({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: message },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              job: { type: 'string' },
              response: { type: 'string' },
            },
            required: ['job', 'response'],
            additionalProperties: false,
          },
        },
      },
    });

    this.logger.log(
      `OpenRouter chat response: ${JSON.stringify(response, null, 2)}`,
    );

    const content = response.choices[0].message.content;
    const { job, response: llmResponse } = JSON.parse(content);

    this.logger.log(`${job}: ${llmResponse}`);
    return llmResponse;
  }
}

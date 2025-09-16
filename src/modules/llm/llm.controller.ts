import { Body, Controller, Post } from '@nestjs/common';
import { LlmService } from './llm.service';
import { GenerateRequestDto } from './dtos/llm-request.dto';

@Controller('llm')
export class LlmController {
  constructor(private readonly llmService: LlmService) {}

  @Post('generate')
  async generate(
    @Body() body: GenerateRequestDto,
  ): Promise<{ result: string }> {
    const result = await this.llmService.generate(body);
    return { result };
  }
}

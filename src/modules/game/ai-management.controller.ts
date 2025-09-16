import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import {
  CreatePersonaRequestDto,
  AIPersonaResponseDto,
  AISystemHealthResponseDto,
} from '../../common/dtos/ai-game.dto';
import { ApiResponse as BaseApiResponse } from '../../common/dtos/api-response.dto';
import { AIPersonaService, AIService } from '../../libs/ai';
import { LLMService } from '../../libs/llm';

@ApiTags('AI Management')
@Controller('ai')
export class AIManagementController {
  private readonly logger = new Logger(AIManagementController.name);

  constructor(
    private readonly aiPersonaService: AIPersonaService,
    private readonly aiService: AIService,
    private readonly llmService: LLMService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'AI 시스템 상태 확인' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'AI 시스템 상태 조회 성공',
    type: BaseApiResponse<AISystemHealthResponseDto>,
  })
  async getSystemHealth(): Promise<BaseApiResponse<AISystemHealthResponseDto>> {
    this.logger.log('Checking AI system health');

    try {
      const healthCheck = await this.aiService.healthCheck();

      const response: AISystemHealthResponseDto = {
        llmService: healthCheck.llmService,
        personaCount: healthCheck.personaCount,
        status: healthCheck.status,
        usageStats: healthCheck.usageStats,
      };

      return {
        success: true,
        data: response,
        message: 'AI 시스템 상태를 성공적으로 조회했습니다.',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to check AI system health: ${error.message}`);

      const unhealthyResponse: AISystemHealthResponseDto = {
        llmService: false,
        personaCount: 0,
        status: 'unhealthy',
        usageStats: {
          dailySpent: 0,
          dailyLimit: 0,
          requestCount: 0,
          remainingBudget: 0,
        },
      };

      return {
        success: false,
        data: unhealthyResponse,
        message: `AI 시스템 상태 확인 중 오류가 발생했습니다: ${error.message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Post('initialize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI 시스템 초기화' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'AI 시스템 초기화 성공',
    type: BaseApiResponse<{ message: string }>,
  })
  async initializeSystem(): Promise<BaseApiResponse<{ message: string }>> {
    this.logger.log('Initializing AI system');

    try {
      await this.aiService.initializeAISystem();

      return {
        success: true,
        data: { message: 'AI 시스템이 성공적으로 초기화되었습니다.' },
        message: 'AI 시스템 초기화가 완료되었습니다.',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to initialize AI system: ${error.message}`);
      throw new BadRequestException(
        `AI 시스템 초기화에 실패했습니다: ${error.message}`,
      );
    }
  }

  @Get('personas')
  @ApiOperation({ summary: 'AI 페르소나 목록 조회' })
  @ApiQuery({
    name: 'active',
    required: false,
    type: Boolean,
    description: '활성화된 페르소나만 조회',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'AI 페르소나 목록 조회 성공',
    type: BaseApiResponse<AIPersonaResponseDto[]>,
  })
  async getPersonas(
    @Query('active') activeOnly?: boolean,
  ): Promise<BaseApiResponse<AIPersonaResponseDto[]>> {
    this.logger.log(`Getting AI personas (active only: ${activeOnly})`);

    try {
      const personas = activeOnly
        ? await this.aiPersonaService.getAllActivePersonas()
        : await this.aiPersonaService.getAllActivePersonas(); // TODO: Add getAllPersonas method

      const response = personas.map((persona) =>
        this.mapPersonaToResponseDto(persona),
      );

      return {
        success: true,
        data: response,
        message: `${response.length}개의 AI 페르소나를 조회했습니다.`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to get AI personas: ${error.message}`);
      throw new BadRequestException(
        `AI 페르소나 조회에 실패했습니다: ${error.message}`,
      );
    }
  }

  @Get('personas/:id')
  @ApiOperation({ summary: 'AI 페르소나 상세 조회' })
  @ApiParam({ name: 'id', description: '페르소나 ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'AI 페르소나 상세 조회 성공',
    type: BaseApiResponse<AIPersonaResponseDto>,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: '페르소나를 찾을 수 없음',
  })
  async getPersonaById(
    @Param('id') id: number,
  ): Promise<BaseApiResponse<AIPersonaResponseDto>> {
    this.logger.log(`Getting AI persona by ID: ${id}`);

    try {
      const persona = await this.aiPersonaService.getPersonaById(id);
      const response = this.mapPersonaToResponseDto(persona);

      return {
        success: true,
        data: response,
        message: 'AI 페르소나를 성공적으로 조회했습니다.',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to get AI persona ${id}: ${error.message}`);

      if (error.message.includes('not found')) {
        throw new NotFoundException(
          `ID ${id}에 해당하는 AI 페르소나를 찾을 수 없습니다.`,
        );
      }

      throw new BadRequestException(
        `AI 페르소나 조회에 실패했습니다: ${error.message}`,
      );
    }
  }

  @Post('personas')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'AI 페르소나 생성' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'AI 페르소나 생성 성공',
    type: BaseApiResponse<AIPersonaResponseDto>,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '잘못된 페르소나 데이터',
  })
  async createPersona(
    @Body() createDto: CreatePersonaRequestDto,
  ): Promise<BaseApiResponse<AIPersonaResponseDto>> {
    this.logger.log(`Creating AI persona: ${createDto.name}`);

    try {
      const persona = await this.aiPersonaService.createPersona(createDto);
      const response = this.mapPersonaToResponseDto(persona);

      return {
        success: true,
        data: response,
        message: 'AI 페르소나가 성공적으로 생성되었습니다.',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to create AI persona: ${error.message}`);
      throw new BadRequestException(
        `AI 페르소나 생성에 실패했습니다: ${error.message}`,
      );
    }
  }

  @Put('personas/:id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI 페르소나 활성화' })
  @ApiParam({ name: 'id', description: '페르소나 ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'AI 페르소나 활성화 성공',
    type: BaseApiResponse<{ message: string }>,
  })
  async activatePersona(
    @Param('id') id: number,
  ): Promise<BaseApiResponse<{ message: string }>> {
    this.logger.log(`Activating AI persona: ${id}`);

    try {
      await this.aiPersonaService.activatePersona(id);

      return {
        success: true,
        data: { message: `페르소나 ID ${id}가 활성화되었습니다.` },
        message: 'AI 페르소나가 성공적으로 활성화되었습니다.',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to activate AI persona ${id}: ${error.message}`,
      );

      if (error.message.includes('not found')) {
        throw new NotFoundException(
          `ID ${id}에 해당하는 AI 페르소나를 찾을 수 없습니다.`,
        );
      }

      throw new BadRequestException(
        `AI 페르소나 활성화에 실패했습니다: ${error.message}`,
      );
    }
  }

  @Put('personas/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI 페르소나 비활성화' })
  @ApiParam({ name: 'id', description: '페르소나 ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'AI 페르소나 비활성화 성공',
    type: BaseApiResponse<{ message: string }>,
  })
  async deactivatePersona(
    @Param('id') id: number,
  ): Promise<BaseApiResponse<{ message: string }>> {
    this.logger.log(`Deactivating AI persona: ${id}`);

    try {
      await this.aiPersonaService.deactivatePersona(id);

      return {
        success: true,
        data: { message: `페르소나 ID ${id}가 비활성화되었습니다.` },
        message: 'AI 페르소나가 성공적으로 비활성화되었습니다.',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to deactivate AI persona ${id}: ${error.message}`,
      );

      if (error.message.includes('not found')) {
        throw new NotFoundException(
          `ID ${id}에 해당하는 AI 페르소나를 찾을 수 없습니다.`,
        );
      }

      throw new BadRequestException(
        `AI 페르소나 비활성화에 실패했습니다: ${error.message}`,
      );
    }
  }

  @Get('personas/:id/stats')
  @ApiOperation({ summary: 'AI 페르소나 성능 통계 조회' })
  @ApiParam({ name: 'id', description: '페르소나 ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'AI 페르소나 통계 조회 성공',
  })
  async getPersonaStats(
    @Param('id') id: number,
  ): Promise<BaseApiResponse<any>> {
    this.logger.log(`Getting AI persona stats: ${id}`);

    try {
      const stats = await this.aiPersonaService.getPersonaStats(id);

      return {
        success: true,
        data: stats,
        message: 'AI 페르소나 통계를 성공적으로 조회했습니다.',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to get AI persona stats ${id}: ${error.message}`,
      );

      if (error.message.includes('not found')) {
        throw new NotFoundException(
          `ID ${id}에 해당하는 AI 페르소나를 찾을 수 없습니다.`,
        );
      }

      throw new BadRequestException(
        `AI 페르소나 통계 조회에 실패했습니다: ${error.message}`,
      );
    }
  }

  @Post('personas/seed')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '기본 AI 페르소나 시드 데이터 생성' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: '기본 페르소나 시드 데이터 생성 성공',
    type: BaseApiResponse<AIPersonaResponseDto[]>,
  })
  async seedDefaultPersonas(): Promise<
    BaseApiResponse<AIPersonaResponseDto[]>
  > {
    this.logger.log('Seeding default AI personas');

    try {
      const personas = await this.aiPersonaService.seedDefaultPersonas();
      const response = personas.map((persona) =>
        this.mapPersonaToResponseDto(persona),
      );

      return {
        success: true,
        data: response,
        message: `${response.length}개의 기본 AI 페르소나가 생성되었습니다.`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to seed default personas: ${error.message}`);
      throw new BadRequestException(
        `기본 페르소나 시드 생성에 실패했습니다: ${error.message}`,
      );
    }
  }

  @Get('usage-stats')
  @ApiOperation({ summary: 'LLM 사용 통계 조회' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'LLM 사용 통계 조회 성공',
  })
  async getUsageStats(): Promise<BaseApiResponse<any>> {
    this.logger.log('Getting LLM usage statistics');

    try {
      const stats = this.llmService.getUsageStats();

      return {
        success: true,
        data: stats,
        message: 'LLM 사용 통계를 성공적으로 조회했습니다.',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to get LLM usage stats: ${error.message}`);
      throw new BadRequestException(
        `LLM 사용 통계 조회에 실패했습니다: ${error.message}`,
      );
    }
  }

  @Post('test-connection')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'LLM 서비스 연결 테스트' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'LLM 연결 테스트 성공',
    type: BaseApiResponse<{ connected: boolean }>,
  })
  async testLLMConnection(): Promise<BaseApiResponse<{ connected: boolean }>> {
    this.logger.log('Testing LLM service connection');

    try {
      const connected = await this.llmService.testConnection();

      return {
        success: true,
        data: { connected },
        message: connected
          ? 'LLM 서비스 연결이 정상입니다.'
          : 'LLM 서비스 연결에 문제가 있습니다.',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`LLM connection test failed: ${error.message}`);

      return {
        success: false,
        data: { connected: false },
        message: `LLM 연결 테스트에 실패했습니다: ${error.message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private mapPersonaToResponseDto(persona: any): AIPersonaResponseDto {
    return {
      id: persona.id,
      name: persona.name,
      traits: persona.traits,
      communicationStyle: persona.communicationStyle,
      riskTolerance: persona.riskTolerance,
      votingTendency: persona.votingTendency,
      suspicionLevel: persona.suspicionLevel,
      deceptionSkill: persona.deceptionSkill,
      gamesPlayed: persona.gamesPlayed,
      winRate: persona.winRate,
      description: persona.description,
    };
  }
}

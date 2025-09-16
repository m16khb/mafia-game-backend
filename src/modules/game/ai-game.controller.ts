import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  Logger,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import {
  CreateAIGameRequestDto,
  StartAIGameRequestDto,
  HumanVoteRequestDto,
  AIGameResponseDto,
  AIGameStatsResponseDto,
  AIDecisionResponseDto,
  AIPersonaResponseDto,
  AISystemHealthResponseDto,
} from '../../common/dtos/ai-game.dto';
import { ApiResponse as BaseApiResponse } from '../../common/dtos/api-response.dto';
import { Game } from '../../entities/game.entity';
import { Player } from '../../entities/player.entity';
import { AIService } from '../../libs/ai';
import { GameService } from './game.service';
import { PlayerService } from '../player/player.service';
import {
  GAME_REPOSITORY_TOKEN,
  PLAYER_REPOSITORY_TOKEN,
  IGameRepository,
  IPlayerRepository,
} from '../../libs/repositories';

@ApiTags('AI Games')
@Controller('games/ai')
export class AIGameController {
  private readonly logger = new Logger(AIGameController.name);

  constructor(
    private readonly aiService: AIService,
    private readonly gameService: GameService,
    private readonly playerService: PlayerService,
    @Inject(GAME_REPOSITORY_TOKEN)
    private readonly gameRepository: IGameRepository,
    @Inject(PLAYER_REPOSITORY_TOKEN)
    private readonly playerRepository: IPlayerRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'AI 게임 생성' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'AI 게임이 성공적으로 생성됨',
    type: BaseApiResponse<AIGameResponseDto>,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '잘못된 요청 데이터',
  })
  async createAIGame(
    @Body() createDto: CreateAIGameRequestDto,
  ): Promise<BaseApiResponse<AIGameResponseDto>> {
    this.logger.log(`Creating AI game for host: ${createDto.hostName}`);

    try {
      // 기본 게임 생성
      const game = this.gameRepository.create({
        name: `${createDto.hostName}의 AI 게임`,
        status: 'waiting',
        currentPhase: 'day_discussion',
        dayCount: 1,
        remainingTime: 0,
        maxPlayers: createDto.aiPlayerCount + 1, // AI players + 1 human
        minPlayers: createDto.aiPlayerCount + 1,
        allowAI: true,
        aiPlayerCount: createDto.aiPlayerCount,
        aiDifficultyLevel: createDto.aiDifficultyLevel || 'medium',
        aiPersonalitySet: createDto.aiPersonalitySet || 'default',
        aiDecisionsComplete: false,
      });

      const savedGame = await this.gameRepository.save(game);

      // 인간 플레이어 생성
      const hostPlayer = this.playerRepository.create({
        name: createDto.hostName,
        socketId: createDto.hostSocketId,
        gameId: savedGame.id,
        isHost: true,
        isReady: false,
        isAlive: true,
        isAi: false,
        role: null,
      });

      await this.playerRepository.save(hostPlayer);

      // AI 플레이어들 생성
      const aiPlayers: Player[] = [];
      for (let i = 1; i <= createDto.aiPlayerCount; i++) {
        const aiPlayer = this.playerRepository.create({
          name: `AI Player ${i}`,
          socketId: `ai_${savedGame.id}_${i}`,
          gameId: savedGame.id,
          isHost: false,
          isReady: true, // AI players are always ready
          isAlive: true,
          isAi: true,
          role: null,
          aiPersonaId: null, // Will be assigned when game starts
          aiDecisionTimeout: 30000,
        });

        const savedAiPlayer = await this.playerRepository.save(aiPlayer);
        aiPlayers.push(savedAiPlayer);
      }

      // 게임에 플레이어들 추가
      savedGame.players = [hostPlayer, ...aiPlayers];
      const finalGame = await this.gameRepository.save(savedGame);

      const response = this.mapGameToResponseDto(finalGame);

      this.logger.log(`AI game created successfully: ${finalGame.id}`);

      return {
        success: true,
        data: response,
        message: 'AI 게임이 성공적으로 생성되었습니다.',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to create AI game: ${error.message}`);
      throw new BadRequestException(
        `AI 게임 생성에 실패했습니다: ${error.message}`,
      );
    }
  }

  @Post(':gameId/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI 게임 시작' })
  @ApiParam({ name: 'gameId', description: '게임 ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'AI 게임이 성공적으로 시작됨',
    type: BaseApiResponse<AIGameResponseDto>,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: '게임을 찾을 수 없음',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '게임을 시작할 수 없는 상태',
  })
  async startAIGame(
    @Param('gameId') gameId: number,
    @Body() startDto: StartAIGameRequestDto,
  ): Promise<BaseApiResponse<AIGameResponseDto>> {
    this.logger.log(`Starting AI game: ${gameId}`);

    try {
      const game = await this.gameRepository.findByIdWithRelations(gameId, {
        players: true,
      });

      if (!game) {
        throw new NotFoundException('게임을 찾을 수 없습니다.');
      }

      if (!game.isAIGame()) {
        throw new BadRequestException('AI 게임이 아닙니다.');
      }

      if (!game.canStartAIGame()) {
        throw new BadRequestException('AI 게임을 시작할 수 없는 상태입니다.');
      }

      // Find human player
      const humanPlayer = game.players.find(
        (p) => p.socketId === startDto.socketId,
      );
      if (!humanPlayer) {
        throw new BadRequestException('플레이어를 찾을 수 없습니다.');
      }

      if (!humanPlayer.isHost) {
        throw new BadRequestException('호스트만 게임을 시작할 수 있습니다.');
      }

      // AI 게임 설정 및 시작
      const setupResult = await this.aiService.setupAIGame(
        game,
        humanPlayer.id,
      );

      // 게임 시작
      setupResult.game.startAIGame();
      const startedGame = await this.gameRepository.save(setupResult.game);

      const response = this.mapGameToResponseDto(startedGame);

      this.logger.log(
        `AI game started successfully: ${gameId} with ${setupResult.assignments.length} AI personas`,
      );

      return {
        success: true,
        data: response,
        message: 'AI 게임이 성공적으로 시작되었습니다.',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to start AI game ${gameId}: ${error.message}`);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `AI 게임 시작에 실패했습니다: ${error.message}`,
      );
    }
  }

  @Get(':gameId/decisions')
  @ApiOperation({ summary: 'AI 게임의 결정 목록 조회' })
  @ApiParam({ name: 'gameId', description: '게임 ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'AI 결정 목록 조회 성공',
    type: BaseApiResponse<AIDecisionResponseDto[]>,
  })
  async getAIDecisions(
    @Param('gameId') gameId: number,
  ): Promise<BaseApiResponse<AIDecisionResponseDto[]>> {
    this.logger.log(`Getting AI decisions for game: ${gameId}`);

    try {
      const game = await this.gameRepository.findById(gameId);
      if (!game) {
        throw new NotFoundException('게임을 찾을 수 없습니다.');
      }

      // AI 결정 통계와 결정 목록을 가져옴 (실제 구현에서는 AIDecisionService 사용)
      const decisions: AIDecisionResponseDto[] = []; // TODO: 실제 결정 데이터 조회

      return {
        success: true,
        data: decisions,
        message: 'AI 결정 목록을 성공적으로 조회했습니다.',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to get AI decisions for game ${gameId}: ${error.message}`,
      );
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(
        `AI 결정 조회에 실패했습니다: ${error.message}`,
      );
    }
  }

  @Get(':gameId/stats')
  @ApiOperation({ summary: 'AI 게임 통계 조회' })
  @ApiParam({ name: 'gameId', description: '게임 ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'AI 게임 통계 조회 성공',
    type: BaseApiResponse<AIGameStatsResponseDto>,
  })
  async getAIGameStats(
    @Param('gameId') gameId: number,
  ): Promise<BaseApiResponse<AIGameStatsResponseDto>> {
    this.logger.log(`Getting AI game stats: ${gameId}`);

    try {
      const game = await this.gameRepository.findById(gameId);
      if (!game) {
        throw new NotFoundException('게임을 찾을 수 없습니다.');
      }

      if (!game.isAIGame()) {
        throw new BadRequestException('AI 게임이 아닙니다.');
      }

      const stats = await this.aiService.getGameAIStats(gameId);

      const response: AIGameStatsResponseDto = {
        totalDecisions: stats.decisionStats.totalDecisions,
        averageConfidence: stats.decisionStats.averageConfidence,
        averageProcessingTime: stats.decisionStats.averageProcessingTime,
        successRate: stats.decisionStats.successRate,
        estimatedCost: stats.costEstimate,
        decisionsByType: stats.decisionStats.decisionsByType,
      };

      return {
        success: true,
        data: response,
        message: 'AI 게임 통계를 성공적으로 조회했습니다.',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to get AI game stats ${gameId}: ${error.message}`,
      );
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `AI 게임 통계 조회에 실패했습니다: ${error.message}`,
      );
    }
  }

  @Post(':gameId/vote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '인간 플레이어 투표' })
  @ApiParam({ name: 'gameId', description: '게임 ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '투표 성공',
    type: BaseApiResponse<{ message: string }>,
  })
  async submitHumanVote(
    @Param('gameId') gameId: number,
    @Body() voteDto: HumanVoteRequestDto,
  ): Promise<BaseApiResponse<{ message: string }>> {
    this.logger.log(
      `Human vote submitted for game ${gameId}: ${voteDto.target}`,
    );

    try {
      const game = await this.gameRepository.findByIdWithRelations(gameId, {
        players: true,
      });

      if (!game) {
        throw new NotFoundException('게임을 찾을 수 없습니다.');
      }

      if (!game.isAIGame()) {
        throw new BadRequestException('AI 게임이 아닙니다.');
      }

      if (game.status !== 'playing') {
        throw new BadRequestException('게임이 진행 중이 아닙니다.');
      }

      if (game.currentPhase !== 'day_voting') {
        throw new BadRequestException('투표 페이즈가 아닙니다.');
      }

      const player = game.players.find((p) => p.socketId === voteDto.socketId);
      if (!player) {
        throw new BadRequestException('플레이어를 찾을 수 없습니다.');
      }

      if (!player.isAlive) {
        throw new BadRequestException('죽은 플레이어는 투표할 수 없습니다.');
      }

      // 투표 대상 검증
      const targetPlayer = game.players.find((p) => p.name === voteDto.target);
      if (!targetPlayer) {
        throw new BadRequestException('투표 대상을 찾을 수 없습니다.');
      }

      if (!targetPlayer.isAlive) {
        throw new BadRequestException('죽은 플레이어에게 투표할 수 없습니다.');
      }

      // 투표 처리 (실제 구현에서는 GameService의 투표 로직 사용)
      this.logger.log(`Player ${player.name} voted for ${targetPlayer.name}`);

      return {
        success: true,
        data: { message: `${targetPlayer.name}에게 투표했습니다.` },
        message: '투표가 성공적으로 처리되었습니다.',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to process human vote for game ${gameId}: ${error.message}`,
      );
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `투표 처리에 실패했습니다: ${error.message}`,
      );
    }
  }

  private mapGameToResponseDto(game: Game): AIGameResponseDto {
    return {
      id: game.id,
      name: game.name,
      status: game.status,
      currentPhase: game.currentPhase,
      dayCount: game.dayCount,
      aiPlayerCount: game.aiPlayerCount,
      aiDifficultyLevel: game.aiDifficultyLevel || 'medium',
      aiDecisionsComplete: game.aiDecisionsComplete,
      phaseRemainingTime: game.getPhaseRemainingTime(),
      players: game.players.map((player) => ({
        id: player.id,
        name: player.name,
        role: player.role,
        isAlive: player.isAlive,
        isAi: player.isAi,
        aiPersonaName: undefined, // TODO: AI persona 정보 조회
      })),
      createdAt: game.createdAt,
      startedAt: game.startedAt,
    };
  }
}

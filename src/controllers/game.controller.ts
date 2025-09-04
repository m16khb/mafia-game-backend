import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
} from "@nestjs/swagger";
import { GameService } from "../services/game.service";
import {
  CreateGameRequestDto,
  JoinGameRequestDto,
  GameResponseDto,
  CreateGameResponseDto,
} from "../common/dtos";

@ApiTags("games")
@Controller("games")
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Post()
  @ApiOperation({
    summary: "새 게임 생성",
    description: "호스트가 새로운 마피아 게임을 생성합니다.",
  })
  @ApiCreatedResponse({
    description: "게임이 성공적으로 생성됨",
    type: CreateGameResponseDto,
  })
  @ApiBadRequestResponse({
    description: "잘못된 요청 데이터",
  })
  @ApiInternalServerErrorResponse({
    description: "게임 생성 실패",
  })
  async createGame(
    @Body() createGameDto: CreateGameRequestDto,
  ): Promise<CreateGameResponseDto> {
    const result = await this.gameService.createGame(
      createGameDto.hostName,
      createGameDto.hostSocketId,
    );
    return CreateGameResponseDto.create(result.gameId, result.game);
  }

  @Get()
  @ApiOperation({
    summary: "전체 게임 목록 조회",
    description: "모든 게임의 목록을 조회합니다.",
  })
  @ApiOkResponse({
    description: "게임 목록 조회 성공",
    type: [GameResponseDto],
    isArray: true,
  })
  async getAllGames(): Promise<GameResponseDto[]> {
    const games = await this.gameService.getAllGames();
    return games.map((game) => GameResponseDto.fromEntity(game));
  }

  @Get(":gameId")
  @ApiOperation({
    summary: "게임 조회",
    description: "ID로 특정 게임의 상세 정보를 조회합니다.",
  })
  @ApiParam({
    name: "gameId",
    description: "게임 ID",
    example: 1,
    type: "number",
  })
  @ApiOkResponse({
    description: "게임 정보 조회 성공",
    type: GameResponseDto,
  })
  @ApiNotFoundResponse({
    description: "게임을 찾을 수 없음",
  })
  async getGame(
    @Param("gameId", ParseIntPipe) gameId: number,
  ): Promise<GameResponseDto> {
    const game = await this.gameService.getGame(gameId);
    return GameResponseDto.fromEntity(game);
  }

  @Post(":gameId/join")
  @ApiOperation({
    summary: "게임 참가",
    description: "플레이어가 게임에 참가합니다.",
  })
  @ApiParam({
    name: "gameId",
    description: "게임 ID",
    example: 1,
    type: "number",
  })
  @ApiOkResponse({
    description: "게임 참가 성공",
    type: GameResponseDto,
  })
  @ApiBadRequestResponse({
    description: "잘못된 요청 데이터",
  })
  @ApiNotFoundResponse({
    description: "게임을 찾을 수 없음",
  })
  @ApiConflictResponse({
    description: "게임 참가 불가 (인원 초과 또는 이미 참가됨)",
  })
  async joinGame(
    @Param("gameId", ParseIntPipe) gameId: number,
    @Body() joinGameDto: JoinGameRequestDto,
  ): Promise<GameResponseDto> {
    const game = await this.gameService.joinGame(
      gameId,
      joinGameDto.playerName,
      joinGameDto.socketId,
    );
    return GameResponseDto.fromEntity(game);
  }

  @Post(":gameId/start")
  @ApiOperation({
    summary: "게임 시작",
    description: "게임을 시작합니다.",
  })
  @ApiParam({
    name: "gameId",
    description: "게임 ID",
    example: 1,
    type: "number",
  })
  @ApiOkResponse({
    description: "게임 시작 성공",
    type: GameResponseDto,
  })
  @ApiNotFoundResponse({
    description: "게임을 찾을 수 없음",
  })
  @ApiConflictResponse({
    description: "게임 시작 불가",
  })
  async startGame(
    @Param("gameId", ParseIntPipe) gameId: number,
  ): Promise<GameResponseDto> {
    const game = await this.gameService.startGame(gameId);
    return GameResponseDto.fromEntity(game);
  }
}

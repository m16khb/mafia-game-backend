import { GameStatus, GamePhase, Game } from "../../../entities/game.entity";
import { ApiProperty } from "@nestjs/swagger";
import { PlayerResponseDto } from "../../player/dtos/player-response.dto";
import { MessageResponseDto } from "../../message/dtos/message-response.dto";

export class GameResponseDto {
  @ApiProperty({ description: "게임 ID", example: 1 })
  id: number;

  @ApiProperty({ description: "게임 이름", example: "Mafia Game #1" })
  name: string;

  @ApiProperty({
    description: "게임 상태",
    enum: ["waiting", "playing", "finished"],
    example: "waiting",
  })
  status: GameStatus;

  @ApiProperty({
    description: "참여 플레이어 목록",
    type: [PlayerResponseDto],
    isArray: true,
  })
  players: PlayerResponseDto[];

  @ApiProperty({
    description: "현재 게임 페이즈",
    enum: ["day", "night", "voting", "result"],
    example: "day",
  })
  currentPhase: GamePhase;

  @ApiProperty({ description: "현재 일차", example: 1 })
  dayCount: number;

  @ApiProperty({ description: "남은 시간 (초)", example: 300 })
  remainingTime: number;

  @ApiProperty({
    description: "채팅 메시지 목록",
    type: [MessageResponseDto],
    isArray: true,
  })
  messages: MessageResponseDto[];

  @ApiProperty({ description: "최대 플레이어 수", example: 8 })
  maxPlayers: number;

  @ApiProperty({ description: "최소 플레이어 수", example: 4 })
  minPlayers: number;

  @ApiProperty({ description: "게임 생성 시간" })
  createdAt: Date;

  @ApiProperty({ description: "게임 시작 시간", required: false })
  startedAt?: Date;

  @ApiProperty({ description: "게임 종료 시간", required: false })
  endedAt?: Date;

  @ApiProperty({
    description: "승리자",
    enum: ["mafia", "citizen"],
    required: false,
  })
  winner?: "mafia" | "citizen";

  static fromEntity(game: Game): GameResponseDto {
    const dto = new GameResponseDto();
    dto.id = game.id;
    dto.name = game.name;
    dto.status = game.status;
    dto.players =
      game.players?.map((p) => PlayerResponseDto.fromEntity(p)) || [];
    dto.currentPhase = game.currentPhase;
    dto.dayCount = game.dayCount;
    dto.remainingTime = game.remainingTime;
    dto.messages =
      game.messages?.map((m) => MessageResponseDto.fromEntity(m)) || [];
    dto.maxPlayers = game.maxPlayers;
    dto.minPlayers = game.minPlayers;
    dto.createdAt = game.createdAt;
    dto.startedAt = game.startedAt;
    dto.endedAt = game.endedAt;
    dto.winner = game.winner;
    return dto;
  }
}

export class CreateGameResponseDto {
  @ApiProperty({ description: "생성된 게임 ID", example: 1 })
  gameId: number;

  @ApiProperty({ description: "생성된 게임 정보", type: GameResponseDto })
  game: GameResponseDto;

  static create(gameId: number, game: Game): CreateGameResponseDto {
    const dto = new CreateGameResponseDto();
    dto.gameId = gameId;
    dto.game = GameResponseDto.fromEntity(game);
    return dto;
  }
}

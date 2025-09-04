import { GameRole, GameStatus, GamePhase, Game } from '@/entities/game.entity';
import { MessageType, Message } from '@/entities/message.entity';
import { Player } from '@/entities/player.entity';
import { ApiProperty } from '@nestjs/swagger';

export class PlayerResponseDto {
  @ApiProperty({ description: '플레이어 ID', example: 1 })
  id: number;

  @ApiProperty({ description: '플레이어 이름', example: 'Player1' })
  name: string;

  @ApiProperty({ description: '소켓 ID', example: 'socket_123' })
  socketId: string;

  @ApiProperty({ description: '생존 여부', example: true })
  isAlive: boolean;

  @ApiProperty({ description: '준비 상태', example: false })
  isReady: boolean;

  @ApiProperty({ description: '호스트 여부', example: false })
  isHost: boolean;

  @ApiProperty({
    description: '플레이어 역할',
    enum: ['citizen', 'mafia', 'police', 'doctor'],
    required: false,
    example: 'citizen',
  })
  role?: GameRole;

  @ApiProperty({ description: '게임 참가 시간' })
  createdAt: Date;

  static fromEntity(player: Player): PlayerResponseDto {
    const dto = new PlayerResponseDto();
    dto.id = player.id;
    dto.name = player.name;
    dto.socketId = player.socketId;
    dto.isAlive = player.isAlive;
    dto.isReady = player.isReady;
    dto.isHost = player.isHost;
    dto.role = player.role;
    dto.createdAt = player.createdAt;
    return dto;
  }
}

export class MessageResponseDto {
  @ApiProperty({ description: '메시지 ID', example: 1 })
  id: number;

  @ApiProperty({ description: '메시지 내용', example: '안녕하세요!' })
  content: string;

  @ApiProperty({ description: '발신자 이름', example: 'Player1' })
  senderName: string;

  @ApiProperty({ description: '발신자 ID', example: 1 })
  senderId: number;

  @ApiProperty({ description: '메시지 타입', enum: ['chat', 'system', 'game'] })
  type: MessageType;

  @ApiProperty({ description: '메시지 생성 시간' })
  createdAt: Date;

  static fromEntity(message: Message): MessageResponseDto {
    const dto = new MessageResponseDto();
    dto.id = message.id;
    dto.content = message.content;
    dto.senderName = message.senderName;
    dto.senderId = message.senderId;
    dto.type = message.type;
    dto.createdAt = message.createdAt;
    return dto;
  }
}

export class GameResponseDto {
  @ApiProperty({ description: '게임 ID', example: 1 })
  id: number;

  @ApiProperty({ description: '게임 이름', example: 'Mafia Game #1' })
  name: string;

  @ApiProperty({
    description: '게임 상태',
    enum: ['waiting', 'playing', 'finished'],
    example: 'waiting',
  })
  status: GameStatus;

  @ApiProperty({
    description: '참여 플레이어 목록',
    type: [PlayerResponseDto],
    isArray: true,
  })
  players: PlayerResponseDto[];

  @ApiProperty({
    description: '현재 게임 페이즈',
    enum: ['day', 'night', 'voting', 'result'],
    example: 'day',
  })
  currentPhase: GamePhase;

  @ApiProperty({ description: '현재 일차', example: 1 })
  dayCount: number;

  @ApiProperty({ description: '남은 시간 (초)', example: 300 })
  remainingTime: number;

  @ApiProperty({
    description: '채팅 메시지 목록',
    type: [MessageResponseDto],
    isArray: true,
  })
  messages: MessageResponseDto[];

  @ApiProperty({ description: '최대 플레이어 수', example: 8 })
  maxPlayers: number;

  @ApiProperty({ description: '최소 플레이어 수', example: 4 })
  minPlayers: number;

  @ApiProperty({ description: '게임 생성 시간' })
  createdAt: Date;

  @ApiProperty({ description: '게임 시작 시간', required: false })
  startedAt?: Date;

  @ApiProperty({ description: '게임 종료 시간', required: false })
  endedAt?: Date;

  @ApiProperty({
    description: '승리자',
    enum: ['mafia', 'citizen'],
    required: false,
  })
  winner?: 'mafia' | 'citizen';

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
  @ApiProperty({ description: '생성된 게임 ID', example: 1 })
  gameId: number;

  @ApiProperty({ description: '생성된 게임 정보', type: GameResponseDto })
  game: GameResponseDto;

  static create(gameId: number, game: Game): CreateGameResponseDto {
    const dto = new CreateGameResponseDto();
    dto.gameId = gameId;
    dto.game = GameResponseDto.fromEntity(game);
    return dto;
  }
}

export class ApiResponseDto {
  @ApiProperty({ description: '성공 여부', example: true })
  success: boolean;

  @ApiProperty({ description: '응답 메시지', required: false })
  message?: string;

  @ApiProperty({ description: '에러 코드', required: false })
  error?: string;
}

export class HealthCheckResponseDto {
  @ApiProperty({ description: '서버 상태', example: true })
  ok: true;
}

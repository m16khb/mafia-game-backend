import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsNumber,
  IsPositive,
  IsBoolean,
  IsOptional,
  IsEnum,
} from "class-validator";
import { MessageType } from "../../entities";

export class CreateGameRequestDto {
  @ApiProperty({
    description: "호스트 이름",
    example: "Player1",
    minLength: 1,
    maxLength: 20,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1, { message: "호스트 이름은 최소 1글자 이상이어야 합니다." })
  @MaxLength(20, { message: "호스트 이름은 최대 20글자까지 가능합니다." })
  hostName: string;

  @ApiProperty({
    description: "호스트 소켓 ID",
    example: "socket_123",
    minLength: 1,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1, { message: "소켓 ID는 필수입니다." })
  hostSocketId: string;
}

export class JoinGameRequestDto {
  @ApiProperty({
    description: "플레이어 이름",
    example: "Player2",
    minLength: 1,
    maxLength: 20,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1, { message: "플레이어 이름은 최소 1글자 이상이어야 합니다." })
  @MaxLength(20, { message: "플레이어 이름은 최대 20글자까지 가능합니다." })
  playerName: string;

  @ApiProperty({
    description: "소켓 ID",
    example: "socket_456",
    minLength: 1,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1, { message: "소켓 ID는 필수입니다." })
  socketId: string;
}

export class SendMessageRequestDto {
  @ApiProperty({
    description: "메시지 내용",
    example: "안녕하세요!",
    minLength: 1,
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1, { message: "메시지 내용은 필수입니다." })
  @MaxLength(500, { message: "메시지는 최대 500글자까지 가능합니다." })
  content: string;

  @ApiProperty({
    description: "발신자 ID",
    example: 1,
  })
  @IsNumber({}, { message: "발신자 ID는 숫자여야 합니다." })
  @IsPositive({ message: "발신자 ID는 양수여야 합니다." })
  senderId: number;

  @ApiProperty({
    description: "발신자 이름",
    example: "Player1",
  })
  @IsString()
  @IsNotEmpty()
  senderName: string;

  @ApiProperty({
    description: "메시지 타입",
    enum: ["chat", "system", "game"],
    default: "chat",
    required: false,
  })
  @IsOptional()
  @IsEnum(["chat", "system", "game"], {
    message: "메시지 타입은 chat, system, game 중 하나여야 합니다.",
  })
  type?: MessageType;
}

export class UpdatePlayerReadyRequestDto {
  @ApiProperty({
    description: "준비 상태",
    example: true,
  })
  @IsBoolean()
  isReady: boolean;
}

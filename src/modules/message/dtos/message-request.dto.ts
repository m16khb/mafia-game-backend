import { MessageType } from "@/entities/message.entity";
import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsNumber,
  IsPositive,
  IsOptional,
  IsEnum,
} from "class-validator";

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

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class CreateGameRequestDto {
  @ApiProperty({
    description: '호스트 이름',
    example: 'Player1',
    minLength: 1,
    maxLength: 20,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1, { message: '호스트 이름은 최소 1글자 이상이어야 합니다.' })
  @MaxLength(20, { message: '호스트 이름은 최대 20글자까지 가능합니다.' })
  hostName: string;

  @ApiProperty({
    description: '호스트 소켓 ID',
    example: 'socket_123',
    minLength: 1,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1, { message: '소켓 ID는 필수입니다.' })
  hostSocketId: string;
}

export class JoinGameRequestDto {
  @ApiProperty({
    description: '플레이어 이름',
    example: 'Player2',
    minLength: 1,
    maxLength: 20,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1, { message: '플레이어 이름은 최소 1글자 이상이어야 합니다.' })
  @MaxLength(20, { message: '플레이어 이름은 최대 20글자까지 가능합니다.' })
  playerName: string;

  @ApiProperty({
    description: '소켓 ID',
    example: 'socket_456',
    minLength: 1,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1, { message: '소켓 ID는 필수입니다.' })
  socketId: string;
}

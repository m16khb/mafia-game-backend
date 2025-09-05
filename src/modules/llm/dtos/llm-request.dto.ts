import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GenerateRequestDto {
  @ApiProperty({
    description: 'LLM 제공자',
    example: 'open-router',
  })
  @IsString()
  @IsNotEmpty()
  provider: string;

  @ApiProperty({
    description: 'LLM 프롬프트',
    example: '당신은 마피아 게임의 참가자입니다',
  })
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @ApiProperty({
    description: 'LLM 메시지',
    example: '안녕하세요!',
  })
  @IsString()
  @IsNotEmpty()
  message: string;
}

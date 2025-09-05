import { GameRole } from '@/entities/game.entity';
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

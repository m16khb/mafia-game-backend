import { MessageType, Message } from '@/entities/message.entity';
import { ApiProperty } from '@nestjs/swagger';

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

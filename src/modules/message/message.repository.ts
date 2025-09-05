import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from '../../entities/message.entity';
import { IMessageRepository } from '@libs/repositories/message.repository.interface';

@Injectable()
export class MessageRepository implements IMessageRepository {
  constructor(
    @InjectRepository(Message)
    private readonly repository: Repository<Message>,
  ) {}

  create(messageData: Partial<Message>): Message {
    return this.repository.create(messageData);
  }

  async save(message: Message): Promise<Message> {
    return this.repository.save(message);
  }

  async findById(id: number): Promise<Message | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByGameId(gameId: number): Promise<Message[]> {
    return this.repository.find({
      where: { gameId },
    });
  }

  async findByGameIdOrderedByCreatedAt(
    gameId: number,
    order: 'ASC' | 'DESC' = 'ASC',
  ): Promise<Message[]> {
    return this.repository.find({
      where: { gameId },
      order: { createdAt: order },
    });
  }

  async deleteByGameId(gameId: number): Promise<void> {
    await this.repository.delete({ gameId });
  }
}

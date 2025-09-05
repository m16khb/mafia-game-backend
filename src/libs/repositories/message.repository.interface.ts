import { Message } from '../../entities/message.entity';

export interface IMessageRepository {
  create(messageData: Partial<Message>): Message;
  save(message: Message): Promise<Message>;
  findById(id: number): Promise<Message | null>;
  findByGameId(gameId: number): Promise<Message[]>;
  findByGameIdOrderedByCreatedAt(
    gameId: number,
    order: 'ASC' | 'DESC',
  ): Promise<Message[]>;
  deleteByGameId(gameId: number): Promise<void>;
}

import { Injectable, Inject } from "@nestjs/common";
import { Message } from "../../entities/message.entity";
import {
  IMessageRepository,
  MESSAGE_REPOSITORY_TOKEN,
} from "@libs/repositories";

@Injectable()
export class MessageService {
  constructor(
    @Inject(MESSAGE_REPOSITORY_TOKEN)
    private readonly messageRepository: IMessageRepository,
  ) {}

  async createMessage(
    gameId: number,
    senderId: number,
    senderName: string,
    content: string,
    type: "chat" | "system" | "game" = "chat",
  ): Promise<Message> {
    const message = this.messageRepository.create({
      content,
      senderName,
      senderId,
      type,
      gameId,
    });

    return this.messageRepository.save(message);
  }

  async getMessagesByGameId(gameId: number): Promise<Message[]> {
    return this.messageRepository.findByGameIdOrderedByCreatedAt(gameId, "ASC");
  }

  async deleteMessagesByGameId(gameId: number): Promise<void> {
    await this.messageRepository.deleteByGameId(gameId);
  }
}

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { GameService } from './game.service';
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  },
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GameGateway.name);

  constructor(private readonly gameService: GameService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // Handle player removal logic here
  }

  @SubscribeMessage('join-game-room')
  async handleJoinGameRoom(
    @MessageBody() data: { gameId: number },
    @ConnectedSocket() client: Socket,
  ) {
    const roomName = `game-${data.gameId}`;
    client.join(roomName);
    this.logger.log(`Client ${client.id} joined room: ${roomName}`);
    return { success: true, room: roomName };
  }

  @SubscribeMessage('leave-game-room')
  async handleLeaveGameRoom(
    @MessageBody() data: { gameId: number },
    @ConnectedSocket() client: Socket,
  ) {
    const roomName = `game-${data.gameId}`;
    client.leave(roomName);
    this.logger.log(`Client ${client.id} left room: ${roomName}`);
    return { success: true };
  }

  @SubscribeMessage('user-message')
  async handleUserMessage(
    @MessageBody()
    data: {
      gameId: number;
      content: string;
      senderId: number;
      senderName: string;
    },
    @ConnectedSocket() _client: Socket,
  ) {
    this.logger.log(`User message: ${JSON.stringify(data, null, 2)}`);

    try {
      const message = await this.gameService.sendMessage(
        data.gameId,
        data.senderId,
        data.senderName,
        data.content,
        'chat',
      );

      // 특정 게임방에만 메시지 브로드캐스트
      const roomName = `game-${data.gameId}`;
      const messageData = {
        id: message.id,
        content: message.content,
        senderName: message.senderName,
        senderId: message.senderId,
        createdAt: message.createdAt,
      };

      this.server.to(roomName).emit('ai-message', messageData);

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to user message: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

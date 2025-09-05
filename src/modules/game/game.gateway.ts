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
import { GameResponseDto } from './dtos/game-response.dto';
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
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

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // Handle player removal logic here
  }

  @SubscribeMessage('join-game')
  async handleJoinGame(
    @MessageBody() data: { gameId: number; playerName: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const game = await this.gameService.joinGame(
        data.gameId,
        data.playerName,
        client.id,
      );

      // Join socket room
      client.join(data.gameId.toString());

      // Notify all players in the game
      const gameResponse = GameResponseDto.fromEntity(game);
      this.server.to(data.gameId.toString()).emit('game-state', gameResponse);

      return { success: true, game: gameResponse };
    } catch (error) {
      this.logger.error(`Failed to join game: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('leave-game')
  async handleLeaveGame(
    @MessageBody() data: { gameId: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const game = await this.gameService.removePlayer(data.gameId, client.id);

      // Leave socket room
      client.leave(data.gameId.toString());

      if (game) {
        // Notify remaining players
        const gameResponse = GameResponseDto.fromEntity(game);
        this.server.to(data.gameId.toString()).emit('game-state', gameResponse);
      }

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to leave game: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('send-message')
  async handleSendMessage(
    @MessageBody()
    data: {
      gameId: number;
      content: string;
      senderId: number;
      senderName: string;
    },
    @ConnectedSocket() _client: Socket,
  ) {
    try {
      const message = await this.gameService.sendMessage(
        data.gameId,
        data.senderId,
        data.senderName,
        data.content,
        'chat',
      );

      // Broadcast message to all players in the game
      this.server.to(data.gameId.toString()).emit('new-message', {
        id: message.id,
        content: message.content,
        senderName: message.senderName,
        senderId: message.senderId,
        type: message.type,
        createdAt: message.createdAt,
      });

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to send message: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('start-game')
  async handleStartGame(
    @MessageBody() data: { gameId: number },
    @ConnectedSocket() _client: Socket,
  ) {
    try {
      const game = await this.gameService.startGame(data.gameId);

      // Notify all players
      const gameResponse = GameResponseDto.fromEntity(game);
      this.server.to(data.gameId.toString()).emit('game-started', gameResponse);
      this.server.to(data.gameId.toString()).emit('game-state', gameResponse);

      return { success: true, game: gameResponse };
    } catch (error) {
      this.logger.error(`Failed to start game: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('player-ready')
  async handlePlayerReady(
    @MessageBody() data: { gameId: number; playerId: number; isReady: boolean },
    @ConnectedSocket() _client: Socket,
  ) {
    try {
      const game = await this.gameService.updatePlayerReady(
        data.gameId,
        data.playerId,
        data.isReady,
      );

      // Notify all players
      const gameResponse = GameResponseDto.fromEntity(game);
      this.server.to(data.gameId.toString()).emit('game-state', gameResponse);

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to update player ready: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Utility method to broadcast game state
  async broadcastGameState(gameId: number) {
    try {
      const game = await this.gameService.getGame(gameId);
      const gameResponse = GameResponseDto.fromEntity(game);
      this.server.to(gameId.toString()).emit('game-state', gameResponse);
    } catch (error) {
      this.logger.error(`Failed to broadcast game state: ${error.message}`);
    }
  }
}

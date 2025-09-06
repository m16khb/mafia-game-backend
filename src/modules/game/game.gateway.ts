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
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PlayerService } from '../player/player.service';
import { LlmService } from '../llm/llm.service';
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

  constructor(
    private readonly gameService: GameService,
    private readonly eventEmitter: EventEmitter2,
    private readonly playerService: PlayerService,
    private readonly llmService: LlmService,
  ) {}

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
        data.content,
        'chat',
      );

      const messageData = {
        id: message.id,
        gameId: message.gameId,
        content: message.content,
        senderId: message.senderId,
        createdAt: message.createdAt,
      };

      this.eventEmitter.emit('user-message.created', messageData);

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to user message: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @OnEvent('user-message.created', { async: true })
  async handleUserMessageCreated(messageData: any) {
    const roomName = `game-${messageData.gameId}`;

    const votedAiPlayer = await this.playerService.chooseResponseAiPlayer(
      messageData.gameId,
    );
    if (!votedAiPlayer) {
      this.logger.error(`No AI player found for game ${messageData.gameId}`);
      return;
    }

    const gameHistory = await this.gameService.getGameHistory(
      messageData.gameId,
    );
    const prompt = `# 너는 지금 마피아 게임의 플레이어야
# 너의 이름은 ${votedAiPlayer.name}이고 너는 다른 ai-player와의 대화 우선권 순위 투표에서 너의 판단으로 가장 높은 수치를 응답했어 이미 마지막에 응답을 했을거야
# 게임 진행상황에 대한 정보는 과거에서부터 현재의 대화까지를 오름차순으로 나열한다.
# 지금까지의 게임 진행 상황에 대한 정보:
${gameHistory}
# 현재의 상황에 맞는 파악된 정보를 기반으로 응답을 해줘.
# 말투는 자연스럽고 직설적이어야하고
# 최대한 100단어 내외로 해줘.`;

    const response = await this.llmService.generate({
      provider: 'open-router',
      prompt,
      message: votedAiPlayer.name,
    });

    await this.gameService.sendMessage(
      messageData.gameId,
      votedAiPlayer.id,
      response,
      'game',
    );

    this.server.to(roomName).emit('ai-message', {
      gameId: messageData.gameId,
      content: response,
      senderId: votedAiPlayer.id,
    });
  }

  @OnEvent('game.started', { async: true })
  async handleGameStarted(gameData: any) {
    const startMessage = `게임이 시작 되었습니다. 다같이 힘을 모아 마피아를 찾아내고 게임에서 승리하세요`;
    this.server.to(gameData.roomName).emit('game-started', startMessage);
  }
}

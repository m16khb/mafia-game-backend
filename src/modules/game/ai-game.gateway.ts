import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsResponse,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject, UsePipes, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateAIGameRequestDto,
  StartAIGameRequestDto,
  HumanVoteRequestDto,
  AIGameResponseDto,
} from '../../common/dtos/ai-game.dto';
import { AIService } from '../../libs/ai';
import { Game } from '../../entities/game.entity';
import {
  GAME_REPOSITORY_TOKEN,
  PLAYER_REPOSITORY_TOKEN,
  IGameRepository,
  IPlayerRepository,
} from '../../libs/repositories';

interface AIGameEventData {
  gameId: number;
  phase: string;
  decisions: number;
  phaseTime: number;
  errors: string[];
}

interface AIDecisionMadeEventData {
  playerId: number;
  playerName: string;
  action: string;
  target?: string;
  confidence: number;
  processingTime: number;
}

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL },
  namespace: '/ai-games',
})
export class AIGameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AIGameGateway.name);
  private readonly activePhaseProcessing = new Set<number>();

  constructor(
    private readonly aiService: AIService,
    private readonly configService: ConfigService,
    @Inject(GAME_REPOSITORY_TOKEN)
    private readonly gameRepository: IGameRepository,
    @Inject(PLAYER_REPOSITORY_TOKEN)
    private readonly playerRepository: IPlayerRepository,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    this.logger.log(`AI game client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    this.logger.log(`AI game client disconnected: ${client.id}`);

    try {
      // Remove player from AI games if they were participating
      await this.handlePlayerDisconnection(client.id);
    } catch (error) {
      this.logger.error(
        `Failed to handle AI game disconnection: ${error.message}`,
      );
    }
  }

  @SubscribeMessage('create-ai-game')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async handleCreateAIGame(
    @MessageBody() data: CreateAIGameRequestDto,
    @ConnectedSocket() client: Socket,
  ): Promise<WsResponse<AIGameResponseDto>> {
    this.logger.log(`Creating AI game via WebSocket: ${data.hostName}`);

    try {
      // Create basic game
      const game = this.gameRepository.create({
        name: `${data.hostName}의 AI 게임`,
        status: 'waiting',
        currentPhase: 'day_discussion',
        dayCount: 1,
        remainingTime: 0,
        maxPlayers: data.aiPlayerCount + 1,
        minPlayers: data.aiPlayerCount + 1,
        allowAI: true,
        aiPlayerCount: data.aiPlayerCount,
        aiDifficultyLevel: data.aiDifficultyLevel || 'medium',
        aiPersonalitySet: data.aiPersonalitySet || 'default',
        aiDecisionsComplete: false,
      });

      const savedGame = await this.gameRepository.save(game);

      // Create human player
      const hostPlayer = this.playerRepository.create({
        name: data.hostName,
        socketId: client.id,
        gameId: savedGame.id,
        isHost: true,
        isReady: false,
        isAlive: true,
        isAi: false,
        role: null,
      });

      await this.playerRepository.save(hostPlayer);

      // Create AI players
      const aiPlayers = [];
      for (let i = 1; i <= data.aiPlayerCount; i++) {
        const aiPlayer = this.playerRepository.create({
          name: `AI Player ${i}`,
          socketId: `ai_${savedGame.id}_${i}`,
          gameId: savedGame.id,
          isHost: false,
          isReady: true,
          isAlive: true,
          isAi: true,
          role: null,
          aiPersonaId: null,
          aiDecisionTimeout: 30000,
        });

        const savedAiPlayer = await this.playerRepository.save(aiPlayer);
        aiPlayers.push(savedAiPlayer);
      }

      // Update game with all players
      savedGame.players = [hostPlayer, ...aiPlayers];
      const finalGame = await this.gameRepository.save(savedGame);

      // Join socket room
      client.join(`ai-game-${finalGame.id}`);

      const response = this.mapGameToResponseDto(finalGame);

      // Emit to room
      this.server
        .to(`ai-game-${finalGame.id}`)
        .emit('ai-game-created', response);

      return { event: 'ai-game-created', data: response };
    } catch (error) {
      this.logger.error(
        `Failed to create AI game via WebSocket: ${error.message}`,
      );
      client.emit('error', {
        message: `AI 게임 생성에 실패했습니다: ${error.message}`,
        code: 'AI_GAME_CREATE_FAILED',
      });
      throw error;
    }
  }

  @SubscribeMessage('start-ai-game')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async handleStartAIGame(
    @MessageBody() data: StartAIGameRequestDto,
    @ConnectedSocket() client: Socket,
  ): Promise<WsResponse<AIGameResponseDto>> {
    this.logger.log(`Starting AI game via WebSocket: ${data.gameId}`);

    try {
      const game = await this.gameRepository.findByIdWithRelations(
        data.gameId,
        {
          players: true,
        },
      );

      if (!game) {
        throw new Error('게임을 찾을 수 없습니다.');
      }

      if (!game.canStartAIGame()) {
        throw new Error('AI 게임을 시작할 수 없는 상태입니다.');
      }

      const humanPlayer = game.players.find((p) => p.socketId === client.id);
      if (!humanPlayer || !humanPlayer.isHost) {
        throw new Error('호스트만 게임을 시작할 수 있습니다.');
      }

      // Setup AI game
      const setupResult = await this.aiService.setupAIGame(
        game,
        humanPlayer.id,
      );

      // Start game
      setupResult.game.startAIGame();
      const startedGame = await this.gameRepository.save(setupResult.game);

      // Join all sockets to the game room
      client.join(`ai-game-${startedGame.id}`);

      const response = this.mapGameToResponseDto(startedGame);

      // Emit to room
      this.server
        .to(`ai-game-${startedGame.id}`)
        .emit('ai-game-started', response);

      // Start first AI phase processing
      this.scheduleAIPhaseProcessing(startedGame);

      return { event: 'ai-game-started', data: response };
    } catch (error) {
      this.logger.error(
        `Failed to start AI game via WebSocket: ${error.message}`,
      );
      client.emit('error', {
        message: `AI 게임 시작에 실패했습니다: ${error.message}`,
        code: 'AI_GAME_START_FAILED',
      });
      throw error;
    }
  }

  @SubscribeMessage('human-vote')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async handleHumanVote(
    @MessageBody() data: HumanVoteRequestDto,
    @ConnectedSocket() client: Socket,
  ): Promise<WsResponse<{ message: string }>> {
    this.logger.log(`Human vote via WebSocket: ${data.target}`);

    try {
      const game = await this.gameRepository.findByIdWithRelations(
        data.gameId,
        {
          players: true,
        },
      );

      if (!game) {
        throw new Error('게임을 찾을 수 없습니다.');
      }

      if (game.currentPhase !== 'day_voting') {
        throw new Error('투표 페이즈가 아닙니다.');
      }

      const player = game.players.find((p) => p.socketId === client.id);
      if (!player || !player.isAlive) {
        throw new Error('투표할 수 없는 상태입니다.');
      }

      const targetPlayer = game.players.find((p) => p.name === data.target);
      if (!targetPlayer || !targetPlayer.isAlive) {
        throw new Error('유효하지 않은 투표 대상입니다.');
      }

      // Process vote
      this.logger.log(`Player ${player.name} voted for ${targetPlayer.name}`);

      // Emit vote event to room
      this.server.to(`ai-game-${data.gameId}`).emit('human-vote-cast', {
        voter: player.name,
        target: targetPlayer.name,
        timestamp: new Date(),
      });

      // Check if all human votes are in and proceed to next phase if needed
      await this.checkPhaseCompletion(game);

      return {
        event: 'vote-confirmed',
        data: { message: `${targetPlayer.name}에게 투표했습니다.` },
      };
    } catch (error) {
      this.logger.error(
        `Failed to process human vote via WebSocket: ${error.message}`,
      );
      client.emit('error', {
        message: `투표 처리에 실패했습니다: ${error.message}`,
        code: 'HUMAN_VOTE_FAILED',
      });
      throw error;
    }
  }

  @SubscribeMessage('join-ai-game')
  async handleJoinAIGame(
    @MessageBody() data: { gameId: number },
    @ConnectedSocket() client: Socket,
  ): Promise<WsResponse<AIGameResponseDto>> {
    try {
      const game = await this.gameRepository.findByIdWithRelations(
        data.gameId,
        {
          players: true,
        },
      );

      if (!game) {
        throw new Error('게임을 찾을 수 없습니다.');
      }

      // Join socket room
      client.join(`ai-game-${data.gameId}`);

      const response = this.mapGameToResponseDto(game);

      return { event: 'ai-game-joined', data: response };
    } catch (error) {
      this.logger.error(
        `Failed to join AI game via WebSocket: ${error.message}`,
      );
      client.emit('error', {
        message: `AI 게임 참가에 실패했습니다: ${error.message}`,
        code: 'AI_GAME_JOIN_FAILED',
      });
      throw error;
    }
  }

  private async scheduleAIPhaseProcessing(game: Game): Promise<void> {
    if (this.activePhaseProcessing.has(game.id)) {
      return; // Already processing
    }

    this.activePhaseProcessing.add(game.id);

    try {
      // Wait for phase time limit or until all decisions are made
      const phaseTimeout = game.phaseTimeLimit
        ? game.phaseTimeLimit * 1000
        : 180000; // 3 minutes default

      setTimeout(async () => {
        try {
          await this.processAIPhase(game);
        } catch (error) {
          this.logger.error(`AI phase processing failed: ${error.message}`);
        } finally {
          this.activePhaseProcessing.delete(game.id);
        }
      }, phaseTimeout);
    } catch (error) {
      this.logger.error(
        `Failed to schedule AI phase processing: ${error.message}`,
      );
      this.activePhaseProcessing.delete(game.id);
    }
  }

  private async processAIPhase(game: Game): Promise<void> {
    this.logger.log(
      `Processing AI phase: ${game.currentPhase} for game ${game.id}`,
    );

    try {
      const result = await this.aiService.processAIPhase(
        game,
        game.currentPhase,
      );

      // Emit individual AI decisions
      for (const decision of result.decisions) {
        const aiPlayer = game.players.find(
          (p) => p.id === decision.decision.playerId,
        );
        if (aiPlayer) {
          this.server.to(`ai-game-${game.id}`).emit('ai-decision-made', {
            playerId: decision.decision.playerId,
            playerName: aiPlayer.name,
            action: decision.action,
            target: decision.target,
            confidence: decision.confidence,
            processingTime: decision.processingTime,
          } as AIDecisionMadeEventData);
        }
      }

      // Emit phase completion
      this.server.to(`ai-game-${game.id}`).emit('ai-phase-completed', {
        gameId: game.id,
        phase: game.currentPhase,
        decisions: result.decisions.length,
        phaseTime: result.phaseTime,
        errors: result.errors,
      } as AIGameEventData);

      // Move to next phase
      await this.transitionToNextPhase(game);
    } catch (error) {
      this.logger.error(`AI phase processing error: ${error.message}`);
      this.server.to(`ai-game-${game.id}`).emit('ai-phase-error', {
        gameId: game.id,
        phase: game.currentPhase,
        error: error.message,
      });
    }
  }

  private async transitionToNextPhase(game: Game): Promise<void> {
    // Check if game is over
    const gameOverCheck = game.isGameOver();
    if (gameOverCheck.isOver) {
      game.finish();
      game.winner = gameOverCheck.winner!;
      await this.gameRepository.save(game);

      this.server.to(`ai-game-${game.id}`).emit('ai-game-ended', {
        gameId: game.id,
        winner: gameOverCheck.winner,
        finalGame: this.mapGameToResponseDto(game),
      });
      return;
    }

    // Move to next phase
    game.nextAIPhase();
    const updatedGame = await this.gameRepository.save(game);

    this.server.to(`ai-game-${game.id}`).emit('ai-phase-transition', {
      gameId: game.id,
      newPhase: updatedGame.currentPhase,
      dayCount: updatedGame.dayCount,
      phaseTimeLimit: updatedGame.phaseTimeLimit,
      game: this.mapGameToResponseDto(updatedGame),
    });

    // Schedule next phase processing
    this.scheduleAIPhaseProcessing(updatedGame);
  }

  private async checkPhaseCompletion(game: Game): Promise<void> {
    // Check if all human decisions are in and AI decisions are complete
    if (game.aiDecisionsComplete) {
      // All decisions are in, can move to next phase immediately
      await this.transitionToNextPhase(game);
    }
  }

  private async handlePlayerDisconnection(socketId: string): Promise<void> {
    try {
      // Find player by socket ID
      const player = await this.playerRepository.findBySocketId(socketId);
      if (!player) {
        return;
      }

      // If it's an AI game, handle appropriately
      const game = await this.gameRepository.findByIdWithRelations(
        player.gameId,
        {
          players: true,
        },
      );

      if (game && game.isAIGame()) {
        // For AI games, if the human player disconnects, we might pause or end the game
        this.server.to(`ai-game-${game.id}`).emit('human-player-disconnected', {
          gameId: game.id,
          playerName: player.name,
          timestamp: new Date(),
        });

        this.logger.log(
          `Human player disconnected from AI game ${game.id}: ${player.name}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle player disconnection: ${error.message}`,
      );
    }
  }

  private mapGameToResponseDto(game: Game): AIGameResponseDto {
    return {
      id: game.id,
      name: game.name,
      status: game.status,
      currentPhase: game.currentPhase,
      dayCount: game.dayCount,
      aiPlayerCount: game.aiPlayerCount,
      aiDifficultyLevel: game.aiDifficultyLevel || 'medium',
      aiDecisionsComplete: game.aiDecisionsComplete,
      phaseRemainingTime: game.getPhaseRemainingTime(),
      players: game.players.map((player) => ({
        id: player.id,
        name: player.name,
        role: player.role,
        isAlive: player.isAlive,
        isAi: player.isAi,
        aiPersonaName: undefined, // TODO: Get AI persona info
      })),
      createdAt: game.createdAt,
      startedAt: game.startedAt,
    };
  }
}

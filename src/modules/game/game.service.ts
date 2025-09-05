import { Injectable, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from '@libs/errors/domain-error';
import { Game } from '../../entities/game.entity';
import { Message } from '../../entities/message.entity';
import {
  IGameRepository,
  IPlayerRepository,
  IMessageRepository,
  GAME_REPOSITORY_TOKEN,
  PLAYER_REPOSITORY_TOKEN,
  MESSAGE_REPOSITORY_TOKEN,
} from '@libs/repositories';

@Injectable()
export class GameService {
  constructor(
    @Inject(GAME_REPOSITORY_TOKEN)
    private readonly gameRepository: IGameRepository,
    @Inject(PLAYER_REPOSITORY_TOKEN)
    private readonly playerRepository: IPlayerRepository,
    @Inject(MESSAGE_REPOSITORY_TOKEN)
    private readonly messageRepository: IMessageRepository,
    @InjectQueue('event-logs')
    private readonly eventLogsQueue: Queue,
  ) {}

  async createGame(
    hostName: string,
    hostSocketId: string,
  ): Promise<{ gameId: number; game: Game }> {
    // Create game (ID will be auto-generated)
    const game = this.gameRepository.create({
      name: `${hostName}의 게임`,
      status: 'waiting',
      currentPhase: 'day',
      dayCount: 1,
      remainingTime: 0,
    });

    const savedGame = await this.gameRepository.save(game);

    // 게임 생성 이벤트 로그 추가
    await this.addEventLogJob(savedGame.id, 'game-created', {
      hostName,
      gameName: savedGame.name,
    });

    // Create host player (ID will be auto-generated)
    const host = this.playerRepository.create({
      name: hostName,
      socketId: hostSocketId,
      gameId: savedGame.id,
      isHost: true,
      isAlive: true,
      isReady: false,
    });

    await this.playerRepository.save(host);

    // 플레이어 참가 이벤트 로그 추가
    await this.addEventLogJob(savedGame.id, 'player-joined', {
      playerName: hostName,
      isHost: true,
    });

    // Reload game with players
    const gameWithPlayers = await this.gameRepository.findByIdWithRelations(
      savedGame.id,
      ['players', 'messages'],
    );

    return { gameId: savedGame.id, game: gameWithPlayers };
  }

  async getGame(gameId: number, requestingPlayerId?: number): Promise<Game> {
    const game = await this.gameRepository.findByIdWithRelations(gameId, [
      'players',
      'messages',
    ]);

    if (!game) {
      throw new NotFoundError('Game', { id: gameId });
    }

    // 역할 정보 필터링
    if (requestingPlayerId && game.status === 'playing') {
      const requestingPlayer = game.players.find(
        (p) => p.id === requestingPlayerId,
      );
      const isPlayerInGame = !!requestingPlayer;

      if (isPlayerInGame && game.currentPhase !== 'result') {
        // 본인 역할만 보여주기
        game.players.forEach((player) => {
          if (player.id !== requestingPlayerId) {
            player.role = undefined;
          }
        });
      }
    }

    return game;
  }

  async getAllGames(): Promise<Game[]> {
    return this.gameRepository.findAllWithRelations(['players']);
  }

  async joinGame(
    gameId: number,
    playerName: string,
    socketId: string,
  ): Promise<Game> {
    const game = await this.gameRepository.findByIdWithRelations(gameId, [
      'players',
    ]);

    if (!game) {
      throw new NotFoundError('Game', { id: gameId });
    }

    if (!game.canAddPlayer()) {
      throw new ConflictError('Cannot add player to game');
    }

    // Check if player already exists
    const existingPlayer = game.players.find((p) => p.socketId === socketId);
    if (existingPlayer) {
      throw new ConflictError('Player already in game');
    }

    const player = this.playerRepository.create({
      name: playerName,
      socketId,
      gameId: game.id,
      isHost: false,
      isAlive: true,
      isReady: false,
    });

    await this.playerRepository.save(player);

    // 플레이어 참가 이벤트 로그 추가
    await this.addEventLogJob(gameId, 'player-joined', {
      playerName,
      isHost: false,
    });

    return this.getGame(gameId);
  }

  async removePlayer(gameId: number, socketId: string): Promise<Game> {
    const game = await this.gameRepository.findByIdWithRelations(gameId, [
      'players',
    ]);

    if (!game) {
      throw new NotFoundError('Game', { id: gameId });
    }

    // 플레이어 정보를 미리 가져오기
    const playerToRemove = game.players.find((p) => p.socketId === socketId);
    if (!playerToRemove) {
      throw new NotFoundError('Player', { socketId });
    }

    const removed = game.removePlayer(socketId);
    if (!removed) {
      throw new NotFoundError('Player', { socketId });
    }

    // Delete player from database
    await this.playerRepository.delete({ socketId, gameId });

    // 플레이어 퇴장 이벤트 로그 추가
    await this.addEventLogJob(gameId, 'player-left', {
      socketId,
      playerName: playerToRemove.name,
    });

    // If no players left, delete the game
    if (game.players.length === 0) {
      await this.addEventLogJob(gameId, 'game-deleted', {
        reason: 'no-players-left',
      });
      await this.gameRepository.delete(gameId);
      return null;
    }

    // Update game
    await this.gameRepository.save(game);
    return this.getGame(gameId);
  }

  async startGame(gameId: number): Promise<Game> {
    const game = await this.gameRepository.findByIdWithRelations(gameId, [
      'players',
    ]);

    if (!game) {
      throw new NotFoundError('Game', { id: gameId });
    }

    if (!game.canStart()) {
      throw new ConflictError(
        'Cannot start game: not enough players or players not ready',
      );
    }

    game.start();
    await this.gameRepository.save(game);

    // Update players with roles
    for (const player of game.players) {
      await this.playerRepository.save(player);
    }

    // 게임 시작 이벤트 로그 추가
    await this.addEventLogJob(gameId, 'game-started', {
      playerCount: game.players.length,
      roles: game.players.map((p) => ({ name: p.name, role: p.role })),
    });

    return this.getGame(gameId);
  }

  async sendMessage(
    gameId: number,
    senderId: number,
    senderName: string,
    content: string,
    type: 'chat' | 'system' | 'game' = 'chat',
  ): Promise<Message> {
    const game = await this.gameRepository.findById(gameId);

    if (!game) {
      throw new NotFoundError('Game', { id: gameId });
    }

    const message = this.messageRepository.create({
      content,
      senderName,
      senderId,
      type,
      gameId,
    });

    const savedMessage = await this.messageRepository.save(message);

    // 메시지 이벤트 로그 추가 (시스템/게임 메시지만)
    if (type !== 'chat') {
      await this.addEventLogJob(gameId, 'message-sent', {
        messageType: type,
        senderName,
        content,
      });
    }

    return savedMessage;
  }

  async updatePlayerReady(
    gameId: number,
    playerId: number,
    isReady: boolean,
  ): Promise<Game> {
    const player = await this.playerRepository.findByIdAndGameId(
      playerId,
      gameId,
    );

    if (!player) {
      throw new NotFoundError('Player', { id: playerId, gameId });
    }

    player.isReady = isReady;
    await this.playerRepository.save(player);

    // 플레이어 준비 상태 변경 이벤트 로그 추가
    await this.addEventLogJob(gameId, 'player-ready-changed', {
      playerName: player.name,
      isReady,
    });

    return this.getGame(gameId);
  }

  async nextPhase(gameId: number): Promise<Game> {
    const game = await this.gameRepository.findByIdWithRelations(gameId, [
      'players',
    ]);

    if (!game) {
      throw new NotFoundError('Game', { id: gameId });
    }

    if (game.status !== 'playing') {
      throw new ValidationError('Game is not in playing status');
    }

    const previousPhase = game.currentPhase;
    const previousDay = game.dayCount;

    game.nextPhase();

    // 페이즈 변경 이벤트 로그 추가
    await this.addEventLogJob(gameId, 'phase-changed', {
      previousPhase,
      newPhase: game.currentPhase,
      previousDay,
      newDay: game.dayCount,
    });

    // Check if game is over
    const gameOverResult = game.isGameOver();
    if (gameOverResult.isOver) {
      game.winner = gameOverResult.winner;
      game.finish();

      // 게임 종료 이벤트 로그 추가
      await this.addEventLogJob(gameId, 'game-finished', {
        winner: gameOverResult.winner,
        finalPhase: game.currentPhase,
        finalDay: game.dayCount,
      });
    }

    await this.gameRepository.save(game);
    return this.getGame(gameId);
  }

  /**
   * 게임 이벤트 로그를 큐에 추가합니다
   */
  private async addEventLogJob(
    gameId: number,
    eventType: string,
    eventData?: Record<string, any>,
  ): Promise<void> {
    try {
      await this.eventLogsQueue.add('append', {
        gameId,
        eventType,
        eventData,
      });
    } catch (error) {
      // 로깅만 하고 게임 로직에는 영향을 주지 않음
      console.error(`Failed to add event log job: ${error.message}`);
    }
  }
}

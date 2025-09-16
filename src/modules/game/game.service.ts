import { Injectable, Inject } from '@nestjs/common';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from '@libs/errors/domain-error';
import { Game, AIDifficultyLevel } from '../../entities/game.entity';
import { Message } from '../../entities/message.entity';
import {
  IGameRepository,
  IPlayerRepository,
  IMessageRepository,
  GAME_REPOSITORY_TOKEN,
  PLAYER_REPOSITORY_TOKEN,
  MESSAGE_REPOSITORY_TOKEN,
} from '@libs/repositories';
import { Player } from '@/entities/player.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MessageService } from '../message/message.service';
import { ClsService } from 'nestjs-cls';
import { Logger } from '@/libs/logger/logger.service';
import { CreateGameRequestDto } from './dtos/game-request.dto';
import { EventLogQueueService } from '../game-event/event-log-queue.service';
import { AIPersonaService } from '../ai/services/ai-persona.service';

@Injectable()
export class GameService {
  constructor(
    @Inject(GAME_REPOSITORY_TOKEN)
    private readonly gameRepository: IGameRepository,
    @Inject(PLAYER_REPOSITORY_TOKEN)
    private readonly playerRepository: IPlayerRepository,
    @Inject(MESSAGE_REPOSITORY_TOKEN)
    private readonly messageRepository: IMessageRepository,
    private readonly messageService: MessageService,
    private readonly eventEmitter: EventEmitter2,
    private readonly logger: Logger,
    private readonly cls: ClsService,
    private readonly eventLogQueueService: EventLogQueueService,
    private readonly aiPersonaService: AIPersonaService,
  ) {
    this.logger.setContext(GameService.name);
  }

  async createGame(
    createGameDto: CreateGameRequestDto,
  ): Promise<{ gameId: number; game: Game }> {
    this.logger.log(createGameDto);

    const { hostName, hostSocketId } = createGameDto;

    const game = this.gameRepository.create({
      name: `${hostName}의 게임`,
      status: 'waiting',
      currentPhase: 'day',
      dayCount: 1,
      remainingTime: 0,
    });

    const savedGame = await this.gameRepository.save(game);

    // 게임 생성 이벤트 로그 추가
    await this.eventLogQueueService.addEventLogJob(
      savedGame.id,
      'game-created',
      {
        hostName,
        gameName: savedGame.name,
      },
    );

    // Create host player (ID will be auto-generated)
    const host = this.playerRepository.create({
      name: hostName,
      socketId: hostSocketId,
      gameId: savedGame.id,
      isHost: true,
      isAlive: true,
      isReady: true,
    });

    await this.playerRepository.save(host);

    // 플레이어 참가 이벤트 로그 추가
    await this.eventLogQueueService.addEventLogJob(
      savedGame.id,
      'player-joined',
      {
        playerName: hostName,
        isHost: true,
      },
    );

    // Reload game with players
    const gameWithHuman = await this.gameRepository.findByIdWithRelations(
      savedGame.id,
      { players: true, messages: true },
    );

    // --- AI Player Creation with Personas ---
    const aiPlayersToCreate = 5;
    const createdAiPlayers: Player[] = [];

    // AI 플레이어들 생성 (일단 기본 이름으로)
    for (let i = 0; i < aiPlayersToCreate; i++) {
      const aiPlayer = this.playerRepository.create({
        name: `AI Player ${i + 1}`, // 임시 이름, 페르소나 할당 후 변경될 예정
        socketId: `ai_${savedGame.id}_${i + 1}`, // AI 전용 소켓 ID
        gameId: savedGame.id,
        isHost: false,
        isAlive: true,
        isReady: true, // AI players are always ready
        isAi: true,
      });
      createdAiPlayers.push(aiPlayer);
    }

    await this.playerRepository.save(createdAiPlayers);

    // AI 플레이어들에게 페르소나 할당
    const personaAssignments =
      this.aiPersonaService.assignRandomPersonas(createdAiPlayers);

    // 페르소나 정보를 데이터베이스에 저장
    for (const aiPlayer of createdAiPlayers) {
      const persona = personaAssignments.get(aiPlayer.id);
      if (persona) {
        // Convert string ID to number for compatibility with entity
        const numericId = this.mapStringPersonaIdToNumber(persona.id);
        aiPlayer.assignAiPersona(numericId);
      }
    }

    // 업데이트된 AI 플레이어 정보 저장
    await this.playerRepository.save(createdAiPlayers);

    for (const ai of createdAiPlayers) {
      const persona = personaAssignments.get(ai.id);
      await this.eventLogQueueService.addEventLogJob(
        savedGame.id,
        'player-joined',
        {
          playerName: ai.name,
          isHost: false,
          isAi: true,
          aiPersonaId: persona?.id,
          aiPersonaName: persona?.name,
        },
      );
    }

    const finalGame = await this.gameRepository.findByIdWithRelations(
      savedGame.id,
      { players: true, messages: true },
    );

    return { gameId: savedGame.id, game: finalGame };
  }

  async getGame(gameId: number, requestingPlayerId?: number): Promise<Game> {
    this.logger.log({ gameId });

    const game = await this.gameRepository.findByIdWithRelations(gameId, {
      players: true,
      messages: true,
    });

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
    const game = await this.gameRepository.findByIdWithRelations(gameId, {
      players: true,
    });

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
    await this.eventLogQueueService.addEventLogJob(gameId, 'player-joined', {
      playerName,
      isHost: false,
    });

    return this.getGame(gameId);
  }

  async removePlayer(gameId: number, socketId: string): Promise<Game> {
    const game = await this.gameRepository.findByIdWithRelations(gameId, {
      players: true,
    });

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
    await this.eventLogQueueService.addEventLogJob(gameId, 'player-left', {
      socketId,
      playerName: playerToRemove.name,
    });

    // If no players left, delete the game
    if (game.players.length === 0) {
      await this.eventLogQueueService.addEventLogJob(gameId, 'game-deleted', {
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
    const game = await this.gameRepository.findByIdWithRelations(gameId, {
      players: true,
    });

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
    await this.eventLogQueueService.addEventLogJob(gameId, 'game-started', {
      playerCount: game.players.length,
      roles: game.players.map((p) => ({ name: p.name, role: p.role })),
    });

    this.eventEmitter.emit('game.started', { roomName: `game-${gameId}` });

    return this.getGame(gameId);
  }

  async sendMessage(
    gameId: number,
    senderId: number,
    content: string,
    type: 'chat' | 'system' | 'game' = 'chat',
  ): Promise<Message> {
    const game = await this.gameRepository.findById(gameId);

    if (!game) {
      throw new NotFoundError('Game', { id: gameId });
    }

    const sender = await this.playerRepository.findById(senderId);

    const message = this.messageRepository.create({
      content,
      senderId,
      senderName: sender.name,
      type,
      gameId,
    });

    const savedMessage = await this.messageRepository.save(message);

    // 메시지 이벤트 로그 추가 (시스템/게임 메시지만)
    if (type !== 'chat') {
      await this.eventLogQueueService.addEventLogJob(gameId, 'message-sent', {
        messageType: type,
        senderName: sender.name,
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
    await this.eventLogQueueService.addEventLogJob(
      gameId,
      'player-ready-changed',
      {
        playerName: player.name,
        isReady,
      },
    );

    return this.getGame(gameId);
  }

  async nextPhase(gameId: number): Promise<Game> {
    const game = await this.gameRepository.findByIdWithRelations(gameId, {
      players: true,
    });

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
    await this.eventLogQueueService.addEventLogJob(gameId, 'phase-changed', {
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
      await this.eventLogQueueService.addEventLogJob(gameId, 'game-finished', {
        winner: gameOverResult.winner,
        finalPhase: game.currentPhase,
        finalDay: game.dayCount,
      });
    }

    await this.gameRepository.save(game);
    return this.getGame(gameId);
  }

  async getGameHistory(gameId: number): Promise<string> {
    const messages = await this.messageService.getMessagesByGameId(gameId);
    const gameHistory = messages
      .map(
        (message: Message) => `\t- ${message.senderName}: ${message.content}`,
      )
      .join('\n');
    return gameHistory;
  }

  // T053: AI 게임 관리 메서드들
  async createAIGame(
    hostName: string,
    hostSocketId: string,
    aiPlayerCount: number = 5,
    aiDifficultyLevel: AIDifficultyLevel = 'medium',
    aiPersonalitySet: string = 'default',
  ): Promise<{ gameId: number; game: Game }> {
    this.logger.log(`Creating AI game with ${aiPlayerCount} AI players`);

    // AI 게임 생성
    const game = this.gameRepository.create({
      name: `${hostName}의 AI 게임`,
      status: 'waiting',
      currentPhase: 'day_discussion',
      dayCount: 1,
      remainingTime: 0,
      maxPlayers: aiPlayerCount + 1,
      minPlayers: aiPlayerCount + 1,
      allowAI: true,
      aiPlayerCount,
      aiDifficultyLevel,
      aiPersonalitySet,
      aiDecisionsComplete: false,
    });

    const savedGame = await this.gameRepository.save(game);

    // 게임 생성 이벤트 로그
    await this.eventLogQueueService.addEventLogJob(
      savedGame.id,
      'ai-game-created',
      {
        hostName,
        aiPlayerCount,
        aiDifficultyLevel,
        aiPersonalitySet,
      },
    );

    // 인간 플레이어 생성
    const hostPlayer = this.playerRepository.create({
      name: hostName,
      socketId: hostSocketId,
      gameId: savedGame.id,
      isHost: true,
      isAlive: true,
      isReady: false,
      isAi: false,
      role: null,
    });

    await this.playerRepository.save(hostPlayer);

    // AI 플레이어들 생성
    const aiPlayers = await this.createAIPlayers(savedGame, aiPlayerCount);

    // 게임에 플레이어들 추가
    savedGame.players = [hostPlayer, ...aiPlayers];
    const finalGame = await this.gameRepository.save(savedGame);

    return { gameId: savedGame.id, game: finalGame };
  }

  async startAIGame(gameId: number, humanPlayerId: number): Promise<Game> {
    this.logger.log(`Starting AI game: ${gameId}`);

    const game = await this.gameRepository.findByIdWithRelations(gameId, {
      players: true,
    });

    if (!game) {
      throw new NotFoundError('Game', { id: gameId });
    }

    if (!game.isAIGame()) {
      throw new ValidationError('Not an AI game');
    }

    if (!game.canStartAIGame()) {
      throw new ConflictError('Cannot start AI game in current state');
    }

    // 역할 배정 및 게임 시작
    game.startAIGame();

    // 모든 플레이어의 역할 저장
    for (const player of game.players) {
      await this.playerRepository.save(player);
    }

    await this.gameRepository.save(game);

    // AI 게임 시작 이벤트 로그
    await this.eventLogQueueService.addEventLogJob(gameId, 'ai-game-started', {
      playerCount: game.players.length,
      aiPlayerCount: game.aiPlayerCount,
      roles: game.players.map((p) => ({
        name: p.name,
        role: p.role,
        isAi: p.isAi,
      })),
    });

    this.eventEmitter.emit('ai-game.started', {
      roomName: `game-${gameId}`,
      gameId,
      humanPlayerId,
    });

    return this.getGame(gameId);
  }

  async processAIPhase(gameId: number, phase: string): Promise<void> {
    this.logger.log(`Processing AI phase: ${phase} for game ${gameId}`);

    const game = await this.gameRepository.findByIdWithRelations(gameId, {
      players: true,
    });

    if (!game || !game.isAIGame()) {
      throw new NotFoundError('AI Game', { id: gameId });
    }

    // AI 결정 처리 완료 표시
    game.aiDecisionsComplete = true;
    await this.gameRepository.save(game);

    // AI 페이즈 완료 이벤트 로그
    await this.eventLogQueueService.addEventLogJob(
      gameId,
      'ai-phase-completed',
      {
        phase,
        aiPlayerCount: game.players.filter((p) => p.isAi && p.isAlive).length,
      },
    );

    this.eventEmitter.emit('ai-phase.completed', {
      roomName: `game-${gameId}`,
      gameId,
      phase,
    });
  }

  async transitionAIGamePhase(gameId: number): Promise<Game> {
    this.logger.log(`Transitioning AI game phase: ${gameId}`);

    const game = await this.gameRepository.findByIdWithRelations(gameId, {
      players: true,
    });

    if (!game || !game.isAIGame()) {
      throw new NotFoundError('AI Game', { id: gameId });
    }

    // 게임 종료 확인
    const gameOverResult = game.isGameOver();
    if (gameOverResult.isOver) {
      game.winner = gameOverResult.winner;
      game.finish();

      await this.eventLogQueueService.addEventLogJob(
        gameId,
        'ai-game-finished',
        {
          winner: gameOverResult.winner,
          finalPhase: game.currentPhase,
          totalDays: game.dayCount,
        },
      );

      await this.gameRepository.save(game);
      return game;
    }

    // 다음 페이즈로 전환
    const previousPhase = game.currentPhase;
    game.nextAIPhase();
    game.aiDecisionsComplete = false; // 새 페이즈에서는 AI 결정 초기화

    await this.eventLogQueueService.addEventLogJob(
      gameId,
      'ai-phase-transition',
      {
        previousPhase,
        newPhase: game.currentPhase,
        dayCount: game.dayCount,
      },
    );

    await this.gameRepository.save(game);

    this.eventEmitter.emit('ai-phase.transition', {
      roomName: `game-${gameId}`,
      gameId,
      newPhase: game.currentPhase,
      dayCount: game.dayCount,
    });

    return game;
  }

  private async createAIPlayers(game: Game, count: number): Promise<Player[]> {
    const aiPlayers: Player[] = [];

    for (let i = 1; i <= count; i++) {
      const aiPlayer = this.playerRepository.create({
        name: `AI Player ${i}`,
        socketId: `ai_${game.id}_${i}`,
        gameId: game.id,
        isHost: false,
        isAlive: true,
        isReady: true,
        isAi: true,
        role: null,
        aiPersonaId: null,
        aiDecisionTimeout: 30000,
      });

      const savedAiPlayer = await this.playerRepository.save(aiPlayer);
      aiPlayers.push(savedAiPlayer);
    }

    // AI 페르소나 할당
    const personaAssignments =
      this.aiPersonaService.assignRandomPersonas(aiPlayers);

    for (const aiPlayer of aiPlayers) {
      const persona = personaAssignments.get(aiPlayer.id);
      if (persona) {
        const numericId = this.mapStringPersonaIdToNumber(persona.id);
        aiPlayer.assignAiPersona(numericId);
        aiPlayer.name = persona.name; // 페르소나 이름으로 변경
      }
    }

    // 업데이트된 AI 플레이어 정보 저장
    await this.playerRepository.save(aiPlayers);

    // 이벤트 로그
    for (const ai of aiPlayers) {
      const persona = personaAssignments.get(ai.id);
      await this.eventLogQueueService.addEventLogJob(
        game.id,
        'ai-player-created',
        {
          playerName: ai.name,
          aiPersonaId: persona?.id,
          aiPersonaName: persona?.name,
        },
      );
    }

    return aiPlayers;
  }

  private mapStringPersonaIdToNumber(stringId: string): number {
    const idMap: Record<string, number> = {
      'detective-holmes': 1,
      'smooth-talker': 2,
      'team-player': 3,
      'lone-wolf': 4,
      'wild-card': 5,
    };
    return idMap[stringId] || 1; // Default to 1 if not found
  }
}

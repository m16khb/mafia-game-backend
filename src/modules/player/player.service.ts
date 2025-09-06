import { Injectable, Inject, Logger } from '@nestjs/common';
import { Player } from '../../entities/player.entity';
import { NotFoundError } from '@libs/errors/domain-error';
import { IPlayerRepository, PLAYER_REPOSITORY_TOKEN } from '@libs/repositories';
import { LlmService } from '../llm/llm.service';
import { MessageService } from '../message/message.service';
import { Message } from '@/entities/message.entity';
import { GameService } from '../game/game.service';

@Injectable()
export class PlayerService {
  private readonly logger = new Logger(PlayerService.name);

  constructor(
    @Inject(PLAYER_REPOSITORY_TOKEN)
    private readonly playerRepository: IPlayerRepository,
    private readonly llmService: LlmService,
    private readonly gameService: GameService,
  ) {}

  async findBySocketId(socketId: string): Promise<Player | null> {
    return this.playerRepository.findBySocketIdWithGame(socketId);
  }

  async findByGameId(gameId: number): Promise<Player[]> {
    return this.playerRepository.findByGameIdWithGame(gameId);
  }

  async updatePlayerReady(playerId: number, isReady: boolean): Promise<Player> {
    const player = await this.playerRepository.findById(playerId);

    if (!player) {
      throw new NotFoundError('Player', { id: playerId });
    }

    player.isReady = isReady;
    return this.playerRepository.save(player);
  }

  async removePlayer(socketId: string): Promise<void> {
    await this.playerRepository.delete({ socketId });
  }

  async chooseResponseAiPlayer(gameId: number): Promise<Player> {
    const players = await this.playerRepository.findByGameId(gameId);
    const gameHistory = await this.gameService.getGameHistory(gameId);

    const prompt = `# 너는 지금 마피아 게임의 플레이어야
## 지금까지의 게임 진행 상황에 대한 정보:
${gameHistory}
## 네가 지금 상황에서 발언을 해야하는 이유를 생각해보고 그 수치를 1~100으로 표현해줘`;

    this.logger.log(`prompt: \n${prompt}`);

    const aiPlayers = players.filter(
      (player: Player) => player.isAi && player.isAlive,
    );

    if (aiPlayers.length === 0) {
      return null;
    }

    const voteStatementPromises = aiPlayers.map((player: Player) =>
      this.llmService.voteStatement({
        provider: 'open-router',
        prompt,
        message: player.name,
      }),
    );

    const voteStatements = await Promise.all(voteStatementPromises);

    let highestScore = -1;
    let selectedPlayer: Player | null = null;

    voteStatements.forEach((voteStatement, index) => {
      try {
        const response = JSON.parse(voteStatement);
        const score = response.figure;

        this.logger.log(`${aiPlayers[index].name}: ${score}`);

        if (score > highestScore) {
          highestScore = score;
          selectedPlayer = aiPlayers[index];
        }
      } catch (error) {
        this.logger.error(
          `Failed to parse vote statement for ${aiPlayers[index].name}: ${voteStatement}`,
        );
      }
    });

    return selectedPlayer;
  }
}

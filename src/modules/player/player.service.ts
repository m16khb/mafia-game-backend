import { Injectable, Inject } from '@nestjs/common';
import { Player } from '../../entities/player.entity';
import { NotFoundError } from '@libs/errors/domain-error';
import { IPlayerRepository, PLAYER_REPOSITORY_TOKEN } from '@libs/repositories';

@Injectable()
export class PlayerService {
  constructor(
    @Inject(PLAYER_REPOSITORY_TOKEN)
    private readonly playerRepository: IPlayerRepository,
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
}

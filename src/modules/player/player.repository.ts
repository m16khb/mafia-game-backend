import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Player } from '../../entities/player.entity';
import { IPlayerRepository } from '@libs/repositories/player.repository.interface';

@Injectable()
export class PlayerRepository implements IPlayerRepository {
  constructor(
    @InjectRepository(Player)
    private readonly repository: Repository<Player>,
  ) {}

  create(playerData: Partial<Player>): Player {
    return this.repository.create(playerData);
  }

  async save(player: Player): Promise<Player>;
  async save(players: Player[]): Promise<Player[]>;
  async save(players: Player | Player[]): Promise<Player | Player[]> {
    switch (Array.isArray(players)) {
      case true:
        return this.repository.save(players as Player[]);
      case false:
        return this.repository.save(players as Player);
    }
  }

  async findById(id: number): Promise<Player | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByIdWithGame(id: number): Promise<Player | null> {
    return this.repository.findOne({
      where: { id },
      relations: { game: true },
    });
  }

  async findBySocketId(socketId: string): Promise<Player | null> {
    return this.repository.findOne({ where: { socketId } });
  }

  async findBySocketIdWithGame(socketId: string): Promise<Player | null> {
    return this.repository.findOne({
      where: { socketId },
      relations: { game: true },
    });
  }

  async findByGameId(gameId: number): Promise<Player[]> {
    return this.repository.find({ where: { gameId } });
  }

  async findByGameIdWithGame(gameId: number): Promise<Player[]> {
    return this.repository.find({
      where: { gameId },
      relations: { game: true },
    });
  }

  async findByIdAndGameId(
    playerId: number,
    gameId: number,
  ): Promise<Player | null> {
    return this.repository.findOne({
      where: { id: playerId, gameId },
    });
  }

  async delete(criteria: { socketId: string; gameId?: number }): Promise<void> {
    if (criteria.gameId) {
      await this.repository.delete({
        socketId: criteria.socketId,
        gameId: criteria.gameId,
      });
    } else {
      await this.repository.delete({ socketId: criteria.socketId });
    }
  }

  async deleteById(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}

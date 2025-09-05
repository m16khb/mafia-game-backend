import { Player } from '../../entities/player.entity';

export interface IPlayerRepository {
  create(playerData: Partial<Player>): Player;
  save(player: Player): Promise<Player>;
  findById(id: number): Promise<Player | null>;
  findByIdWithGame(id: number): Promise<Player | null>;
  findBySocketId(socketId: string): Promise<Player | null>;
  findBySocketIdWithGame(socketId: string): Promise<Player | null>;
  findByGameId(gameId: number): Promise<Player[]>;
  findByGameIdWithGame(gameId: number): Promise<Player[]>;
  findByIdAndGameId(playerId: number, gameId: number): Promise<Player | null>;
  delete(criteria: { socketId: string; gameId?: number }): Promise<void>;
  deleteById(id: number): Promise<void>;
}

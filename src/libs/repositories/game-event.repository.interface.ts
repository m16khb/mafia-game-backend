import { GameEvent } from '../../entities/game-event.entity';

export interface IGameEventRepository {
  create(eventData: Partial<GameEvent>): GameEvent;
  save(event: GameEvent): Promise<GameEvent>;
  findById(id: number): Promise<GameEvent | null>;
  findByGameId(gameId: number): Promise<GameEvent[]>;
  findByGameIdOrderedByCreatedAt(
    gameId: number,
    order: 'ASC' | 'DESC',
  ): Promise<GameEvent[]>;
  deleteByGameId(gameId: number): Promise<void>;
}

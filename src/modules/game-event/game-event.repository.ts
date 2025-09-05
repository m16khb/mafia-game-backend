import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { GameEvent } from "../../entities/game-event.entity";
import { IGameEventRepository } from "@libs/repositories/game-event.repository.interface";

@Injectable()
export class GameEventRepository implements IGameEventRepository {
  constructor(
    @InjectRepository(GameEvent)
    private readonly repository: Repository<GameEvent>,
  ) {}

  create(eventData: Partial<GameEvent>): GameEvent {
    return this.repository.create(eventData);
  }

  async save(event: GameEvent): Promise<GameEvent> {
    return this.repository.save(event);
  }

  async findById(id: number): Promise<GameEvent | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByGameId(gameId: number): Promise<GameEvent[]> {
    return this.repository.find({
      where: { gameId },
    });
  }

  async findByGameIdOrderedByCreatedAt(
    gameId: number,
    order: "ASC" | "DESC" = "ASC",
  ): Promise<GameEvent[]> {
    return this.repository.find({
      where: { gameId },
      order: { createdAt: order },
    });
  }

  async deleteByGameId(gameId: number): Promise<void> {
    await this.repository.delete({ gameId });
  }
}

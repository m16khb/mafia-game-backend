import { Injectable, Inject } from '@nestjs/common';
import { GameEvent } from '../../entities/game-event.entity';
import {
  IGameEventRepository,
  GAME_EVENT_REPOSITORY_TOKEN,
} from '@libs/repositories';

@Injectable()
export class GameEventService {
  constructor(
    @Inject(GAME_EVENT_REPOSITORY_TOKEN)
    private readonly gameEventRepository: IGameEventRepository,
  ) {}

  async createEvent(
    gameId: number,
    eventType: string,
    eventData?: Record<string, any>,
  ): Promise<GameEvent> {
    const event = this.gameEventRepository.create({
      gameId,
      eventType,
      eventData,
    });

    return this.gameEventRepository.save(event);
  }

  async getEventsByGameId(gameId: number): Promise<GameEvent[]> {
    return this.gameEventRepository.findByGameIdOrderedByCreatedAt(
      gameId,
      'ASC',
    );
  }

  async deleteEventsByGameId(gameId: number): Promise<void> {
    await this.gameEventRepository.deleteByGameId(gameId);
  }
}

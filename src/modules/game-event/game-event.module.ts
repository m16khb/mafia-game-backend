import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { GameEvent } from '../../entities/game-event.entity';
import { AIDecision } from '../../entities/ai-decision.entity';
import { Game } from '../../entities/game.entity';
import { Player } from '../../entities/player.entity';
import { GameEventService } from './game-event.service';
import { GameEventRepository } from './game-event.repository';
import { EventLogsProcessor } from './event-logs.processor';
import { AIDecisionProcessor } from './ai-decision.processor';
import {
  GAME_EVENT_REPOSITORY_TOKEN,
  AI_DECISION_REPOSITORY_TOKEN,
  GAME_REPOSITORY_TOKEN,
  PLAYER_REPOSITORY_TOKEN,
} from '@libs/repositories';
import { AIDecisionRepository } from '@libs/repositories/ai-decision.repository';
import { GameRepository } from '../game/game.repository';
import { PlayerRepository } from '../player/player.repository';
import { EventLogQueueService } from './event-log-queue.service';
import { AIDecisionQueueService } from './ai-decision-queue.service';
import { AIModule } from '@libs/ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GameEvent, AIDecision, Game, Player]),
    BullModule.registerQueue({
      name: 'event-logs',
    }),
    BullModule.registerQueue({
      name: 'ai-decisions',
    }),
    AIModule,
  ],
  providers: [
    GameEventService,
    GameEventRepository,
    AIDecisionRepository,
    GameRepository,
    PlayerRepository,
    EventLogsProcessor,
    AIDecisionProcessor,
    EventLogQueueService,
    AIDecisionQueueService,
    {
      provide: GAME_EVENT_REPOSITORY_TOKEN,
      useClass: GameEventRepository,
    },
    {
      provide: AI_DECISION_REPOSITORY_TOKEN,
      useClass: AIDecisionRepository,
    },
    {
      provide: GAME_REPOSITORY_TOKEN,
      useClass: GameRepository,
    },
    {
      provide: PLAYER_REPOSITORY_TOKEN,
      useClass: PlayerRepository,
    },
  ],
  exports: [
    GameEventService,
    EventLogQueueService,
    AIDecisionQueueService,
    GAME_EVENT_REPOSITORY_TOKEN,
  ],
})
export class GameEventModule {}

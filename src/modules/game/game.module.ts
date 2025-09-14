import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Game } from '../../entities/game.entity';
import { Player } from '../../entities/player.entity';
import { Message } from '../../entities/message.entity';
import { GameEvent } from '../../entities/game-event.entity';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { GameGateway } from './game.gateway';
import { GameRepository } from './game.repository';
import { PlayerModule } from '../player/player.module';
import { MessageModule } from '../message/message.module';
import { GAME_REPOSITORY_TOKEN } from '@libs/repositories';
import { LlmModule } from '../llm/llm.module';
import { EventLogQueueService } from '../game-event/event-log-queue.service';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Game, Player, Message, GameEvent]),
    BullModule.registerQueue({
      name: 'event-logs',
    }),
    PlayerModule,
    MessageModule,
    LlmModule,
    AIModule,
  ],
  controllers: [GameController],
  providers: [
    GameService,
    GameGateway,
    GameRepository,
    EventLogQueueService,
    {
      provide: GAME_REPOSITORY_TOKEN,
      useExisting: GameRepository,
    },
  ],
  exports: [GameService, GAME_REPOSITORY_TOKEN],
})
export class GameModule {}

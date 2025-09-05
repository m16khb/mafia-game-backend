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

@Module({
  imports: [
    TypeOrmModule.forFeature([Game, Player, Message, GameEvent]),
    BullModule.registerQueue({
      name: 'event-logs',
    }),
    PlayerModule,
    MessageModule,
  ],
  controllers: [GameController],
  providers: [
    GameService,
    GameGateway,
    GameRepository,
    {
      provide: GAME_REPOSITORY_TOKEN,
      useClass: GameRepository,
    },
  ],
  exports: [GameService, GAME_REPOSITORY_TOKEN],
})
export class GameModule {}

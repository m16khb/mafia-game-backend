import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Player } from '../../entities/player.entity';
import { PlayerService } from './player.service';
import { PlayerRepository } from './player.repository';
import { PLAYER_REPOSITORY_TOKEN } from '@libs/repositories';
import { LlmModule } from '../llm/llm.module';
import { GameModule } from '../game/game.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Player]),
    LlmModule,
    forwardRef(() => GameModule),
  ],
  providers: [
    PlayerService,
    PlayerRepository,
    {
      provide: PLAYER_REPOSITORY_TOKEN,
      useExisting: PlayerRepository,
    },
  ],
  exports: [PlayerService, PLAYER_REPOSITORY_TOKEN],
})
export class PlayerModule {}

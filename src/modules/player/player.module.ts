import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Player } from '../../entities/player.entity';
import { PlayerService } from './player.service';
import { PlayerRepository } from './player.repository';
import { PLAYER_REPOSITORY_TOKEN } from '@libs/repositories';

@Module({
  imports: [TypeOrmModule.forFeature([Player])],
  providers: [
    PlayerService,
    PlayerRepository,
    {
      provide: PLAYER_REPOSITORY_TOKEN,
      useClass: PlayerRepository,
    },
  ],
  exports: [PlayerService, PLAYER_REPOSITORY_TOKEN],
})
export class PlayerModule {}

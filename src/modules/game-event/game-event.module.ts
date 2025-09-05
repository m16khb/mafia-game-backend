import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bullmq";
import { GameEvent } from "../../entities/game-event.entity";
import { GameEventService } from "./game-event.service";
import { GameEventRepository } from "./game-event.repository";
import { EventLogsProcessor } from "./event-logs.processor";
import { GAME_EVENT_REPOSITORY_TOKEN } from "@libs/repositories";

@Module({
  imports: [
    TypeOrmModule.forFeature([GameEvent]),
    BullModule.registerQueue({
      name: "event-logs",
    }),
  ],
  providers: [
    GameEventService,
    GameEventRepository,
    EventLogsProcessor,
    {
      provide: GAME_EVENT_REPOSITORY_TOKEN,
      useClass: GameEventRepository,
    },
  ],
  exports: [GameEventService, GAME_EVENT_REPOSITORY_TOKEN],
})
export class GameEventModule {}

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { Game } from "./entities/game.entity";
import { GameEvent } from "./entities/game-event.entity";
import { Message } from "./entities/message.entity";
import { Player } from "./entities/player.entity";
import { GameModule } from "./modules/game/game.module";
import { PlayerModule } from "./modules/player/player.module";
import { MessageModule } from "./modules/message/message.module";
import { GameEventModule } from "./modules/game-event/game-event.module";
import { HealthModule } from "./modules/health/health.module";
import { RedisModule } from "@libs/redis/redis.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: "mysql",
        host: configService.get("DB_HOST"),
        port: +configService.get("DB_PORT"),
        username: configService.get("DB_USERNAME"),
        password: configService.get("DB_PASSWORD"),
        database: configService.get("DB_DATABASE"),
        entities: [Game, Player, Message, GameEvent],
        synchronize: configService.get("NODE_ENV") !== "prod",
        logging: configService.get("NODE_ENV") !== "prod",
      }),
      inject: [ConfigService],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get("REDIS_HOST", "localhost"),
          port: configService.get("REDIS_PORT", 6379),
        },
      }),
      inject: [ConfigService],
    }),
    GameModule,
    PlayerModule,
    MessageModule,
    GameEventModule,
    HealthModule,
    RedisModule,
  ],
})
export class AppModule {}

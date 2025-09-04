import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { Game, Player, Message, GameEvent } from './entities';
import { GameService } from './services/game.service';
import { EventLogsProcessor } from './services/event-logs.processor';
import { GameController, HealthController } from './controllers';
import { GameGateway } from './gateways/game.gateway';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';
import { RedisService } from './common/redis.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get('DB_HOST'),
        port: +configService.get('DB_PORT'),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_DATABASE'),
        entities: [Game, Player, Message, GameEvent],
        synchronize: configService.get('NODE_ENV') !== 'prod',
        logging: configService.get('NODE_ENV') !== 'prod',
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Game, Player, Message, GameEvent]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'event-logs',
    }),
  ],
  controllers: [GameController, HealthController],
  providers: [
    GameService,
    EventLogsProcessor,
    GameGateway,
    RedisService,
    {
      provide: 'APP_FILTER',
      useClass: DomainExceptionFilter,
    },
  ],
})
export class AppModule {}

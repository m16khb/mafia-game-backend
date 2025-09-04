import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisIoAdapter } from './common/redis-io.adapter';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ResponseTimeInterceptor } from './common/interceptors/response-time.interceptor';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter as BullBoardFastifyAdapter } from '@bull-board/fastify';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  // ConfigService 가져오기
  const configService = app.get(ConfigService);

  // Redis Socket.IO 어댑터 설정
  const redisIoAdapter = new RedisIoAdapter(configService);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  // CORS 설정
  await app.register(require('@fastify/cors'), {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  // 전역 ValidationPipe 설정
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // DTO에 정의되지 않은 속성 제거
      forbidNonWhitelisted: true, // DTO에 없는 속성이 있으면 에러 발생
      transform: true, // 자동 타입 변환 (string -> number 등)
      transformOptions: {
        enableImplicitConversion: true, // 암시적 타입 변환 활성화
      },
      disableErrorMessages: false, // 에러 메시지 표시 (production에서는 true 고려)
      validateCustomDecorators: true, // 커스텀 validator 활성화
      stopAtFirstError: false, // 모든 validation 에러 반환 (첫 번째만 반환하지 않음)
    }),
  );
  app.useGlobalFilters(new DomainExceptionFilter());
  app.useGlobalInterceptors(new ResponseTimeInterceptor());

  // Swagger 설정
  const config = new DocumentBuilder()
    .setTitle('Mafia Game API')
    .setDescription(
      'AI Mafia Game - Real-time multiplayer mafia game API (Layered Architecture)',
    )
    .setVersion('1.0')
    .addTag('games', 'Game management')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Bull Board 설정
  const eventLogsQueue = app.get<Queue>(getQueueToken('event-logs'));

  const serverAdapter = new BullBoardFastifyAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [new BullMQAdapter(eventLogsQueue)],
    serverAdapter,
  });

  await app.register(serverAdapter.registerPlugin(), {
    prefix: '/admin/queues',
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  console.log(
    `🚀 Mafia Game Backend (Layered Architecture) running on port ${port} with Fastify & Redis Socket.IO`,
  );
  console.log(`📊 Bull Board UI: http://localhost:${port}/admin/queues`);
}

bootstrap();

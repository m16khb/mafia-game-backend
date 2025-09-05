import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;
  private readonly logger = new Logger(RedisIoAdapter.name);

  constructor(app: any, private readonly configService: ConfigService) {
    super(app);
    this.logger.log('RedisIoAdapter initialized.');
  }

  async connectToRedis(): Promise<void> {
    this.logger.log('Attempting to connect to Redis...');
    const pubClient = createClient({
      socket: {
        host: this.configService.get<string>('REDIS_HOST') || 'localhost',
        port: this.configService.get<number>('REDIS_PORT') || 6379,
      },
    });

    const subClient = pubClient.duplicate();

    let attempt = 0;
    const maxRetries = this.configService.get<number>('REDIS_MAX_RETRIES') || 5;
    const baseDelayMs =
      this.configService.get<number>('REDIS_BASE_DELAY_MS') || 500;
    while (attempt < maxRetries) {
      try {
        await Promise.all([pubClient.connect(), subClient.connect()]);
        this.logger.log('Successfully connected to Redis.');
        break;
      } catch (err) {
        attempt += 1;
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        this.logger.error(
          `Socket.IO Redis adapter connect failed (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms`,
          err,
        );
        await new Promise((res) => setTimeout(res, delay));
      }
    }

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const corsOptions = {
      origin: this.configService.get('FRONTEND_URL') || 'http://localhost:3001',
      credentials: true,
    };

    const serverOptions: ServerOptions = {
      ...options,
      cors: corsOptions,
      transports: ['websocket', 'polling'],
      allowEIO3: true,
    };

    const server = super.createIOServer(port, serverOptions);
    
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
      this.logger.log('Using Redis adapter for Socket.IO.');
    } else {
      // 폴백: 단일 노드 모드 (in-memory adapter)
      this.logger.warn(
        'Redis adapter unavailable. Falling back to in-memory Socket.IO adapter.',
      );
    }
    
    server.engine.generateId = () => {
      return Math.random().toString(36).substr(2, 9);
    };
    
    return server;
  }
}

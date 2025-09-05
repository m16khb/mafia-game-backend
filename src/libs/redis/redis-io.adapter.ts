import { IoAdapter } from "@nestjs/platform-socket.io";
import { ServerOptions } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { ConfigService } from "@nestjs/config";

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async connectToRedis(): Promise<void> {
    const pubClient = createClient({
      socket: {
        host: this.configService.get<string>("REDIS_HOST") || "localhost",
        port: this.configService.get<number>("REDIS_PORT") || 6379,
      },
    });

    const subClient = pubClient.duplicate();

    let attempt = 0;
    const maxRetries = this.configService.get<number>("REDIS_MAX_RETRIES") || 5;
    const baseDelayMs =
      this.configService.get<number>("REDIS_BASE_DELAY_MS") || 500;
    while (attempt < maxRetries) {
      try {
        await Promise.all([pubClient.connect(), subClient.connect()]);
        break;
      } catch (err) {
        attempt += 1;
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.error(
          `Socket.IO Redis adapter connect failed (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms`,
          err,
        );
        await new Promise((res) => setTimeout(res, delay));
      }
    }

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    } else {
      // 폴백: 단일 노드 모드 (in-memory adapter)
      console.warn(
        "Redis adapter unavailable. Falling back to in-memory Socket.IO adapter.",
      );
    }
    return server;
  }
}

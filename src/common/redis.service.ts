import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, RedisClientType } from "redis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client: RedisClientType;
  private subscriber: RedisClientType;

  constructor(private configService: ConfigService) {
    const redisConfig = {
      socket: {
        host: this.configService.get<string>("REDIS_HOST") || "localhost",
        port: this.configService.get<number>("REDIS_PORT") || 6379,
      },
    };

    this.client = createClient(redisConfig);
    this.subscriber = createClient(redisConfig);

    this.client.on("error", (err) => {
      console.error("Redis Client Error:", err);
    });

    this.subscriber.on("error", (err) => {
      console.error("Redis Subscriber Error:", err);
    });

    this.client.on("connect", () => {
      console.log("📦 Redis connected");
    });

    this.connectWithRetry();
  }

  private async connectWithRetry(): Promise<void> {
    const maxRetries = this.configService.get<number>("REDIS_MAX_RETRIES") || 5;
    let attempt = 0;
    const baseDelayMs =
      this.configService.get<number>("REDIS_BASE_DELAY_MS") || 500;
    while (attempt < maxRetries) {
      try {
        await this.client.connect();
        await this.subscriber.connect();
        console.log("📦 Redis connected (publisher & subscriber)");
        return;
      } catch (error) {
        attempt += 1;
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.error(
          `Failed to connect to Redis (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms`,
          error,
        );
        await new Promise((res) => setTimeout(res, delay));
      }
    }
    console.error(
      "Exceeded maximum Redis connection retries. Continuing without Redis.",
    );
  }

  async onModuleDestroy() {
    await this.client.quit();
    await this.subscriber.quit();
  }

  getClient(): RedisClientType {
    return this.client;
  }

  getSubscriber(): RedisClientType {
    return this.subscriber;
  }

  // 기본 Redis 작업들
  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setEx(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async del(key: string): Promise<number> {
    return await this.client.del(key);
  }

  async exists(key: string): Promise<number> {
    return await this.client.exists(key);
  }

  // JSON 데이터 저장/조회
  async setJson<T>(key: string, value: T, ttl?: number): Promise<void> {
    const jsonValue = JSON.stringify(value);
    await this.set(key, jsonValue, ttl);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    return value ? JSON.parse(value) : null;
  }

  // Hash 작업들 (게임 상태 저장에 유용)
  async hSet(key: string, field: string, value: string): Promise<number> {
    return await this.client.hSet(key, field, value);
  }

  async hGet(key: string, field: string): Promise<string | undefined> {
    return await this.client.hGet(key, field);
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    return await this.client.hGetAll(key);
  }

  async hDel(key: string, field: string): Promise<number> {
    return await this.client.hDel(key, field);
  }

  // Set 작업들 (플레이어 목록 관리에 유용)
  async sAdd(key: string, member: string): Promise<number> {
    return await this.client.sAdd(key, member);
  }

  async sRem(key: string, member: string): Promise<number> {
    return await this.client.sRem(key, member);
  }

  async sMembers(key: string): Promise<string[]> {
    return await this.client.sMembers(key);
  }

  async sIsMember(key: string, member: string): Promise<boolean> {
    return await this.client.sIsMember(key, member);
  }

  // 게임별 키 생성 유틸리티
  getGameKey(gameId: string): string {
    return `game:${gameId}`;
  }

  getPlayerKey(gameId: string, playerId: string): string {
    return `game:${gameId}:player:${playerId}`;
  }

  getGamePlayersKey(gameId: string): string {
    return `game:${gameId}:players`;
  }

  getGameMessagesKey(gameId: string): string {
    return `game:${gameId}:messages`;
  }
}

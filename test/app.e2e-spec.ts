import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "./../src/app.module";
import { getQueueToken } from "@nestjs/bullmq";
import { Queue, QueueEvents } from "bullmq";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Game } from "../src/entities/game.entity";
import { GameEvent } from "../src/entities/game-event.entity";

describe("AppController (e2e)", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("enqueue -> append smoke", async () => {
    const queue = app.get<Queue>(getQueueToken("event-logs"));
    const eventRepo = app.get<Repository<GameEvent>>(
      getRepositoryToken(GameEvent),
    );

    const queueEvents = new QueueEvents("event-logs", {
      connection: {
        host: process.env.REDIS_HOST || "localhost",
        port: Number(process.env.REDIS_PORT || 6379),
      },
    });
    await queueEvents.waitUntilReady();

    // ensure FK: seed minimal game row
    const gameRepo = app.get<Repository<Game>>(getRepositoryToken(Game));
    const savedGame = await gameRepo.save({
      name: "test",
      status: "waiting" as any,
      currentPhase: "day" as any,
      dayCount: 1,
      remainingTime: 0,
    });

    const before = await eventRepo.count();

    const job = await queue.add("append", {
      gameId: savedGame.id,
      type: "game-started",
      payload: { ok: true },
    });

    await job.waitUntilFinished(queueEvents, 8000);
    await queueEvents.close();
    const after = await eventRepo.count();
    expect(after).toBeGreaterThan(before);
  });
});

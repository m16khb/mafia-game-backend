import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger, Inject } from "@nestjs/common";
import { Job } from "bullmq";
import {
  IGameEventRepository,
  GAME_EVENT_REPOSITORY_TOKEN,
} from "@libs/repositories";

interface EventLogJobData {
  gameId: number;
  eventType: string;
  eventData?: Record<string, any>;
}

@Processor("event-logs")
@Injectable()
export class EventLogsProcessor extends WorkerHost {
  private readonly logger = new Logger(EventLogsProcessor.name);

  constructor(
    @Inject(GAME_EVENT_REPOSITORY_TOKEN)
    private readonly gameEventRepository: IGameEventRepository,
  ) {
    super();
  }

  async process(job: Job<EventLogJobData, any, string>): Promise<void> {
    this.logger.log(`Processing event log job: ${job.id}`);

    try {
      const { gameId, eventType, eventData } = job.data;

      // GameEvent 엔티티 생성 및 저장
      const gameEvent = this.gameEventRepository.create({
        gameId,
        eventType,
        eventData: eventData || {},
      });

      const savedEvent = await this.gameEventRepository.save(gameEvent);

      this.logger.log(
        `Event log saved: ${savedEvent.id} - ${eventType} for game ${gameId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process event log job ${job.id}:`,
        error.stack,
      );
      throw error; // Re-throw to mark job as failed
    }
  }
}

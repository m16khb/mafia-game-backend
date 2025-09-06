import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  IGameEventRepository,
  GAME_EVENT_REPOSITORY_TOKEN,
} from '@libs/repositories';
import { Logger } from '@/libs/logger/logger.service';
import { ClsService } from 'nestjs-cls';

interface EventLogJobData {
  gameId: number;
  eventType: string;
  eventData?: Record<string, any>;
  requestContext?: string;
}

@Processor('event-logs')
@Injectable()
export class EventLogsProcessor extends WorkerHost {
  constructor(
    @Inject(GAME_EVENT_REPOSITORY_TOKEN)
    private readonly gameEventRepository: IGameEventRepository,
    private readonly logger: Logger,
    private readonly cls: ClsService,
  ) {
    super();
    this.logger.setContext(EventLogsProcessor.name);
  }

  async process(job: Job<EventLogJobData, any, string>): Promise<void> {
    // CLS 컨텍스트를 새로 생성하여 request-context 설정
    const { requestContext } = job.data;
    
    return this.cls.run(async () => {
      if (requestContext) {
        this.cls.set('request-context', requestContext);
      }

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
        this.logger.error(error, `Failed to process event log job ${job.id}:`);
        throw error; // Re-throw to mark job as failed
      }
    });
  }
}

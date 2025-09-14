import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class EventLogQueueService {
  constructor(
    @InjectQueue('event-logs')
    private readonly eventLogsQueue: Queue,
    private readonly cls: ClsService,
  ) {}

  async addEventLogJob(
    gameId: number,
    eventType: string,
    eventData?: Record<string, any>,
  ): Promise<void> {
    try {
      const requestContext = this.cls.get('request-context');
      await this.eventLogsQueue.add(
        'append',
        {
          gameId,
          eventType,
          eventData,
          requestContext,
        },
        {
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    } catch (error) {
      console.error(`Failed to add event log job: ${error.message}`);
    }
  }
}

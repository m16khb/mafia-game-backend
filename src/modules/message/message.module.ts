import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from '../../entities/message.entity';
import { MessageService } from './message.service';
import { MessageRepository } from './message.repository';
import { MESSAGE_REPOSITORY_TOKEN } from '@libs/repositories';

@Module({
  imports: [TypeOrmModule.forFeature([Message])],
  providers: [
    MessageService,
    MessageRepository,
    {
      provide: MESSAGE_REPOSITORY_TOKEN,
      useExisting: MessageRepository,
    },
  ],
  exports: [MessageService, MESSAGE_REPOSITORY_TOKEN],
})
export class MessageModule {}

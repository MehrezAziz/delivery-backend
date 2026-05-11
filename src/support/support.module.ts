import { Module } from '@nestjs/common';
import { SupportService } from './support.service';
import { SupportTicketController, CSSupportTicketController } from './support.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AiSupportModule } from '../ai-support/ai-support.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, AiSupportModule, NotificationsModule],
  controllers: [SupportTicketController, CSSupportTicketController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}

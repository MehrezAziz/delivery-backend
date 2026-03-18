import { Module } from '@nestjs/common';
import { SupportService } from './support.service';
import { SupportTicketController, CSSupportTicketController } from './support.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SupportTicketController, CSSupportTicketController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}

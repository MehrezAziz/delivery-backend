import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GroqClientService } from './groq-client.service';
import { AiSupportToolsService } from './ai-support-tools.service';
import { AiSupportOrchestratorService } from './ai-support-orchestrator.service';
import { AiSupportConfigService } from './ai-support-config.service';
import { AiSupportAnalyticsService } from './ai-support-analytics.service';
import { AiSupportAdminController } from './ai-support-admin.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AiSupportAdminController],
  providers: [
    GroqClientService,
    AiSupportToolsService,
    AiSupportOrchestratorService,
    AiSupportConfigService,
    AiSupportAnalyticsService,
  ],
  exports: [AiSupportOrchestratorService, GroqClientService, AiSupportConfigService, AiSupportAnalyticsService],
})
export class AiSupportModule {}

import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtSuperUserGuard, AdminGuard } from '../auth/guards/auth.guards';
import { CurrentSuperUser } from '../auth/decorators/auth.decorators';
import type { AuthenticatedSuperUser } from '../auth/dto/jwt-payload.interface';
import { AiSupportConfigService } from './ai-support-config.service';
import { AiSupportAnalyticsService } from './ai-support-analytics.service';
import { PatchAiSupportSettingsDto } from './dto/ai-support-admin.dto';

@Controller('admin/ai-support')
@UseGuards(JwtSuperUserGuard, AdminGuard)
export class AiSupportAdminController {
  constructor(
    private readonly aiSupportConfig: AiSupportConfigService,
    private readonly analytics: AiSupportAnalyticsService,
  ) {}

  @Get('settings')
  async getSettings() {
    return this.aiSupportConfig.getAdminSettings();
  }

  @Patch('settings')
  async patchSettings(
    @CurrentSuperUser() superUser: AuthenticatedSuperUser,
    @Body() dto: PatchAiSupportSettingsDto,
  ) {
    return this.aiSupportConfig.setRuntimeEnabled(dto.enabled, superUser.id);
  }

  @Get('analytics')
  async getAnalytics(@Query('days') days?: string) {
    const d = Math.min(Math.max(parseInt(days ?? '30', 10) || 30, 1), 365);
    return this.analytics.getAnalytics(d);
  }

  @Get('tool-logs')
  async getToolLogs(
    @Query('limit') limit?: string,
    @Query('ticketId') ticketId?: string,
  ) {
    const lim = Math.min(Math.max(parseInt(limit ?? '80', 10) || 80, 1), 200);
    return this.analytics.getToolLogs({ limit: lim, ticketId: ticketId || undefined });
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { GroqClientService } from './groq-client.service';

const CONFIG_KEY = 'ai_support_enabled';
const CATEGORY = 'AI';

@Injectable()
export class AiSupportConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly groq: GroqClientService,
  ) {}

  private envWantsAi(): boolean {
    const v = (this.config.get<string>('AI_SUPPORT_ENABLED') ?? '').toLowerCase().trim();
    return v === '1' || v === 'true' || v === 'on' || v === 'yes';
  }

  /**
   * Effective enable: GROQ key + env flag + runtime DB switch (admin can set false without redeploy).
   */
  async isEnabled(): Promise<boolean> {
    if (!this.groq.isConfigured()) return false;
    if (!this.envWantsAi()) return false;
    const row = await this.prisma.systemConfig.findUnique({ where: { key: CONFIG_KEY } });
    if (row && row.value.toLowerCase() === 'false') return false;
    return true;
  }

  async getAdminSettings() {
    const row = await this.prisma.systemConfig.findUnique({ where: { key: CONFIG_KEY } });
    const envEnabled = this.envWantsAi();
    const runtimeExplicitFalse = row?.value.toLowerCase() === 'false';
    const effective = await this.isEnabled();
    return {
      effectiveEnabled: effective,
      envEnabled,
      groqConfigured: this.groq.isConfigured(),
      /** Admin toggle: when null, runtime does not force off (follows env). */
      runtimeDisabledByAdmin: runtimeExplicitFalse,
      model: this.groq.model,
    };
  }

  async setRuntimeEnabled(enabled: boolean, updatedBySuperUserId?: string) {
    await this.prisma.systemConfig.upsert({
      where: { key: CONFIG_KEY },
      create: {
        key: CONFIG_KEY,
        value: enabled ? 'true' : 'false',
        category: CATEGORY,
        description: 'When false, AI assistant is off regardless of AI_SUPPORT_ENABLED (unless env is off).',
        updatedBy: updatedBySuperUserId,
      },
      update: {
        value: enabled ? 'true' : 'false',
        updatedBy: updatedBySuperUserId,
      },
    });
    return this.getAdminSettings();
  }
}

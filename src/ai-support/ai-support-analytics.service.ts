import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AiSupportAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [feedbackGroups, toolGroups, escalations, ticketsWithBot, totalToolCalls] = await Promise.all([
      this.prisma.aiSupportFeedback.groupBy({
        by: ['helpful'],
        _count: { id: true },
        where: { createdAt: { gte: since } },
      }),
      this.prisma.aiSupportToolLog.groupBy({
        by: ['toolName'],
        _count: { id: true },
        where: { createdAt: { gte: since } },
      }),
      this.prisma.supportTicket.count({
        where: {
          humanEscalationNotifiedAt: { gte: since },
        },
      }),
      this.prisma.supportMessage.count({
        where: {
          senderType: 'BOT',
          timestamp: { gte: since },
        },
      }),
      this.prisma.aiSupportToolLog.count({
        where: { createdAt: { gte: since } },
      }),
    ]);

    const toolSuccess = await this.prisma.aiSupportToolLog.groupBy({
      by: ['success'],
      _count: { id: true },
      where: { createdAt: { gte: since } },
    });

    let helpfulYes = 0;
    let helpfulNo = 0;
    for (const row of feedbackGroups) {
      if (row.helpful) helpfulYes = row._count.id;
      else helpfulNo = row._count.id;
    }

    const toolByName = toolGroups.map((g) => ({
      toolName: g.toolName,
      count: g._count.id,
    }));

    let toolOk = 0;
    let toolFail = 0;
    for (const row of toolSuccess) {
      if (row.success) toolOk = row._count.id;
      else toolFail = row._count.id;
    }

    return {
      periodDays: days,
      since: since.toISOString(),
      feedback: {
        helpful: helpfulYes,
        notHelpful: helpfulNo,
        total: helpfulYes + helpfulNo,
      },
      escalationsWithHumanRequest: escalations,
      botMessages: ticketsWithBot,
      toolCalls: {
        total: totalToolCalls,
        success: toolOk,
        failure: toolFail,
        byTool: toolByName.sort((a, b) => b.count - a.count),
      },
    };
  }

  async getToolLogs(query: { limit?: number; ticketId?: string }) {
    const limit = Math.min(Math.max(query.limit ?? 80, 1), 200);
    return this.prisma.aiSupportToolLog.findMany({
      where: query.ticketId ? { ticketId: query.ticketId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

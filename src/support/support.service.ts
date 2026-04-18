import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto, SendMessageDto, AiFeedbackDto } from './dto/support.dto';
import { SupportTicketStatus } from '@prisma/client';
import { AiSupportOrchestratorService } from '../ai-support/ai-support-orchestrator.service';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly aiSupport: AiSupportOrchestratorService,
  ) {}

  // ============================================
  // USER-FACING (Customer / Driver)
  // ============================================

  async createTicket(userId: string, dto: CreateTicketDto) {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId,
        category: dto.category,
        priority: dto.priority,
        description: dto.description,
      },
      include: { messages: true },
    });
    this.eventEmitter.emit('support.new_ticket', { ticketId: ticket.id, userId });
    return ticket;
  }

  async getUserTickets(userId: string) {
    return this.prisma.supportTicket.findMany({
      where: { userId },
      include: {
        customerService: { include: { superUser: { select: { pseudo: true } } } },
        messages: { orderBy: { timestamp: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTicketWithMessages(ticketId: string, userId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        user: { select: { id: true, firstName: true, secondName: true, role: true } },
        customerService: { include: { superUser: { select: { pseudo: true } } } },
        messages: { orderBy: { timestamp: 'asc' } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.userId !== userId) throw new ForbiddenException('Not your ticket');
    return ticket;
  }

  async sendUserMessage(ticketId: string, userId: string, dto: SendMessageDto) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: { customerService: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.userId !== userId) throw new ForbiddenException('Not your ticket');
    if (ticket.status === 'CLOSED') throw new ForbiddenException('Ticket is closed');

    const message = await this.prisma.supportMessage.create({
      data: {
        ticketId,
        senderId: userId,
        senderType: 'USER',
        content: dto.content,
        image: dto.image,
      },
    });

    this.eventEmitter.emit('support.customer_replied', { ticketId });

    let botMessage: Awaited<ReturnType<AiSupportOrchestratorService['handleUserMessage']>> = null;
    if (!ticket.assignedTo && (await this.aiSupport.canRunAiSupport())) {
      try {
        botMessage = await this.aiSupport.handleUserMessage({
          ticketId,
          userId,
          userMessageContent: dto.content,
        });
      } catch (e) {
        this.logger.warn(`AI support orchestration failed: ${(e as Error).message}`);
      }
    }

    return { message, botMessage };
  }

  /**
   * Same as sendUserMessage but emits SSE: user_message, chunk (optional), done.
   */
  async sendUserMessageStream(
    ticketId: string,
    userId: string,
    dto: SendMessageDto,
    emit: (event: string, data: Record<string, unknown>) => void,
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: { customerService: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.userId !== userId) throw new ForbiddenException('Not your ticket');
    if (ticket.status === 'CLOSED') throw new ForbiddenException('Ticket is closed');

    const message = await this.prisma.supportMessage.create({
      data: {
        ticketId,
        senderId: userId,
        senderType: 'USER',
        content: dto.content,
        image: dto.image,
      },
    });

    this.eventEmitter.emit('support.customer_replied', { ticketId });

    emit('user_message', { message });

    let botMessage: Awaited<ReturnType<AiSupportOrchestratorService['handleUserMessage']>> = null;
    if (!ticket.assignedTo && (await this.aiSupport.canRunAiSupport())) {
      try {
        botMessage = await this.aiSupport.handleUserMessage({
          ticketId,
          userId,
          userMessageContent: dto.content,
          onStreamChunk: async (chunk: string) => {
            emit('chunk', { text: chunk });
          },
        });
      } catch (e) {
        this.logger.warn(`AI support stream orchestration failed: ${(e as Error).message}`);
      }
    }

    emit('done', { botMessage: botMessage ?? null });
  }

  async submitAiFeedback(ticketId: string, userId: string, dto: AiFeedbackDto) {
    const msg = await this.prisma.supportMessage.findFirst({
      where: {
        id: dto.messageId,
        ticketId,
        senderType: 'BOT',
      },
    });
    if (!msg) throw new NotFoundException('Bot message not found');

    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.userId !== userId) throw new ForbiddenException('Not your ticket');

    await this.prisma.aiSupportFeedback.upsert({
      where: { messageId: dto.messageId },
      create: {
        messageId: dto.messageId,
        ticketId,
        userId,
        helpful: dto.helpful,
      },
      update: { helpful: dto.helpful },
    });

    if (!dto.helpful) {
      const negativeCount = await this.prisma.aiSupportFeedback.count({
        where: { ticketId, helpful: false },
      });
      if (negativeCount === 2) {
        this.eventEmitter.emit('support.ai_negative_feedback_twice', { ticketId, userId });
      }
    }

    return { success: true };
  }

  /**
   * Generate a bot reply for the latest user message without creating a new user row.
   * Used when the mobile client could not read the SSE stream but the user message was already persisted.
   */
  async generateAiFollowup(ticketId: string, userId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        messages: { orderBy: { timestamp: 'asc' } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.userId !== userId) throw new ForbiddenException('Not your ticket');
    if (ticket.assignedTo) throw new ForbiddenException('Ticket is assigned; AI is disabled');
    if (ticket.status === 'CLOSED') throw new ForbiddenException('Ticket is closed');

    const last = ticket.messages[ticket.messages.length - 1];
    if (!last || last.senderType !== 'USER' || last.senderId !== userId) {
      throw new BadRequestException('No pending user message to answer');
    }

    let botMessage: Awaited<ReturnType<AiSupportOrchestratorService['handleUserMessage']>> = null;
    if (await this.aiSupport.canRunAiSupport()) {
      try {
        botMessage = await this.aiSupport.handleUserMessage({
          ticketId,
          userId,
          userMessageContent: last.content,
        });
      } catch (e) {
        this.logger.warn(`AI follow-up failed: ${(e as Error).message}`);
      }
    }

    return { botMessage };
  }

  // ============================================
  // CUSTOMER SERVICE-FACING
  // ============================================

  async getAllTickets(filters?: { status?: SupportTicketStatus }) {
    return this.prisma.supportTicket.findMany({
      where: filters?.status ? { status: filters.status } : undefined,
      include: {
        user: { select: { id: true, firstName: true, secondName: true, role: true, phone: true } },
        customerService: { include: { superUser: { select: { pseudo: true } } } },
        messages: { orderBy: { timestamp: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTicketForCS(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        user: { select: { id: true, firstName: true, secondName: true, role: true, phone: true, image: true } },
        customerService: { include: { superUser: { select: { pseudo: true } } } },
        messages: { orderBy: { timestamp: 'asc' } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async assignTicket(ticketId: string, customerServiceId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    // Get the superUserId for the CS agent
    const csAgent = await this.prisma.customerService.findUnique({
      where: { id: customerServiceId },
      select: { superUserId: true },
    });

    const updated = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        assignedTo: customerServiceId,
        status: ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status,
      },
      include: {
        user: { select: { id: true, firstName: true, secondName: true, role: true } },
        customerService: { include: { superUser: { select: { pseudo: true } } } },
      },
    });

    // Notify the assigned CS agent
    if (csAgent) {
      this.eventEmitter.emit('support.ticket_assigned', {
        ticketId,
        csAgentSuperUserId: csAgent.superUserId,
      });
    }

    return updated;
  }

  async sendCSMessage(ticketId: string, superUserId: string, customerServiceId: string, dto: SendMessageDto) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === 'CLOSED') throw new ForbiddenException('Ticket is closed');

    // Auto-assign if not assigned yet
    if (!ticket.assignedTo) {
      await this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { assignedTo: customerServiceId, status: 'IN_PROGRESS' },
      });
    }

    const message = await this.prisma.supportMessage.create({
      data: {
        ticketId,
        senderId: superUserId,
        senderType: 'CUSTOMER_SERVICE',
        content: dto.content,
        image: dto.image,
      },
    });

    this.eventEmitter.emit('support.ticket_reply', { ticketId });

    return message;
  }

  async closeTicket(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: 'CLOSED', resolvedAt: new Date() },
    });
  }

  async reopenTicket(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: 'IN_PROGRESS', resolvedAt: null },
    });
  }

  // Mark messages as read
  async markMessagesRead(ticketId: string, readerType: 'USER' | 'CUSTOMER_SERVICE') {
    // Mark messages from the OTHER side as read (BOT counts as support-side for USER readers)
    await this.prisma.supportMessage.updateMany({
      where: {
        ticketId,
        readAt: null,
        senderType:
          readerType === 'USER'
            ? { in: ['CUSTOMER_SERVICE', 'BOT'] }
            : 'USER',
      },
      data: { readAt: new Date() },
    });
  }
}

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto, SendMessageDto } from './dto/support.dto';
import { SupportTicketStatus } from '@prisma/client';

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
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

    // Notify assigned CS agent about customer reply
    if (ticket.customerService) {
      this.eventEmitter.emit('support.customer_replied', {
        ticketId,
        csAgentSuperUserId: ticket.customerService.superUserId,
      });
    }

    return message;
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

    // Notify user about CS reply
    this.eventEmitter.emit('support.ticket_reply', { ticketId, userId: ticket.userId });

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
    // Mark messages from the OTHER side as read
    const senderType = readerType === 'USER' ? 'CUSTOMER_SERVICE' : 'USER';
    await this.prisma.supportMessage.updateMany({
      where: { ticketId, senderType, readAt: null },
      data: { readAt: new Date() },
    });
  }
}

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto, SendMessageDto } from './dto/support.dto';
import { SupportTicketStatus } from '@prisma/client';

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // USER-FACING (Customer / Driver)
  // ============================================

  async createTicket(userId: string, dto: CreateTicketDto) {
    return this.prisma.supportTicket.create({
      data: {
        userId,
        category: dto.category,
        priority: dto.priority,
        description: dto.description,
      },
      include: { messages: true },
    });
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
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.userId !== userId) throw new ForbiddenException('Not your ticket');
    if (ticket.status === 'CLOSED') throw new ForbiddenException('Ticket is closed');

    return this.prisma.supportMessage.create({
      data: {
        ticketId,
        senderId: userId,
        senderType: 'USER',
        content: dto.content,
        image: dto.image,
      },
    });
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

    return this.prisma.supportTicket.update({
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

    return this.prisma.supportMessage.create({
      data: {
        ticketId,
        senderId: superUserId,
        senderType: 'CUSTOMER_SERVICE',
        content: dto.content,
        image: dto.image,
      },
    });
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

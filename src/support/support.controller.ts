import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { SupportService } from './support.service';
import { AiFeedbackDto, CreateTicketDto, SendMessageDto } from './dto/support.dto';
import { JwtUserGuard, JwtSuperUserGuard, CustomerServiceGuard } from '../auth/guards/auth.guards';
import { CurrentUser, CurrentSuperUser } from '../auth/decorators/auth.decorators';
import type { AuthenticatedUser, AuthenticatedSuperUser } from '../auth/dto/jwt-payload.interface';
import { SupportTicketStatus } from '@prisma/client';

// ============================================
// USER ENDPOINTS (Customer / Driver)
// ============================================

@Controller('support/tickets')
@UseGuards(JwtUserGuard)
export class SupportTicketController {
  constructor(private readonly supportService: SupportService) {}

  @Post()
  async createTicket(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTicketDto,
  ) {
    return this.supportService.createTicket(user.id, dto);
  }

  @Get()
  async getMyTickets(@CurrentUser() user: AuthenticatedUser) {
    return this.supportService.getUserTickets(user.id);
  }

  @Get(':id')
  async getTicket(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.supportService.getTicketWithMessages(id, user.id);
  }

  @Post(':id/messages/stream')
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  async sendMessageStream(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @Res({ passthrough: false }) res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    (res as Response & { flushHeaders?: () => void }).flushHeaders?.();
    await this.supportService.sendUserMessageStream(id, user.id, dto, (event, data) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    });
    res.end();
  }

  @Post(':id/messages')
  @Throttle({ default: { limit: 25, ttl: 60000 } })
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.supportService.sendUserMessage(id, user.id, dto);
  }

  @Post(':id/ai-feedback')
  async submitAiFeedback(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AiFeedbackDto,
  ) {
    return this.supportService.submitAiFeedback(id, user.id, dto);
  }

  /** When SSE could not be read on the client but the user message exists — run AI once without duplicating the user message. */
  @Post(':id/ai-followup')
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  async aiFollowup(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.supportService.generateAiFollowup(id, user.id);
  }

  @Patch(':id/read')
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.supportService.markMessagesRead(id, 'USER');
    return { success: true };
  }
}

// ============================================
// CUSTOMER SERVICE ENDPOINTS
// ============================================

@Controller('cs/support/tickets')
@UseGuards(JwtSuperUserGuard, CustomerServiceGuard)
export class CSSupportTicketController {
  constructor(private readonly supportService: SupportService) {}

  @Get()
  async getAllTickets(@Query('status') status?: SupportTicketStatus) {
    return this.supportService.getAllTickets(status ? { status } : undefined);
  }

  @Get(':id')
  async getTicket(@Param('id') id: string) {
    return this.supportService.getTicketForCS(id);
  }

  @Patch(':id/assign')
  async assignTicket(
    @CurrentSuperUser() superUser: AuthenticatedSuperUser,
    @Param('id') id: string,
  ) {
    return this.supportService.assignTicket(id, superUser.profileId);
  }

  @Post(':id/messages')
  async sendMessage(
    @CurrentSuperUser() superUser: AuthenticatedSuperUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.supportService.sendCSMessage(id, superUser.id, superUser.profileId, dto);
  }

  @Patch(':id/close')
  async closeTicket(@Param('id') id: string) {
    return this.supportService.closeTicket(id);
  }

  @Patch(':id/reopen')
  async reopenTicket(@Param('id') id: string) {
    return this.supportService.reopenTicket(id);
  }

  @Patch(':id/read')
  async markRead(@Param('id') id: string) {
    await this.supportService.markMessagesRead(id, 'CUSTOMER_SERVICE');
    return { success: true };
  }
}

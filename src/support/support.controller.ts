import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { SupportService } from './support.service';
import { CreateTicketDto, SendMessageDto } from './dto/support.dto';
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

  @Post(':id/messages')
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.supportService.sendUserMessage(id, user.id, dto);
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

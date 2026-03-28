import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications.service';

@Injectable()
export class SupportNotificationListener {
  constructor(private notificationsService: NotificationsService) {}

  @OnEvent('support.new_ticket')
  async handleNewTicket(payload: { ticketId: string; userId: string }) {
    // Notify CS agents with MANAGE_SUPPORT_TICKETS permission
    await this.notificationsService.sendToCSWithPermission(
      'MANAGE_SUPPORT_TICKETS',
      NotificationType.NEW_SUPPORT_TICKET,
      { relatedEntityType: 'SupportTicket', relatedEntityId: payload.ticketId },
    );
  }

  @OnEvent('support.ticket_assigned')
  async handleTicketAssigned(payload: { ticketId: string; csAgentSuperUserId: string }) {
    await this.notificationsService.send({
      userId: payload.csAgentSuperUserId,
      userType: 'SUPER_USER',
      type: NotificationType.TICKET_ASSIGNED,
      relatedEntityType: 'SupportTicket',
      relatedEntityId: payload.ticketId,
    });
  }

  @OnEvent('support.ticket_reply')
  async handleTicketReply(payload: { ticketId: string; userId: string }) {
    await this.notificationsService.send({
      userId: payload.userId,
      userType: 'USER',
      type: NotificationType.SUPPORT_TICKET_REPLY,
      relatedEntityType: 'SupportTicket',
      relatedEntityId: payload.ticketId,
    });
  }

  @OnEvent('support.customer_replied')
  async handleCustomerReplied(payload: { ticketId: string; csAgentSuperUserId: string }) {
    await this.notificationsService.send({
      userId: payload.csAgentSuperUserId,
      userType: 'SUPER_USER',
      type: NotificationType.CUSTOMER_REPLIED_TICKET,
      relatedEntityType: 'SupportTicket',
      relatedEntityId: payload.ticketId,
    });
  }

  @OnEvent('dispute.opened')
  async handleDisputeOpened(payload: { disputeId: string; customerUserId: string; orderId: string }) {
    // Notify customer
    await this.notificationsService.send({
      userId: payload.customerUserId,
      userType: 'USER',
      type: NotificationType.DISPUTE_OPENED,
      relatedEntityType: 'Dispute',
      relatedEntityId: payload.disputeId,
    });

    // Notify admins
    await this.notificationsService.sendToAllAdmins(NotificationType.NEW_DISPUTE_CREATED, {
      relatedEntityType: 'Dispute',
      relatedEntityId: payload.disputeId,
    });
  }

  @OnEvent('dispute.resolved')
  async handleDisputeResolved(payload: { disputeId: string; customerUserId: string }) {
    await this.notificationsService.send({
      userId: payload.customerUserId,
      userType: 'USER',
      type: NotificationType.DISPUTE_RESOLVED,
      relatedEntityType: 'Dispute',
      relatedEntityId: payload.disputeId,
    });
  }

  @OnEvent('dispute.assigned')
  async handleDisputeAssigned(payload: { disputeId: string; csAgentSuperUserId: string }) {
    await this.notificationsService.send({
      userId: payload.csAgentSuperUserId,
      userType: 'SUPER_USER',
      type: NotificationType.DISPUTE_ASSIGNED,
      relatedEntityType: 'Dispute',
      relatedEntityId: payload.disputeId,
    });
  }
}

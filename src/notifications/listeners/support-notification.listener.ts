import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationPriority, NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications.service';

@Injectable()
export class SupportNotificationListener {
  constructor(private notificationsService: NotificationsService) {}

  @OnEvent('support.ai_negative_feedback_twice')
  async handleAiNegativeFeedbackTwice(payload: { ticketId: string; userId: string }) {
    await this.notificationsService.sendToAllAdmins(NotificationType.SUPPORT_HUMAN_REQUESTED, {
      title: 'AI support rated not helpful twice',
      body: `Ticket ${payload.ticketId}: the user gave two negative helpfulness ratings on bot replies. Please review the conversation.`,
      priority: NotificationPriority.HIGH,
      relatedEntityType: 'SupportTicket',
      relatedEntityId: payload.ticketId,
    });
    const govIds = await this.notificationsService.getGovernorateIdsForSupportTicket(
      payload.ticketId,
      payload.userId,
    );
    // Security: do NOT fallback to all CS here; notify only CS with permission and matching governorate coverage.
    if (govIds.length > 0) {
      await this.notificationsService.sendToCsWithPermissionForGovernorates(
        govIds,
        'MANAGE_SUPPORT_TICKETS',
        NotificationType.SUPPORT_HUMAN_REQUESTED,
        {
          title: 'AI support rated not helpful twice',
          body: `Ticket ${payload.ticketId}: two "not helpful" ratings on AI replies.`,
          priority: NotificationPriority.HIGH,
          relatedEntityType: 'SupportTicket',
          relatedEntityId: payload.ticketId,
        },
      );
    }
  }

  @OnEvent('support.human_requested')
  async handleHumanRequested(payload: { ticketId: string; userId: string }) {
    await this.notificationsService.sendToAllAdmins(NotificationType.SUPPORT_HUMAN_REQUESTED, {
      relatedEntityType: 'SupportTicket',
      relatedEntityId: payload.ticketId,
      priority: NotificationPriority.CRITICAL,
      templateData: { ticketId: payload.ticketId },
    });
    const govIds = await this.notificationsService.getGovernorateIdsForUser(payload.userId);
    await this.notificationsService.sendToCsWithPermissionForGovernorates(
      govIds,
      'MANAGE_SUPPORT_TICKETS',
      NotificationType.SUPPORT_HUMAN_REQUESTED,
      {
        relatedEntityType: 'SupportTicket',
        relatedEntityId: payload.ticketId,
        priority: NotificationPriority.HIGH,
        templateData: { ticketId: payload.ticketId },
      },
    );
  }

  @OnEvent('support.new_ticket')
  async handleNewTicket(payload: { ticketId: string; userId: string }) {
    await this.notificationsService.notifyNewSupportTicket(payload.ticketId);
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
  async handleTicketReply(payload: { ticketId: string; userId?: string }) {
    await this.notificationsService.notifySupportTicketReply(payload.ticketId);
  }

  @OnEvent('support.customer_replied')
  async handleCustomerReplied(payload: { ticketId: string; csAgentSuperUserId?: string | null }) {
    await this.notificationsService.notifySupportCustomerReplied(payload.ticketId);
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
      groupKey: `dispute:${payload.disputeId}`,
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
      groupKey: `dispute:${payload.disputeId}`,
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

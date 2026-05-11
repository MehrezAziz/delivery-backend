import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { DeliveryControlSecretGuard } from './delivery-control-secret.guard';
import { TriggerCustomerNotificationDto } from './dto/trigger-customer-notification.dto';
import { SupportTicketIdDto } from './dto/support-ticket-id.dto';
import { NotifyFiatPayoutSentDto } from './dto/notify-fiat-payout-sent.dto';

/**
 * Server-to-server hooks for the Next.js delivery-control app (shared secret).
 */
@Controller('control-panel')
export class ControlPanelController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('trigger-customer-notification')
  @UseGuards(DeliveryControlSecretGuard)
  async triggerCustomerNotification(@Body() body: TriggerCustomerNotificationDto) {
    if (body.type !== NotificationType.ACCOUNT_SUSPENDED) {
      return { ok: false };
    }
    await this.notificationsService.send({
      userId: body.userId,
      userType: 'USER',
      type: NotificationType.ACCOUNT_SUSPENDED,
    });
    return { ok: true };
  }

  /** After CS/admin posts a support message from delivery-control (shared DB; Nest listeners do not run). */
  @Post('support-notify-ticket-reply')
  @UseGuards(DeliveryControlSecretGuard)
  async supportNotifyTicketReply(@Body() body: SupportTicketIdDto) {
    await this.notificationsService.notifySupportTicketReply(body.ticketId);
    return { ok: true };
  }

  /** After company portal posts a user message on a ticket (shared DB; Nest listeners do not run). */
  @Post('support-notify-customer-replied')
  @UseGuards(DeliveryControlSecretGuard)
  async supportNotifyCustomerReplied(@Body() body: SupportTicketIdDto) {
    await this.notificationsService.notifySupportCustomerReplied(body.ticketId);
    return { ok: true };
  }

  /** Company portal (or other control-panel flows) created a ticket without hitting Nest `createTicket`. */
  @Post('support-notify-new-ticket')
  @UseGuards(DeliveryControlSecretGuard)
  async supportNotifyNewTicket(@Body() body: SupportTicketIdDto) {
    await this.notificationsService.notifyNewSupportTicket(body.ticketId);
    return { ok: true };
  }

  /** After delivery-control marks a fiat withdrawal as paid (shared DB; Nest listeners do not run). */
  @Post('notify-fiat-payout-sent')
  @UseGuards(DeliveryControlSecretGuard)
  async notifyFiatPayoutSent(@Body() body: NotifyFiatPayoutSentDto) {
    const amt = body.amount?.trim() || '';
    const cur = body.currency?.trim() || '';
    const isBank = body.payoutMethod === 'BANK_TRANSFER';
    const title = 'Payout sent';
    const bodyText = isBank
      ? `Your payout of ${amt} ${cur} has been sent by bank transfer. It may take a few business days to appear in your account.`
      : `Your payout of ${amt} ${cur} has been marked as sent (cash).`;
    await this.notificationsService.send({
      userId: body.userId,
      userType: 'USER',
      type: NotificationType.WITHDRAWAL_PROCESSED,
      title,
      body: bodyText,
      relatedEntityType: body.relatedEntityType,
      relatedEntityId: body.withdrawalRequestId,
      templateData: { amount: amt },
    });
    return { ok: true };
  }
}

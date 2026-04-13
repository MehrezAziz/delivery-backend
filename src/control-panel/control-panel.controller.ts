import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { DeliveryControlSecretGuard } from './delivery-control-secret.guard';
import { TriggerCustomerNotificationDto } from './dto/trigger-customer-notification.dto';

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
}

import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications.service';

@Injectable()
export class AdminNotificationListener {
  constructor(private notificationsService: NotificationsService) {}

  @OnEvent('admin.high_value_order')
  async handleHighValueOrder(payload: { orderId: string; amount: string }) {
    await this.notificationsService.sendToAllAdmins(NotificationType.HIGH_VALUE_ORDER, {
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      templateData: { amount: payload.amount },
    });
  }

  @OnEvent('admin.order_stuck_no_driver')
  async handleOrderStuck(payload: { orderId: string }) {
    await this.notificationsService.sendToAllAdmins(NotificationType.ORDER_STUCK_NO_DRIVER, {
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
    });
  }

  @OnEvent('admin.large_withdrawal')
  async handleLargeWithdrawal(payload: { amount: string; userId: string }) {
    await this.notificationsService.sendToAllAdmins(NotificationType.LARGE_WITHDRAWAL_REQUEST, {
      templateData: { amount: payload.amount },
    });
  }

  @OnEvent('admin.payment_gateway_failure')
  async handlePaymentGatewayFailure() {
    await this.notificationsService.sendToAllAdmins(NotificationType.PAYMENT_GATEWAY_FAILURE, {});
  }

  @OnEvent('admin.daily_revenue_report')
  async handleDailyRevenue(payload: { amount: string }) {
    await this.notificationsService.sendToAllAdmins(NotificationType.DAILY_REVENUE_REPORT, {
      templateData: { amount: payload.amount },
    });
  }

  @OnEvent('admin.server_error_spike')
  async handleServerErrorSpike() {
    await this.notificationsService.sendToAllAdmins(NotificationType.SERVER_ERROR_SPIKE, {});
  }

  @OnEvent('admin.database_alert')
  async handleDatabaseAlert() {
    await this.notificationsService.sendToAllAdmins(NotificationType.DATABASE_PERFORMANCE_ALERT, {});
  }

  @OnEvent('admin.suspicious_activity')
  async handleSuspiciousActivity() {
    await this.notificationsService.sendToAllAdmins(NotificationType.SUSPICIOUS_ACTIVITY, {});
  }

  @OnEvent('admin.bulk_registration')
  async handleBulkRegistration() {
    await this.notificationsService.sendToAllAdmins(NotificationType.BULK_REGISTRATION_DETECTED, {});
  }

  @OnEvent('admin.driver_performance_alert')
  async handleDriverPerformanceAlert(payload: { driverName: string }) {
    await this.notificationsService.sendToAllAdmins(NotificationType.DRIVER_PERFORMANCE_ALERT, {
      templateData: { driverName: payload.driverName },
    });
  }
}

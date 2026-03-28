import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications.service';

@Injectable()
export class PaymentNotificationListener {
  constructor(private notificationsService: NotificationsService) {}

  @OnEvent('wallet.topup_success')
  async handleTopUpSuccess(payload: { userId: string; amount: string }) {
    await this.notificationsService.send({
      userId: payload.userId,
      userType: 'USER',
      type: NotificationType.WALLET_TOPUP_SUCCESS,
      relatedEntityType: 'Wallet',
      templateData: { amount: payload.amount },
    });
  }

  @OnEvent('wallet.topup_failed')
  async handleTopUpFailed(payload: { userId: string }) {
    await this.notificationsService.send({
      userId: payload.userId,
      userType: 'USER',
      type: NotificationType.WALLET_TOPUP_FAILED,
      relatedEntityType: 'Wallet',
    });
  }

  @OnEvent('wallet.low_balance')
  async handleLowBalance(payload: { userId: string }) {
    await this.notificationsService.send({
      userId: payload.userId,
      userType: 'USER',
      type: NotificationType.LOW_WALLET_BALANCE,
      relatedEntityType: 'Wallet',
    });
  }

  @OnEvent('order.payment_deducted')
  async handlePaymentDeducted(payload: { userId: string; orderId: string; amount: string }) {
    await this.notificationsService.send({
      userId: payload.userId,
      userType: 'USER',
      type: NotificationType.ORDER_PAYMENT_DEDUCTED,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      templateData: { amount: payload.amount },
    });
  }

  @OnEvent('refund.processed')
  async handleRefundProcessed(payload: { userId: string; orderId: string; amount: string }) {
    await this.notificationsService.send({
      userId: payload.userId,
      userType: 'USER',
      type: NotificationType.REFUND_PROCESSED,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      templateData: { amount: payload.amount },
    });
  }

  @OnEvent('withdrawal.status_changed')
  async handleWithdrawalStatus(payload: { userId: string; status: string }) {
    await this.notificationsService.send({
      userId: payload.userId,
      userType: 'USER',
      type: NotificationType.WITHDRAWAL_STATUS,
      templateData: { status: payload.status },
    });
  }

  // Driver financial events
  @OnEvent('driver.payment_received_cod')
  async handleDriverCOD(payload: { driverUserId: string; orderId: string; amount: string }) {
    await this.notificationsService.send({
      userId: payload.driverUserId,
      userType: 'USER',
      type: NotificationType.PAYMENT_RECEIVED_COD,
      relatedEntityType: 'Order',
      relatedEntityId: payload.orderId,
      templateData: { amount: payload.amount },
    });
  }

  @OnEvent('driver.payment_credited')
  async handleDriverCredited(payload: { driverUserId: string; amount: string }) {
    await this.notificationsService.send({
      userId: payload.driverUserId,
      userType: 'USER',
      type: NotificationType.PAYMENT_CREDITED_WALLET,
      templateData: { amount: payload.amount },
    });
  }

  @OnEvent('driver.negative_balance')
  async handleNegativeBalance(payload: { driverUserId: string; driverName?: string }) {
    await this.notificationsService.send({
      userId: payload.driverUserId,
      userType: 'USER',
      type: NotificationType.NEGATIVE_BALANCE_WARNING,
    });
  }

  @OnEvent('driver.account_blocked_debt')
  async handleAccountBlockedDebt(payload: { driverUserId: string; driverName?: string }) {
    await this.notificationsService.send({
      userId: payload.driverUserId,
      userType: 'USER',
      type: NotificationType.ACCOUNT_BLOCKED_DEBT,
    });

    // Also notify admins
    await this.notificationsService.sendToAllAdmins(NotificationType.DRIVER_DEBT_THRESHOLD, {
      templateData: { driverName: payload.driverName },
    });
  }

  @OnEvent('driver.withdrawal_processed')
  async handleDriverWithdrawal(payload: { driverUserId: string; amount: string }) {
    await this.notificationsService.send({
      userId: payload.driverUserId,
      userType: 'USER',
      type: NotificationType.WITHDRAWAL_PROCESSED,
      templateData: { amount: payload.amount },
    });
  }
}

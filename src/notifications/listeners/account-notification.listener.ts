import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications.service';

@Injectable()
export class AccountNotificationListener {
  constructor(private notificationsService: NotificationsService) {}

  @OnEvent('account.created')
  async handleAccountCreated(payload: { userId: string }) {
    await this.notificationsService.send({
      userId: payload.userId,
      userType: 'USER',
      type: NotificationType.ACCOUNT_CREATED,
    });
  }

  @OnEvent('account.suspended')
  async handleAccountSuspended(payload: { userId: string }) {
    await this.notificationsService.send({
      userId: payload.userId,
      userType: 'USER',
      type: NotificationType.ACCOUNT_SUSPENDED,
    });
  }

  @OnEvent('account.reactivated')
  async handleAccountReactivated(payload: { userId: string }) {
    await this.notificationsService.send({
      userId: payload.userId,
      userType: 'USER',
      type: NotificationType.ACCOUNT_REACTIVATED,
    });
  }

  @OnEvent('driver.registered')
  async handleDriverRegistered(payload: { driverUserId: string; driverName: string }) {
    // Notify all admins
    await this.notificationsService.sendToAllAdmins(NotificationType.NEW_DRIVER_REGISTRATION, {
      templateData: { driverName: payload.driverName },
    });
  }

  @OnEvent('driver.documents_submitted')
  async handleDocumentsSubmitted(payload: { driverUserId: string; driverName: string }) {
    // Notify driver
    await this.notificationsService.send({
      userId: payload.driverUserId,
      userType: 'USER',
      type: NotificationType.DOCUMENTS_SUBMITTED,
    });

    // Notify admins
    await this.notificationsService.sendToAllAdmins(NotificationType.DRIVER_DOCUMENTS_SUBMITTED, {
      templateData: { driverName: payload.driverName },
    });
  }

  @OnEvent('driver.verification_approved')
  async handleVerificationApproved(payload: { driverUserId: string }) {
    await this.notificationsService.send({
      userId: payload.driverUserId,
      userType: 'USER',
      type: NotificationType.VERIFICATION_APPROVED,
    });
  }

  @OnEvent('driver.verification_rejected')
  async handleVerificationRejected(payload: { driverUserId: string; reason?: string }) {
    await this.notificationsService.send({
      userId: payload.driverUserId,
      userType: 'USER',
      type: NotificationType.VERIFICATION_REJECTED,
      templateData: { reason: payload.reason },
    });
  }

  @OnEvent('driver.account_suspended')
  async handleDriverSuspended(payload: { driverUserId: string }) {
    await this.notificationsService.send({
      userId: payload.driverUserId,
      userType: 'USER',
      type: NotificationType.DRIVER_ACCOUNT_SUSPENDED,
    });
  }
}

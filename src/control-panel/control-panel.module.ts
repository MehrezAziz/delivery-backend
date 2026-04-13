import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ControlPanelController } from './control-panel.controller';
import { DeliveryControlSecretGuard } from './delivery-control-secret.guard';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ConfigModule, NotificationsModule],
  controllers: [ControlPanelController],
  providers: [DeliveryControlSecretGuard],
})
export class ControlPanelModule {}

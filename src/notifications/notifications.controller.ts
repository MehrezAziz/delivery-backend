import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { RegisterTokenDto } from './dto/register-token.dto';
import { NotificationQueryDto, NotificationPreviewQueryDto } from './dto/notification-query.dto';
import { JwtUserGuard } from '../auth/guards/auth.guards';
import { JwtSuperUserGuard } from '../auth/guards/auth.guards';
import { PrismaService } from '../prisma/prisma.service';

// Mobile user notification endpoints
@Controller('notifications')
@UseGuards(JwtUserGuard)
export class UserNotificationsController {
  constructor(
    private notificationsService: NotificationsService,
    private prisma: PrismaService,
  ) {}

  @Post('register-token')
  async registerToken(@Request() req, @Body() dto: RegisterTokenDto) {
    const fcmToken = dto.token || null;
    const fcmPlatform = dto.token ? dto.platform : null;

    // Clear this token from any other user (handles same-device multi-account)
    if (fcmToken) {
      await this.prisma.user.updateMany({
        where: { fcmToken, id: { not: req.user.id } },
        data: { fcmToken: null, fcmPlatform: null },
      });
    }

    await this.prisma.user.update({
      where: { id: req.user.id },
      data: { fcmToken, fcmPlatform },
    });
    return { message: fcmToken ? 'Token registered successfully' : 'Token cleared' };
  }

  @Get()
  async getNotifications(@Request() req, @Query() query: NotificationQueryDto) {
    return this.notificationsService.getNotifications(req.user.id, 'USER', query);
  }

  /** Short grouped list for in-app “reminder” sheet (not full history). */
  @Get('preview')
  async getPreview(@Request() req, @Query() query: NotificationPreviewQueryDto) {
    return this.notificationsService.getPreviewGroups(req.user.id, 'USER', query.limit ?? 8);
  }

  @Get('unread-count')
  async getUnreadCount(@Request() req) {
    const count = await this.notificationsService.getUnreadCount(req.user.id, 'USER');
    return { count };
  }

  @Patch(':id/read')
  async markAsRead(@Request() req, @Param('id') id: string) {
    await this.notificationsService.markAsRead(id, req.user.id);
    return { message: 'Notification marked as read' };
  }

  @Patch('read-all')
  async markAllAsRead(@Request() req) {
    await this.notificationsService.markAllAsRead(req.user.id, 'USER');
    return { message: 'All notifications marked as read' };
  }
}

// SuperUser (Admin/CS) notification endpoints
@Controller('admin/notifications')
@UseGuards(JwtSuperUserGuard)
export class SuperUserNotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  async getNotifications(@Request() req, @Query() query: NotificationQueryDto) {
    return this.notificationsService.getNotifications(
      req.user.superUserId,
      'SUPER_USER',
      query,
    );
  }

  @Get('unread-count')
  async getUnreadCount(@Request() req) {
    const count = await this.notificationsService.getUnreadCount(
      req.user.superUserId,
      'SUPER_USER',
    );
    return { count };
  }

  @Patch(':id/read')
  async markAsRead(@Request() req, @Param('id') id: string) {
    await this.notificationsService.markAsRead(id, req.user.superUserId);
    return { message: 'Notification marked as read' };
  }

  @Patch('read-all')
  async markAllAsRead(@Request() req) {
    await this.notificationsService.markAllAsRead(req.user.superUserId, 'SUPER_USER');
    return { message: 'All notifications marked as read' };
  }
}

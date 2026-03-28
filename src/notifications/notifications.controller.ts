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
import { NotificationQueryDto } from './dto/notification-query.dto';
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
    await this.prisma.user.update({
      where: { id: req.user.id },
      data: { fcmToken: dto.token, fcmPlatform: dto.platform },
    });
    return { message: 'Token registered successfully' };
  }

  @Get()
  async getNotifications(@Request() req, @Query() query: NotificationQueryDto) {
    return this.notificationsService.getNotifications(req.user.id, 'USER', query);
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

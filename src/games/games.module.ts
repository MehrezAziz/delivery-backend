import { Module } from '@nestjs/common';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { GamesDrawService } from './games-draw.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [GamesController],
  providers: [GamesService, GamesDrawService],
  exports: [GamesService, GamesDrawService],
})
export class GamesModule {}

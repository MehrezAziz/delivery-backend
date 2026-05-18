import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtUserGuard } from '../auth/guards/auth.guards';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import type { AuthenticatedUser } from '../auth/dto/jwt-payload.interface';
import { GamesService } from './games.service';
import {
  MarkCongratsShownDto,
  SubmitGameAnswerDto,
  UnlockGameCodeDto,
} from './dto/games.dto';

@Controller('games')
@UseGuards(JwtUserGuard)
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Get('entries')
  async getEntries(
    @CurrentUser() user: AuthenticatedUser,
    @Query('placement') placement: string,
  ) {
    return this.gamesService.getEntriesForPlacement(
      user.id,
      user.role as UserRole,
      placement,
    );
  }

  @Get('me/pending-congrats')
  async pendingCongrats(@CurrentUser() user: AuthenticatedUser) {
    return this.gamesService.getPendingCongrats(user.id);
  }

  @Post('me/congrats-shown')
  async congratsShown(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarkCongratsShownDto,
  ) {
    return this.gamesService.markCongratsShown(user.id, dto.winnerId);
  }

  @Get(':gameId')
  async getGame(
    @CurrentUser() user: AuthenticatedUser,
    @Param('gameId') gameId: string,
  ) {
    return this.gamesService.getGameDetail(
      gameId,
      user.id,
      user.role as UserRole,
    );
  }

  @Post(':gameId/unlock')
  async unlock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('gameId') gameId: string,
    @Body() dto: UnlockGameCodeDto,
  ) {
    return this.gamesService.unlockCode(gameId, user.id, dto.code);
  }

  @Get(':gameId/next-question')
  async nextQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('gameId') gameId: string,
  ) {
    return this.gamesService.getNextQuestion(gameId, user.id);
  }

  @Post(':gameId/answer')
  async answer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('gameId') gameId: string,
    @Body() dto: SubmitGameAnswerDto,
  ) {
    return this.gamesService.submitAnswer(
      gameId,
      user.id,
      dto.questionId,
      dto.optionId,
    );
  }

  @Get(':gameId/winners')
  async winners(@Param('gameId') gameId: string) {
    return this.gamesService.getRecentWinners(gameId);
  }
}

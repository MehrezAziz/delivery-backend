import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import type { AuthenticatedUser } from '../auth/dto/jwt-payload.interface';
import { JwtUserGuard, CustomerOrDriverGuard } from '../auth/guards/auth.guards';
import { CoinTopupService } from './coin-topup.service';
import { InitFlouciTopUpDto, VerifyFlouciTopUpDto } from './dto/coin-topup.dto';

const FLOUCI_WEBHOOK_HEADER = 'x-flouci-webhook-token';

function readWebhookSecret(configured: string | undefined, req: Request): boolean {
  if (!configured) return true;
  const rawToken = req.query?.token;
  const qFirst =
    typeof rawToken === 'string'
      ? rawToken.trim()
      : Array.isArray(rawToken) && typeof rawToken[0] === 'string'
        ? rawToken[0].trim()
        : '';
  const authorization = typeof req.headers?.authorization === 'string' ? req.headers.authorization.trim() : '';
  const bearer = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : '';
  const rawHdr = req.headers[FLOUCI_WEBHOOK_HEADER];
  const hdr =
    typeof rawHdr === 'string' ? rawHdr.trim() : Array.isArray(rawHdr) ? (rawHdr[0] ?? '').trim() : '';

  const ok = bearer === configured || hdr === configured || qFirst === configured;
  if (!ok) {
    throw new UnauthorizedException('Invalid webhook authentication');
  }
  return ok;
}

@Controller('coin-topup')
@UseGuards(JwtUserGuard, CustomerOrDriverGuard)
export class CoinTopupController {
  constructor(private readonly coinTopupService: CoinTopupService) {}

  @Get('quote')
  getQuote(
    @CurrentUser() user: AuthenticatedUser,
    @Query('walletId') walletId?: string,
    @Query('countryId') countryId?: string,
  ) {
    return this.coinTopupService.getQuote(user.id, user.role, { walletId, countryId });
  }

  /** Start card checkout (Flouci). */
  @Post('flouci/init')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  init(@CurrentUser() user: AuthenticatedUser, @Body() dto: InitFlouciTopUpDto) {
    return this.coinTopupService.initFlouciSession(user.id, user.role, dto.coinsAmount, {
      walletId: dto.walletId,
      countryId: dto.countryId,
    });
  }

  @Post('flouci/verify')
  verify(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyFlouciTopUpDto) {
    return this.coinTopupService.verifyOwnedSession(user.id, dto);
  }

  @Get('pending')
  listPending(@CurrentUser() user: AuthenticatedUser) {
    return this.coinTopupService.listPendingSessionsForUser(user.id);
  }

  @Delete('pending/:trackingId')
  cancelPending(
    @CurrentUser() user: AuthenticatedUser,
    @Param('trackingId') trackingId: string,
  ) {
    return this.coinTopupService.cancelPendingSession(user.id, trackingId);
  }

  @Get('sessions/:trackingId')
  getSession(@CurrentUser() user: AuthenticatedUser, @Param('trackingId') trackingId: string) {
    return this.coinTopupService.getSessionSummaryForUser(user.id, trackingId);
  }
}

@Controller('payments/flouci')
@SkipThrottle()
export class FlouciWebhookController {
  constructor(private readonly coinTopupService: CoinTopupService) {}

  /**
   * Flouci notifies this URL server-to-server. Protect with Authorization: Bearer …,
   * header `x-flouci-webhook-token`, or query `token` matching `FLOUCI_WEBHOOK_SECRET`.
   */
  @Post('webhook')
  async webhook(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
    @Query('token') _tokenFallback?: string,
  ) {
  const secret =
    typeof process.env.FLOUCI_WEBHOOK_SECRET === 'string'
      ? process.env.FLOUCI_WEBHOOK_SECRET.trim()
      : '';
  readWebhookSecret(secret.length ? secret : undefined, req);

    await this.coinTopupService.handleWebhookBody(body ?? {});
    return { ok: true };
  }
}

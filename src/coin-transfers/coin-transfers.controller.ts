import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CoinTransfersService } from './coin-transfers.service';
import {
  CreateCoinTransferDto,
  CreateTransferChallengeDto,
  PreviewCoinTransferDto,
  ReportCoinTransferDto,
  SetTransferPinDto,
  VerifyTransferPinDto,
  RemoveTransferPinDto,
} from './dto/coin-transfer.dto';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import { JwtUserGuard, CustomerOrDriverGuard } from '../auth/guards/auth.guards';
import type { AuthenticatedUser } from '../auth/dto/jwt-payload.interface';

@Controller('coins')
@UseGuards(JwtUserGuard, CustomerOrDriverGuard)
export class CoinTransfersController {
  constructor(private readonly coinTransfers: CoinTransfersService) {}

  @Post('transfer-pin/security-session')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async establishTransferPinSecuritySession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyTransferPinDto,
  ) {
    return this.coinTransfers.establishSecuritySessionWithPin(user.id, dto.transferPin);
  }

  @Post('transfer-pin')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async setTransferPin(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetTransferPinDto) {
    return this.coinTransfers.setTransferPin(user.id, dto.transferPin, dto.oldTransferPin);
  }

  @Post('transfer-pin/verify')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async verifyTransferPin(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyTransferPinDto) {
    return this.coinTransfers.verifyTransferPinForGate(user.id, dto.transferPin);
  }

  @Post('transfer-pin/clear')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async clearTransferPin(@CurrentUser() user: AuthenticatedUser, @Body() dto: RemoveTransferPinDto) {
    return this.coinTransfers.clearTransferPin(user.id, dto?.oldTransferPin);
  }

  @Post('transfers/challenge')
  @Throttle({ default: { ttl: 60_000, limit: 15 } })
  async createChallenge(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTransferChallengeDto) {
    const pin = dto.transferPin?.trim();
    return this.coinTransfers.createChallenge(user.id, pin || undefined);
  }

  @Post('transfers/preview')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async preview(@CurrentUser() user: AuthenticatedUser, @Body() dto: PreviewCoinTransferDto) {
    return this.coinTransfers.previewTransfer(user.id, dto.recipientUserId, dto.grossCoins);
  }

  @Post('transfers')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCoinTransferDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    const deviceId = (req.headers['x-device-id'] as string | undefined)?.slice(0, 128) || null;
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : undefined;
    return this.coinTransfers.createTransfer(
      user.id,
      {
        recipientUserId: dto.recipientUserId,
        grossCoins: dto.grossCoins,
        challengeToken: dto.challengeToken,
        giftMessage: dto.giftMessage,
        scheduledAt,
      },
      { idempotencyKey: idempotencyKey?.trim() || null, clientIp: ip || null, deviceId },
    );
  }

  @Get('transfers')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.coinTransfers.listMyTransfers(user.id, page, Math.min(50, limit));
  }

  @Get('transfers/:id')
  async getOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.coinTransfers.getTransferForViewer(user.id, id);
  }

  @Post('transfers/:id/cancel')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async cancel(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.coinTransfers.cancelTransfer(user.id, id);
  }

  @Post('transfers/:id/report')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async report(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportCoinTransferDto,
  ) {
    return this.coinTransfers.reportTransfer(user.id, id, dto.note);
  }
}

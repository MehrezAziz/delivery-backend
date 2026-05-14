import { Controller, Get, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { CoinTransfersService } from './coin-transfers.service';
import { JwtSuperUserGuard, AdminGuard } from '../auth/guards/auth.guards';

@Controller('admin/coin-transfers')
@UseGuards(JwtSuperUserGuard, AdminGuard)
export class CoinTransfersAdminController {
  constructor(private readonly coinTransfers: CoinTransfersService) {}

  @Get()
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('userId') userId?: string,
  ) {
    return this.coinTransfers.adminListTransfers(page, Math.min(100, limit), userId);
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { CreateWithdrawalRequestDto } from './dto/wallet.dto';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import { JwtUserGuard, CustomerGuard } from '../auth/guards/auth.guards';
import type { AuthenticatedUser } from '../auth/dto/jwt-payload.interface';

@Controller('wallet')
@UseGuards(JwtUserGuard, CustomerGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  /**
   * GET /wallet/me
   * Returns the authenticated customer's wallet info.
   */
  @Get('me')
  async getMyWallet(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.getMyWallet(user.id);
  }

  /**
   * GET /wallet/me/transactions
   * Returns paginated transaction history.
   */
  @Get('me/transactions')
  async getMyTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.walletService.getMyTransactions(user.id, page, limit);
  }

  /**
   * GET /wallet/me/withdrawals
   * Returns paginated withdrawal request history.
   */
  @Get('me/withdrawals')
  async getMyWithdrawalRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.walletService.getMyWithdrawalRequests(user.id, page, limit);
  }

  /**
   * POST /wallet/me/withdrawals
   * Submit a new withdrawal request.
   */
  @Post('me/withdrawals')
  async createWithdrawalRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWithdrawalRequestDto,
  ) {
    return this.walletService.createWithdrawalRequest(user.id, dto);
  }
}

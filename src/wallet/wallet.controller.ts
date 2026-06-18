import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { CreateWithdrawalRequestDto, CreateCountryWalletDto, UpdatePayoutBankDetailsDto } from './dto/wallet.dto';
import { CurrentUser } from '../auth/decorators/auth.decorators';
import { JwtUserGuard, CustomerGuard } from '../auth/guards/auth.guards';
import type { AuthenticatedUser } from '../auth/dto/jwt-payload.interface';

@Controller('wallet')
@UseGuards(JwtUserGuard, CustomerGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('me/summary')
  async getWalletsSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.getWalletsSummary(user.id);
  }

  @Post('countries')
  async createCountryWallet(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCountryWalletDto,
  ) {
    return this.walletService.createWalletForCountry(user.id, dto);
  }

  /**
   * GET /wallet/me — primary wallet, or ?countryId= / ?walletId=
   */
  @Get('me')
  async getMyWallet(
    @CurrentUser() user: AuthenticatedUser,
    @Query('countryId') countryId?: string,
    @Query('walletId') walletId?: string,
  ) {
    return this.walletService.getMyWallet(user.id, { countryId, walletId });
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
    @Query('walletId') walletId?: string,
    @Query('countryId') countryId?: string,
  ) {
    return this.walletService.getMyTransactions(user.id, page, limit, { walletId, countryId });
  }

  /**
   * GET /wallet/me/payout-bank-details
   * Saved bank payout profile (optional).
   */
  @Get('me/payout-bank-details')
  async getMyPayoutBankDetails(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.getPayoutBankDetails(user.id);
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
    @Query('walletId') walletId?: string,
    @Query('countryId') countryId?: string,
  ) {
    return this.walletService.getMyWithdrawalRequests(user.id, page, limit, { walletId, countryId });
  }

  /**
   * PUT /wallet/me/payout-bank-details
   */
  @Put('me/payout-bank-details')
  async putPayoutBankDetails(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePayoutBankDetailsDto,
  ) {
    return this.walletService.updatePayoutBankDetails(user.id, dto);
  }

  /**
   * DELETE /wallet/me/payout-bank-details
   */
  @Delete('me/payout-bank-details')
  async deletePayoutBankDetails(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.deletePayoutBankDetails(user.id);
  }

  /**
   * POST /wallet/me/withdrawals/:requestId/cancel
   */
  @Post('me/withdrawals/:requestId/cancel')
  async cancelWithdrawalRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
  ) {
    return this.walletService.cancelWithdrawalRequest(user.id, requestId);
  }

  /**
   * GET /wallet/me/withdrawals/quote?amount=
   * Preview payout amount, fee, and fiat equivalent.
   */
  @Get('me/withdrawals/quote')
  async getWithdrawalQuote(
    @CurrentUser() user: AuthenticatedUser,
    @Query('amount') amountStr: string,
    @Query('walletId') walletId?: string,
    @Query('countryId') countryId?: string,
  ) {
    const amount = Number(amountStr);
    return this.walletService.getWithdrawalQuote(user.id, amount, { walletId, countryId });
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

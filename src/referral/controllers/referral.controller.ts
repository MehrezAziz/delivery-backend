import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ReferralService } from '../services/referral.service';
import { CurrentUser, Public } from '../../auth/decorators/auth.decorators';
import { JwtUserGuard, CustomerGuard } from '../../auth/guards/auth.guards';
import type { AuthenticatedUser } from '../../auth/dto/jwt-payload.interface';
import { ReferralCodeDto, ReferralStatisticsDto } from '../dto';

@Controller('referral')
@UseGuards(JwtUserGuard, CustomerGuard)
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  /**
   * Get authenticated customer's referral code
   * GET /referral/my-code
   */
  @Get('my-code')
  async getMyReferralCode(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReferralCodeDto> {
    return this.referralService.getMyReferralCode(user.profileId);
  }

  /**
   * Validate a referral code
   * GET /referral/validate/:code
   */
  @Public()
  @Get('validate/:code')
  async validateReferralCode(
    @Param('code') code: string,
  ): Promise<ReferralCodeDto> {
    const referralCode = await this.referralService.validateReferralCode(code);
    return this.mapToDto(referralCode);
  }

  /**
   * Get authenticated customer's referral statistics
   * GET /referral/statistics
   */
  @Get('statistics')
  async getReferralStatistics(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReferralStatisticsDto> {
    return this.referralService.getReferralStatistics(user.profileId);
  }

  /**
   * Maps a ReferralCode entity to a DTO
   */
  private mapToDto(referralCode: any): ReferralCodeDto {
    return {
      id: referralCode.id,
      code: referralCode.code,
      type: referralCode.type,
      value: Number(referralCode.value),
      maxDiscountAmount: referralCode.maxDiscountAmount
        ? Number(referralCode.maxDiscountAmount)
        : undefined,
      minOrderAmount: referralCode.minOrderAmount
        ? Number(referralCode.minOrderAmount)
        : undefined,
      active: referralCode.active,
      validFrom: referralCode.validFrom ?? undefined,
      validUntil: referralCode.validUntil ?? undefined,
      usageLimit: referralCode.usageLimit ?? undefined,
      totalUses: referralCode.totalUses,
    };
  }
}

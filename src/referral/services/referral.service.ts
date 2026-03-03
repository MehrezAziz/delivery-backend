import { Injectable } from '@nestjs/common';
import { ReferralCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  InvalidReferralCodeException,
  ReferralCodeExpiredException,
  ReferralCodeNotYetValidException,
  UsageLimitExceededException,
  CannotUseOwnCodeException,
  NoReferralCodeException,
} from '../exceptions';
import { ReferralCodeDto, ReferralStatisticsDto } from '../dto';

@Injectable()
export class ReferralService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates a referral code against all business rules
   * @param code - The referral code string to validate
   * @param customerId - Optional customer ID to check self-referral and per-user limits
   * @returns The validated ReferralCode entity
   * @throws InvalidReferralCodeException if code doesn't exist or is inactive
   * @throws CannotUseOwnCodeException if customer tries to use their own code
   * @throws ReferralCodeNotYetValidException if code is not yet valid
   * @throws ReferralCodeExpiredException if code has expired
   * @throws UsageLimitExceededException if usage limit is reached
   */
  async validateReferralCode(
    code: string,
    customerId?: string,
  ): Promise<ReferralCode> {
    // Step 1: Check existence
    const referralCode = await this.prisma.referralCode.findUnique({
      where: { code },
      include: { owner: true },
    });

    if (!referralCode) {
      throw new InvalidReferralCodeException('Code does not exist');
    }

    // Step 2: Check if customer is using their own code
    if (customerId && referralCode.ownerId === customerId) {
      throw new CannotUseOwnCodeException();
    }

    // Step 3: Check active status
    if (!referralCode.active) {
      throw new InvalidReferralCodeException('Code is not active');
    }

    // Step 4: Check validFrom
    const now = new Date();
    if (referralCode.validFrom && now < referralCode.validFrom) {
      throw new ReferralCodeNotYetValidException();
    }

    // Step 5: Check validUntil
    if (referralCode.validUntil && now > referralCode.validUntil) {
      throw new ReferralCodeExpiredException();
    }

    // Step 6: Check usage limit (-1 means unlimited)
    if (
      referralCode.usageLimit !== null &&
      referralCode.usageLimit !== -1 &&
      referralCode.totalUses >= referralCode.usageLimit
    ) {
      throw new UsageLimitExceededException();
    }

    // Step 7: Check per-user usage limit (if customerId provided)
    if (customerId && referralCode.usagePerUserLimit) {
      const userUsageCount = await this.prisma.customer.count({
        where: {
          referredByCodeId: referralCode.id,
          id: customerId,
        },
      });

      if (userUsageCount >= referralCode.usagePerUserLimit) {
        throw new UsageLimitExceededException('Per-user limit exceeded');
      }
    }

    return referralCode;
  }

  /**
   * Retrieves a customer's own referral code
   * @param customerId - The customer ID
   * @returns ReferralCodeDto with all code details
   * @throws NoReferralCodeException if customer has no referral code
   */
  async getMyReferralCode(customerId: string): Promise<ReferralCodeDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { myReferralCode: true },
    });

    if (!customer?.myReferralCode) {
      throw new NoReferralCodeException();
    }

    return this.mapToDto(customer.myReferralCode);
  }

  /**
   * Retrieves referral statistics for a customer
   * @param customerId - The customer ID
   * @returns ReferralStatisticsDto with referral counts and commission totals
   */
  async getReferralStatistics(
    customerId: string,
  ): Promise<ReferralStatisticsDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { myReferralCode: true },
    });

    if (!customer?.myReferralCode) {
      return {
        totalReferrals: 0,
        totalCommission: 0,
        pendingCommission: 0,
        paidCommission: 0,
        myReferralCode: null,
      };
    }

    const [totalReferrals, commissions] = await Promise.all([
      this.prisma.customer.count({
        where: { referredByCodeId: customer.myReferralCode?.id },
      }),
      this.prisma.referralCommission.findMany({
        where: { referrerCustomerId: customerId },
      }),
    ]);

    const totalCommission = commissions.reduce(
      (sum, c) => sum + Number(c.commissionAmount),
      0,
    );
    const pendingCommission = commissions
      .filter((c) => c.status === 'PENDING')
      .reduce((sum, c) => sum + Number(c.commissionAmount), 0);
    const paidCommission = commissions
      .filter((c) => c.status === 'PAID')
      .reduce((sum, c) => sum + Number(c.commissionAmount), 0);

    return {
      totalReferrals,
      totalCommission,
      pendingCommission,
      paidCommission,
      myReferralCode: this.mapToDto(customer.myReferralCode),
    };
  }

  /**
   * Increments the usage counter for a referral code
   * @param codeId - The referral code ID
   */
  async incrementUsage(codeId: string): Promise<void> {
    await this.prisma.referralCode.update({
      where: { id: codeId },
      data: { totalUses: { increment: 1 } },
    });
  }

  /**
   * Checks if a customer has exceeded the per-user usage limit for a code
   * @param codeId - The referral code ID
   * @param customerId - The customer ID
   * @returns true if limit is exceeded, false otherwise
   */
  async checkPerUserLimit(
    codeId: string,
    customerId: string,
  ): Promise<boolean> {
    const referralCode = await this.prisma.referralCode.findUnique({
      where: { id: codeId },
    });

    if (!referralCode?.usagePerUserLimit) {
      return false;
    }

    const userUsageCount = await this.prisma.customer.count({
      where: {
        referredByCodeId: codeId,
        id: customerId,
      },
    });

    return userUsageCount >= referralCode.usagePerUserLimit;
  }

  /**
   * Maps a ReferralCode entity to a DTO
   * @param referralCode - The ReferralCode entity
   * @returns ReferralCodeDto
   */
  private mapToDto(referralCode: ReferralCode): ReferralCodeDto {
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

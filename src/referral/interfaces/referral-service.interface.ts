import { ReferralCode } from '@prisma/client';

export interface ReferralCodeDto {
  id: string;
  code: string;
  type: string;
  value: number;
  maxDiscountAmount?: number;
  minOrderAmount?: number;
  active: boolean;
  validFrom?: Date;
  validUntil?: Date;
  usageLimit?: number;
  totalUses: number;
}

export interface ReferralStatisticsDto {
  totalReferrals: number;
  totalCommission: number;
  pendingCommission: number;
  paidCommission: number;
  myReferralCode: ReferralCodeDto | null;
}

export interface IReferralService {
  validateReferralCode(code: string, customerId?: string): Promise<ReferralCode>;
  getMyReferralCode(customerId: string): Promise<ReferralCodeDto>;
  getReferralStatistics(customerId: string): Promise<ReferralStatisticsDto>;
  incrementUsage(codeId: string): Promise<void>;
  checkPerUserLimit(codeId: string, customerId: string): Promise<boolean>;
}

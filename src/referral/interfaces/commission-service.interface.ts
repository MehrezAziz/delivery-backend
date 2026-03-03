import { ReferralCode, ReferralCommission } from '@prisma/client';

export interface ICommissionService {
  createCommissionForOrder(orderId: string): Promise<ReferralCommission | null>;
  calculateCommission(orderTotal: number, code: ReferralCode): number;
}

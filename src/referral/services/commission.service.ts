import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ReferralCode, ReferralCommission, ReferralCommissionStatus } from '@prisma/client';
import { ReferralCodeType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ICommissionService } from '../interfaces/commission-service.interface';

@Injectable()
export class CommissionService implements ICommissionService {
  private readonly logger = new Logger(CommissionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate commission amount based on order total and referral code configuration
   * @param orderTotal - The total amount of the order
   * @param code - The referral code with type, value, and constraints
   * @returns Commission amount rounded to 2 decimal places
   */
  calculateCommission(orderTotal: number, code: ReferralCode): number {
    let commission: number;

    // Step 1: Calculate base commission based on type
    if (code.type === ReferralCodeType.PERCENTAGE) {
      // For PERCENTAGE type: calculate (orderTotal * value / 100)
      commission = (orderTotal * Number(code.value)) / 100;
    } else {
      // For FIXED type: use value directly
      commission = Number(code.value);
    }

    // Step 2: Apply maxDiscountAmount cap if specified
    if (code.maxDiscountAmount && commission > Number(code.maxDiscountAmount)) {
      commission = Number(code.maxDiscountAmount);
    }

    // Step 3: Round result to 2 decimal places
    return Math.round(commission * 100) / 100;
  }

  /**
   * Create a commission record for a completed order if all conditions are met
   * @param orderId - The ID of the completed order
   * @returns ReferralCommission record if created, null otherwise
   */
  async createCommissionForOrder(orderId: string): Promise<ReferralCommission | null> {
    // Step 1: Query Order with customer and referredByCode relations
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: {
          include: {
            referredByCode: true,
          },
        },
      },
    });

    if (!order) {
      return null;
    }

    // Step 2: Return null if customer has no referredByCodeId
    if (!order.customer.referredByCodeId) {
      return null;
    }

    // Step 3: Return null if customer completedOrders != 1 (only first order gets commission)
    if (order.customer.completedOrders !== 1) {
      return null;
    }

    const referralCode = order.customer.referredByCode;

    // Return null if referralCode is not loaded
    if (!referralCode) {
      return null;
    }

    // Return null if referralCode has no owner (shouldn't happen for customer-owned codes)
    if (!referralCode.ownerId) {
      return null;
    }

    // Step 4: Return null if order total < referralCode.minOrderAmount
    if (referralCode.minOrderAmount && Number(order.price) < Number(referralCode.minOrderAmount)) {
      return null;
    }

    // Step 5: Calculate commission using calculateCommission method
    const commissionAmount = this.calculateCommission(Number(order.price), referralCode);

    // Step 6: Check for existing commission record (idempotency)
    const existingCommission = await this.prisma.referralCommission.findFirst({
      where: { orderId: order.id },
    });

    if (existingCommission) {
      return existingCommission;
    }

    // Step 7: Create ReferralCommission record with status=PENDING
    // Step 8: Link to referralCodeId, referrerCustomerId, referredCustomerId, orderId
    return await this.prisma.referralCommission.create({
      data: {
        referralCodeId: referralCode.id,
        referrerCustomerId: referralCode.ownerId,
        referredCustomerId: order.customerId,
        orderId: order.id,
        commissionAmount,
        status: ReferralCommissionStatus.PENDING,
      },
    });
  }

  /**
   * Event listener for order completion events
   * Automatically creates commission records when orders are completed
   * @param event - Order completion event containing orderId
   */
  @OnEvent('order.completed')
  async handleOrderCompleted(event: { orderId: string }): Promise<void> {
    try {
      this.logger.log(`Processing order completion event for order: ${event.orderId}`);
      
      const commission = await this.createCommissionForOrder(event.orderId);
      
      if (commission) {
        this.logger.log({
          message: 'Commission created successfully',
          commissionId: commission.id,
          orderId: event.orderId,
          referrerId: commission.referrerCustomerId,
          referredId: commission.referredCustomerId,
          amount: commission.commissionAmount.toString(),
        });
      } else {
        this.logger.debug(`No commission created for order: ${event.orderId} (conditions not met)`);
      }
    } catch (error) {
      this.logger.error({
        message: 'Failed to create commission for order',
        orderId: event.orderId,
        error: error.message,
        stack: error.stack,
      });
      // Don't throw - we don't want to break the order completion flow
      // The commission can be created manually or through a retry mechanism
    }
  }
}

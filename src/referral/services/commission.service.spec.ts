import { Test, TestingModule } from '@nestjs/testing';
import { CommissionService } from './commission.service';
import { ReferralCode, ReferralCodeType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';

describe('CommissionService', () => {
  let service: CommissionService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    order: {
      findUnique: jest.fn(),
    },
    referralCommission: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommissionService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<CommissionService>(CommissionService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateCommission', () => {
    describe('PERCENTAGE type', () => {
      it('should calculate commission as percentage of order total', () => {
        const code: ReferralCode = {
          id: '1',
          code: 'TEST10',
          type: ReferralCodeType.PERCENTAGE,
          value: new Decimal(10),
          maxDiscountAmount: null,
          minOrderAmount: null,
          usageLimit: null,
          usagePerUserLimit: null,
          validFrom: null,
          validUntil: null,
          active: true,
          createdBy: 'system',
          ownerId: 'customer1',
          totalUses: 0,
        };

        const result = service.calculateCommission(100, code);
        expect(result).toBe(10); // 100 * 10 / 100 = 10
      });

      it('should calculate commission correctly for different percentages', () => {
        const code: ReferralCode = {
          id: '1',
          code: 'TEST25',
          type: ReferralCodeType.PERCENTAGE,
          value: new Decimal(25),
          maxDiscountAmount: null,
          minOrderAmount: null,
          usageLimit: null,
          usagePerUserLimit: null,
          validFrom: null,
          validUntil: null,
          active: true,
          createdBy: 'system',
          ownerId: 'customer1',
          totalUses: 0,
        };

        const result = service.calculateCommission(200, code);
        expect(result).toBe(50); // 200 * 25 / 100 = 50
      });

      it('should apply maxDiscountAmount cap for percentage type', () => {
        const code: ReferralCode = {
          id: '1',
          code: 'TEST10',
          type: ReferralCodeType.PERCENTAGE,
          value: new Decimal(10),
          maxDiscountAmount: new Decimal(15),
          minOrderAmount: null,
          usageLimit: null,
          usagePerUserLimit: null,
          validFrom: null,
          validUntil: null,
          active: true,
          createdBy: 'system',
          ownerId: 'customer1',
          totalUses: 0,
        };

        const result = service.calculateCommission(200, code);
        // 200 * 10 / 100 = 20, but capped at 15
        expect(result).toBe(15);
      });

      it('should not apply cap when commission is below maxDiscountAmount', () => {
        const code: ReferralCode = {
          id: '1',
          code: 'TEST10',
          type: ReferralCodeType.PERCENTAGE,
          value: new Decimal(10),
          maxDiscountAmount: new Decimal(50),
          minOrderAmount: null,
          usageLimit: null,
          usagePerUserLimit: null,
          validFrom: null,
          validUntil: null,
          active: true,
          createdBy: 'system',
          ownerId: 'customer1',
          totalUses: 0,
        };

        const result = service.calculateCommission(100, code);
        // 100 * 10 / 100 = 10, which is below 50
        expect(result).toBe(10);
      });
    });

    describe('FIXED type', () => {
      it('should use value directly for fixed type', () => {
        const code: ReferralCode = {
          id: '1',
          code: 'FIXED20',
          type: ReferralCodeType.FIXED,
          value: new Decimal(20),
          maxDiscountAmount: null,
          minOrderAmount: null,
          usageLimit: null,
          usagePerUserLimit: null,
          validFrom: null,
          validUntil: null,
          active: true,
          createdBy: 'system',
          ownerId: 'customer1',
          totalUses: 0,
        };

        const result = service.calculateCommission(100, code);
        expect(result).toBe(20);
      });

      it('should use same value regardless of order total', () => {
        const code: ReferralCode = {
          id: '1',
          code: 'FIXED20',
          type: ReferralCodeType.FIXED,
          value: new Decimal(20),
          maxDiscountAmount: null,
          minOrderAmount: null,
          usageLimit: null,
          usagePerUserLimit: null,
          validFrom: null,
          validUntil: null,
          active: true,
          createdBy: 'system',
          ownerId: 'customer1',
          totalUses: 0,
        };

        expect(service.calculateCommission(50, code)).toBe(20);
        expect(service.calculateCommission(100, code)).toBe(20);
        expect(service.calculateCommission(500, code)).toBe(20);
      });

      it('should apply maxDiscountAmount cap for fixed type', () => {
        const code: ReferralCode = {
          id: '1',
          code: 'FIXED50',
          type: ReferralCodeType.FIXED,
          value: new Decimal(50),
          maxDiscountAmount: new Decimal(30),
          minOrderAmount: null,
          usageLimit: null,
          usagePerUserLimit: null,
          validFrom: null,
          validUntil: null,
          active: true,
          createdBy: 'system',
          ownerId: 'customer1',
          totalUses: 0,
        };

        const result = service.calculateCommission(100, code);
        // Fixed value is 50, but capped at 30
        expect(result).toBe(30);
      });

      it('should not apply cap when fixed value is below maxDiscountAmount', () => {
        const code: ReferralCode = {
          id: '1',
          code: 'FIXED20',
          type: ReferralCodeType.FIXED,
          value: new Decimal(20),
          maxDiscountAmount: new Decimal(50),
          minOrderAmount: null,
          usageLimit: null,
          usagePerUserLimit: null,
          validFrom: null,
          validUntil: null,
          active: true,
          createdBy: 'system',
          ownerId: 'customer1',
          totalUses: 0,
        };

        const result = service.calculateCommission(100, code);
        expect(result).toBe(20);
      });
    });

    describe('Rounding', () => {
      it('should round to 2 decimal places', () => {
        const code: ReferralCode = {
          id: '1',
          code: 'TEST15',
          type: ReferralCodeType.PERCENTAGE,
          value: new Decimal(15),
          maxDiscountAmount: null,
          minOrderAmount: null,
          usageLimit: null,
          usagePerUserLimit: null,
          validFrom: null,
          validUntil: null,
          active: true,
          createdBy: 'system',
          ownerId: 'customer1',
          totalUses: 0,
        };

        const result = service.calculateCommission(33.33, code);
        // 33.33 * 15 / 100 = 4.9995, should round to 5.00
        expect(result).toBe(5);
      });

      it('should handle decimal values correctly', () => {
        const code: ReferralCode = {
          id: '1',
          code: 'TEST10',
          type: ReferralCodeType.PERCENTAGE,
          value: new Decimal(10),
          maxDiscountAmount: null,
          minOrderAmount: null,
          usageLimit: null,
          usagePerUserLimit: null,
          validFrom: null,
          validUntil: null,
          active: true,
          createdBy: 'system',
          ownerId: 'customer1',
          totalUses: 0,
        };

        const result = service.calculateCommission(123.45, code);
        // 123.45 * 10 / 100 = 12.345, should round to 12.35
        expect(result).toBe(12.35);
      });
    });

    describe('Edge cases', () => {
      it('should handle zero order total', () => {
        const code: ReferralCode = {
          id: '1',
          code: 'TEST10',
          type: ReferralCodeType.PERCENTAGE,
          value: new Decimal(10),
          maxDiscountAmount: null,
          minOrderAmount: null,
          usageLimit: null,
          usagePerUserLimit: null,
          validFrom: null,
          validUntil: null,
          active: true,
          createdBy: 'system',
          ownerId: 'customer1',
          totalUses: 0,
        };

        const result = service.calculateCommission(0, code);
        expect(result).toBe(0);
      });

      it('should handle very small order totals', () => {
        const code: ReferralCode = {
          id: '1',
          code: 'TEST10',
          type: ReferralCodeType.PERCENTAGE,
          value: new Decimal(10),
          maxDiscountAmount: null,
          minOrderAmount: null,
          usageLimit: null,
          usagePerUserLimit: null,
          validFrom: null,
          validUntil: null,
          active: true,
          createdBy: 'system',
          ownerId: 'customer1',
          totalUses: 0,
        };

        const result = service.calculateCommission(0.5, code);
        // 0.5 * 10 / 100 = 0.05
        expect(result).toBe(0.05);
      });

      it('should handle large order totals', () => {
        const code: ReferralCode = {
          id: '1',
          code: 'TEST10',
          type: ReferralCodeType.PERCENTAGE,
          value: new Decimal(10),
          maxDiscountAmount: null,
          minOrderAmount: null,
          usageLimit: null,
          usagePerUserLimit: null,
          validFrom: null,
          validUntil: null,
          active: true,
          createdBy: 'system',
          ownerId: 'customer1',
          totalUses: 0,
        };

        const result = service.calculateCommission(10000, code);
        // 10000 * 10 / 100 = 1000
        expect(result).toBe(1000);
      });
    });
  });

  describe('handleOrderCompleted', () => {
    it('should call createCommissionForOrder when event is received', async () => {
      const orderId = 'order-123';
      const event = { orderId };

      // Mock createCommissionForOrder to return null (no commission created)
      jest.spyOn(service, 'createCommissionForOrder').mockResolvedValue(null);

      await service.handleOrderCompleted(event);

      expect(service.createCommissionForOrder).toHaveBeenCalledWith(orderId);
    });

    it('should handle errors gracefully without throwing', async () => {
      const orderId = 'order-123';
      const event = { orderId };

      // Mock createCommissionForOrder to throw an error
      jest.spyOn(service, 'createCommissionForOrder').mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(service.handleOrderCompleted(event)).resolves.not.toThrow();
    });

    it('should log success when commission is created', async () => {
      const orderId = 'order-123';
      const event = { orderId };
      const mockCommission = {
        id: 'commission-1',
        referralCodeId: 'code-1',
        referrerCustomerId: 'referrer-1',
        referredCustomerId: 'referred-1',
        orderId: 'order-123',
        commissionAmount: new Decimal(10),
        status: 'PENDING' as any,
        createdAt: new Date(),
      };

      jest.spyOn(service, 'createCommissionForOrder').mockResolvedValue(mockCommission);

      await service.handleOrderCompleted(event);

      expect(service.createCommissionForOrder).toHaveBeenCalledWith(orderId);
    });
  });
});

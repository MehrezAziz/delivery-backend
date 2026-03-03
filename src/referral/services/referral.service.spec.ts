import { Test, TestingModule } from '@nestjs/testing';
import { ReferralService } from './referral.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  InvalidReferralCodeException,
  ReferralCodeExpiredException,
  ReferralCodeNotYetValidException,
  UsageLimitExceededException,
  CannotUseOwnCodeException,
  NoReferralCodeException,
} from '../exceptions';
import { ReferralCodeType } from '@prisma/client';

describe('ReferralService', () => {
  let service: ReferralService;
  let prisma: PrismaService;

  const mockPrismaService = {
    referralCode: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    customer: {
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    referralCommission: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ReferralService>(ReferralService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateReferralCode', () => {
    const validCode = {
      id: 'code-1',
      code: 'VALID123',
      type: ReferralCodeType.PERCENTAGE,
      value: 10,
      maxDiscountAmount: null,
      minOrderAmount: null,
      usageLimit: null,
      usagePerUserLimit: null,
      validFrom: null,
      validUntil: null,
      active: true,
      createdBy: 'system',
      ownerId: 'owner-1',
      totalUses: 0,
      owner: null,
    };

    it('should validate a valid referral code', async () => {
      mockPrismaService.referralCode.findUnique.mockResolvedValue(validCode);

      const result = await service.validateReferralCode('VALID123');

      expect(result).toEqual(validCode);
      expect(mockPrismaService.referralCode.findUnique).toHaveBeenCalledWith({
        where: { code: 'VALID123' },
        include: { owner: true },
      });
    });

    it('should throw InvalidReferralCodeException if code does not exist', async () => {
      mockPrismaService.referralCode.findUnique.mockResolvedValue(null);

      await expect(service.validateReferralCode('INVALID')).rejects.toThrow(
        InvalidReferralCodeException,
      );
    });

    it('should throw CannotUseOwnCodeException if customer uses their own code', async () => {
      mockPrismaService.referralCode.findUnique.mockResolvedValue(validCode);

      await expect(
        service.validateReferralCode('VALID123', 'owner-1'),
      ).rejects.toThrow(CannotUseOwnCodeException);
    });

    it('should throw InvalidReferralCodeException if code is not active', async () => {
      mockPrismaService.referralCode.findUnique.mockResolvedValue({
        ...validCode,
        active: false,
      });

      await expect(service.validateReferralCode('VALID123')).rejects.toThrow(
        InvalidReferralCodeException,
      );
    });

    it('should throw ReferralCodeNotYetValidException if code is not yet valid', async () => {
      const futureDate = new Date(Date.now() + 86400000); // Tomorrow
      mockPrismaService.referralCode.findUnique.mockResolvedValue({
        ...validCode,
        validFrom: futureDate,
      });

      await expect(service.validateReferralCode('VALID123')).rejects.toThrow(
        ReferralCodeNotYetValidException,
      );
    });

    it('should throw ReferralCodeExpiredException if code has expired', async () => {
      const pastDate = new Date(Date.now() - 86400000); // Yesterday
      mockPrismaService.referralCode.findUnique.mockResolvedValue({
        ...validCode,
        validUntil: pastDate,
      });

      await expect(service.validateReferralCode('VALID123')).rejects.toThrow(
        ReferralCodeExpiredException,
      );
    });

    it('should throw UsageLimitExceededException if usage limit is reached', async () => {
      mockPrismaService.referralCode.findUnique.mockResolvedValue({
        ...validCode,
        usageLimit: 10,
        totalUses: 10,
      });

      await expect(service.validateReferralCode('VALID123')).rejects.toThrow(
        UsageLimitExceededException,
      );
    });

    it('should allow unlimited uses when usageLimit is -1', async () => {
      mockPrismaService.referralCode.findUnique.mockResolvedValue({
        ...validCode,
        usageLimit: -1,
        totalUses: 1000,
      });

      const result = await service.validateReferralCode('VALID123');

      expect(result).toEqual({
        ...validCode,
        usageLimit: -1,
        totalUses: 1000,
      });
    });

    it('should throw UsageLimitExceededException if per-user limit is exceeded', async () => {
      mockPrismaService.referralCode.findUnique.mockResolvedValue({
        ...validCode,
        usagePerUserLimit: 1,
      });
      mockPrismaService.customer.count.mockResolvedValue(1);

      await expect(
        service.validateReferralCode('VALID123', 'customer-1'),
      ).rejects.toThrow(UsageLimitExceededException);
    });

    it('should validate successfully if per-user limit is not exceeded', async () => {
      mockPrismaService.referralCode.findUnique.mockResolvedValue({
        ...validCode,
        usagePerUserLimit: 2,
      });
      mockPrismaService.customer.count.mockResolvedValue(1);

      const result = await service.validateReferralCode(
        'VALID123',
        'customer-1',
      );

      expect(result).toEqual({
        ...validCode,
        usagePerUserLimit: 2,
      });
    });
  });

  describe('getMyReferralCode', () => {
    it('should return customer referral code', async () => {
      const mockCustomer = {
        id: 'customer-1',
        myReferralCode: {
          id: 'code-1',
          code: 'MYCODE123',
          type: ReferralCodeType.PERCENTAGE,
          value: 10,
          maxDiscountAmount: null,
          minOrderAmount: null,
          active: true,
          validFrom: null,
          validUntil: null,
          usageLimit: null,
          totalUses: 5,
        },
      };

      mockPrismaService.customer.findUnique.mockResolvedValue(mockCustomer);

      const result = await service.getMyReferralCode('customer-1');

      expect(result).toEqual({
        id: 'code-1',
        code: 'MYCODE123',
        type: ReferralCodeType.PERCENTAGE,
        value: 10,
        maxDiscountAmount: undefined,
        minOrderAmount: undefined,
        active: true,
        validFrom: undefined,
        validUntil: undefined,
        usageLimit: undefined,
        totalUses: 5,
      });
    });

    it('should throw NoReferralCodeException if customer has no code', async () => {
      mockPrismaService.customer.findUnique.mockResolvedValue({
        id: 'customer-1',
        myReferralCode: null,
      });

      await expect(service.getMyReferralCode('customer-1')).rejects.toThrow(
        NoReferralCodeException,
      );
    });
  });

  describe('getReferralStatistics', () => {
    it('should return statistics for customer with referral code', async () => {
      const mockCustomer = {
        id: 'customer-1',
        myReferralCodeId: 'code-1',
        myReferralCode: {
          id: 'code-1',
          code: 'MYCODE123',
          type: ReferralCodeType.PERCENTAGE,
          value: 10,
          maxDiscountAmount: null,
          minOrderAmount: null,
          active: true,
          validFrom: null,
          validUntil: null,
          usageLimit: null,
          totalUses: 5,
        },
      };

      const mockCommissions = [
        { commissionAmount: 10.5, status: 'PENDING' },
        { commissionAmount: 20.0, status: 'PAID' },
        { commissionAmount: 15.5, status: 'PENDING' },
      ];

      mockPrismaService.customer.findUnique.mockResolvedValue(mockCustomer);
      mockPrismaService.customer.count.mockResolvedValue(3);
      mockPrismaService.referralCommission.findMany.mockResolvedValue(
        mockCommissions,
      );

      const result = await service.getReferralStatistics('customer-1');

      expect(result).toEqual({
        totalReferrals: 3,
        totalCommission: 46,
        pendingCommission: 26,
        paidCommission: 20,
        myReferralCode: {
          id: 'code-1',
          code: 'MYCODE123',
          type: ReferralCodeType.PERCENTAGE,
          value: 10,
          maxDiscountAmount: undefined,
          minOrderAmount: undefined,
          active: true,
          validFrom: undefined,
          validUntil: undefined,
          usageLimit: undefined,
          totalUses: 5,
        },
      });
    });

    it('should return zero statistics if customer has no referral code', async () => {
      mockPrismaService.customer.findUnique.mockResolvedValue({
        id: 'customer-1',
        myReferralCode: null,
      });

      const result = await service.getReferralStatistics('customer-1');

      expect(result).toEqual({
        totalReferrals: 0,
        totalCommission: 0,
        pendingCommission: 0,
        paidCommission: 0,
        myReferralCode: null,
      });
    });
  });

  describe('incrementUsage', () => {
    it('should increment the usage counter', async () => {
      mockPrismaService.referralCode.update.mockResolvedValue({});

      await service.incrementUsage('code-1');

      expect(mockPrismaService.referralCode.update).toHaveBeenCalledWith({
        where: { id: 'code-1' },
        data: { totalUses: { increment: 1 } },
      });
    });
  });

  describe('checkPerUserLimit', () => {
    it('should return false if no per-user limit is set', async () => {
      mockPrismaService.referralCode.findUnique.mockResolvedValue({
        id: 'code-1',
        usagePerUserLimit: null,
      });

      const result = await service.checkPerUserLimit('code-1', 'customer-1');

      expect(result).toBe(false);
    });

    it('should return true if per-user limit is exceeded', async () => {
      mockPrismaService.referralCode.findUnique.mockResolvedValue({
        id: 'code-1',
        usagePerUserLimit: 2,
      });
      mockPrismaService.customer.count.mockResolvedValue(2);

      const result = await service.checkPerUserLimit('code-1', 'customer-1');

      expect(result).toBe(true);
    });

    it('should return false if per-user limit is not exceeded', async () => {
      mockPrismaService.referralCode.findUnique.mockResolvedValue({
        id: 'code-1',
        usagePerUserLimit: 3,
      });
      mockPrismaService.customer.count.mockResolvedValue(1);

      const result = await service.checkPerUserLimit('code-1', 'customer-1');

      expect(result).toBe(false);
    });
  });
});

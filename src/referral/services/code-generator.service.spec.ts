import { Test, TestingModule } from '@nestjs/testing';
import { CodeGeneratorService } from './code-generator.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CodeGenerationFailedException } from '../exceptions/code-generation-failed.exception';
import { ReferralCodeType } from '@prisma/client';

describe('CodeGeneratorService', () => {
  let service: CodeGeneratorService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CodeGeneratorService,
        {
          provide: PrismaService,
          useValue: {
            referralCode: {
              findUnique: jest.fn(),
              create: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<CodeGeneratorService>(CodeGeneratorService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateUniqueCode', () => {
    it('should generate a code with length between 6 and 12 characters', async () => {
      jest.spyOn(prismaService.referralCode, 'findUnique').mockResolvedValue(null);

      const code = await service.generateUniqueCode();

      expect(code.length).toBeGreaterThanOrEqual(6);
      expect(code.length).toBeLessThanOrEqual(12);
    });

    it('should generate a code with only alphanumeric characters (A-Z, 0-9)', async () => {
      jest.spyOn(prismaService.referralCode, 'findUnique').mockResolvedValue(null);

      const code = await service.generateUniqueCode();

      expect(code).toMatch(/^[A-Z0-9]+$/);
    });

    it('should check uniqueness against database', async () => {
      const findUniqueSpy = jest
        .spyOn(prismaService.referralCode, 'findUnique')
        .mockResolvedValue(null);

      await service.generateUniqueCode();

      expect(findUniqueSpy).toHaveBeenCalledWith({
        where: { code: expect.any(String) },
      });
    });

    it('should retry if code already exists and return unique code', async () => {
      const findUniqueSpy = jest
        .spyOn(prismaService.referralCode, 'findUnique')
        .mockResolvedValueOnce({ id: '1', code: 'EXISTING' } as any)
        .mockResolvedValueOnce(null);

      const code = await service.generateUniqueCode();

      expect(findUniqueSpy).toHaveBeenCalledTimes(2);
      expect(code).toBeDefined();
      expect(code).toMatch(/^[A-Z0-9]+$/);
    });

    it('should throw CodeGenerationFailedException after max attempts', async () => {
      jest
        .spyOn(prismaService.referralCode, 'findUnique')
        .mockResolvedValue({ id: '1', code: 'EXISTING' } as any);

      await expect(service.generateUniqueCode()).rejects.toThrow(
        CodeGenerationFailedException
      );
    });

    it('should attempt generation exactly 10 times before throwing', async () => {
      const findUniqueSpy = jest
        .spyOn(prismaService.referralCode, 'findUnique')
        .mockResolvedValue({ id: '1', code: 'EXISTING' } as any);

      await expect(service.generateUniqueCode()).rejects.toThrow();

      expect(findUniqueSpy).toHaveBeenCalledTimes(10);
    });
  });

  describe('generateForCustomer', () => {
    const customerId = 'customer-123';
    const mockCode = 'ABC123XYZ';
    const mockReferralCode = {
      id: 'referral-code-id',
      code: mockCode,
      type: ReferralCodeType.PERCENTAGE,
      value: 10,
      active: true,
      ownerId: customerId,
      createdBy: 'system',
      maxDiscountAmount: null,
      minOrderAmount: null,
      usageLimit: null,
      usagePerUserLimit: null,
      validFrom: null,
      validUntil: null,
      totalUses: 0,
    };

    it('should generate a unique code and create a ReferralCode record', async () => {
      jest.spyOn(prismaService.referralCode, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prismaService.referralCode, 'create').mockResolvedValue(mockReferralCode as any);

      const result = await service.generateForCustomer(customerId);

      expect(result).toEqual(mockReferralCode);
      expect(prismaService.referralCode.create).toHaveBeenCalledWith({
        data: {
          code: expect.any(String),
          type: ReferralCodeType.PERCENTAGE,
          value: 10,
          active: true,
          ownerId: customerId,
          createdBy: 'system',
        },
      });
    });

    it('should create ReferralCode with correct default values', async () => {
      jest.spyOn(prismaService.referralCode, 'findUnique').mockResolvedValue(null);
      const createSpy = jest.spyOn(prismaService.referralCode, 'create').mockResolvedValue(mockReferralCode as any);

      await service.generateForCustomer(customerId);

      const createCall = createSpy.mock.calls[0][0];
      expect(createCall.data.type).toBe(ReferralCodeType.PERCENTAGE);
      expect(createCall.data.value).toBe(10);
      expect(createCall.data.active).toBe(true);
      expect(createCall.data.ownerId).toBe(customerId);
      expect(createCall.data.createdBy).toBe('system');
    });

    it('should support optional transaction client parameter', async () => {
      const mockTx = {
        referralCode: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(mockReferralCode),
        },
      };

      await service.generateForCustomer(customerId, mockTx as any);

      expect(mockTx.referralCode.findUnique).toHaveBeenCalled();
      expect(mockTx.referralCode.create).toHaveBeenCalledWith({
        data: {
          code: expect.any(String),
          type: ReferralCodeType.PERCENTAGE,
          value: 10,
          active: true,
          ownerId: customerId,
          createdBy: 'system',
        },
      });
    });

    it('should use default prisma client when no transaction provided', async () => {
      jest.spyOn(prismaService.referralCode, 'findUnique').mockResolvedValue(null);
      const createSpy = jest.spyOn(prismaService.referralCode, 'create').mockResolvedValue(mockReferralCode as any);

      await service.generateForCustomer(customerId);

      expect(createSpy).toHaveBeenCalled();
    });

    it('should throw CodeGenerationFailedException if code generation fails', async () => {
      jest
        .spyOn(prismaService.referralCode, 'findUnique')
        .mockResolvedValue({ id: '1', code: 'EXISTING' } as any);

      await expect(service.generateForCustomer(customerId)).rejects.toThrow(
        CodeGenerationFailedException
      );
    });

    it('should generate unique code for each customer', async () => {
      jest.spyOn(prismaService.referralCode, 'findUnique').mockResolvedValue(null);
      const createSpy = jest.spyOn(prismaService.referralCode, 'create').mockResolvedValue(mockReferralCode as any);

      await service.generateForCustomer('customer-1');
      await service.generateForCustomer('customer-2');

      expect(createSpy).toHaveBeenCalledTimes(2);
      const call1 = createSpy.mock.calls[0][0].data;
      const call2 = createSpy.mock.calls[1][0].data;
      
      expect(call1.ownerId).toBe('customer-1');
      expect(call2.ownerId).toBe('customer-2');
    });
  });
});

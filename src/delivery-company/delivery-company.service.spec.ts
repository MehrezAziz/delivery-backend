import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DeliveryCompanyService } from './delivery-company.service';

describe('DeliveryCompanyService', () => {
  let service: DeliveryCompanyService;
  const mockPrisma: any = {
    deliveryCompany: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    deliveryCompanyAddress: {
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    deliveryCompanyTransaction: {
      create: jest.fn(),
    },
    deliveryCompanyRefundRequest: {
      create: jest.fn(),
    },
    order: {
      create: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    countryPricingPolicy: {
      findFirst: jest.fn(),
    },
    systemConfig: {
      findUnique: jest.fn(),
    },
    deliveryCompanyAuditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
  };
  const mockPriceCalc: any = {
    calculatePrice: jest.fn(),
    calculateLocalPickupOnlyPrice: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DeliveryCompanyService(mockPrisma, mockPriceCalc);
  });

  it('throws when company is missing in previewOrder', async () => {
    mockPrisma.deliveryCompany.findUnique.mockResolvedValue(null);
    await expect(
      service.previewOrder('missing-company', {
        pickupAddressId: 'a1',
        dropoffAddressId: 'a2',
        weight: 1,
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws when customer extra amount exceeds max', async () => {
    mockPrisma.deliveryCompany.findUnique.mockResolvedValue({
      id: 'c1',
      defaultDiscountPercent: null,
    });
    mockPrisma.systemConfig.findUnique.mockResolvedValue({ value: '-10' });
    mockPriceCalc.calculatePrice.mockResolvedValue({ totalPrice: 100 });

    await expect(
      service.previewOrder('c1', {
        pickupAddressId: 'a1',
        dropoffAddressId: 'a2',
        weight: 1,
        customerExtraAmount: 10001,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when available capacity is insufficient on createOrder', async () => {
    mockPrisma.deliveryCompany.findUnique.mockResolvedValue({
      id: 'c1',
      proxyCustomerId: 'cust1',
      proxyCustomer: { id: 'cust1' },
      coinBalance: 0,
      maxNegativeBalance: 0,
      lockedCoins: 0,
      defaultDiscountPercent: null,
    });
    mockPrisma.systemConfig.findUnique.mockResolvedValue({ value: '-10' });
    mockPriceCalc.calculatePrice.mockResolvedValue({ totalPrice: 200 });

    await expect(
      service.createOrder('c1', {
        pickupAddressId: 'a1',
        dropoffAddressId: 'a2',
        weight: 3,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates refund request and ledger transaction', async () => {
    mockPrisma.deliveryCompany.findUnique.mockResolvedValue({
      id: 'c1',
      coinBalance: 1000,
      lockedCoins: 100,
    });
    mockPrisma.deliveryCompanyRefundRequest.create.mockResolvedValue({ id: 'rr1' });

    const out = await service.createRefundRequest('c1', {
      amountCoins: 300,
      destinationType: 'BANK_TRANSFER',
      reason: 'Need payout',
    } as any);

    expect(out).toEqual({ id: 'rr1' });
    expect(mockPrisma.deliveryCompany.update).toHaveBeenCalled();
    expect(mockPrisma.deliveryCompanyTransaction.create).toHaveBeenCalled();
  });
});

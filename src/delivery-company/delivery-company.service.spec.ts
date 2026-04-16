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
    deliveryCompanyIdempotencyKey: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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

  it('returns persisted idempotent response for createRefundRequest', async () => {
    mockPrisma.deliveryCompany.findUnique.mockResolvedValue({
      id: 'c1',
      coinBalance: 1000,
      lockedCoins: 0,
    });
    mockPrisma.deliveryCompanyIdempotencyKey.findFirst.mockResolvedValue({
      id: 'ik1',
      requestHash: 'h1',
      responseBody: { id: 'rr-existing', status: 'PENDING' },
      responseStatus: 201,
    });

    const out = await service.createRefundRequest(
      'c1',
      {
        amountCoins: 100,
        destinationType: 'BANK_TRANSFER',
      } as any,
      'idem-1',
      'h1',
    );

    expect(out).toEqual({ id: 'rr-existing', status: 'PENDING' });
    expect(mockPrisma.deliveryCompanyRefundRequest.create).not.toHaveBeenCalled();
  });

  it('throws on idempotency key reuse with different body hash', async () => {
    mockPrisma.deliveryCompany.findUnique.mockResolvedValue({
      id: 'c1',
      coinBalance: 1000,
      lockedCoins: 0,
    });
    mockPrisma.deliveryCompanyIdempotencyKey.findFirst.mockResolvedValue({
      id: 'ik1',
      requestHash: 'old-hash',
      responseBody: null,
      responseStatus: 0,
    });

    await expect(
      service.createRefundRequest(
        'c1',
        {
          amountCoins: 100,
          destinationType: 'BANK_TRANSFER',
        } as any,
        'idem-1',
        'new-hash',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when idempotency insert races (P2002 with inflight row)', async () => {
    mockPrisma.deliveryCompany.findUnique.mockResolvedValue({
      id: 'c1',
      coinBalance: 1000,
      lockedCoins: 0,
    });

    mockPrisma.deliveryCompanyIdempotencyKey.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'ik1',
        requestHash: 'h1',
        responseBody: null,
        responseStatus: 0,
      });

    mockPrisma.deliveryCompanyIdempotencyKey.create.mockImplementationOnce(() => {
      const err: any = new Error('Unique constraint failed');
      err.code = 'P2002';
      throw err;
    });

    await expect(
      service.createRefundRequest(
        'c1',
        {
          amountCoins: 100,
          destinationType: 'BANK_TRANSFER',
        } as any,
        'idem-1',
        'h1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

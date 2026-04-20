import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { DeliveryCompanyApiKeyGuard } from './delivery-company-auth.guard';

describe('DeliveryCompanyApiKeyGuard', () => {
  const mockPrisma: any = {
    deliveryCompanyApiKey: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const guard = new DeliveryCompanyApiKeyGuard(mockPrisma);

  const makeCtx = (authorization?: string, method = 'GET', path = 'orders') => {
    const req: any = {
      headers: { authorization },
      method,
      route: { path },
    };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
    } as ExecutionContext;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects missing bearer auth', async () => {
    await expect(guard.canActivate(makeCtx(undefined))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects inactive company', async () => {
    mockPrisma.deliveryCompanyApiKey.findFirst.mockResolvedValue({
      id: 'k1',
      scopes: ['orders:read'],
      deliveryCompany: { id: 'c1', status: 'SUSPENDED' },
    });
    await expect(guard.canActivate(makeCtx('Bearer abcdefghijklmnopqrstuvwxyz'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when required scope is missing', async () => {
    mockPrisma.deliveryCompanyApiKey.findFirst.mockResolvedValue({
      id: 'k1',
      scopes: ['wallet:read'],
      deliveryCompany: { id: 'c1', status: 'ACTIVE' },
    });
    await expect(
      guard.canActivate(makeCtx('Bearer abcdefghijklmnopqrstuvwxyz', 'POST', 'orders')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts valid key and scope', async () => {
    mockPrisma.deliveryCompanyApiKey.findFirst.mockResolvedValue({
      id: 'k1',
      scopes: ['orders:write'],
      deliveryCompany: { id: 'c1', status: 'ACTIVE' },
    });
    const allowed = await guard.canActivate(
      makeCtx('Bearer abcdefghijklmnopqrstuvwxyz', 'POST', 'orders'),
    );
    expect(allowed).toBe(true);
    expect(mockPrisma.deliveryCompanyApiKey.update).toHaveBeenCalled();
  });

  it('accepts PENDING company (only SUSPENDED is blocked)', async () => {
    mockPrisma.deliveryCompanyApiKey.findFirst.mockResolvedValue({
      id: 'k1',
      scopes: ['orders:write'],
      deliveryCompany: { id: 'c1', status: 'PENDING' },
    });
    const allowed = await guard.canActivate(
      makeCtx('Bearer abcdefghijklmnopqrstuvwxyz', 'POST', 'orders'),
    );
    expect(allowed).toBe(true);
  });
});

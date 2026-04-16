import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DeliveryCompanyApiKeyGuard implements CanActivate {
  private static readonly WINDOW_MS = 60_000;
  private static readonly MAX_REQUESTS_PER_WINDOW = 120;
  private static readonly buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing API key');
    }
    const rawKey = authHeader.slice('Bearer '.length).trim();
    if (!rawKey || rawKey.length < 20) {
      throw new UnauthorizedException('Invalid API key');
    }

    const keyPrefix = rawKey.slice(0, 12);
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await this.prisma.deliveryCompanyApiKey.findFirst({
      where: {
        keyPrefix,
        keyHash,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { deliveryCompany: true },
    });
    if (!apiKey || apiKey.deliveryCompany.status !== 'ACTIVE') {
      throw new UnauthorizedException('API key rejected');
    }

    await this.prisma.deliveryCompanyApiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    this.enforceRateLimit(apiKey.id);
    this.enforceScope(req.method, req.route?.path || '', apiKey.scopes || []);

    req.deliveryCompany = apiKey.deliveryCompany;
    req.deliveryCompanyApiKey = apiKey;
    return true;
  }

  private enforceRateLimit(apiKeyId: string) {
    const now = Date.now();
    const bucket = DeliveryCompanyApiKeyGuard.buckets.get(apiKeyId);
    if (!bucket || now > bucket.resetAt) {
      DeliveryCompanyApiKeyGuard.buckets.set(apiKeyId, {
        count: 1,
        resetAt: now + DeliveryCompanyApiKeyGuard.WINDOW_MS,
      });
      return;
    }
    if (bucket.count >= DeliveryCompanyApiKeyGuard.MAX_REQUESTS_PER_WINDOW) {
      throw new ForbiddenException('Rate limit exceeded for this API key');
    }
    bucket.count += 1;
    DeliveryCompanyApiKeyGuard.buckets.set(apiKeyId, bucket);
  }

  private enforceScope(method: string, routePath: string, scopes: string[]) {
    const req = routePath.toLowerCase();
    const write = method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';
    const requiredScope =
      req.includes('wallet') ? 'wallet:read'
      : req.includes('notifications') ? 'orders:read'
      : req.includes('refund-requests') ? (write ? 'refunds:write' : 'refunds:read')
      : req.includes('orders') ? (write ? 'orders:write' : 'orders:read')
      : req.includes('departments') ? (write ? 'departments:write' : 'departments:read')
      : null;
    if (requiredScope && !scopes.includes(requiredScope)) {
      throw new ForbiddenException(`Missing API key scope: ${requiredScope}`);
    }
  }
}

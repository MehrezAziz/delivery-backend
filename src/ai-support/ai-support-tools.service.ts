import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';

export interface ToolContext {
  ticketId: string;
  userId: string;
}

type CacheEntry = { expires: number; value: unknown };

@Injectable()
export class AiSupportToolsService {
  private readonly logger = new Logger(AiSupportToolsService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 5 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  private cacheKey(tool: string, ctx: ToolContext, args: string) {
    return `${ctx.ticketId}:${ctx.userId}:${tool}:${args}`;
  }

  private getCached<T>(key: string): T | undefined {
    const e = this.cache.get(key);
    if (!e || e.expires < Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return e.value as T;
  }

  private setCached(key: string, value: unknown) {
    this.cache.set(key, { value, expires: Date.now() + this.ttlMs });
  }

  clearTicketCache(ticketId: string) {
    for (const k of this.cache.keys()) {
      if (k.startsWith(`${ticketId}:`)) this.cache.delete(k);
    }
  }

  private dec(n: { toString(): string } | null | undefined): string {
    if (n == null) return '0';
    return n.toString();
  }

  private maskPhone(phone: string | null | undefined): string | null {
    if (!phone) return null;
    const d = phone.replace(/\D/g, '');
    if (d.length < 4) return '***';
    return `***${d.slice(-4)}`;
  }

  async buildInitialContextPack(ctx: ToolContext): Promise<string> {
    const profile = await this.getUserProfile(ctx);
    const orders = await this.execute('list_orders', ctx, JSON.stringify({ limit: 3 }));
    const wallet = await this.execute('get_wallet', ctx, JSON.stringify({ limit: 5 }));
    return [
      '=== Context pack (first turn; trust tools for updates) ===',
      JSON.stringify({ profile, recentOrders: orders, walletSummary: wallet }),
    ].join('\n');
  }

  async execute(name: string, ctx: ToolContext, argsJson: string): Promise<unknown> {
    const argsKey = `${name}:${argsJson}`;
    const ck = this.cacheKey(name, ctx, argsJson);
    const hit = this.getCached<unknown>(ck);
    if (hit !== undefined) return hit;

    let result: unknown;
    try {
      let parsed: unknown = {};
      try {
        parsed = argsJson ? JSON.parse(argsJson) : {};
      } catch {
        parsed = {};
      }
      const args =
        parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
      switch (name) {
        case 'get_user_profile':
          result = await this.getUserProfile(ctx);
          break;
        case 'list_orders':
          result = await this.listOrders(ctx, args);
          break;
        case 'get_order_details':
          result = await this.getOrderDetails(ctx, args.orderId as string);
          break;
        case 'get_wallet':
          result = await this.getWallet(ctx, args);
          break;
        case 'list_addresses':
          result = await this.listAddresses(ctx);
          break;
        case 'get_support_history':
          result = await this.getSupportHistory(ctx, args);
          break;
        case 'get_peer_chat_summaries':
          result = await this.peerChatSummaries(ctx, args);
          break;
        case 'get_driver_for_order':
          result = await this.getDriverForOrder(ctx, args.orderId as string);
          break;
        case 'get_driver_position':
          result = await this.getDriverPosition(ctx, args.orderId as string);
          break;
        default:
          result = { error: `Unknown tool: ${name}` };
      }
    } catch (e) {
      this.logger.warn(`Tool ${name} failed: ${(e as Error).message}`);
      result = { error: 'TOOL_FAILED', message: 'Could not load this data right now.' };
    }

    this.setCached(ck, result);
    return result;
  }

  private async getUserProfile(ctx: ToolContext) {
    const user = await this.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: {
        id: true,
        role: true,
        firstName: true,
        secondName: true,
        phone: true,
        myEmail: true,
        createdAt: true,
        customer: { select: { id: true, completedOrders: true, customerStatus: true } },
        driver: {
          select: {
            id: true,
            vehicleType: true,
            status: true,
            driverAccount: { select: { balance: true, currency: true, completedDeliveries: true } },
          },
        },
      },
    });
    if (!user) return { error: 'USER_NOT_FOUND' };
    return {
      role: user.role,
      displayName: [user.firstName, user.secondName].filter(Boolean).join(' ') || 'User',
      phone: this.maskPhone(user.phone),
      emailDomain: user.myEmail ? user.myEmail.split('@')[1] ?? 'hidden' : null,
      customer: user.customer
        ? {
            id: user.customer.id,
            completedOrders: user.customer.completedOrders,
            status: user.customer.customerStatus,
          }
        : null,
      driver: user.driver
        ? {
            id: user.driver.id,
            vehicleType: user.driver.vehicleType,
            status: user.driver.status,
            account: user.driver.driverAccount
              ? {
                  balance: this.dec(user.driver.driverAccount.balance),
                  currency: user.driver.driverAccount.currency,
                  completedDeliveries: user.driver.driverAccount.completedDeliveries,
                }
              : null,
          }
        : null,
    };
  }

  private async listOrders(ctx: ToolContext, args: { limit?: number }) {
    const limit = Math.min(Math.max(Number(args?.limit) || 8, 1), 15);
    const user = await this.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: {
        role: true,
        customer: { select: { id: true } },
        driver: { select: { id: true } },
      },
    });
    if (!user) return { error: 'USER_NOT_FOUND' };

    if (user.role === UserRole.CUSTOMER && user.customer) {
      const rows = await this.prisma.order.findMany({
        where: { customerId: user.customer.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          status: true,
          paymentType: true,
          createdAt: true,
          price: true,
          description: true,
          driverAssignment: {
            select: {
              acceptedAt: true,
              deliveredAt: true,
              arrivedAt: true,
              pickedUpAt: true,
            },
          },
        },
      });
      return {
        role: 'CUSTOMER',
        orders: rows.map((o) => ({
          id: o.id,
          status: o.status,
          paymentType: o.paymentType,
          createdAt: o.createdAt,
          price: this.dec(o.price),
          description: o.description,
          assignment: o.driverAssignment,
        })),
      };
    }

    if (user.role === UserRole.DRIVER && user.driver) {
      const rows = await this.prisma.order.findMany({
        where: { driverAssignment: { driverId: user.driver.id } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          status: true,
          paymentType: true,
          createdAt: true,
          price: true,
          description: true,
          driverAssignment: {
            select: {
              acceptedAt: true,
              deliveredAt: true,
              arrivedAt: true,
              pickedUpAt: true,
            },
          },
        },
      });
      return {
        role: 'DRIVER',
        orders: rows.map((o) => ({
          id: o.id,
          status: o.status,
          paymentType: o.paymentType,
          createdAt: o.createdAt,
          price: this.dec(o.price),
          description: o.description,
          assignment: o.driverAssignment,
        })),
      };
    }

    return { orders: [] };
  }

  private async assertOrderAccess(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { userId: true } },
        driverAssignment: { include: { driver: { select: { userId: true } } } },
        dispute: { select: { id: true, status: true, reason: true } },
      },
    });
    if (!order) return { ok: false as const, reason: 'NOT_FOUND' as const };
    const asCustomer = order.customer.userId === userId;
    const asDriver = order.driverAssignment?.driver.userId === userId;
    if (!asCustomer && !asDriver) return { ok: false as const, reason: 'FORBIDDEN' as const };
    return { ok: true as const, order, asCustomer, asDriver };
  }

  private async getOrderDetails(ctx: ToolContext, orderId: string) {
    const access = await this.assertOrderAccess(ctx.userId, orderId);
    if (!access.ok) return { error: access.reason };
    const { order, asCustomer } = access;

    const pickup = order.pickupAddressId
      ? await this.prisma.address.findUnique({
          where: { id: order.pickupAddressId },
          include: { delegation: { include: { governorate: { select: { nameGovernorate: true } } } } },
        })
      : null;
    const dropoff = order.dropoffAddressId
      ? await this.prisma.address.findUnique({
          where: { id: order.dropoffAddressId },
          include: { delegation: { include: { governorate: { select: { nameGovernorate: true } } } } },
        })
      : null;

    const recentLoc = await this.prisma.driverLocation.findFirst({
      where: { orderId },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });
    const recentEnough = recentLoc
      ? Date.now() - recentLoc.timestamp.getTime() < 10 * 60 * 1000
      : false;

    const trackingActive = ['DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'PICKED_UP', 'DELIVERING'].includes(order.status);

    return {
      id: order.id,
      status: order.status,
      paymentType: order.paymentType,
      createdAt: order.createdAt,
      price: this.dec(order.price),
      weight: this.dec(order.weight),
      distanceKm: this.dec(order.distanceKm),
      description: order.description,
      dispute: order.dispute,
      pickup: pickup
        ? {
            street: pickup.street,
            delegation: pickup.delegation?.nameDelegation,
            governorate: pickup.delegation?.governorate?.nameGovernorate,
          }
        : null,
      dropoff: dropoff
        ? {
            street: dropoff.street,
            delegation: dropoff.delegation?.nameDelegation,
            governorate: dropoff.delegation?.governorate?.nameGovernorate,
          }
        : null,
      assignment: order.driverAssignment
        ? {
            acceptedAt: order.driverAssignment.acceptedAt,
            arrivedAt: order.driverAssignment.arrivedAt,
            pickedUpAt: order.driverAssignment.pickedUpAt,
            deliveredAt: order.driverAssignment.deliveredAt,
            cancelledBy: order.driverAssignment.cancelledBy,
            cancellationReason: order.driverAssignment.cancellationReason,
          }
        : null,
      tracking: {
        uiTrackRecommended: asCustomer && trackingActive,
        lastLocationAt: recentLoc?.timestamp ?? null,
        driverProbablyTrackable: recentEnough,
      },
    };
  }

  private async getWallet(ctx: ToolContext, args: { limit?: number }) {
    const limit = Math.min(Math.max(Number(args?.limit) || 12, 1), 25);
    const user = await this.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: {
        role: true,
        customer: { select: { id: true, wallet: true } },
        driver: { select: { id: true, driverAccount: true } },
      },
    });
    if (!user) return { error: 'USER_NOT_FOUND' };

    if (user.role === UserRole.CUSTOMER && user.customer?.wallet) {
      const w = user.customer.wallet;
      const txs = await this.prisma.walletTransaction.findMany({
        where: { walletId: w.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          type: true,
          amount: true,
          status: true,
          createdAt: true,
          orderId: true,
          balanceAfter: true,
        },
      });
      return {
        kind: 'CUSTOMER_WALLET',
        balance: this.dec(w.balance),
        currency: w.currency,
        transactions: txs.map((t) => ({
          ...t,
          amount: this.dec(t.amount),
          balanceAfter: this.dec(t.balanceAfter),
        })),
      };
    }

    if (user.role === UserRole.DRIVER && user.driver?.driverAccount) {
      const a = user.driver.driverAccount;
      const txs = await this.prisma.driverTransaction.findMany({
        where: { accountId: a.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          type: true,
          amount: true,
          createdAt: true,
          description: true,
          balanceAfter: true,
          referenceId: true,
        },
      });
      return {
        kind: 'DRIVER_ACCOUNT',
        balance: this.dec(a.balance),
        currency: a.currency,
        transactions: txs.map((t) => ({
          ...t,
          amount: this.dec(t.amount),
          balanceAfter: this.dec(t.balanceAfter),
        })),
      };
    }

    return { kind: 'NONE', message: 'No wallet for this account type.' };
  }

  private async listAddresses(ctx: ToolContext) {
    const rows = await this.prisma.address.findMany({
      where: { userId: ctx.userId },
      take: 20,
      include: { delegation: { include: { governorate: { select: { nameGovernorate: true } } } } },
    });
    return {
      addresses: rows.map((a) => ({
        id: a.id,
        street: a.street,
        delegation: a.delegation?.nameDelegation,
        governorate: a.delegation?.governorate?.nameGovernorate,
      })),
    };
  }

  private async getSupportHistory(ctx: ToolContext, args: { limit?: number }) {
    const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 10);
    const tickets = await this.prisma.supportTicket.findMany({
      where: { userId: ctx.userId, id: { not: ctx.ticketId } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        category: true,
        priority: true,
        status: true,
        createdAt: true,
        description: true,
      },
    });
    return { tickets };
  }

  private async peerChatSummaries(ctx: ToolContext, args: { limit?: number }) {
    const limit = Math.min(Math.max(Number(args.limit) || 6, 1), 12);
    const user = await this.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { customer: { select: { id: true } }, driver: { select: { id: true } } },
    });
    if (!user?.customer && !user?.driver) return { rooms: [] };

    const where = user.customer
      ? { customerId: user.customer.id }
      : { driverId: user.driver!.id };

    const rooms = await this.prisma.chatRoom.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        order: { select: { id: true, status: true } },
        messages: { orderBy: { timestamp: 'desc' }, take: 1, select: { content: true, timestamp: true, senderType: true } },
      },
    });

    return {
      rooms: rooms.map((r) => ({
        orderId: r.orderId,
        orderStatus: r.order.status,
        lastMessage: r.messages[0]
          ? {
              at: r.messages[0].timestamp,
              senderType: r.messages[0].senderType,
              preview: r.messages[0].content.slice(0, 200),
            }
          : null,
      })),
    };
  }

  private async getDriverForOrder(ctx: ToolContext, orderId: string) {
    const access = await this.assertOrderAccess(ctx.userId, orderId);
    if (!access.ok) return { error: access.reason };
    if (!access.asCustomer) {
      return { note: 'You are the driver on this order; use assignment and order details for status.' };
    }

    const assignment = await this.prisma.driverAssignment.findUnique({
      where: { orderId },
      include: {
        driver: {
          include: {
            user: { select: { firstName: true, secondName: true, phone: true } },
          },
        },
      },
    });
    if (!assignment) return { assigned: false };

    const first = assignment.driver.user.firstName ?? 'Driver';
    return {
      assigned: true,
      driverFirstName: first,
      vehicleType: assignment.driver.vehicleType,
      phoneLast4: this.maskPhone(assignment.driver.user.phone),
      timeline: {
        acceptedAt: assignment.acceptedAt,
        arrivedAt: assignment.arrivedAt,
        pickedUpAt: assignment.pickedUpAt,
        deliveredAt: assignment.deliveredAt,
      },
    };
  }

  private async getDriverPosition(ctx: ToolContext, orderId: string) {
    const access = await this.assertOrderAccess(ctx.userId, orderId);
    if (!access.ok) return { error: access.reason };
    if (!access.asCustomer) {
      return { note: 'Position tool is for customers tracking their delivery.' };
    }

    const loc = await this.prisma.driverLocation.findFirst({
      where: { orderId },
      orderBy: { timestamp: 'desc' },
    });
    if (!loc) {
      return { hasFix: false, message: 'No GPS sample stored for this order yet (driver may be offline).' };
    }
    const ageSec = (Date.now() - loc.timestamp.getTime()) / 1000;
    return {
      hasFix: true,
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracyMeters: loc.accuracy,
      recordedAt: loc.timestamp,
      recentEnough: ageSec < 600,
      ageSeconds: Math.round(ageSec),
    };
  }
}

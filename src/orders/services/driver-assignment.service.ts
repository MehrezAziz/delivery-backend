import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderSourceType, OrderStatus, DriverStatus, ChatStatus } from '@prisma/client';
import { rollbackDeliveryCompanyOrderFundsInTx } from '../../delivery-company/company-order-budget.util';

@Injectable()
export class DriverAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Get available orders for a driver, filtered by DeliveryZoneType and availability.
   */
    async getAvailableOrdersForDriver(driverId: string, forceAvailable = false) {
      const driver = await this.prisma.driver.findUnique({
        where: { id: driverId },
        include: {
          user: {
            include: {
              addresses: {
                include: { delegation: { include: { governorate: { include: { country: true } } } } },
                take: 1,
              },
            },
          },
          weeklyAvailability: {
            include: { dayAvailabilities: { include: { timePeriods: true } } },
          },
        },
      });

      if (!driver) throw new NotFoundException('Driver not found');

      if (driver.status === DriverStatus.REJECTED || driver.status === DriverStatus.SUSPENDED || (driver.status as string) === 'PAUSED') {
        throw new ForbiddenException('Your account is not eligible to view orders');
      }

      const driverAddress = driver.user.addresses[0];
      if (!driverAddress) throw new BadRequestException('Driver must have at least one address set');

      // Check driver availability (skip if forceAvailable is true)
      const isAvailable = forceAvailable || this.isDriverCurrentlyAvailable(driver.weeklyAvailability);
      if (!isAvailable) {
        return {
          canAccept: driver.status === DriverStatus.VERIFIED,
          isAvailable: false,
          sameDelegation: [],
          sameGovernorate: [],
          differentGovernorate: [],
          differentCountry: [],
        };
      }

      const driverDelegationId = driverAddress.delegationId;
      const driverGovernorateId = driverAddress.delegation.governorate.id;
      const driverCountryId = driverAddress.delegation.governorate.country.id;

      const availableOrders = await this.prisma.order.findMany({
        where: {
          status: OrderStatus.SEARCHING_DRIVER,
          driverRejections: { none: { driverId } },
        },
        include: {
          pickupAddress: { include: { delegation: { include: { governorate: { include: { country: true } } } } } },
          dropoffAddress: { include: { delegation: { include: { governorate: { include: { country: true } } } } } },
          pricingPolicy: true,
          deliveryCompany: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

      const sameDelegation: any[] = [];
      const sameGovernorate: any[] = [];
      const differentGovernorate: any[] = [];
      const differentCountry: any[] = [];

      for (const order of availableOrders) {
        if (!order.pickupAddress) continue;
        if (order.localPickupOnly || !order.dropoffAddress) {
          if (driverDelegationId === order.pickupAddress.delegationId) {
            sameDelegation.push(order);
          }
          continue;
        }
        const zoneType = order.pricingPolicy?.deliveryZoneType;
        const pickupDelegationId = order.pickupAddress.delegationId;
        const dropoffDelegationId = order.dropoffAddress.delegationId;
        const pickupGovernorateId = order.pickupAddress.delegation.governorate.id;
        const dropoffGovernorateId = order.dropoffAddress.delegation.governorate.id;
        const pickupCountryId = order.pickupAddress.delegation.governorate.country.id;
        const dropoffCountryId = order.dropoffAddress.delegation.governorate.country.id;

        let matches = false;
        let bucket: any[] | null = null;

        switch (zoneType) {
          case 'SAME_DELEGATION':
            if (driverDelegationId === pickupDelegationId || driverDelegationId === dropoffDelegationId) {
              matches = true;
              bucket = sameDelegation;
            }
            break;
          case 'SAME_GOVERNORATE':
            if (driverDelegationId === pickupDelegationId || driverDelegationId === dropoffDelegationId) {
              matches = true;
              bucket = sameGovernorate;
            }
            break;
          case 'DIFFERENT_GOVERNORATE':
            if (driverGovernorateId === pickupGovernorateId || driverGovernorateId === dropoffGovernorateId) {
              matches = true;
              bucket = differentGovernorate;
            }
            break;
          case 'DIFFERENT_COUNTRY':
            if (driverCountryId === pickupCountryId || driverCountryId === dropoffCountryId) {
              matches = true;
              bucket = differentCountry;
            }
            break;
          default:
            // Fallback: group by proximity like before
            if (pickupDelegationId === driverDelegationId) { matches = true; bucket = sameDelegation; }
            else if (pickupGovernorateId === driverGovernorateId) { matches = true; bucket = sameGovernorate; }
            else if (pickupCountryId === driverCountryId) { matches = true; bucket = differentGovernorate; }
            else { matches = true; bucket = differentCountry; }
            break;
        }

        if (matches && bucket) bucket.push(order);
      }

      const mapFn = (o: any) => this.mapOrderToResponse(o);
      return {
        canAccept: driver.status === DriverStatus.VERIFIED,
        isAvailable: true,
        sameDelegation: sameDelegation.map(mapFn),
        sameGovernorate: sameGovernorate.map(mapFn),
        differentGovernorate: differentGovernorate.map(mapFn),
        differentCountry: differentCountry.map(mapFn),
      };
    }


  /**
   * Driver accepts an order (VERIFIED only)
   */
  async acceptOrder(driverId: string, orderId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: { select: { id: true, phone: true, firstName: true, secondName: true } } },
    });
    if (!driver || driver.status !== DriverStatus.VERIFIED) {
      throw new ForbiddenException('Driver must be verified to accept orders');
    }
    // Driver must have a phone number (Google OAuth users need to add one first)
    if (!driver.user.phone) {
      throw new BadRequestException('You must add a phone number to your profile before accepting orders. Customers need to be able to contact you.');
    }

    // Check if this driver was rejected by the customer for this order
    const rejection = await this.prisma.orderDriverRejection.findUnique({
      where: { orderId_driverId: { orderId, driverId } },
    });
    if (rejection) {
      throw new ForbiddenException('The customer has declined working with you on this order');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId }, include: { customer: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.SEARCHING_DRIVER) {
      throw new BadRequestException('Order is not available for assignment');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const assignment = await tx.driverAssignment.create({
        data: { orderId, driverId, acceptedAt: new Date() },
      });
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'PENDING_CUSTOMER_APPROVAL' as any,
          ...this.buildPausedTimerUpdate(order),
        },
      });
      // Keep history: close previous active chat rooms and create a new one for this driver.
      await tx.chatRoom.updateMany({
        where: { orderId, status: ChatStatus.ACTIVE },
        data: { status: ChatStatus.CLOSED },
      });
      await tx.chatRoom.create({
        data: { orderId, customerId: order.customerId, driverId, status: ChatStatus.ACTIVE },
      });
      return assignment;
    });

    // Emit pending_customer_approval event for notifications (customer needs to approve)
    this.eventEmitter.emit('order.pending_customer_approval', {
      orderId,
      customerId: order.customerId,
      customerUserId: order.customer.userId,
      driverId,
      driverUserId: driver!.user.id,
      driverName: `${driver!.user.firstName || ''} ${driver!.user.secondName || ''}`.trim(),
    });

    return result;
  }

  // Note: This is called from the controller after acceptOrder succeeds

  /**
   * Cancel order assignment (by driver or customer)
   */
  async cancelAssignment(orderId: string, userId: string, reason: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { driverAssignment: { include: { driver: true } }, customer: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.DRIVER_ASSIGNED && (order.status as string) !== 'PENDING_CUSTOMER_APPROVAL') {
      throw new BadRequestException('Order is not in assigned state');
    }

    const isCustomer = order.customer.userId === userId;
    const isDriver = order.driverAssignment?.driver.userId === userId;
    if (!isCustomer && !isDriver) throw new ForbiddenException('Not authorized to cancel');

    await this.prisma.$transaction(async (tx) => {
      const driverId = order.driverAssignment!.driverId;
      // Delete the assignment so a new driver can accept
      await tx.driverAssignment.delete({ where: { orderId } });
      const resumedTimer = this.buildResumedTimerUpdate(order);
      const nextStatus =
        resumedTimer.cancelTimerRemainingSeconds <= 0
          ? OrderStatus.CANCELLED
          : OrderStatus.SEARCHING_DRIVER;
      await tx.order.update({
        where: { id: orderId },
        data:
          nextStatus === OrderStatus.CANCELLED
            ? {
                status: OrderStatus.CANCELLED,
                cancelTimerRemainingSeconds: 0,
                cancelTimerPausedAt: new Date(),
                cancelTimerLastResumedAt: null,
              }
            : {
                status: OrderStatus.SEARCHING_DRIVER,
                ...resumedTimer,
              },
      });
      if (nextStatus === OrderStatus.CANCELLED && order.deliveryCompanyId && order.sourceType === OrderSourceType.DELIVERY_COMPANY) {
        await rollbackDeliveryCompanyOrderFundsInTx(tx, order, 'CANCELLED');
      }
      // Close chat room
      await tx.chatRoom.updateMany({ where: { orderId }, data: { status: ChatStatus.CLOSED } });
      // Update driver performance metrics — increment totalOrders and cancelledOrders
      const metrics = await tx.driverPerformanceMetrics.findUnique({ where: { driverId } });
      if (metrics) {
        const newTotal = metrics.totalOrders + 1;
        const newCancelled = metrics.cancelledOrders + 1;
        const completionRate = newTotal > 0 ? (metrics.completedOrders / newTotal) * 100 : 0;
        await tx.driverPerformanceMetrics.update({
          where: { driverId },
          data: { totalOrders: newTotal, cancelledOrders: newCancelled, completionRate, lastCalculatedAt: new Date() },
        });
      }
    });

    return { message: 'Order assignment cancelled successfully' };
  }

  private mapOrderToResponse(order: any) {
    const companyName =
      order.sourceType === OrderSourceType.DELIVERY_COMPANY && order.deliveryCompany?.name
        ? String(order.deliveryCompany.name)
        : null;
    return {
      id: order.id,
      customerId: order.customerId,
      status: order.status,
      sourceType: order.sourceType,
      deliveryCompanyId: order.deliveryCompanyId ?? null,
      deliveryCompanyName: companyName,
      paymentType: order.paymentType, description: order.description,
      weight: Number(order.weight), distanceKm: Number(order.distanceKm),
      price: Number(order.price), nightFee: Number(order.nightFee),
      extraWeightFee: Number(order.extraWeightFee), isNightDelivery: order.isNightDelivery,
      localPickupOnly: !!order.localPickupOnly,
      deliveryZoneType: order.pricingPolicy?.deliveryZoneType || null, createdAt: order.createdAt,
      pickupAddress: order.pickupAddress ? {
        id: order.pickupAddress.id, street: order.pickupAddress.street,
        latitude: order.pickupAddress.latitude, longitude: order.pickupAddress.longitude,
        delegation: { nameDelegation: order.pickupAddress.delegation.nameDelegation,
          governorate: { nameGovernorate: order.pickupAddress.delegation.governorate.nameGovernorate,
            country: { name: order.pickupAddress.delegation.governorate.country.name } } },
      } : null,
      dropoffAddress: order.dropoffAddress ? {
        id: order.dropoffAddress.id, street: order.dropoffAddress.street,
        latitude: order.dropoffAddress.latitude, longitude: order.dropoffAddress.longitude,
        delegation: { nameDelegation: order.dropoffAddress.delegation.nameDelegation,
          governorate: { nameGovernorate: order.dropoffAddress.delegation.governorate.nameGovernorate,
            country: { name: order.dropoffAddress.delegation.governorate.country.name } } },
      } : null,
    };
  }

  private computeCancelRemainingSeconds(order: any): number {
    const fallback = Math.max(0, Number(order.cancelAfterMinutes ?? 15) * 60);
    const baseRemaining = typeof order.cancelTimerRemainingSeconds === 'number'
      ? order.cancelTimerRemainingSeconds
      : fallback;
    if (order.status !== OrderStatus.SEARCHING_DRIVER) return Math.max(0, baseRemaining);
    const lastResumedAt = order.cancelTimerLastResumedAt ? new Date(order.cancelTimerLastResumedAt).getTime() : null;
    if (!lastResumedAt) return Math.max(0, baseRemaining);
    const elapsedSec = Math.floor((Date.now() - lastResumedAt) / 1000);
    return Math.max(0, baseRemaining - elapsedSec);
  }

  private buildPausedTimerUpdate(order: any) {
    return {
      cancelTimerRemainingSeconds: this.computeCancelRemainingSeconds(order),
      cancelTimerPausedAt: new Date(),
      cancelTimerLastResumedAt: null,
    };
  }

  private buildResumedTimerUpdate(order: any) {
    return {
      cancelTimerRemainingSeconds: this.computeCancelRemainingSeconds(order),
      cancelTimerPausedAt: null,
      cancelTimerLastResumedAt: new Date(),
    };
  }

  /**
   * Check if driver is currently available based on their weekly schedule
   */
  isDriverCurrentlyAvailable(weeklyAvailability: any): boolean {
    if (!weeklyAvailability || weeklyAvailability.status !== 'ACTIVE') return false;
    const now = new Date();
    const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const todayName = dayNames[now.getDay()];
    const todayAvail = weeklyAvailability.dayAvailabilities?.find(
      (d: any) => d.dayOfWeek === todayName,
    );
    if (!todayAvail || !todayAvail.timePeriods?.length) return false;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return todayAvail.timePeriods.some((tp: any) => {
      const start = new Date(tp.startTime);
      const end = new Date(tp.endTime);
      const startMin = start.getUTCHours() * 60 + start.getUTCMinutes();
      const endMin = end.getUTCHours() * 60 + end.getUTCMinutes();
      return currentMinutes >= startMin && currentMinutes <= endMin;
    });
  }

  /**
   * Search orders by geographic filter (ignores driver address and availability)
   */
  async searchOrdersByGeography(driverId: string, filters: {
    countryId?: string; governorateId?: string; delegationId?: string;
  }) {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found');
    if (driver.status === DriverStatus.REJECTED || driver.status === DriverStatus.SUSPENDED || (driver.status as string) === 'PAUSED') {
      throw new ForbiddenException('Your account is not eligible to view orders');
    }

    const addressFilter: any[] = [];
    if (filters.delegationId) {
      addressFilter.push(
        { pickupAddress: { delegationId: filters.delegationId } },
        { dropoffAddress: { delegationId: filters.delegationId } },
      );
    } else if (filters.governorateId) {
      addressFilter.push(
        { pickupAddress: { delegation: { governorateId: filters.governorateId } } },
        { dropoffAddress: { delegation: { governorateId: filters.governorateId } } },
      );
    } else if (filters.countryId) {
      addressFilter.push(
        { pickupAddress: { delegation: { governorate: { countryId: filters.countryId } } } },
        { dropoffAddress: { delegation: { governorate: { countryId: filters.countryId } } } },
      );
    }

    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.SEARCHING_DRIVER,
        driverRejections: { none: { driverId } },
        ...(addressFilter.length > 0 ? { OR: addressFilter } : {}),
      },
      include: {
        pickupAddress: { include: { delegation: { include: { governorate: { include: { country: true } } } } } },
        dropoffAddress: { include: { delegation: { include: { governorate: { include: { country: true } } } } } },
        pricingPolicy: true,
        deliveryCompany: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      canAccept: driver.status === DriverStatus.VERIFIED,
      orders: orders.map((o: any) => this.mapOrderToResponse(o)),
    };
  }

  /**
   * Search orders by multiple geographic IDs (multi-select quick filter)
   */
  async searchOrdersByMultipleGeography(driverId: string, filters: {
    delegationIds?: string[]; governorateIds?: string[]; countryIds?: string[];
  }) {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found');
    if (driver.status === DriverStatus.REJECTED || driver.status === DriverStatus.SUSPENDED || (driver.status as string) === 'PAUSED') {
      throw new ForbiddenException('Your account is not eligible to view orders');
    }

    const addressFilter: any[] = [];
    if (filters.delegationIds?.length) {
      addressFilter.push(
        { pickupAddress: { delegationId: { in: filters.delegationIds } } },
        { dropoffAddress: { delegationId: { in: filters.delegationIds } } },
      );
    } else if (filters.governorateIds?.length) {
      addressFilter.push(
        { pickupAddress: { delegation: { governorateId: { in: filters.governorateIds } } } },
        { dropoffAddress: { delegation: { governorateId: { in: filters.governorateIds } } } },
      );
    } else if (filters.countryIds?.length) {
      addressFilter.push(
        { pickupAddress: { delegation: { governorate: { countryId: { in: filters.countryIds } } } } },
        { dropoffAddress: { delegation: { governorate: { countryId: { in: filters.countryIds } } } } },
      );
    }

    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.SEARCHING_DRIVER,
        driverRejections: { none: { driverId } },
        ...(addressFilter.length > 0 ? { OR: addressFilter } : {}),
      },
      include: {
        pickupAddress: { include: { delegation: { include: { governorate: { include: { country: true } } } } } },
        dropoffAddress: { include: { delegation: { include: { governorate: { include: { country: true } } } } } },
        pricingPolicy: true,
        deliveryCompany: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      canAccept: driver.status === DriverStatus.VERIFIED,
      orders: orders.map((o: any) => this.mapOrderToResponse(o)),
    };
  }

  /**
   * Check if there are any available orders in the driver's delegation zone.
   * Uses a count query with take:1 for performance.
   */
  async hasAvailableOrdersForDriver(driverId: string): Promise<boolean> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        user: {
          include: {
            addresses: {
              select: { delegationId: true },
            },
          },
        },
      },
    });

    if (!driver) throw new NotFoundException('Driver not found');

    const delegationIds = driver.user.addresses
      .map((a) => a.delegationId)
      .filter(Boolean) as string[];

    if (delegationIds.length === 0) return false;

    const count = await this.prisma.order.count({
      take: 1,
      where: {
        status: OrderStatus.SEARCHING_DRIVER,
        pickupAddress: {
          delegationId: { in: delegationIds },
        },
        driverRejections: { none: { driverId } },
      },
    });

    return count > 0;
  }

  /**
   * Get orders where this driver was rejected by the customer
   */
  async getRejectedOrders(driverId: string) {
    const rejections = await this.prisma.orderDriverRejection.findMany({
      where: {
        driverId,
        order: {
          status: { in: [OrderStatus.SEARCHING_DRIVER, OrderStatus.DRIVER_ASSIGNED, OrderStatus.DRIVER_ARRIVED, OrderStatus.PICKED_UP, OrderStatus.DELIVERING] },
        },
      },
      include: {
        order: {
          include: {
            pickupAddress: { include: { delegation: { include: { governorate: { include: { country: true } } } } } },
            dropoffAddress: { include: { delegation: { include: { governorate: { include: { country: true } } } } } },
            pricingPolicy: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rejections.map(r => ({
      rejectionId: r.id,
      rejectedAt: r.createdAt,
      reason: r.reason,
      order: this.mapOrderToResponse(r.order),
    }));
  }

}

import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus, DriverStatus, ChatStatus } from '@prisma/client';

@Injectable()
export class DriverAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get available orders for a driver, prioritized by delivery zone type.
   * INCOMPLETE/PENDING_REVIEW drivers can see orders but cannot accept.
   */
  async getAvailableOrdersForDriver(driverId: string) {
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
      },
    });

    if (!driver) throw new NotFoundException('Driver not found');

    // INCOMPLETE and PENDING_REVIEW can view, VERIFIED can view+accept
    // REJECTED and SUSPENDED cannot view
    if (driver.status === DriverStatus.REJECTED || driver.status === DriverStatus.SUSPENDED) {
      throw new ForbiddenException('Your account is not eligible to view orders');
    }

    const driverAddress = driver.user.addresses[0];
    if (!driverAddress) throw new BadRequestException('Driver must have at least one address set');

    const driverDelegationId = driverAddress.delegationId;
    const driverGovernorateId = driverAddress.delegation.governorate.id;
    const driverCountryId = driverAddress.delegation.governorate.country.id;

    const availableOrders = await this.prisma.order.findMany({
      where: { status: OrderStatus.SEARCHING_DRIVER },
      include: {
        pickupAddress: { include: { delegation: { include: { governorate: { include: { country: true } } } } } },
        dropoffAddress: { include: { delegation: { include: { governorate: { include: { country: true } } } } } },
        pricingPolicy: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const sameDelegation: any[] = [];
    const sameGovernorate: any[] = [];
    const differentGovernorate: any[] = [];
    const differentCountry: any[] = [];

    for (const order of availableOrders) {
      if (!order.pickupAddress) continue;
      const pickupDelegationId = order.pickupAddress.delegationId;
      const pickupGovernorateId = order.pickupAddress.delegation.governorate.id;
      const pickupCountryId = order.pickupAddress.delegation.governorate.country.id;

      if (pickupDelegationId === driverDelegationId) sameDelegation.push(order);
      else if (pickupGovernorateId === driverGovernorateId) sameGovernorate.push(order);
      else if (pickupCountryId === driverCountryId) differentGovernorate.push(order);
      else differentCountry.push(order);
    }

    const mapFn = (o: any) => this.mapOrderToResponse(o);
    return {
      canAccept: driver.status === DriverStatus.VERIFIED,
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
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver || driver.status !== DriverStatus.VERIFIED) {
      throw new ForbiddenException('Driver must be verified to accept orders');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId }, include: { customer: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.SEARCHING_DRIVER) {
      throw new BadRequestException('Order is not available for assignment');
    }

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.driverAssignment.create({
        data: { orderId, driverId, acceptedAt: new Date() },
      });
      await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.DRIVER_ASSIGNED } });
      // Open chat room between driver and customer
      await tx.chatRoom.create({
        data: { orderId, customerId: order.customerId, driverId, status: ChatStatus.ACTIVE },
      });
      return assignment;
    });
  }

  /**
   * Cancel order assignment (by driver or customer)
   */
  async cancelAssignment(orderId: string, userId: string, reason: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { driverAssignment: { include: { driver: true } }, customer: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.DRIVER_ASSIGNED) {
      throw new BadRequestException('Order is not in assigned state');
    }

    const isCustomer = order.customer.userId === userId;
    const isDriver = order.driverAssignment?.driver.userId === userId;
    if (!isCustomer && !isDriver) throw new ForbiddenException('Not authorized to cancel');

    await this.prisma.$transaction(async (tx) => {
      // Delete the assignment so a new driver can accept
      await tx.driverAssignment.delete({ where: { orderId } });
      await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.SEARCHING_DRIVER } });
      // Close chat room
      await tx.chatRoom.updateMany({ where: { orderId }, data: { status: ChatStatus.CLOSED } });
    });

    return { message: 'Order assignment cancelled successfully' };
  }

  private mapOrderToResponse(order: any) {
    return {
      id: order.id, customerId: order.customerId, status: order.status,
      paymentType: order.paymentType, description: order.description,
      weight: Number(order.weight), distanceKm: Number(order.distanceKm),
      price: Number(order.price), nightFee: Number(order.nightFee),
      extraWeightFee: Number(order.extraWeightFee), isNightDelivery: order.isNightDelivery,
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
}

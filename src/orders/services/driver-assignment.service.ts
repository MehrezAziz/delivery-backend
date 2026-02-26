import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus, DriverStatus, DeliveryZoneType, ChatStatus } from '@prisma/client';

@Injectable()
export class DriverAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get available orders for a driver, prioritized by delivery zone type
   */
  async getAvailableOrdersForDriver(driverId: string) {
    // Get driver's location (delegation, governorate, country)
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        user: {
          include: {
            addresses: {
              include: {
                delegation: {
                  include: {
                    governorate: {
                      include: {
                        country: true,
                      },
                    },
                  },
                },
              },
              take: 1, // Get first address as driver's location
            },
          },
        },
      },
    });

    if (!driver || driver.status !== DriverStatus.VERIFIED) {
      throw new ForbiddenException('Driver must be verified to view orders');
    }

    const driverAddress = driver.user.addresses[0];
    if (!driverAddress) {
      throw new BadRequestException('Driver must have at least one address set');
    }

    const driverDelegationId = driverAddress.delegationId;
    const driverGovernorateId = driverAddress.delegation.governorate.id;
    const driverCountryId = driverAddress.delegation.governorate.country.id;

    // Get all available orders (SEARCHING_DRIVER status)
    const availableOrders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.SEARCHING_DRIVER,
      },
      include: {
        pickupAddress: {
          include: {
            delegation: {
              include: {
                governorate: {
                  include: {
                    country: true,
                  },
                },
              },
            },
          },
        },
        dropoffAddress: {
          include: {
            delegation: {
              include: {
                governorate: {
                  include: {
                    country: true,
                  },
                },
              },
            },
          },
        },
        pricingPolicy: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Categorize orders by delivery zone type relative to driver's location
    const sameDelegation: any[] = [];
    const sameGovernorate: any[] = [];
    const differentGovernorate: any[] = [];
    const differentCountry: any[] = [];

    for (const order of availableOrders) {
      if (!order.pickupAddress || !order.dropoffAddress) continue;

      const pickupDelegationId = order.pickupAddress.delegationId;
      const pickupGovernorateId = order.pickupAddress.delegation.governorate.id;
      const pickupCountryId = order.pickupAddress.delegation.governorate.country.id;

      // Determine category based on pickup location relative to driver
      if (pickupDelegationId === driverDelegationId) {
        sameDelegation.push(order);
      } else if (pickupGovernorateId === driverGovernorateId) {
        sameGovernorate.push(order);
      } else if (pickupCountryId === driverCountryId) {
        differentGovernorate.push(order);
      } else {
        differentCountry.push(order);
      }
    }

    return {
      sameDelegation: sameDelegation.map(o => this.mapOrderToResponse(o)),
      sameGovernorate: sameGovernorate.map(o => this.mapOrderToResponse(o)),
      differentGovernorate: differentGovernorate.map(o => this.mapOrderToResponse(o)),
      differentCountry: differentCountry.map(o => this.mapOrderToResponse(o)),
    };
  }

  /**
   * Driver accepts an order
   */
  async acceptOrder(driverId: string, orderId: string) {
    // Check if driver is verified
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver || driver.status !== DriverStatus.VERIFIED) {
      throw new ForbiddenException('Driver must be verified to accept orders');
    }

    // Check if order exists and is available
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.SEARCHING_DRIVER) {
      throw new BadRequestException('Order is not available for assignment');
    }

    // Create driver assignment and update order status in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create driver assignment
      const assignment = await tx.driverAssignment.create({
        data: {
          orderId,
          driverId,
          acceptedAt: new Date(),
        },
      });

      // Update order status
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.DRIVER_ASSIGNED },
      });

      // Create chat room between driver and customer
      await tx.chatRoom.create({
        data: {
          orderId,
          customerId: order.customerId,
          driverId,
          status: ChatStatus.ACTIVE,
        },
      });

      return assignment;
    });

    return result;
  }

  /**
   * Cancel order assignment (by driver or customer)
   */
  async cancelAssignment(
    orderId: string,
    userId: string,
    reason: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        driverAssignment: {
          include: {
            driver: true,
          },
        },
        customer: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.DRIVER_ASSIGNED) {
      throw new BadRequestException('Order is not in assigned state');
    }

    // Verify user is either the customer or the assigned driver
    const isCustomer = order.customer.userId === userId;
    const isDriver = order.driverAssignment?.driver.userId === userId;

    if (!isCustomer && !isDriver) {
      throw new ForbiddenException('You are not authorized to cancel this order');
    }

    // Cancel assignment and make order available again
    await this.prisma.$transaction(async (tx) => {
      // Update driver assignment with cancellation info
      await tx.driverAssignment.update({
        where: { orderId },
        data: {
          cancelledBy: userId,
          cancellationReason: reason,
        },
      });

      // Update order status back to SEARCHING_DRIVER
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.SEARCHING_DRIVER },
      });

      // Close chat room
      await tx.chatRoom.updateMany({
        where: { orderId },
        data: { status: ChatStatus.CLOSED },
      });
    });

    return { message: 'Order assignment cancelled successfully' };
  }

  private mapOrderToResponse(order: any) {
    return {
      id: order.id,
      customerId: order.customerId,
      status: order.status,
      paymentType: order.paymentType,
      description: order.description,
      weight: Number(order.weight),
      distanceKm: Number(order.distanceKm),
      price: Number(order.price),
      nightFee: Number(order.nightFee),
      extraWeightFee: Number(order.extraWeightFee),
      isNightDelivery: order.isNightDelivery,
      deliveryZoneType: order.pricingPolicy?.deliveryZoneType || null,
      createdAt: order.createdAt,
      pickupAddress: order.pickupAddress ? {
        id: order.pickupAddress.id,
        street: order.pickupAddress.street,
        latitude: order.pickupAddress.latitude,
        longitude: order.pickupAddress.longitude,
        delegation: {
          nameDelegation: order.pickupAddress.delegation.nameDelegation,
          governorate: {
            nameGovernorate: order.pickupAddress.delegation.governorate.nameGovernorate,
            country: {
              name: order.pickupAddress.delegation.governorate.country.name,
            },
          },
        },
      } : null,
      dropoffAddress: order.dropoffAddress ? {
        id: order.dropoffAddress.id,
        street: order.dropoffAddress.street,
        latitude: order.dropoffAddress.latitude,
        longitude: order.dropoffAddress.longitude,
        delegation: {
          nameDelegation: order.dropoffAddress.delegation.nameDelegation,
          governorate: {
            nameGovernorate: order.dropoffAddress.delegation.governorate.nameGovernorate,
            country: {
              name: order.dropoffAddress.delegation.governorate.country.name,
            },
          },
        },
      } : null,
    };
  }
}

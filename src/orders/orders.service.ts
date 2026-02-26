import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PriceCalculationService } from './services/price-calculation.service';
import { CreateOrderDto, OrderResponseDto } from './dto/order.dto';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly priceCalculationService: PriceCalculationService,
  ) {}

  /**
   * Create a new order
   */
  async createOrder(customerId: string, dto: CreateOrderDto): Promise<OrderResponseDto> {
    // Verify addresses belong to the customer
    const [pickupAddress, dropoffAddress] = await Promise.all([
      this.prisma.address.findUnique({ where: { id: dto.pickupAddressId } }),
      this.prisma.address.findUnique({ where: { id: dto.dropoffAddressId } }),
    ]);

    if (!pickupAddress || !dropoffAddress) {
      throw new NotFoundException('Address not found');
    }

    if (pickupAddress.userId !== customerId || dropoffAddress.userId !== customerId) {
      throw new ForbiddenException('You can only use your own addresses');
    }

    // Calculate price and distance
    const priceCalculation = await this.priceCalculationService.calculatePrice(
      dto.pickupAddressId,
      dto.dropoffAddressId,
      dto.weight,
      dto.isNightDelivery || false,
    );

    // Get customer record
    const customer = await this.prisma.customer.findUnique({
      where: { userId: customerId },
    });

    if (!customer) {
      throw new NotFoundException('Customer profile not found');
    }

    // Calculate distance
    const distance = this.priceCalculationService.calculateDistance(
      pickupAddress.latitude!,
      pickupAddress.longitude!,
      dropoffAddress.latitude!,
      dropoffAddress.longitude!,
    );

    // Create order
    const order = await this.prisma.order.create({
      data: {
        customerId: customer.id,
        pricingPolicyId: priceCalculation.pricingPolicyId,
        pickupAddressId: dto.pickupAddressId,
        dropoffAddressId: dto.dropoffAddressId,
        status: OrderStatus.SEARCHING_DRIVER,
        paymentType: dto.paymentType,
        description: dto.description,
        weight: dto.weight,
        distanceKm: distance,
        price: priceCalculation.totalPrice,
        nightFee: priceCalculation.nightFee,
        extraWeightFee: priceCalculation.extraWeightFee,
        isNightDelivery: dto.isNightDelivery || false,
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
    });

    return this.mapToResponseDto(order);
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId: string, userId: string): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
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
        driverAssignment: {
          include: {
            driver: {
              include: {
                user: true,
              },
            },
          },
        },
        pricingPolicy: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Verify user has access to this order
    const isCustomer = order.customer.userId === userId;
    const isDriver = order.driverAssignment?.driver.userId === userId;

    if (!isCustomer && !isDriver) {
      throw new ForbiddenException('You do not have access to this order');
    }

    return this.mapToResponseDto(order);
  }

  /**
   * Get customer's orders
   */
  async getCustomerOrders(customerId: string): Promise<OrderResponseDto[]> {
    const customer = await this.prisma.customer.findUnique({
      where: { userId: customerId },
    });

    if (!customer) {
      throw new NotFoundException('Customer profile not found');
    }

    const orders = await this.prisma.order.findMany({
      where: { customerId: customer.id },
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
        driverAssignment: {
          include: {
            driver: {
              include: {
                user: true,
              },
            },
          },
        },
        pricingPolicy: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return orders.map(order => this.mapToResponseDto(order));
  }

  /**
   * Get driver's assigned orders
   */
  async getDriverOrders(driverId: string): Promise<OrderResponseDto[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        driverAssignment: {
          driverId,
        },
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
        driverAssignment: {
          include: {
            driver: {
              include: {
                user: true,
              },
            },
          },
        },
        pricingPolicy: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return orders.map(order => this.mapToResponseDto(order));
  }

  /**
   * Cancel order (customer only, before driver assignment)
   */
  async cancelOrder(orderId: string, userId: string, reason: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.customer.userId !== userId) {
      throw new ForbiddenException('You can only cancel your own orders');
    }

    if (order.status !== OrderStatus.SEARCHING_DRIVER && order.status !== OrderStatus.DRAFT) {
      throw new BadRequestException('Order cannot be cancelled at this stage');
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });
  }

  private mapToResponseDto(order: any): OrderResponseDto {
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
      driverAssignment: order.driverAssignment ? {
        id: order.driverAssignment.id,
        driverId: order.driverAssignment.driverId,
        acceptedAt: order.driverAssignment.acceptedAt,
        driver: {
          userId: order.driverAssignment.driver.userId,
          user: {
            firstName: order.driverAssignment.driver.user.firstName,
            secondName: order.driverAssignment.driver.user.secondName,
            phone: order.driverAssignment.driver.user.phone,
          },
        },
      } : null,
    };
  }
}

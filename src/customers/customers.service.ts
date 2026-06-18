import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCustomerDto, CustomerResponseDto, CustomerListResponseDto, CustomerStatsDto } from './dto/customer.dto';
import {
  NotificationPreferencesDto,
  UpdateNotificationPreferencesDto,
} from './dto/notification-preferences.dto';
import { SetupCustomerDto } from './dto/setup-customer.dto';
import { UpsertCountryPreferenceDto } from './dto/country-preference.dto';
import { CustomerStatus } from '@prisma/client';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Get customer by ID (for authenticated customer to view their own profile)
   */
  async getCustomerProfile(userId: string): Promise<CustomerResponseDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            password: true,
            firstName: true,
            secondName: true,
            image: true,
            myEmail: true,
            userGender: true,
            role: true,
            createdAt: true,
          },
        },
        myReferralCode: {
          select: {
            id: true,
            code: true,
            type: true,
            value: true,
            active: true,
          },
        },
        referredByCode: {
          select: {
            id: true,
            code: true,
            type: true,
            value: true,
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer profile not found');
    }

    return this.mapToResponseDto(customer);
  }

  /**
   * Update customer profile (for authenticated customer)
   */
  async updateCustomerProfile(userId: string, dto: UpdateCustomerDto): Promise<CustomerResponseDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { userId },
    });

    if (!customer) {
      throw new NotFoundException('Customer profile not found');
    }

    // Check phone uniqueness if phone is being updated
    if (dto.phone) {
      const existingUser = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
      if (existingUser && existingUser.id !== userId) {
        throw new BadRequestException('This phone number is already in use');
      }
    }

    // Update user fields
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName,
        secondName: dto.secondName,
        phone: dto.phone,
        myEmail: dto.myEmail,
        userGender: dto.userGender,
        image: dto.image,
      },
    });

    // Fetch and return updated customer data
    const updatedCustomer = await this.prisma.customer.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            firstName: true,
            secondName: true,
            image: true,
            myEmail: true,
            userGender: true,
            role: true,
            createdAt: true,
          },
        },
        myReferralCode: {
          select: {
            id: true,
            code: true,
            type: true,
            value: true,
            active: true,
          },
        },
        referredByCode: {
          select: {
            id: true,
            code: true,
            type: true,
            value: true,
          },
        },
      },
    });

    return this.mapToResponseDto(updatedCustomer);
  }

  /**
   * Get all customers (Admin only)
   */
  async getAllCustomers(page: number = 1, limit: number = 20): Promise<{
    customers: CustomerListResponseDto[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        skip,
        take: limit,
        include: {
          user: {
            select: {
              phone: true,
              firstName: true,
              secondName: true,
            },
          },
        },
        orderBy: {
          user: {
            createdAt: 'desc',
          },
        },
      }),
      this.prisma.customer.count(),
    ]);

    return {
      customers: customers.map(c => this.mapToListDto(c)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get customer by ID (Admin only)
   */
  async getCustomerById(customerId: string): Promise<CustomerResponseDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            firstName: true,
            secondName: true,
            image: true,
            myEmail: true,
            userGender: true,
            role: true,
            createdAt: true,
          },
        },
        myReferralCode: {
          select: {
            id: true,
            code: true,
            type: true,
            value: true,
            active: true,
          },
        },
        referredByCode: {
          select: {
            id: true,
            code: true,
            type: true,
            value: true,
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.mapToResponseDto(customer);
  }

  /**
   * Delete customer (Admin only) - Soft delete by blocking the user
   */
  async deleteCustomer(customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Soft delete by setting customer status to BLOCKED
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { customerStatus: CustomerStatus.BLOCKED },
    });
  }

  /**
   * Get customer statistics (Admin only)
   */
  async getCustomerStats(): Promise<CustomerStatsDto> {
    const [totalCustomers, activeCustomers, blockedCustomers, customersWithOrders] = await Promise.all([
      this.prisma.customer.count(),
      this.prisma.customer.count({
        where: {
          customerStatus: CustomerStatus.ACTIVE,
        },
      }),
      this.prisma.customer.count({
        where: {
          customerStatus: CustomerStatus.BLOCKED,
        },
      }),
      this.prisma.customer.count({
        where: {
          completedOrders: {
            gt: 0,
          },
        },
      }),
    ]);

    const totalOrders = await this.prisma.customer.aggregate({
      _sum: {
        completedOrders: true,
      },
    });

    const averageOrdersPerCustomer = totalCustomers > 0 
      ? (totalOrders._sum.completedOrders || 0) / totalCustomers 
      : 0;

    return {
      totalCustomers,
      activeCustomers,
      blockedCustomers,
      customersWithOrders,
      averageOrdersPerCustomer: Math.round(averageOrdersPerCustomer * 100) / 100,
    };
  }

  /**
   * Search customers by phone or name (Admin only)
   */
  async searchCustomers(query: string): Promise<CustomerListResponseDto[]> {
    const customers = await this.prisma.customer.findMany({
      where: {
        user: {
          OR: [
            { phone: { contains: query } },
            { firstName: { contains: query, mode: 'insensitive' } },
            { secondName: { contains: query, mode: 'insensitive' } },
          ],
        },
      },
      include: {
        user: {
          select: {
            phone: true,
            firstName: true,
            secondName: true,
          },
        },
      },
      take: 20,
    });

    return customers.map(c => this.mapToListDto(c));
  }

  /**
   * Customer setup: choose country (creates wallet) + required address (delegation).
   * Transitions status from CREATED → ACTIVE.
   * If already ACTIVE (wallet exists), just creates/updates the address.
   */
  async setupCustomer(userId: string, dto: SetupCustomerDto) {
    const customer = await this.prisma.customer.findUnique({ where: { userId } });
    if (!customer) throw new NotFoundException('Customer not found');

    // Validate country
    const country = await this.prisma.country.findUnique({ where: { id: dto.countryId } });
    if (!country || !country.isActive) throw new NotFoundException('Country not found');

    // Validate delegation (required)
    if (!dto.address?.delegationId) {
      throw new BadRequestException('Delegation is required');
    }
    const delegation = await this.prisma.delegation.findUnique({
      where: { id: dto.address.delegationId },
    });
    if (!delegation) throw new NotFoundException('Delegation not found');

    return this.prisma.$transaction(async (tx) => {
      if (customer.customerStatus === CustomerStatus.CREATED) {
        await this.walletService.createWalletForCustomer(customer.id, dto.countryId, tx);
        await tx.customer.update({
          where: { id: customer.id },
          data: { customerStatus: CustomerStatus.ACTIVE },
        });
      }

      await tx.address.create({
        data: {
          latitude: null,
          longitude: null,
          street: dto.address!.street ?? null,
          delegationId: dto.address!.delegationId,
          nickname: 'MAIN',
          userId,
        },
      });

      return { message: 'Setup completed. Wallet and address saved successfully.' };
    });
  }

  async getCountryPreferences(userId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { userId } });
    if (!customer) throw new NotFoundException('Customer not found');
    const prefs = await this.prisma.customerCountryPreference.findMany({
      where: { customerId: customer.id },
      include: { country: { select: { id: true, name: true, isoCode: true, currencyCode: true } } },
    });
    return prefs.map((p) => ({
      countryId: p.countryId,
      countryName: p.country.name,
      isoCode: p.country.isoCode,
      currencyCode: p.country.currencyCode,
      codOnly: p.codOnly,
    }));
  }

  async upsertCountryPreference(userId: string, countryId: string, dto: UpsertCountryPreferenceDto) {
    const customer = await this.prisma.customer.findUnique({ where: { userId } });
    if (!customer) throw new NotFoundException('Customer not found');
    const country = await this.prisma.country.findUnique({ where: { id: countryId } });
    if (!country) throw new NotFoundException('Country not found');

    const pref = await this.prisma.customerCountryPreference.upsert({
      where: { customerId_countryId: { customerId: customer.id, countryId } },
      create: { customerId: customer.id, countryId, codOnly: dto.codOnly },
      update: { codOnly: dto.codOnly },
    });
    return { countryId: pref.countryId, codOnly: pref.codOnly };
  }

  async getNotificationPreferences(userId: string): Promise<NotificationPreferencesDto> {
    const customer = await this.prisma.customer.findUnique({ where: { userId } });
    if (!customer) throw new NotFoundException('Customer profile not found');
    return {
      notifyReferralCommission: customer.notifyReferralCommission,
      notifyGameEvents: customer.notifyGameEvents,
    };
  }

  async updateNotificationPreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesDto> {
    const customer = await this.prisma.customer.findUnique({ where: { userId } });
    if (!customer) throw new NotFoundException('Customer profile not found');
    const updated = await this.prisma.customer.update({
      where: { userId },
      data: {
        ...(dto.notifyReferralCommission !== undefined
          ? { notifyReferralCommission: dto.notifyReferralCommission }
          : {}),
        ...(dto.notifyGameEvents !== undefined
          ? { notifyGameEvents: dto.notifyGameEvents }
          : {}),
      },
    });
    return {
      notifyReferralCommission: updated.notifyReferralCommission,
      notifyGameEvents: updated.notifyGameEvents,
    };
  }

  private mapToResponseDto(customer: any): CustomerResponseDto {
    const { password, ...userWithoutPassword } = customer.user || {};
    return {
      id: customer.id,
      userId: customer.userId,
      completedOrders: customer.completedOrders,
      customerStatus: customer.customerStatus,
      referredByCodeId: customer.referredByCodeId,
      user: { ...userWithoutPassword, hasPassword: !!password },
      myReferralCode: customer.myReferralCode,
      referredByCode: customer.referredByCode,
    };
  }

  private mapToListDto(customer: any): CustomerListResponseDto {
    return {
      id: customer.id,
      userId: customer.userId,
      completedOrders: customer.completedOrders,
      user: customer.user,
    };
  }
}

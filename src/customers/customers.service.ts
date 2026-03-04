import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCustomerDto, CustomerResponseDto, CustomerListResponseDto, CustomerStatsDto } from './dto/customer.dto';
import { CustomerStatus } from '@prisma/client';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

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

    // Update user fields
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName,
        secondName: dto.secondName,
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

  private mapToResponseDto(customer: any): CustomerResponseDto {
    return {
      id: customer.id,
      userId: customer.userId,
      completedOrders: customer.completedOrders,
      customerStatus: customer.customerStatus,
      referredByCodeId: customer.referredByCodeId,
      user: customer.user,
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

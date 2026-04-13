import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerServiceDto, UpdateCustomerServiceDto, UpdateCustomerServiceRolesDto, CustomerServiceResponseDto, CustomerServiceListDto } from '../dto/customer-service.dto';
import { SuperUserRole, UserStatus, CustomerServiceRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class CustomerServiceManagementService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new customer service account
   */
  async createCustomerService(dto: CreateCustomerServiceDto): Promise<CustomerServiceResponseDto> {
    // Check if telephone, pseudo, or email already exists
    const existing = await this.prisma.superUser.findFirst({
      where: {
        OR: [
          { telephone: dto.telephone },
          { pseudo: dto.pseudo },
          { email: dto.email },
        ],
      },
    });

    if (existing) {
      if (existing.telephone === dto.telephone) {
        throw new ConflictException('Telephone already exists');
      }
      if (existing.pseudo === dto.pseudo) {
        throw new ConflictException('Pseudo already exists');
      }
      if (existing.email === dto.email) {
        throw new ConflictException('Email already exists');
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Create SuperUser and CustomerService in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const superUser = await tx.superUser.create({
        data: {
          telephone: dto.telephone,
          pseudo: dto.pseudo,
          email: dto.email,
          superPassword: hashedPassword,
          role: SuperUserRole.CUSTOMER_SERVICE,
          status: UserStatus.ACTIVE,
        },
      });

      const customerService = await tx.customerService.create({
        data: {
          superUserId: superUser.id,
          roles: dto.roles || [],
        },
        include: {
          superUser: true,
        },
      });

      return customerService;
    });

    return this.mapToResponseDto(result);
  }

  /**
   * Get all customer service accounts
   */
  async getAllCustomerServices(): Promise<CustomerServiceListDto[]> {
    const customerServices = await this.prisma.customerService.findMany({
      include: {
        superUser: true,
      },
      orderBy: {
        superUser: {
          createdAt: 'desc',
        },
      },
    });

    return customerServices.map(cs => this.mapToListDto(cs));
  }

  /**
   * Get customer service by ID
   */
  async getCustomerServiceById(id: string): Promise<CustomerServiceResponseDto> {
    const customerService = await this.prisma.customerService.findUnique({
      where: { id },
      include: {
        superUser: true,
        governorates: { include: { governorate: { include: { country: true } } } },
      },
    });

    if (!customerService) {
      throw new NotFoundException('Customer service account not found');
    }

    return this.mapToResponseDto(customerService);
  }

  /** Replace all governorate assignments (admin). CS can cover multiple countries. */
  async setGovernorates(id: string, governorateIds: string[]): Promise<CustomerServiceResponseDto> {
    const cs = await this.prisma.customerService.findUnique({ where: { id } });
    if (!cs) throw new NotFoundException('Customer service account not found');

    if (governorateIds.length) {
      const found = await this.prisma.governorate.findMany({
        where: { id: { in: governorateIds } },
        select: { id: true },
      });
      if (found.length !== governorateIds.length) {
        throw new BadRequestException('One or more governorate IDs are invalid');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.customerServiceGovernorate.deleteMany({ where: { customerServiceId: id } });
      if (governorateIds.length) {
        await tx.customerServiceGovernorate.createMany({
          data: governorateIds.map((governorateId) => ({
            id: randomUUID(),
            customerServiceId: id,
            governorateId,
          })),
        });
      }
    });

    return this.getCustomerServiceById(id);
  }

  /** Merge all governorates of a country into this CS account (one-click). */
  async addAllGovernoratesForCountry(id: string, countryId: string): Promise<CustomerServiceResponseDto> {
    const cs = await this.prisma.customerService.findUnique({ where: { id } });
    if (!cs) throw new NotFoundException('Customer service account not found');
    const country = await this.prisma.country.findUnique({ where: { id: countryId } });
    if (!country) throw new NotFoundException('Country not found');

    const govs = await this.prisma.governorate.findMany({
      where: { countryId },
      select: { id: true },
    });
    await this.prisma.customerServiceGovernorate.createMany({
      data: govs.map((g) => ({
        id: randomUUID(),
        customerServiceId: id,
        governorateId: g.id,
      })),
      skipDuplicates: true,
    });

    return this.getCustomerServiceById(id);
  }

  /**
   * Update customer service account details
   */
  async updateCustomerService(id: string, dto: UpdateCustomerServiceDto): Promise<CustomerServiceResponseDto> {
    const customerService = await this.prisma.customerService.findUnique({
      where: { id },
      include: { superUser: true },
    });

    if (!customerService) {
      throw new NotFoundException('Customer service account not found');
    }

    // Check uniqueness if updating telephone, pseudo, or email
    if (dto.telephone || dto.pseudo || dto.email) {
      const existing = await this.prisma.superUser.findFirst({
        where: {
          OR: [
            ...(dto.telephone ? [{ telephone: dto.telephone }] : []),
            ...(dto.pseudo ? [{ pseudo: dto.pseudo }] : []),
            ...(dto.email ? [{ email: dto.email }] : []),
          ],
          id: { not: customerService.superUserId },
        },
      });

      if (existing) {
        if (dto.telephone && existing.telephone === dto.telephone) {
          throw new ConflictException('Telephone already exists');
        }
        if (dto.pseudo && existing.pseudo === dto.pseudo) {
          throw new ConflictException('Pseudo already exists');
        }
        if (dto.email && existing.email === dto.email) {
          throw new ConflictException('Email already exists');
        }
      }
    }

    // Prepare update data
    const updateData: any = {};
    if (dto.telephone) updateData.telephone = dto.telephone;
    if (dto.pseudo) updateData.pseudo = dto.pseudo;
    if (dto.email) updateData.email = dto.email;
    if (dto.password) {
      updateData.superPassword = await bcrypt.hash(dto.password, 10);
    }

    // Update SuperUser
    await this.prisma.superUser.update({
      where: { id: customerService.superUserId },
      data: updateData,
    });

    // Fetch updated customer service
    const updated = await this.prisma.customerService.findUnique({
      where: { id },
      include: {
        superUser: true,
      },
    });

    return this.mapToResponseDto(updated!);
  }

  /**
   * Update customer service roles
   */
  async updateCustomerServiceRoles(id: string, dto: UpdateCustomerServiceRolesDto): Promise<CustomerServiceResponseDto> {
    const customerService = await this.prisma.customerService.findUnique({
      where: { id },
    });

    if (!customerService) {
      throw new NotFoundException('Customer service account not found');
    }

    const updated = await this.prisma.customerService.update({
      where: { id },
      data: {
        roles: dto.roles,
      },
      include: {
        superUser: true,
      },
    });

    return this.mapToResponseDto(updated);
  }

  /**
   * Add role to customer service
   */
  async addRole(id: string, role: CustomerServiceRole): Promise<CustomerServiceResponseDto> {
    const customerService = await this.prisma.customerService.findUnique({
      where: { id },
    });

    if (!customerService) {
      throw new NotFoundException('Customer service account not found');
    }

    if (customerService.roles.includes(role)) {
      throw new BadRequestException('Role already assigned');
    }

    const updated = await this.prisma.customerService.update({
      where: { id },
      data: {
        roles: {
          push: role,
        },
      },
      include: {
        superUser: true,
      },
    });

    return this.mapToResponseDto(updated);
  }

  /**
   * Remove role from customer service
   */
  async removeRole(id: string, role: CustomerServiceRole): Promise<CustomerServiceResponseDto> {
    const customerService = await this.prisma.customerService.findUnique({
      where: { id },
    });

    if (!customerService) {
      throw new NotFoundException('Customer service account not found');
    }

    if (!customerService.roles.includes(role)) {
      throw new BadRequestException('Role not assigned');
    }

    const updated = await this.prisma.customerService.update({
      where: { id },
      data: {
        roles: customerService.roles.filter(r => r !== role),
      },
      include: {
        superUser: true,
      },
    });

    return this.mapToResponseDto(updated);
  }

  /**
   * Delete customer service account
   */
  async deleteCustomerService(id: string): Promise<void> {
    const customerService = await this.prisma.customerService.findUnique({
      where: { id },
    });

    if (!customerService) {
      throw new NotFoundException('Customer service account not found');
    }

    // Delete CustomerService (will cascade to SuperUser)
    await this.prisma.superUser.delete({
      where: { id: customerService.superUserId },
    });
  }

  /**
   * Block/Unblock customer service account
   */
  async toggleStatus(id: string): Promise<CustomerServiceResponseDto> {
    const customerService = await this.prisma.customerService.findUnique({
      where: { id },
      include: { superUser: true },
    });

    if (!customerService) {
      throw new NotFoundException('Customer service account not found');
    }

    const newStatus = customerService.superUser.status === UserStatus.ACTIVE 
      ? UserStatus.BLOCKED 
      : UserStatus.ACTIVE;

    await this.prisma.superUser.update({
      where: { id: customerService.superUserId },
      data: { status: newStatus },
    });

    const updated = await this.prisma.customerService.findUnique({
      where: { id },
      include: { superUser: true },
    });

    return this.mapToResponseDto(updated!);
  }

  /**
   * Check if customer service has a specific role
   */
  async hasRole(customerServiceId: string, role: CustomerServiceRole): Promise<boolean> {
    const customerService = await this.prisma.customerService.findUnique({
      where: { id: customerServiceId },
    });

    if (!customerService) {
      return false;
    }

    return customerService.roles.includes(role);
  }

  private mapToResponseDto(cs: any): CustomerServiceResponseDto {
    return {
      id: cs.id,
      superUserId: cs.superUserId,
      roles: cs.roles,
      governorates: cs.governorates?.map((cg: any) => ({
        id: cg.id,
        governorateId: cg.governorateId,
        nameGovernorate: cg.governorate.nameGovernorate,
        countryId: cg.governorate.countryId,
        countryName: cg.governorate.country?.name,
      })),
      superUser: {
        id: cs.superUser.id,
        telephone: cs.superUser.telephone,
        pseudo: cs.superUser.pseudo,
        email: cs.superUser.email,
        role: cs.superUser.role,
        status: cs.superUser.status,
        createdAt: cs.superUser.createdAt,
      },
    };
  }

  private mapToListDto(cs: any): CustomerServiceListDto {
    return {
      id: cs.id,
      superUserId: cs.superUserId,
      roles: cs.roles,
      telephone: cs.superUser.telephone,
      pseudo: cs.superUser.pseudo,
      email: cs.superUser.email,
      status: cs.superUser.status,
    };
  }
}

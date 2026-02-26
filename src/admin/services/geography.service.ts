import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCountryDto, UpdateCountryDto, CreateGovernorateDto, UpdateGovernorateDto, CreateDelegationDto, UpdateDelegationDto } from '../dto/geography.dto';

@Injectable()
export class GeographyService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // COUNTRY OPERATIONS
  // ============================================

  async createCountry(dto: CreateCountryDto) {
    // Check if ISO code already exists
    const existing = await this.prisma.country.findUnique({
      where: { isoCode: dto.isoCode },
    });

    if (existing) {
      throw new ConflictException('Country with this ISO code already exists');
    }

    return this.prisma.country.create({
      data: dto,
    });
  }

  async getAllCountries() {
    return this.prisma.country.findMany({
      include: {
        _count: {
          select: {
            governorates: true,
            pricingPolicies: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async getCountryById(id: string) {
    const country = await this.prisma.country.findUnique({
      where: { id },
      include: {
        governorates: {
          include: {
            _count: {
              select: {
                delegations: true,
              },
            },
          },
        },
        pricingPolicies: {
          where: { isActive: true },
        },
      },
    });

    if (!country) {
      throw new NotFoundException('Country not found');
    }

    return country;
  }

  async updateCountry(id: string, dto: UpdateCountryDto) {
    const country = await this.prisma.country.findUnique({ where: { id } });

    if (!country) {
      throw new NotFoundException('Country not found');
    }

    // Check ISO code uniqueness if updating
    if (dto.isoCode && dto.isoCode !== country.isoCode) {
      const existing = await this.prisma.country.findUnique({
        where: { isoCode: dto.isoCode },
      });

      if (existing) {
        throw new ConflictException('Country with this ISO code already exists');
      }
    }

    return this.prisma.country.update({
      where: { id },
      data: dto,
    });
  }

  async deleteCountry(id: string) {
    const country = await this.prisma.country.findUnique({ where: { id } });

    if (!country) {
      throw new NotFoundException('Country not found');
    }

    await this.prisma.country.delete({ where: { id } });
  }

  // ============================================
  // GOVERNORATE OPERATIONS
  // ============================================

  async createGovernorate(dto: CreateGovernorateDto) {
    // Verify country exists
    const country = await this.prisma.country.findUnique({
      where: { id: dto.countryId },
    });

    if (!country) {
      throw new NotFoundException('Country not found');
    }

    return this.prisma.governorate.create({
      data: dto,
      include: {
        country: true,
      },
    });
  }

  async getAllGovernorates(countryId?: string) {
    return this.prisma.governorate.findMany({
      where: countryId ? { countryId } : undefined,
      include: {
        country: true,
        _count: {
          select: {
            delegations: true,
          },
        },
      },
      orderBy: {
        nameGovernorate: 'asc',
      },
    });
  }

  async getGovernorateById(id: string) {
    const governorate = await this.prisma.governorate.findUnique({
      where: { id },
      include: {
        country: true,
        delegations: true,
      },
    });

    if (!governorate) {
      throw new NotFoundException('Governorate not found');
    }

    return governorate;
  }

  async updateGovernorate(id: string, dto: UpdateGovernorateDto) {
    const governorate = await this.prisma.governorate.findUnique({ where: { id } });

    if (!governorate) {
      throw new NotFoundException('Governorate not found');
    }

    // Verify country exists if updating
    if (dto.countryId) {
      const country = await this.prisma.country.findUnique({
        where: { id: dto.countryId },
      });

      if (!country) {
        throw new NotFoundException('Country not found');
      }
    }

    return this.prisma.governorate.update({
      where: { id },
      data: dto,
      include: {
        country: true,
      },
    });
  }

  async deleteGovernorate(id: string) {
    const governorate = await this.prisma.governorate.findUnique({ where: { id } });

    if (!governorate) {
      throw new NotFoundException('Governorate not found');
    }

    await this.prisma.governorate.delete({ where: { id } });
  }

  // ============================================
  // DELEGATION OPERATIONS
  // ============================================

  async createDelegation(dto: CreateDelegationDto) {
    // Verify governorate exists
    const governorate = await this.prisma.governorate.findUnique({
      where: { id: dto.governorateId },
    });

    if (!governorate) {
      throw new NotFoundException('Governorate not found');
    }

    return this.prisma.delegation.create({
      data: dto,
      include: {
        governorate: {
          include: {
            country: true,
          },
        },
      },
    });
  }

  async getAllDelegations(governorateId?: string) {
    return this.prisma.delegation.findMany({
      where: governorateId ? { governorateId } : undefined,
      include: {
        governorate: {
          include: {
            country: true,
          },
        },
      },
      orderBy: {
        nameDelegation: 'asc',
      },
    });
  }

  async getDelegationById(id: string) {
    const delegation = await this.prisma.delegation.findUnique({
      where: { id },
      include: {
        governorate: {
          include: {
            country: true,
          },
        },
      },
    });

    if (!delegation) {
      throw new NotFoundException('Delegation not found');
    }

    return delegation;
  }

  async updateDelegation(id: string, dto: UpdateDelegationDto) {
    const delegation = await this.prisma.delegation.findUnique({ where: { id } });

    if (!delegation) {
      throw new NotFoundException('Delegation not found');
    }

    // Verify governorate exists if updating
    if (dto.governorateId) {
      const governorate = await this.prisma.governorate.findUnique({
        where: { id: dto.governorateId },
      });

      if (!governorate) {
        throw new NotFoundException('Governorate not found');
      }
    }

    return this.prisma.delegation.update({
      where: { id },
      data: dto,
      include: {
        governorate: {
          include: {
            country: true,
          },
        },
      },
    });
  }

  async deleteDelegation(id: string) {
    const delegation = await this.prisma.delegation.findUnique({ where: { id } });

    if (!delegation) {
      throw new NotFoundException('Delegation not found');
    }

    await this.prisma.delegation.delete({ where: { id } });
  }
}

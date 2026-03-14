import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GeographyService {
  constructor(private readonly prisma: PrismaService) {}

  async getCountries() {
    return this.prisma.country.findMany({
      where: { isActive: true },
      select: { id: true, name: true, isoCode: true, currencyCode: true, currencySymbol: true },
      orderBy: { name: 'asc' },
    });
  }

  async getGovernorates(countryId: string) {
    const country = await this.prisma.country.findUnique({ where: { id: countryId } });
    if (!country) throw new NotFoundException('Country not found');

    return this.prisma.governorate.findMany({
      where: { countryId },
      select: { id: true, nameGovernorate: true },
      orderBy: { nameGovernorate: 'asc' },
    });
  }

  async getDelegations(governorateId: string) {
    const gov = await this.prisma.governorate.findUnique({ where: { id: governorateId } });
    if (!gov) throw new NotFoundException('Governorate not found');

    return this.prisma.delegation.findMany({
      where: { governorateId },
      select: { id: true, nameDelegation: true, maxConfirmationDelayMinutes: true },
      orderBy: { nameDelegation: 'asc' },
    });
  }
}

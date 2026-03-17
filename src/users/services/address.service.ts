import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAddressDto, UpdateAddressDto, AddressResponseDto } from '../dto/address.dto';

@Injectable()
export class AddressService {
  constructor(private readonly prisma: PrismaService) {}

  async createAddress(userId: string, dto: CreateAddressDto): Promise<AddressResponseDto> {
    // Validate delegation exists
    const delegation = await this.prisma.delegation.findUnique({
      where: { id: dto.delegationId },
    });

    if (!delegation) {
      throw new BadRequestException('Invalid delegation ID');
    }

    const address = await this.prisma.address.create({
      data: {
        userId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        street: dto.street,
        delegationId: dto.delegationId,
      },
      include: {
        delegation: {
          include: {
            governorate: {
              include: { country: true },
            },
          },
        },
      },
    });

    return this.mapToResponseDto(address);
  }

  async getAddresses(userId: string): Promise<AddressResponseDto[]> {
    const addresses = await this.prisma.address.findMany({
      where: { userId },
      include: {
        delegation: {
          include: {
            governorate: {
              include: { country: true },
            },
          },
        },
      },
    });

    return addresses.map(address => this.mapToResponseDto(address));
  }

  async updateAddress(userId: string, addressId: string, dto: UpdateAddressDto): Promise<AddressResponseDto> {
    // Check ownership
    const address = await this.prisma.address.findUnique({
      where: { id: addressId },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    if (address.userId !== userId) {
      throw new ForbiddenException('You do not own this address');
    }

    // Validate delegation if provided
    if (dto.delegationId) {
      const delegation = await this.prisma.delegation.findUnique({
        where: { id: dto.delegationId },
      });

      if (!delegation) {
        throw new BadRequestException('Invalid delegation ID');
      }
    }

    const updatedAddress = await this.prisma.address.update({
      where: { id: addressId },
      data: dto,
      include: {
        delegation: {
          include: {
            governorate: {
              include: { country: true },
            },
          },
        },
      },
    });

    return this.mapToResponseDto(updatedAddress);
  }

  async deleteAddress(userId: string, addressId: string): Promise<void> {
    // Check ownership
    const address = await this.prisma.address.findUnique({
      where: { id: addressId },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    if (address.userId !== userId) {
      throw new ForbiddenException('You do not own this address');
    }

    // Prevent deleting the last address
    const count = await this.prisma.address.count({ where: { userId } });
    if (count <= 1) {
      throw new BadRequestException('You must have at least one address');
    }

    await this.prisma.address.delete({
      where: { id: addressId },
    });
  }

  private mapToResponseDto(address: any): AddressResponseDto {
    return {
      id: address.id,
      latitude: address.latitude,
      longitude: address.longitude,
      street: address.street,
      userId: address.userId,
      delegation: {
        id: address.delegation.id,
        nameDelegation: address.delegation.nameDelegation,
        governorate: {
          id: address.delegation.governorate.id,
          nameGovernorate: address.delegation.governorate.nameGovernorate,
          country: address.delegation.governorate.country
            ? {
                id: address.delegation.governorate.country.id,
                name: address.delegation.governorate.country.name,
              }
            : undefined,
        },
      },
    };
  }
}

import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { CustomerStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAddressDto, UpdateAddressDto, AddressResponseDto } from '../dto/address.dto';

@Injectable()
export class AddressService {
  constructor(private readonly prisma: PrismaService) {}
  private static readonly MAIN_NICKNAME = 'MAIN';

  async createAddress(userId: string | null, dto: CreateAddressDto): Promise<AddressResponseDto> {
    // Validate delegation exists
    const delegation = await this.prisma.delegation.findUnique({
      where: { id: dto.delegationId },
    });

    if (!delegation) {
      throw new BadRequestException('Invalid delegation ID');
    }

    const nickname = dto.nickname?.trim() || null;
    const wantsMain = nickname?.toUpperCase() === AddressService.MAIN_NICKNAME;
    const userAddressCount = userId ? await this.prisma.address.count({ where: { userId } }) : 0;
    const hasMainAddress = userId
      ? !!(await this.prisma.address.findFirst({
          where: { userId, nickname: AddressService.MAIN_NICKNAME },
          select: { id: true },
        }))
      : false;
    const shouldBeMain = !!userId && (wantsMain || userAddressCount === 0 || !hasMainAddress);

    const address = await this.prisma.$transaction(async (tx) => {
      if (shouldBeMain && userId) {
        await tx.address.updateMany({
          where: { userId, nickname: AddressService.MAIN_NICKNAME },
          data: { nickname: null },
        });
        await tx.customer.updateMany({
          where: { userId, customerStatus: CustomerStatus.CREATED },
          data: { customerStatus: CustomerStatus.ACTIVE },
        });
      }

      return tx.address.create({
        data: {
          ...(userId ? { userId } : {}),
          latitude: dto.latitude,
          longitude: dto.longitude,
          street: dto.street,
          nickname: shouldBeMain ? AddressService.MAIN_NICKNAME : nickname,
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

    if (address.userId && address.userId !== userId) {
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

    const normalizedNickname = dto.nickname?.trim();
    const wantsMain = normalizedNickname?.toUpperCase() === AddressService.MAIN_NICKNAME;
    const isDemotingCurrentMain =
      address.nickname === AddressService.MAIN_NICKNAME &&
      normalizedNickname !== undefined &&
      normalizedNickname.toUpperCase() !== AddressService.MAIN_NICKNAME;
    if (isDemotingCurrentMain) {
      throw new BadRequestException('MAIN address cannot be unset directly. Set another address as MAIN first.');
    }
    const updatedAddress = await this.prisma.$transaction(async (tx) => {
      if (wantsMain) {
        await tx.address.updateMany({
          where: { userId, id: { not: addressId }, nickname: AddressService.MAIN_NICKNAME },
          data: { nickname: null },
        });
        await tx.customer.updateMany({
          where: { userId, customerStatus: CustomerStatus.CREATED },
          data: { customerStatus: CustomerStatus.ACTIVE },
        });
      }

      return tx.address.update({
        where: { id: addressId },
        data: {
          ...dto,
          ...(wantsMain ? { nickname: AddressService.MAIN_NICKNAME } : {}),
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

    if (address.userId && address.userId !== userId) {
      throw new ForbiddenException('You do not own this address');
    }

    // Prevent deleting the MAIN address unless user promotes another address first.
    if (address.nickname === AddressService.MAIN_NICKNAME) {
      throw new BadRequestException('MAIN address cannot be deleted. Set another address as MAIN first.');
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
      nickname: address.nickname ?? null,
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

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { UserResponseDto } from '../dto/user-response.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        customer: true,
        driver: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.mapToResponseDto(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserResponseDto> {
    // Validate that only allowed fields are being updated
    const allowedFields = ['firstName', 'secondName', 'photo', 'myEmail', 'image'];
    const providedFields = Object.keys(dto);
    
    const invalidFields = providedFields.filter(field => !allowedFields.includes(field));
    if (invalidFields.length > 0) {
      throw new BadRequestException(`Cannot update protected fields: ${invalidFields.join(', ')}`);
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      include: {
        customer: true,
        driver: true,
      },
    });

    return this.mapToResponseDto(user);
  }

  async deleteAccount(userId: string): Promise<void> {
    // Get user to determine role
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { customer: true, driver: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Block customer or suspend driver based on role
    if (user.customer) {
      await this.prisma.customer.update({
        where: { id: user.customer.id },
        data: { customerStatus: 'BLOCKED' },
      });
    } else if (user.driver) {
      await this.prisma.driver.update({
        where: { id: user.driver.id },
        data: { status: 'SUSPENDED' },
      });
    }
  }

  private mapToResponseDto(user: any): UserResponseDto {
    const { password, ...userWithoutPassword } = user;
    return {
      ...userWithoutPassword,
      customer: user.customer ? {
        id: user.customer.id,
        completedOrders: user.customer.completedOrders,
      } : undefined,
      driver: user.driver ? {
        id: user.driver.id,
        status: user.driver.status,
        vehicleType: user.driver.vehicleType,
        description: user.driver.description,
        approvedAt: user.driver.approvedAt,
        suspendedAt: user.driver.suspendedAt,
      } : undefined,
    };
  }
}

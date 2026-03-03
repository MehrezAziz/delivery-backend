import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from '../dto/register.dto';
import { UserResponseDto } from '../dto/user-response.dto';
import * as bcrypt from 'bcrypt';
import { UserRole, UserStatus, DriverStatus } from '@prisma/client';

@Injectable()
export class RegistrationService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto): Promise<UserResponseDto> {
    // Check if phone already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (existingUser) {
      throw new ConflictException('Phone number already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Create user with associated role record
    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        password: hashedPassword,
        firstName: dto.firstName,
        secondName: dto.secondName,
        role: dto.role,
        ...(dto.role === UserRole.CUSTOMER && {
          customer: {
            create: {},
          },
        }),
        ...(dto.role === UserRole.DRIVER && {
          driver: {
            create: {
              status: DriverStatus.INCOMPLETE,
            },
          },
        }),
      },
      include: {
        customer: true,
        driver: true,
      },
    });

    // Return response without password
    return this.mapToResponseDto(user);
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

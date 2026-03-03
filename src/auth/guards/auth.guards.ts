import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  CanActivate,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { UserRole, SuperUserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/auth.decorators';
import { AuthenticatedUser, AuthenticatedSuperUser } from '../dto/jwt-payload.interface';

// ============================================
// BASE GUARDS
// ============================================

/**
 * Protects routes for regular Users (Customer & Driver)
 * Usage: @UseGuards(JwtUserGuard)
 */
@Injectable()
export class JwtUserGuard extends AuthGuard('jwt-user') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication required');
    }
    return user;
  }
}

/**
 * Protects routes for SuperUsers (Admin & CustomerService)
 * Usage: @UseGuards(JwtSuperUserGuard)
 */
@Injectable()
export class JwtSuperUserGuard extends AuthGuard('jwt-superuser') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Staff authentication required');
    }
    return user;
  }
}

// ============================================
// ROLE-BASED GUARDS
// ============================================

/**
 * Restricts to CUSTOMER only
 * Usage: @UseGuards(JwtUserGuard, CustomerGuard)
 */
@Injectable()
export class CustomerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user: AuthenticatedUser = context.switchToHttp().getRequest().user;
    if (user?.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Customer access only');
    }
    return true;
  }
}

/**
 * Restricts to DRIVER only
 * Usage: @UseGuards(JwtUserGuard, DriverGuard)
 */
@Injectable()
export class DriverGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user: AuthenticatedUser = context.switchToHttp().getRequest().user;
    if (user?.role !== UserRole.DRIVER) {
      throw new ForbiddenException('Driver access only');
    }
    return true;
  }
}

/**
 * Restricts to ADMIN only
 * Usage: @UseGuards(JwtSuperUserGuard, AdminGuard)
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const superUser: AuthenticatedSuperUser = context.switchToHttp().getRequest().user;
    if (superUser?.role !== SuperUserRole.ADMIN) {
      throw new ForbiddenException('Admin access only');
    }
    return true;
  }
}

/**
 * Restricts to CUSTOMER_SERVICE only
 * Usage: @UseGuards(JwtSuperUserGuard, CustomerServiceGuard)
 */
@Injectable()
export class CustomerServiceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const superUser: AuthenticatedSuperUser = context.switchToHttp().getRequest().user;
    if (superUser?.role !== SuperUserRole.CUSTOMER_SERVICE) {
      throw new ForbiddenException('Customer service access only');
    }
    return true;
  }
}

/**
 * Allows both Admin and CustomerService
 * Usage: @UseGuards(JwtSuperUserGuard, StaffGuard)
 */
@Injectable()
export class StaffGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const superUser: AuthenticatedSuperUser = context.switchToHttp().getRequest().user;
    if (!superUser?.role || !Object.values(SuperUserRole).includes(superUser.role)) {
      throw new ForbiddenException('Staff access only');
    }
    return true;
  }
}

// ============================================
// USER STATUS GUARDS
// ============================================

/**
 * Ensures the USER account is ACTIVE (not BLOCKED/SUSPENDED)
 * Use after JwtUserGuard for sensitive operations
 */
@Injectable()
export class UserActiveGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user: AuthenticatedUser = context.switchToHttp().getRequest().user;
    
    // Check customer or driver status
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: {
        customer: true,
        driver: true,
      },
    });

    if (!dbUser) {
      throw new ForbiddenException('User not found');
    }

    // Check if customer is blocked
    if (dbUser.customer && dbUser.customer.customerStatus === 'BLOCKED') {
      // Get the most recent restriction reason
      const restriction = await this.prisma.userRestriction.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      
      const reason = restriction?.reason || 'account is blocked';
      throw new ForbiddenException(`Your account is not active because ${reason}`);
    }

    // Check if driver is suspended
    if (dbUser.driver && dbUser.driver.status === 'SUSPENDED') {
      // Get the most recent restriction reason
      const restriction = await this.prisma.userRestriction.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      
      const reason = restriction?.reason || 'account is suspended';
      throw new ForbiddenException(`Your account is not active because ${reason}`);
    }

    return true;
  }
}

/**
 * Checks for active user restrictions (suspension, block) via DB
 * Use for high-sensitivity operations (orders, payments)
 */
@Injectable()
export class UserRestrictionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user: AuthenticatedUser = context.switchToHttp().getRequest().user;

    const activeRestriction = await this.prisma.userRestriction.findFirst({
      where: {
        userId: user.id,
        liftedAt: null,
        OR: [
          { endDate: null },                           // Permanent
          { endDate: { gt: new Date() } },             // Not yet expired
        ],
      },
    });

    if (activeRestriction) {
      throw new ForbiddenException(
        `Account restricted (${activeRestriction.type}): ${activeRestriction.reason}`,
      );
    }

    return true;
  }
}

/**
 * Ensures driver is VERIFIED before performing delivery actions
 */
@Injectable()
export class VerifiedDriverGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user: AuthenticatedUser = context.switchToHttp().getRequest().user;

    if (user.role !== UserRole.DRIVER) {
      throw new ForbiddenException('Driver access only');
    }

    const driver = await this.prisma.driver.findUnique({
      where: { userId: user.id },
    });

    if (driver?.status !== 'VERIFIED') {
      throw new ForbiddenException(
        'Your driver account must be verified before you can accept orders.',
      );
    }

    return true;
  }
}

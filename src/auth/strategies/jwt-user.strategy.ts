// ============================================
// JWT STRATEGY FOR USERS (Customer & Driver)
// ============================================

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtUserPayload, AuthenticatedUser } from '../dto/jwt-payload.interface';

@Injectable()
export class JwtUserStrategy extends PassportStrategy(Strategy, 'jwt-user') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') as string,
    });
  }

  async validate(payload: JwtUserPayload): Promise<AuthenticatedUser> {
    // Ensure this is a user token (not superuser)
    if (payload.type !== 'USER') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        customer: true,
        driver: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check if customer is blocked or driver is suspended
    if (user.customer && user.customer.customerStatus === 'BLOCKED') {
      throw new UnauthorizedException('Account has been blocked');
    }
    if (user.driver && user.driver.status === 'SUSPENDED') {
      throw new UnauthorizedException('Account has been suspended');
    }

    return {
      id: user.id,
      phone: user.phone!,
      role: user.role,
      profileId: payload.profileId,
      type: 'USER',
    };
  }
}
// ============================================
// JWT STRATEGY FOR SUPER USERS (Admin & CustomerService)
// ============================================

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { UserStatus } from '@prisma/client';
import { JwtSuperUserPayload, AuthenticatedSuperUser } from '../dto/jwt-payload.interface';

@Injectable()
export class JwtSuperUserStrategy extends PassportStrategy(Strategy, 'jwt-superuser') {
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

  async validate(payload: JwtSuperUserPayload): Promise<AuthenticatedSuperUser> {
    // Ensure this is a superuser token
    if (payload.type !== 'SUPER_USER') {
      throw new UnauthorizedException('Invalid token type');
    }

    const superUser = await this.prisma.superUser.findUnique({
      where: { id: payload.sub },
    });

    if (!superUser) {
      throw new UnauthorizedException('SuperUser not found');
    }

    if (superUser.status === UserStatus.BLOCKED) {
      throw new UnauthorizedException('Account has been blocked');
    }

    return {
      id: superUser.id,
      email: superUser.email,
      role: superUser.role,
      status: superUser.status,
      profileId: payload.profileId,
      type: 'SUPER_USER',
    };
  }
}
import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthenticatedUser, AuthenticatedSuperUser } from '../dto/jwt-payload.interface';

// ============================================
// PUBLIC ROUTE DECORATOR
// ============================================

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a route as public (skip JWT auth)
 * Usage: @Public()
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// ============================================
// CURRENT USER DECORATORS
// ============================================

/**
 * Extract the current authenticated User from request
 * Usage: @CurrentUser() user: AuthenticatedUser
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext): AuthenticatedUser | AuthenticatedUser[keyof AuthenticatedUser] => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;
    return data ? user?.[data] : user;
  },
);

/**
 * Extract the current authenticated SuperUser from request
 * Usage: @CurrentSuperUser() superUser: AuthenticatedSuperUser
 */
export const CurrentSuperUser = createParamDecorator(
  (data: keyof AuthenticatedSuperUser | undefined, ctx: ExecutionContext): AuthenticatedSuperUser | AuthenticatedSuperUser[keyof AuthenticatedSuperUser] => {
    const request = ctx.switchToHttp().getRequest();
    const superUser: AuthenticatedSuperUser = request.user;
    return data ? superUser?.[data] : superUser;
  },
);

/**
 * Get only the user's ID
 * Usage: @UserId() id: string
 */
export const UserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.id;
  },
);

/**
 * Get the profileId (Customer.id or Driver.id)
 * Usage: @ProfileId() profileId: string
 */
export const ProfileId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.profileId;
  },
);
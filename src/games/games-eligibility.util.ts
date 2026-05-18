import { CustomerStatus, DriverStatus, UserRole } from '@prisma/client';

export type EligibilityReason =
  | 'OK'
  | 'NOT_ACTIVE_USER'
  | 'PHONE_REQUIRED'
  | 'COUNTRY_NOT_ELIGIBLE'
  | 'ORDER_REQUIRED'
  | 'CODE_REQUIRED'
  | 'CODE_VERSION_STALE'
  | 'GAME_INACTIVE'
  | 'NOT_OPEN_TODAY'
  | 'COMING_SOON';

export function isCustomerEligibleStatus(status: CustomerStatus): boolean {
  return status === CustomerStatus.ACTIVE || status === CustomerStatus.VERIFIED;
}

export function isDriverEligibleStatus(status: DriverStatus): boolean {
  return status === DriverStatus.VERIFIED;
}

export function roleMatchesPool(
  userRole: UserRole,
  poolScope: string,
): boolean {
  if (poolScope === 'COMBINED') return true;
  if (poolScope === 'CUSTOMER') return userRole === UserRole.CUSTOMER;
  if (poolScope === 'DRIVER') return userRole === UserRole.DRIVER;
  return true;
}

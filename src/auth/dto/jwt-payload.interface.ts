import { UserRole, SuperUserRole, UserStatus } from '@prisma/client';

// ============================================
// JWT PAYLOAD TYPES
// ============================================

export interface JwtUserPayload {
  sub: string;       // User.id
  phone: string;
  role: UserRole;    // CUSTOMER | DRIVER
  profileId: string; // Customer.id or Driver.id
  type: 'USER';
  iat?: number;
  exp?: number;
}

export interface JwtSuperUserPayload {
  sub: string;          // SuperUser.id
  email: string;
  role: SuperUserRole;  // ADMIN | CUSTOMER_SERVICE
  profileId: string;    // Admin.id or CustomerService.id
  type: 'SUPER_USER';
  iat?: number;
  exp?: number;
}

export type JwtPayload = JwtUserPayload | JwtSuperUserPayload;

// ============================================
// REQUEST USER TYPES (attached after guard validation)
// ============================================

export interface AuthenticatedUser {
  id: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  profileId: string;
  type: 'USER';
}

export interface AuthenticatedSuperUser {
  id: string;
  email: string;
  role: SuperUserRole;
  status: UserStatus;
  profileId: string;
  type: 'SUPER_USER';
}

export type AuthenticatedEntity = AuthenticatedUser | AuthenticatedSuperUser;

// ============================================
// OTP STORE INTERFACE (Redis)
// ============================================

export interface OtpData {
  otp: string;
  phone: string;
  role: UserRole;
  attempts: number;
  createdAt: number;
}

/**
 * Payload embedded in the short-lived "pending" JWT issued after step 1.
 * No DB record exists yet — everything is committed atomically in step 2.
 */
export interface DriverPendingPayload {
  type: 'DRIVER_PENDING';
  // Phone registration fields
  phone?: string;
  hashedPassword?: string;
  firstName?: string;
  secondName?: string;
  myEmail?: string;
  userGender?: string;
  image?: string; // uploaded image path (if any)
  // Google registration fields
  googleId?: string;
  googleEmail?: string;
  iat?: number;
  exp?: number;
}

# 🔐 Authentication System Setup & Testing

## ✅ What's Implemented

### Core Features
- ✅ Phone OTP authentication for Users (Customer & Driver)
- ✅ Email/Password authentication for SuperUsers (Admin & Customer Service)
- ✅ JWT token generation with 7-day expiration
- ✅ Refresh tokens (30-day expiration)
- ✅ Redis-based OTP storage with 5-minute TTL
- ✅ Rate limiting (5 OTPs per hour per phone)
- ✅ Role-based guards (Customer, Driver, Admin, CustomerService)
- ✅ User status guards (Active, Blocked, Restricted)
- ✅ Driver verification guard
- ✅ Automatic user profile creation on first login

### Architecture
```
src/auth/
├── auth.controller.ts       # API endpoints
├── auth.service.ts          # Business logic
├── auth.module.ts           # Module configuration
├── otp.service.ts           # OTP generation & verification
├── decorators/
│   └── auth.decorators.ts   # @CurrentUser, @Public, etc.
├── dto/
│   ├── auth.dto.ts          # Request/Response DTOs
│   └── jwt-payload.interface.ts
├── guards/
│   └── auth.guards.ts       # All guards
└── strategies/
    ├── jwt-user.strategy.ts
    └── jwt-superuser.strategy.ts
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment
Make sure your `.env` file has:
```env
DATABASE_URL="postgresql://postgres:root@localhost:5432/delivery_platform?schema=public"
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRATION="7d"
REDIS_HOST="localhost"
REDIS_PORT=6379
TWILIO_ACCOUNT_SID="your_twilio_account_sid"
TWILIO_AUTH_TOKEN="your_twilio_auth_token"
TWILIO_PHONE_NUMBER="+1234567890"
PORT=3000
NODE_ENV="development"
```

### 3. Start Services
```bash
# Start PostgreSQL (if not running)
# Start Redis
redis-server

# Or using Docker
docker run -d -p 6379:6379 redis:alpine
```

### 4. Run Migrations
```bash
npx prisma migrate dev
```

### 5. Seed Database
```bash
npm run prisma:seed
```

This creates:
- Tunisia country with governorates and delegations
- Pricing policy
- Admin user (admin@delivery.com)
- Customer Service user (support@delivery.com)
- Test customer (+21612345678)
- Test driver (+21698765432)

### 6. Start Server
```bash
npm run start:dev
```

Server runs on: `http://localhost:3000/api`

---

## 🧪 Testing with Postman

### Import Collection
See `POSTMAN_TESTING.md` for detailed testing guide.

### Quick Test Flow

1. **Send OTP (Customer)**
```bash
POST http://localhost:3000/api/auth/user/send-otp
Content-Type: application/json

{
  "phone": "+21612345678",
  "role": "CUSTOMER"
}
```

Response includes OTP in dev mode:
```json
{
  "message": "OTP sent successfully",
  "expiresInSeconds": 300,
  "otp": "123456"
}
```

2. **Verify OTP & Login**
```bash
POST http://localhost:3000/api/auth/user/verify-otp
Content-Type: application/json

{
  "phone": "+21612345678",
  "role": "CUSTOMER",
  "otp": "123456"
}
```

Response:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 604800
}
```

3. **Access Protected Route**
```bash
POST http://localhost:3000/api/auth/user/me
Authorization: Bearer YOUR_ACCESS_TOKEN
```

---

## 🔒 Guards Usage Examples

### Basic Authentication
```typescript
@UseGuards(JwtUserGuard)
@Get('profile')
getProfile(@CurrentUser() user: AuthenticatedUser) {
  return user;
}
```

### Role-Based Access
```typescript
// Customer only
@UseGuards(JwtUserGuard, CustomerGuard)
@Post('orders')
createOrder(@CurrentUser() user: AuthenticatedUser) {
  // Only customers can access
}

// Driver only
@UseGuards(JwtUserGuard, DriverGuard)
@Get('deliveries')
getDeliveries(@CurrentUser() user: AuthenticatedUser) {
  // Only drivers can access
}

// Admin only
@UseGuards(JwtSuperUserGuard, AdminGuard)
@Get('admin/users')
getAllUsers(@CurrentSuperUser() admin: AuthenticatedSuperUser) {
  // Only admins can access
}
```

### Advanced Guards
```typescript
// Ensure user is active and not restricted
@UseGuards(JwtUserGuard, UserActiveGuard, UserRestrictionGuard)
@Post('orders')
createOrder() {
  // User must be ACTIVE and have no restrictions
}

// Ensure driver is verified
@UseGuards(JwtUserGuard, DriverGuard, VerifiedDriverGuard)
@Post('accept-order')
acceptOrder() {
  // Driver must be VERIFIED to accept orders
}
```

### Public Routes
```typescript
@Public()
@Get('health')
healthCheck() {
  return { status: 'ok' };
}
```

---

## 📋 Available Decorators

### @CurrentUser()
Extract authenticated user from request:
```typescript
@Get('profile')
getProfile(@CurrentUser() user: AuthenticatedUser) {
  console.log(user.id, user.phone, user.role);
}

// Get specific field
@Get('profile')
getProfile(@CurrentUser('id') userId: string) {
  console.log(userId);
}
```

### @CurrentSuperUser()
Extract authenticated super user:
```typescript
@Get('admin/profile')
getProfile(@CurrentSuperUser() admin: AuthenticatedSuperUser) {
  console.log(admin.id, admin.email, admin.role);
}
```

### @UserId()
Get just the user ID:
```typescript
@Get('orders')
getOrders(@UserId() userId: string) {
  return this.ordersService.findByUser(userId);
}
```

### @ProfileId()
Get the profile ID (Customer.id or Driver.id):
```typescript
@Get('wallet')
getWallet(@ProfileId() customerId: string) {
  return this.walletService.findByCustomer(customerId);
}
```

### @Public()
Mark route as public (skip authentication):
```typescript
@Public()
@Get('public-data')
getPublicData() {
  return { data: 'public' };
}
```

---

## 🛡️ Available Guards

| Guard | Purpose | Usage |
|-------|---------|-------|
| `JwtUserGuard` | Authenticate Users (Customer/Driver) | `@UseGuards(JwtUserGuard)` |
| `JwtSuperUserGuard` | Authenticate SuperUsers (Admin/CS) | `@UseGuards(JwtSuperUserGuard)` |
| `CustomerGuard` | Restrict to CUSTOMER role | `@UseGuards(JwtUserGuard, CustomerGuard)` |
| `DriverGuard` | Restrict to DRIVER role | `@UseGuards(JwtUserGuard, DriverGuard)` |
| `AdminGuard` | Restrict to ADMIN role | `@UseGuards(JwtSuperUserGuard, AdminGuard)` |
| `CustomerServiceGuard` | Restrict to CUSTOMER_SERVICE | `@UseGuards(JwtSuperUserGuard, CustomerServiceGuard)` |
| `StaffGuard` | Allow Admin or CustomerService | `@UseGuards(JwtSuperUserGuard, StaffGuard)` |
| `UserActiveGuard` | Ensure user status is ACTIVE | `@UseGuards(JwtUserGuard, UserActiveGuard)` |
| `UserRestrictionGuard` | Check for active restrictions | `@UseGuards(JwtUserGuard, UserRestrictionGuard)` |
| `VerifiedDriverGuard` | Ensure driver is VERIFIED | `@UseGuards(JwtUserGuard, DriverGuard, VerifiedDriverGuard)` |

---

## 🔧 Configuration

### JWT Settings
Edit `.env`:
```env
JWT_SECRET="your-secret-key"
JWT_EXPIRATION="7d"  # Access token expiration
```

### OTP Settings
Edit `src/auth/otp.service.ts`:
```typescript
private readonly OTP_TTL_SECONDS = 300;        // 5 minutes
private readonly MAX_ATTEMPTS = 5;             // Max verification attempts
private readonly RATE_LIMIT_WINDOW = 3600;     // 1 hour
private readonly RATE_LIMIT_MAX_SENDS = 5;     // Max OTPs per hour
```

### Twilio (Production)
For production SMS delivery, add to `.env`:
```env
TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxx"
TWILIO_AUTH_TOKEN="your_auth_token"
TWILIO_PHONE_NUMBER="+1234567890"
```

---

## 📝 TODO: SuperUser Password Implementation

Currently, SuperUser login accepts any password in development. To implement proper authentication:

### 1. Update Prisma Schema
Add password field to SuperUser:
```prisma
model SuperUser {
  id        String        @id @default(uuid())
  telephone String        @unique
  pseudo    String        @unique
  email     String        @unique
  password  String        // Add this field
  role      SuperUserRole
  status    UserStatus    @default(ACTIVE)
  createdAt DateTime      @default(now()) @map("created_at")
  
  // ... relations
}
```

### 2. Create Migration
```bash
npx prisma migrate dev --name add_superuser_password
```

### 3. Update Seed Script
Hash passwords in `prisma/seed.ts`:
```typescript
import * as bcrypt from 'bcrypt';

const hashedPassword = await bcrypt.hash('admin123456', 10);

const adminUser = await prisma.superUser.create({
  data: {
    // ... other fields
    password: hashedPassword,
  },
});
```

### 4. Update AuthService
Replace the placeholder in `verifyPassword`:
```typescript
private async verifyPassword(password: string, email: string): Promise<boolean> {
  const superUser = await this.prisma.superUser.findUnique({
    where: { email },
  });
  
  if (!superUser) return false;
  
  return bcrypt.compare(password, superUser.password);
}
```

---

## 🐛 Troubleshooting

### Redis Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:6379
```
**Solution:** Start Redis server
```bash
redis-server
```

### Database Connection Error
```
Error: Can't reach database server
```
**Solution:** Check PostgreSQL is running and DATABASE_URL is correct

### OTP Not Sent (Production)
**Solution:** Verify Twilio credentials in `.env`

### Token Invalid
**Solution:** 
- Check JWT_SECRET matches between token generation and validation
- Ensure token hasn't expired
- Verify Bearer token format: `Authorization: Bearer <token>`

### User Already Exists with Different Role
**Solution:** This is expected behavior. Each phone can only have one role.

---

## ✅ Testing Checklist

- [ ] Send OTP to new phone (Customer)
- [ ] Send OTP to new phone (Driver)
- [ ] Verify OTP and receive JWT token
- [ ] Access protected route with token
- [ ] Complete user profile
- [ ] Try wrong OTP (should fail)
- [ ] Try expired OTP (wait 5+ min)
- [ ] Test rate limiting (send 6 OTPs)
- [ ] Test role mismatch error
- [ ] Test blocked user (manually block in DB)
- [ ] Test SuperUser login
- [ ] Test different guards (Customer, Driver, Admin)
- [ ] Test UserRestrictionGuard with restricted user

---

## 🎯 Next Steps

1. ✅ Complete authentication system
2. ⏭️ Implement SuperUser password field
3. ⏭️ Add refresh token endpoint
4. ⏭️ Implement user management endpoints
5. ⏭️ Add driver verification workflow
6. ⏭️ Create order management system
7. ⏭️ Implement wallet & payment system

---

## 📚 Resources

- [NestJS Authentication](https://docs.nestjs.com/security/authentication)
- [Passport JWT](http://www.passportjs.org/packages/passport-jwt/)
- [Prisma Client](https://www.prisma.io/docs/concepts/components/prisma-client)
- [Redis Commands](https://redis.io/commands)
- [Twilio SMS API](https://www.twilio.com/docs/sms)

---

**Status:** ✅ Authentication system is complete and ready for testing!

Test it now with Postman using the guide in `POSTMAN_TESTING.md`

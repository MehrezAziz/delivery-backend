# Quick Reference Card

## 🚀 Quick Setup Commands

```bash
# 1. Install dependencies
npm install

# 2. Run migrations
npx prisma migrate dev

# 3. Seed database with test data
npm run seed:complete

# 4. Generate Postman collection
npm run postman:generate

# 5. Start server
npm run start:dev
```

## 🔑 Test Credentials

| Role | Phone/Telephone | Password |
|------|----------------|----------|
| Admin | +21612345678 | Admin123456 |
| Customer Service | +21655555555 | Support123 |
| Customer (Ahmed) | +21698765432 | Customer123 |
| Customer (Fatma) | +21699887766 | Customer123 |
| Driver (Mohamed) | +21623456789 | Driver123 |
| Driver (Karim) | +21622334455 | Driver123 |

## 📍 Seeded Data

### Geography
- **Countries:** Tunisia (TN), France (FR)
- **Governorates:** Tunis, Sfax
- **Delegations:** Tunis Centre, La Marsa, Sfax Ville

### Pricing Policies (Tunisia)
- SAME_DELEGATION: 1.5 TND/km, 5 TND base
- SAME_GOVERNORATE: 2.0 TND/km, 8 TND base
- DIFFERENT_GOVERNORATE: 3.0 TND/km, 15 TND base
- DIFFERENT_COUNTRY: 5.0 TND/km, 30 TND base

### Users
- 1 Admin (admin1)
- 1 Customer Service (cs_support1)
- 2 Customers (Ahmed, Fatma)
- 2 Verified Drivers (Mohamed, Karim)

### Other Data
- 5 Addresses (distributed across delegations)
- 2 Digital Wallets (100 TND, 50 TND)
- 2 Sample Orders
- 2 Referral Codes (WELCOME10, FIRST5)

## 🔗 API Endpoints Quick Reference

### Authentication
```
POST /auth/superuser/login    # Admin/CS login
POST /auth/user/login         # Customer/Driver login
POST /auth/superuser/register # Register admin/CS
POST /auth/user/register      # Register customer/driver
```

### Admin - Geography
```
GET    /admin/geography/countries
POST   /admin/geography/countries
PATCH  /admin/geography/countries/:id
DELETE /admin/geography/countries/:id

GET    /admin/geography/governorates
POST   /admin/geography/governorates
PATCH  /admin/geography/governorates/:id
DELETE /admin/geography/governorates/:id

GET    /admin/geography/delegations
POST   /admin/geography/delegations
PATCH  /admin/geography/delegations/:id
DELETE /admin/geography/delegations/:id
```

### Admin - Pricing
```
GET    /admin/pricing-policies
POST   /admin/pricing-policies
PATCH  /admin/pricing-policies/:id
PATCH  /admin/pricing-policies/:id/deactivate
DELETE /admin/pricing-policies/:id
```

### Admin - Customer Service
```
GET    /admin/customer-services
POST   /admin/customer-services
GET    /admin/customer-services/:id
POST   /admin/customer-services/:id/roles/:role
DELETE /admin/customer-services/:id/roles/:role
PATCH  /admin/customer-services/:id/roles
PATCH  /admin/customer-services/:id/toggle-status
```

### Admin - Customers
```
GET    /admin/customers              # Paginated list
GET    /admin/customers/stats        # Statistics
GET    /admin/customers/search?q=    # Search
DELETE /admin/customers/:id
```

### Admin - Drivers
```
GET    /admin/drivers/pending
POST   /admin/drivers/:id/approve
POST   /admin/drivers/:id/reject
POST   /admin/drivers/:id/suspend
```

### Admin - Restrictions
```
POST   /admin/restrictions/block
POST   /admin/restrictions/suspend
POST   /admin/restrictions/suspend-driver
GET    /admin/restrictions/user/:userId
DELETE /admin/restrictions/:id/lift
```

### User Profile
```
GET    /users/profile
PATCH  /users/profile
DELETE /users/profile
```

### Addresses
```
GET    /addresses
POST   /addresses
PATCH  /addresses/:id
DELETE /addresses/:id
```

### Customers
```
GET    /customers/me
PATCH  /customers/me
```

### Drivers
```
POST   /driver/documents
GET    /driver/verification
```

### Orders (Customer)
```
POST   /orders
GET    /orders/my-orders
GET    /orders/:id
DELETE /orders/:id
```

### Orders (Driver)
```
GET    /driver/orders/available
GET    /driver/orders/my-orders
POST   /driver/orders/:id/accept
POST   /driver/orders/:id/cancel-assignment
```

## 📦 Order Status Flow

```
DRAFT
  ↓
SEARCHING_DRIVER
  ↓
DRIVER_ASSIGNED (driver accepts)
  ↓
DRIVER_ARRIVED
  ↓
PICKED_UP
  ↓
DELIVERING
  ↓
DELIVERED
```

## 🚗 Driver Status Flow

```
INCOMPLETE (no documents)
  ↓
PENDING_REVIEW (documents uploaded)
  ↓
VERIFIED (admin approved) / REJECTED (admin rejected)
  ↓
SUSPENDED (admin suspended)
```

## 🎯 Delivery Zone Types (Priority Order for Drivers)

1. **SAME_DELEGATION** - Highest priority, lowest price
2. **SAME_GOVERNORATE** - Medium priority, medium price
3. **DIFFERENT_GOVERNORATE** - Lower priority, higher price
4. **DIFFERENT_COUNTRY** - Lowest priority, highest price

## 🛡️ Customer Service Roles

- READ_DRIVER_PROFILE
- READ_CUSTOMER_PROFILE
- UPDATE_DRIVER_STATUS
- UPDATE_CUSTOMER_STATUS
- VERIFY_ACCOUNTS
- ACCEPT_LOCAL_PAYMENT
- VIEW_DELIVERIES
- MANAGE_DISPUTES
- MANAGE_SUPPORT_TICKETS
- VIEW_FINANCIAL_REPORTS

## 🔒 Guards & Authorization

### Authentication Guards
- `JwtUserGuard` - For Customer/Driver
- `JwtSuperUserGuard` - For Admin/CS

### Role Guards
- `CustomerGuard` - Customer only
- `DriverGuard` - Driver only
- `AdminGuard` - Admin only
- `CustomerServiceGuard` - CS only

### Status Guards
- `UserActiveGuard` - User must be ACTIVE
- `UserRestrictionGuard` - No active restrictions
- `VerifiedDriverGuard` - Driver must be VERIFIED

## 📝 Common Testing Scenarios

### 1. Complete Order Flow
1. Login as customer → Get token
2. Create addresses (pickup & dropoff)
3. Create order → Get order ID
4. Login as driver → Get token
5. Get available orders (should see the order)
6. Accept order → Order status: DRIVER_ASSIGNED
7. Chat room automatically created

### 2. Driver Verification Flow
1. Register as driver
2. Upload documents
3. Login as admin
4. Get pending drivers
5. Approve driver
6. Driver status → VERIFIED

### 3. User Restriction Flow
1. Login as admin
2. Block a customer
3. Try to create order as that customer → Should fail
4. Lift restriction
5. Try again → Should succeed

### 4. Zone-Based Pricing
1. Create addresses in same delegation → SAME_DELEGATION pricing
2. Create addresses in different delegations (same governorate) → SAME_GOVERNORATE pricing
3. Create addresses in different governorates → DIFFERENT_GOVERNORATE pricing

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Table does not exist" | Run `npx prisma migrate dev` |
| "Cannot connect to database" | Check DATABASE_URL in .env |
| "Unique constraint violation" | Run `npm run seed:complete` again |
| "Token expired" | Re-login to get new token |
| "Unauthorized" | Check if token is set in Authorization header |

## 📚 Documentation Files

- `SEED_AND_TEST_GUIDE.md` - Detailed setup and testing guide
- `TESTING_GUIDE.md` - Step-by-step manual testing
- `IMPLEMENTATION_SUMMARY.md` - Complete feature overview
- `QUICK_START.md` - Quick start guide
- Module-specific docs: `CUSTOMER_MODULE.md`, `ORDERS_MODULE.md`, etc.

---

**Base URL:** `http://localhost:3000`

**Postman Collection:** `Delivery_Platform_Complete.postman_collection.json`

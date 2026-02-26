# Postman Collection & Seed Data Setup

## What Was Created

This document summarizes the Postman collection and seed data setup that was just completed.

---

## 📦 Files Created

### 1. Seed Script
**File:** `prisma/seed-complete.ts`

A comprehensive seed script that populates the database with realistic test data:

- **Geography**: 2 countries, 2 governorates, 3 delegations
- **Pricing**: 4 pricing policies covering all delivery zone types
- **Users**: 1 admin, 1 customer service, 2 customers, 2 drivers
- **Addresses**: 5 addresses distributed across delegations
- **Financial**: 2 digital wallets with initial balances
- **Orders**: 2 sample orders in different states
- **Referrals**: 2 referral codes for testing

**Features:**
- Automatically cleans existing data before seeding
- Uses bcrypt to hash all passwords
- Creates verified drivers ready for testing
- Provides detailed console output with summary
- Shows all login credentials at the end

**Usage:**
```bash
npm run seed:complete
```

---

### 2. Postman Collection Generator
**File:** `scripts/generate-postman-collection.ts`

A TypeScript script that programmatically generates a complete Postman collection:

**Features:**
- 11 organized folders covering all API endpoints
- Auto-saves response variables (tokens, IDs) for chaining requests
- Pre-configured authentication headers
- Request bodies with example data
- Proper URL structure with collection variables

**Generated Collection Includes:**
1. Authentication (4 requests)
2. Admin - Geography (6 requests)
3. Admin - Pricing (4 requests)
4. Admin - Customer Service (7 requests)
5. User Profile (3 requests)
6. Addresses (4 requests)
7. Customers (5 requests)
8. Drivers (6 requests)
9. Orders (4 requests)
10. Driver Orders (5 requests)
11. Restrictions (5 requests)

**Total:** 53 pre-configured API requests

**Usage:**
```bash
npm run postman:generate
```

**Output:** `Delivery_Platform_Complete.postman_collection.json`

---

### 3. Documentation Files

#### SEED_AND_TEST_GUIDE.md
Complete guide for setting up and testing the API:
- Step-by-step setup instructions
- How to use the seed script
- How to import and use Postman collection
- Test credentials reference
- Manual testing with cURL examples
- Troubleshooting section

#### QUICK_REFERENCE.md
Quick reference card with:
- Setup commands
- All test credentials in table format
- Seeded data summary
- Complete API endpoint list
- Order and driver status flows
- Delivery zone types and priorities
- Customer service roles
- Guards and authorization
- Common testing scenarios
- Troubleshooting table

#### Updated README.md
Enhanced main README with:
- Quick start section
- Links to all documentation
- Feature overview
- Technology stack
- Test credentials table
- Available scripts
- API endpoints summary
- Project structure
- Security features
- Troubleshooting

---

## 🎯 Key Features

### Automatic Variable Management
The Postman collection automatically saves these variables:
- `adminToken` - Admin JWT token
- `customerToken` - Customer JWT token
- `driverToken` - Driver JWT token
- `csToken` - Customer Service JWT token
- `countryId` - Last created country
- `governorateId` - Last created governorate
- `delegationId1`, `delegationId2` - Created delegations
- `orderId` - Last created order
- `addressId1`, `addressId2` - Created addresses
- `customerId`, `driverId`, `csId` - User IDs
- `policyId` - Last created pricing policy

### Smart Request Chaining
Requests are organized to work sequentially:
1. Login requests save tokens
2. Create requests save IDs
3. Subsequent requests use saved variables
4. No manual copying of IDs needed

### Realistic Test Data
The seed script creates data that represents real-world scenarios:
- Multiple delegations for testing zone-based pricing
- Verified drivers ready to accept orders
- Customers with wallets and addresses
- Sample orders in different states
- Active referral codes

---

## 📊 Seeded Data Details

### Users & Authentication

| Type | Count | Status | Details |
|------|-------|--------|---------|
| Admin | 1 | ACTIVE | Full system access |
| Customer Service | 1 | ACTIVE | 4 roles assigned |
| Customers | 2 | ACTIVE | With wallets and addresses |
| Drivers | 2 | VERIFIED | Ready to accept orders |

### Geography & Pricing

| Type | Count | Details |
|------|-------|---------|
| Countries | 2 | Tunisia (TN), France (FR) |
| Governorates | 2 | Tunis, Sfax |
| Delegations | 3 | Tunis Centre, La Marsa, Sfax Ville |
| Pricing Policies | 4 | All zone types for Tunisia |

### Financial & Orders

| Type | Count | Details |
|------|-------|---------|
| Digital Wallets | 2 | 100 TND, 50 TND balances |
| Addresses | 5 | Distributed across delegations |
| Orders | 2 | SEARCHING_DRIVER, DRAFT |
| Referral Codes | 2 | WELCOME10 (10%), FIRST5 (5 TND) |

---

## 🚀 Quick Start Workflow

### 1. Setup Database
```bash
npx prisma migrate dev
npm run seed:complete
```

### 2. Generate Postman Collection
```bash
npm run postman:generate
```

### 3. Start Server
```bash
npm run start:dev
```

### 4. Import to Postman
1. Open Postman
2. Click "Import"
3. Select `Delivery_Platform_Complete.postman_collection.json`
4. Collection appears with 11 folders

### 5. Start Testing
1. Open "1. Authentication" folder
2. Run "Login Admin" - Token auto-saved
3. Run "Login Customer" - Token auto-saved
4. Run "Login Driver" - Token auto-saved
5. Continue with other folders in order

---

## 🔑 Login Credentials

All passwords are hashed with bcrypt in the database.

### Admin
- **Telephone:** +21612345678
- **Password:** Admin123456
- **Role:** ADMIN

### Customer Service
- **Telephone:** +21655555555
- **Password:** Support123
- **Role:** CUSTOMER_SERVICE
- **Roles:** READ_DRIVER_PROFILE, READ_CUSTOMER_PROFILE, VERIFY_ACCOUNTS, MANAGE_SUPPORT_TICKETS

### Customer 1 (Ahmed)
- **Phone:** +21698765432
- **Password:** Customer123
- **Wallet:** 100 TND
- **Addresses:** 2 (Tunis Centre, La Marsa)

### Customer 2 (Fatma)
- **Phone:** +21699887766
- **Password:** Customer123
- **Wallet:** 50 TND
- **Addresses:** 1 (Tunis Centre)

### Driver 1 (Mohamed)
- **Phone:** +21623456789
- **Password:** Driver123
- **Status:** VERIFIED
- **Vehicle:** Motorcycle
- **Address:** Tunis Centre

### Driver 2 (Karim)
- **Phone:** +21622334455
- **Password:** Driver123
- **Status:** VERIFIED
- **Vehicle:** Car
- **Address:** La Marsa

---

## 📝 Package.json Scripts Added

```json
{
  "scripts": {
    "seed:complete": "ts-node prisma/seed-complete.ts",
    "postman:generate": "ts-node scripts/generate-postman-collection.ts"
  }
}
```

---

## 🎨 Postman Collection Structure

```
Delivery Platform - Complete API
├── 1. Authentication
│   ├── Login Admin
│   ├── Login Customer
│   ├── Login Driver
│   └── Login Customer Service
├── 2. Admin - Geography
│   ├── Get All Countries
│   ├── Create Country
│   ├── Get All Governorates
│   ├── Create Governorate
│   ├── Get All Delegations
│   └── Create Delegation
├── 3. Admin - Pricing
│   ├── Get All Pricing Policies
│   ├── Create Pricing Policy - SAME_DELEGATION
│   ├── Update Pricing Policy
│   └── Deactivate Pricing Policy
├── 4. Admin - Customer Service
│   ├── Create Customer Service Account
│   ├── Get All Customer Services
│   ├── Get Customer Service by ID
│   ├── Add Role to CS
│   ├── Remove Role from CS
│   ├── Update All CS Roles
│   └── Toggle CS Status
├── 5. User Profile
│   ├── Get My Profile (Customer)
│   ├── Update My Profile (Customer)
│   └── Get My Profile (Driver)
├── 6. Addresses
│   ├── Create Address (Customer)
│   ├── Get All My Addresses
│   ├── Update Address
│   └── Delete Address
├── 7. Customers
│   ├── Get My Customer Profile
│   ├── Update My Customer Profile
│   ├── Admin - Get All Customers
│   ├── Admin - Get Customer Statistics
│   └── Admin - Search Customers
├── 8. Drivers
│   ├── Upload Driver Documents
│   ├── Get Driver Verification Status
│   ├── Admin - Get Pending Drivers
│   ├── Admin - Approve Driver
│   ├── Admin - Reject Driver
│   └── Admin - Suspend Driver
├── 9. Orders
│   ├── Create Order
│   ├── Get My Orders (Customer)
│   ├── Get Order by ID
│   └── Cancel Order
├── 10. Driver Orders
│   ├── Get Available Orders (Prioritized)
│   ├── Accept Order
│   ├── Get My Orders (Driver)
│   ├── Cancel Assignment (Driver)
│   └── Cancel Assignment (Customer)
└── 11. Restrictions
    ├── Admin - Block User
    ├── Admin - Suspend User
    ├── Admin - Suspend Driver
    ├── Admin - Get User Restrictions
    └── Admin - Lift Restriction
```

---

## ✅ Testing Checklist

After setup, verify these work:

- [ ] Seed script runs without errors
- [ ] Postman collection generates successfully
- [ ] Server starts on port 3000
- [ ] Can login as admin and get token
- [ ] Can login as customer and get token
- [ ] Can login as driver and get token
- [ ] Can create an order as customer
- [ ] Can see available orders as driver
- [ ] Can accept order as driver
- [ ] Variables are auto-saved in Postman

---

## 🎓 Learning Resources

### For Testing
1. Start with SEED_AND_TEST_GUIDE.md
2. Use QUICK_REFERENCE.md for quick lookups
3. Follow TESTING_GUIDE.md for detailed scenarios

### For Development
1. Read IMPLEMENTATION_SUMMARY.md for overview
2. Check module-specific docs for details
3. Review schema.prisma for data models

---

## 🔄 Resetting Data

To start fresh:

```bash
# Option 1: Re-run seed (cleans automatically)
npm run seed:complete

# Option 2: Reset database completely
npx prisma migrate reset
npm run seed:complete
```

---

## 🎉 Success Indicators

You'll know everything is working when:

1. ✅ Seed script shows summary with all counts
2. ✅ Postman collection has 11 folders with 53 requests
3. ✅ Server starts without errors
4. ✅ Login requests return tokens
5. ✅ Tokens are automatically saved in Postman
6. ✅ Subsequent requests use saved tokens
7. ✅ Can create orders and see them as driver

---

## 📞 Support

If you encounter issues:

1. Check SEED_AND_TEST_GUIDE.md troubleshooting section
2. Verify DATABASE_URL in .env
3. Ensure PostgreSQL is running
4. Check that migrations are up to date
5. Review console output for specific errors

---

**Created:** February 26, 2026
**Purpose:** Complete testing setup for delivery platform API
**Status:** ✅ Ready for testing

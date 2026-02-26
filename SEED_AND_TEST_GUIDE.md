# Seed Data & Testing Guide

## Quick Start

This guide will help you quickly set up test data and start testing the API.

## Prerequisites

1. PostgreSQL database running
2. Environment variables configured in `.env`
3. Dependencies installed: `npm install`

## Step 1: Database Setup

Run migrations to create all tables:

```bash
npx prisma migrate dev
```

Generate Prisma client:

```bash
npx prisma generate
```

## Step 2: Seed the Database

Run the complete seed script to populate the database with test data:

```bash
npm run seed:complete
```

This will create:
- 2 Countries (Tunisia, France)
- 2 Governorates (Tunis, Sfax)
- 3 Delegations (Tunis Centre, La Marsa, Sfax Ville)
- 4 Pricing Policies (all zone types for Tunisia)
- 1 Admin account
- 1 Customer Service account
- 2 Customer accounts
- 2 Driver accounts (both VERIFIED)
- 5 Addresses
- 2 Digital Wallets
- 2 Sample Orders
- 2 Referral Codes

## Step 3: Start the Server

```bash
npm run start:dev
```

The server will start on `http://localhost:3000`

## Step 4: Test with Postman

### Generate Postman Collection

```bash
npm run postman:generate
```

This creates `Delivery_Platform_Complete.postman_collection.json`

### Import into Postman

1. Open Postman
2. Click "Import" button
3. Select the generated JSON file
4. The collection will be imported with all endpoints organized in folders

### Testing Flow

The collection is organized in the recommended testing order:

1. **Authentication** - Login to get access tokens (automatically saved)
2. **Admin - Geography** - Manage countries, governorates, delegations
3. **Admin - Pricing** - Manage pricing policies
4. **Admin - Customer Service** - Manage CS accounts and roles
5. **User Profile** - View and update user profiles
6. **Addresses** - Create and manage addresses
7. **Customers** - Customer profile management
8. **Drivers** - Driver verification and management
9. **Orders** - Create and manage orders
10. **Driver Orders** - Driver order acceptance and assignment
11. **Restrictions** - User blocking and suspension

### Auto-Saved Variables

The collection automatically saves these variables as you make requests:
- `adminToken` - Admin JWT token
- `customerToken` - Customer JWT token
- `driverToken` - Driver JWT token
- `csToken` - Customer Service JWT token
- `countryId` - Last created country ID
- `governorateId` - Last created governorate ID
- `delegationId1` - Last created delegation ID
- `orderId` - Last created order ID
- `addressId1`, `addressId2` - Created address IDs
- And more...

## Test Credentials

### Admin
- **Telephone:** +21612345678
- **Password:** Admin123456

### Customer Service
- **Telephone:** +21655555555
- **Password:** Support123

### Customer 1 (Ahmed)
- **Phone:** +21698765432
- **Password:** Customer123

### Customer 2 (Fatma)
- **Phone:** +21699887766
- **Password:** Customer123

### Driver 1 (Mohamed)
- **Phone:** +21623456789
- **Password:** Driver123
- **Status:** VERIFIED

### Driver 2 (Karim)
- **Phone:** +21622334455
- **Password:** Driver123
- **Status:** VERIFIED

## Manual Testing with cURL

If you prefer cURL, here are some examples:

### Login as Admin
```bash
curl -X POST http://localhost:3000/auth/superuser/login \
  -H "Content-Type: application/json" \
  -d '{
    "telephone": "+21612345678",
    "password": "Admin123456"
  }'
```

### Login as Customer
```bash
curl -X POST http://localhost:3000/auth/user/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+21698765432",
    "password": "Customer123"
  }'
```

### Get Customer Profile
```bash
curl -X GET http://localhost:3000/customers/me \
  -H "Authorization: Bearer YOUR_CUSTOMER_TOKEN"
```

## Resetting the Database

To start fresh, run the seed script again:

```bash
npm run seed:complete
```

The script automatically cleans all existing data before seeding.

## Troubleshooting

### Issue: "Table does not exist"
**Solution:** Run migrations first: `npx prisma migrate dev`

### Issue: "Cannot connect to database"
**Solution:** Check your DATABASE_URL in `.env` file

### Issue: "Unique constraint violation"
**Solution:** The seed script cleans data first. If it fails, manually reset:
```bash
npx prisma migrate reset
npm run seed:complete
```

### Issue: "Token expired"
**Solution:** Re-login using the Authentication endpoints in Postman

## Next Steps

After testing with seed data:

1. Test edge cases with invalid data
2. Test concurrent operations (multiple drivers accepting same order)
3. Test with different zone types (create addresses in different delegations)
4. Test restriction workflows (block user, try to create order)
5. Test driver assignment cancellation by both parties

## Additional Resources

- **Full Testing Guide:** See `TESTING_GUIDE.md` for detailed step-by-step testing
- **Implementation Summary:** See `IMPLEMENTATION_SUMMARY.md` for feature overview
- **API Documentation:** See individual module documentation files

---

Happy Testing! 🚀

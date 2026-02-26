# Delivery Platform Backend

A comprehensive on-demand delivery platform built with NestJS, Prisma, and PostgreSQL.

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Setup environment variables
cp .env.example .env
# Edit .env with your database credentials

# 3. Run database migrations
npx prisma migrate dev

# 4. Seed database with test data
npm run seed:complete

# 5. Generate Postman collection
npm run postman:generate

# 6. Start development server
npm run start:dev
```

Server will be running at `http://localhost:3000`

## 📚 Documentation

### Getting Started
- **[Quick Reference](QUICK_REFERENCE.md)** - Commands, credentials, and API endpoints at a glance
- **[Seed & Test Guide](SEED_AND_TEST_GUIDE.md)** - Complete setup and testing instructions
- **[Quick Start Guide](QUICK_START.md)** - Basic setup guide

### Testing
- **[Testing Guide](TESTING_GUIDE.md)** - Detailed step-by-step manual testing
- **Postman Collection** - `Delivery_Platform_Complete.postman_collection.json`

### Implementation Details
- **[Implementation Summary](IMPLEMENTATION_SUMMARY.md)** - Complete feature overview
- **[Customer Module](CUSTOMER_MODULE.md)** - Customer management details
- **[Orders Module](ORDERS_MODULE.md)** - Order system and pricing
- **[Admin Geography & Pricing](ADMIN_GEOGRAPHY_PRICING.md)** - Geographic and pricing management
- **[Customer Service Management](CUSTOMER_SERVICE_MANAGEMENT.md)** - CS roles and permissions
- **[Authentication](AUTHENTICATION_COMPLETE.md)** - Auth system details

## ✨ Features

### Core Modules
- ✅ User & Driver Management
- ✅ Customer Management with Referral System
- ✅ Order Management with Zone-Based Pricing
- ✅ Driver Assignment with Priority System
- ✅ Admin Geography Management
- ✅ Dynamic Pricing Policies
- ✅ Customer Service Role Management
- ✅ User Restrictions & Guards
- ✅ Address Management
- ✅ Driver Verification System

### Key Capabilities
- **Zone-Based Pricing**: 4 delivery zone types with different pricing
- **Smart Driver Assignment**: Priority-based order display for drivers
- **Automatic Distance Calculation**: Haversine formula for accurate distances
- **Chat Room Integration**: Auto-created when driver accepts order
- **Flexible Cancellation**: Both parties can cancel assignments
- **Role-Based Access Control**: Granular permissions for customer service
- **User Restrictions**: Block/suspend users with reason tracking

## 🗄️ Database

### Technology Stack
- **Framework**: NestJS
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT (Passport)
- **Password Hashing**: bcrypt
- **Cache**: Redis (for OTP)

### Schema Overview
- 30+ models covering all aspects of delivery operations
- Geographic hierarchy (Country → Governorate → Delegation)
- User types (Customer, Driver, Admin, Customer Service)
- Order management with status workflow
- Financial tracking (Wallets, Transactions)
- Referral and rating systems

## 🔑 Test Credentials

After running `npm run seed:complete`:

| Role | Phone/Telephone | Password |
|------|----------------|----------|
| Admin | +21612345678 | Admin123456 |
| Customer Service | +21655555555 | Support123 |
| Customer (Ahmed) | +21698765432 | Customer123 |
| Driver (Mohamed) | +21623456789 | Driver123 |

See [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for complete list.

## 📦 Available Scripts

```bash
# Development
npm run start:dev          # Start with hot-reload
npm run start:debug        # Start with debugging

# Build
npm run build              # Compile TypeScript
npm run start:prod         # Run production build

# Database
npx prisma migrate dev     # Run migrations
npx prisma generate        # Generate Prisma client
npm run seed:complete      # Seed with test data

# Testing
npm run postman:generate   # Generate Postman collection
npm test                   # Run unit tests
npm run test:e2e          # Run e2e tests

# Code Quality
npm run lint              # Lint code
npm run format            # Format code with Prettier
```

## 🔗 API Endpoints

### Authentication
- `POST /auth/superuser/login` - Admin/CS login
- `POST /auth/user/login` - Customer/Driver login
- `POST /auth/superuser/register` - Register admin/CS
- `POST /auth/user/register` - Register customer/driver

### Admin
- `/admin/geography/*` - Manage countries, governorates, delegations
- `/admin/pricing-policies` - Manage pricing policies
- `/admin/customer-services` - Manage CS accounts
- `/admin/customers` - Customer management
- `/admin/drivers` - Driver verification
- `/admin/restrictions` - User restrictions

### Users
- `/users/profile` - User profile management
- `/addresses` - Address CRUD
- `/customers/me` - Customer profile
- `/driver/*` - Driver operations

### Orders
- `/orders` - Order management (customer)
- `/driver/orders/*` - Driver order operations

See [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for complete endpoint list.

## 🧪 Testing

### With Postman
1. Generate collection: `npm run postman:generate`
2. Import `Delivery_Platform_Complete.postman_collection.json` into Postman
3. Start with "1. Authentication" folder
4. Variables are auto-saved as you test

### Manual Testing
See [TESTING_GUIDE.md](TESTING_GUIDE.md) for detailed cURL examples and testing flows.

## 🏗️ Project Structure

```
delivery-backend/
├── prisma/
│   ├── schema.prisma              # Database schema
│   ├── seed.ts                    # Basic seed
│   └── seed-complete.ts           # Complete test data seed
├── src/
│   ├── admin/                     # Admin module
│   ├── auth/                      # Authentication
│   ├── customers/                 # Customer management
│   ├── drivers/                   # Driver management
│   ├── orders/                    # Order system
│   ├── users/                     # User management
│   ├── restrictions/              # User restrictions
│   └── prisma/                    # Prisma service
├── scripts/
│   └── generate-postman-collection.ts
└── docs/                          # Documentation files
```

## 🛡️ Security

- JWT-based authentication with separate strategies for users and super users
- Password hashing with bcrypt (10 rounds)
- Role-based access control with guards
- User status and restriction checks
- Input validation with class-validator

## 🚦 Order Status Flow

```
DRAFT → SEARCHING_DRIVER → DRIVER_ASSIGNED → DRIVER_ARRIVED 
→ PICKED_UP → DELIVERING → DELIVERED
```

## 🚗 Driver Status Flow

```
INCOMPLETE → PENDING_REVIEW → VERIFIED/REJECTED → SUSPENDED
```

## 🎯 Delivery Zone Types

1. **SAME_DELEGATION** - Lowest price, highest priority
2. **SAME_GOVERNORATE** - Medium price, medium priority
3. **DIFFERENT_GOVERNORATE** - Higher price, lower priority
4. **DIFFERENT_COUNTRY** - Highest price, lowest priority

## 📊 Seeded Test Data

Running `npm run seed:complete` creates:
- 2 Countries (Tunisia, France)
- 2 Governorates, 3 Delegations
- 4 Pricing Policies (all zone types)
- 1 Admin, 1 Customer Service
- 2 Customers, 2 Verified Drivers
- 5 Addresses, 2 Wallets
- 2 Sample Orders, 2 Referral Codes

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Table does not exist | Run `npx prisma migrate dev` |
| Cannot connect to database | Check DATABASE_URL in .env |
| Unique constraint violation | Run `npm run seed:complete` |
| Token expired | Re-login to get new token |

See [SEED_AND_TEST_GUIDE.md](SEED_AND_TEST_GUIDE.md) for more troubleshooting tips.

## 📝 Environment Variables

```env
DATABASE_URL="postgresql://user:password@localhost:5432/delivery_platform"
JWT_SECRET="your-secret-key"
REDIS_HOST="localhost"
REDIS_PORT=6379
```

## 🤝 Contributing

1. Follow NestJS best practices
2. Use Prisma for database operations
3. Add proper validation with class-validator
4. Include guards for authorization
5. Update documentation when adding features

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

Built with:
- [NestJS](https://nestjs.com/) - Progressive Node.js framework
- [Prisma](https://www.prisma.io/) - Next-generation ORM
- [PostgreSQL](https://www.postgresql.org/) - Powerful database
- [Passport](http://www.passportjs.org/) - Authentication middleware

---

For detailed information, see the documentation files in the project root.

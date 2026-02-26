# Customer Module Documentation

## Overview
The Customer module provides CRUD operations and management functionality for customer-specific data. It separates customer operations from the base User entity, allowing for customer-specific features like referral codes, order tracking, and customer statistics.

## Architecture

### Entity Relationship
```
User (1) ──→ (0..1) Customer
```
- A User with role=CUSTOMER has an associated Customer record
- Customer extends User with customer-specific fields

## API Endpoints

### Customer Endpoints (Authenticated Customer)

#### Get My Profile
```
GET /customers/me
Authorization: Bearer <user_jwt_token>
Role: CUSTOMER
```

**Response:**
```json
{
  "id": "customer-uuid",
  "userId": "user-uuid",
  "completedOrders": 5,
  "myReferralCodeId": "referral-code-uuid",
  "referredByCodeId": "referral-code-uuid",
  "user": {
    "id": "user-uuid",
    "phone": "+1234567890",
    "firstName": "John",
    "secondName": "Doe",
    "image": "https://...",
    "myEmail": "john@example.com",
    "status": "ACTIVE"
  },
  "myReferralCode": {
    "id": "referral-code-uuid",
    "code": "JOHN2024",
    "type": "PERCENTAGE",
    "value": 10,
    "active": true
  },
  "referredByCode": {
    "id": "referral-code-uuid",
    "code": "FRIEND2024",
    "type": "FIXED",
    "value": 5
  }
}
```

#### Update My Profile
```
PATCH /customers/me
Authorization: Bearer <user_jwt_token>
Role: CUSTOMER
```

**Request Body:**
```json
{
  "myReferralCodeId": "new-referral-code-uuid"
}
```

**Response:** Same as Get My Profile

---

### Admin Endpoints (Admin Only)

#### Get All Customers (Paginated)
```
GET /admin/customers?page=1&limit=20
Authorization: Bearer <admin_jwt_token>
Role: ADMIN
```

**Query Parameters:**
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 20) - Items per page

**Response:**
```json
{
  "customers": [
    {
      "id": "customer-uuid",
      "userId": "user-uuid",
      "completedOrders": 5,
      "user": {
        "phone": "+1234567890",
        "firstName": "John",
        "secondName": "Doe",
        "status": "ACTIVE"
      }
    }
  ],
  "total": 150,
  "page": 1,
  "totalPages": 8
}
```

#### Get Customer Statistics
```
GET /admin/customers/stats
Authorization: Bearer <admin_jwt_token>
Role: ADMIN
```

**Response:**
```json
{
  "totalCustomers": 150,
  "activeCustomers": 140,
  "blockedCustomers": 10,
  "customersWithOrders": 85,
  "averageOrdersPerCustomer": 3.45
}
```

#### Search Customers
```
GET /admin/customers/search?q=john
Authorization: Bearer <admin_jwt_token>
Role: ADMIN
```

**Query Parameters:**
- `q` (required) - Search query (searches phone, firstName, secondName)

**Response:**
```json
[
  {
    "id": "customer-uuid",
    "userId": "user-uuid",
    "completedOrders": 5,
    "user": {
      "phone": "+1234567890",
      "firstName": "John",
      "secondName": "Doe",
      "status": "ACTIVE"
    }
  }
]
```

#### Get Customer by ID
```
GET /admin/customers/:id
Authorization: Bearer <admin_jwt_token>
Role: ADMIN
```

**Response:** Same as Get My Profile

#### Delete Customer (Soft Delete)
```
DELETE /admin/customers/:id
Authorization: Bearer <admin_jwt_token>
Role: ADMIN
```

**Response:**
```json
{
  "message": "Customer deleted successfully"
}
```

**Note:** This performs a soft delete by setting the user's status to BLOCKED.

---

## Service Methods

### CustomersService

#### Customer Methods
- `getCustomerProfile(userId: string)` - Get customer profile by user ID
- `updateCustomerProfile(userId: string, dto: UpdateCustomerDto)` - Update customer profile

#### Admin Methods
- `getAllCustomers(page: number, limit: number)` - Get paginated list of customers
- `getCustomerById(customerId: string)` - Get customer by customer ID
- `deleteCustomer(customerId: string)` - Soft delete customer
- `getCustomerStats()` - Get customer statistics
- `searchCustomers(query: string)` - Search customers by phone or name

---

## DTOs

### UpdateCustomerDto
```typescript
{
  myReferralCodeId?: string;  // Optional: Update referral code
}
```

### CustomerResponseDto
```typescript
{
  id: string;
  userId: string;
  completedOrders: number;
  myReferralCodeId: string | null;
  referredByCodeId: string | null;
  user: {
    id: string;
    phone: string;
    firstName: string | null;
    secondName: string | null;
    image: string | null;
    myEmail: string | null;
    status: string;
  };
  myReferralCode?: {
    id: string;
    code: string;
    type: string;
    value: number;
    active: boolean;
  } | null;
  referredByCode?: {
    id: string;
    code: string;
    type: string;
    value: number;
  } | null;
}
```

### CustomerListResponseDto
```typescript
{
  id: string;
  userId: string;
  completedOrders: number;
  user: {
    phone: string;
    firstName: string | null;
    secondName: string | null;
    status: string;
  };
}
```

### CustomerStatsDto
```typescript
{
  totalCustomers: number;
  activeCustomers: number;
  blockedCustomers: number;
  customersWithOrders: number;
  averageOrdersPerCustomer: number;
}
```

---

## Guards & Authorization

### Customer Endpoints
- **JwtUserGuard** - Validates JWT token for regular users
- **CustomerGuard** - Ensures user has role=CUSTOMER

### Admin Endpoints
- **JwtSuperUserGuard** - Validates JWT token for super users
- **AdminGuard** - Ensures super user has role=ADMIN

---

## Database Schema

### Customer Model
```prisma
model Customer {
  id               String  @id @default(uuid())
  userId           String  @unique
  completedOrders  Int     @default(0)
  myReferralCodeId String? @unique
  referredByCodeId String?

  user                      User                 @relation(...)
  myReferralCode            ReferralCode?        @relation(...)
  referredByCode            ReferralCode?        @relation(...)
  orders                    Order[]
  wallet                    DigitalWallet?
  supportTickets            SupportTicket[]
  ratingsGiven              Rating[]
  commissionsAsReferrer     ReferralCommission[]
  commissionsAsReferred     ReferralCommission[]
  chatRoomsAsCustomer       ChatRoom[]
}
```

---

## Features

### Customer Features
- View own profile with user details
- View referral code information (own code and referred by)
- Update referral code association
- Track completed orders count

### Admin Features
- View all customers with pagination
- Search customers by phone or name
- View detailed customer information
- Get customer statistics dashboard
- Soft delete customers (blocks user account)

---

## Error Handling

### Common Errors
- **404 Not Found** - Customer profile not found
- **403 Forbidden** - Insufficient permissions (wrong role)
- **401 Unauthorized** - Invalid or missing JWT token

---

## Usage Examples

### Customer: Get My Profile
```bash
curl -X GET http://localhost:3000/customers/me \
  -H "Authorization: Bearer <customer_jwt_token>"
```

### Customer: Update Referral Code
```bash
curl -X PATCH http://localhost:3000/customers/me \
  -H "Authorization: Bearer <customer_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{"myReferralCodeId": "new-referral-code-uuid"}'
```

### Admin: Get All Customers
```bash
curl -X GET "http://localhost:3000/admin/customers?page=1&limit=20" \
  -H "Authorization: Bearer <admin_jwt_token>"
```

### Admin: Search Customers
```bash
curl -X GET "http://localhost:3000/admin/customers/search?q=john" \
  -H "Authorization: Bearer <admin_jwt_token>"
```

### Admin: Get Customer Stats
```bash
curl -X GET http://localhost:3000/admin/customers/stats \
  -H "Authorization: Bearer <admin_jwt_token>"
```

### Admin: Delete Customer
```bash
curl -X DELETE http://localhost:3000/admin/customers/<customer-id> \
  -H "Authorization: Bearer <admin_jwt_token>"
```

---

## Notes

1. **Soft Delete**: Deleting a customer sets the user's status to BLOCKED rather than removing the record
2. **Referral Codes**: Customers can have their own referral code and can be referred by another code
3. **Completed Orders**: The completedOrders field is automatically updated when orders are completed
4. **Search**: Case-insensitive search across phone, firstName, and secondName fields
5. **Pagination**: Default page size is 20, can be adjusted via query parameter
6. **Statistics**: Calculated in real-time from the database

---

## Integration with Other Modules

- **User Module**: Customer extends User entity
- **Orders Module**: Tracks completedOrders count
- **Referral Module**: Manages referral codes and commissions
- **Wallet Module**: Each customer has a digital wallet
- **Restrictions Module**: Customer accounts can be blocked/suspended

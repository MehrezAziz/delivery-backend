# Customer Service Management

## Overview
The Customer Service Management module allows admins to create, manage, and assign roles to customer service accounts. Customer service staff have limited permissions based on their assigned roles, enabling fine-grained access control.

## Customer Service Roles

The system supports the following roles (CustomerServiceRole enum):

- **READ_DRIVER_PROFILE** - View driver profile information
- **READ_CUSTOMER_PROFILE** - View customer profile information
- **UPDATE_DRIVER_STATUS** - Modify driver status (verify, suspend, etc.)
- **UPDATE_CUSTOMER_STATUS** - Modify customer status (block, unblock)
- **VERIFY_ACCOUNTS** - Approve/reject driver verification documents
- **ACCEPT_LOCAL_PAYMENT** - Process local payment collections
- **VIEW_DELIVERIES** - View delivery information and tracking
- **MANAGE_DISPUTES** - Handle customer/driver disputes
- **MANAGE_SUPPORT_TICKETS** - Manage customer support tickets
- **VIEW_FINANCIAL_REPORTS** - Access financial reports and analytics

Each customer service account can have **zero or more roles** assigned by admins.

---

## API Endpoints (Admin Only)

### Create Customer Service Account
```
POST /admin/customer-services
Authorization: Bearer <admin_jwt_token>
Role: ADMIN
```

**Request Body:**
```json
{
  "telephone": "+1234567890",
  "pseudo": "cs_john",
  "email": "john.cs@example.com",
  "password": "SecurePass123",
  "roles": [
    "READ_DRIVER_PROFILE",
    "READ_CUSTOMER_PROFILE",
    "MANAGE_SUPPORT_TICKETS"
  ]
}
```

**Response:**
```json
{
  "id": "cs-uuid",
  "superUserId": "superuser-uuid",
  "roles": [
    "READ_DRIVER_PROFILE",
    "READ_CUSTOMER_PROFILE",
    "MANAGE_SUPPORT_TICKETS"
  ],
  "superUser": {
    "id": "superuser-uuid",
    "telephone": "+1234567890",
    "pseudo": "cs_john",
    "email": "john.cs@example.com",
    "role": "CUSTOMER_SERVICE",
    "status": "ACTIVE",
    "createdAt": "2024-01-01T10:00:00Z"
  }
}
```

### Get All Customer Service Accounts
```
GET /admin/customer-services
Authorization: Bearer <admin_jwt_token>
Role: ADMIN
```

**Response:**
```json
[
  {
    "id": "cs-uuid",
    "superUserId": "superuser-uuid",
    "roles": ["READ_DRIVER_PROFILE", "READ_CUSTOMER_PROFILE"],
    "telephone": "+1234567890",
    "pseudo": "cs_john",
    "email": "john.cs@example.com",
    "status": "ACTIVE"
  }
]
```

### Get Customer Service by ID
```
GET /admin/customer-services/:id
Authorization: Bearer <admin_jwt_token>
Role: ADMIN
```

**Response:** Same as Create response

### Update Customer Service Account
```
PATCH /admin/customer-services/:id
Authorization: Bearer <admin_jwt_token>
Role: ADMIN
```

**Request Body:**
```json
{
  "telephone": "+0987654321",
  "pseudo": "cs_john_updated",
  "email": "john.updated@example.com",
  "password": "NewSecurePass456"
}
```

**Note:** All fields are optional. Password will be hashed before storage.

### Update Customer Service Roles (Replace All)
```
PATCH /admin/customer-services/:id/roles
Authorization: Bearer <admin_jwt_token>
Role: ADMIN
```

**Request Body:**
```json
{
  "roles": [
    "READ_DRIVER_PROFILE",
    "UPDATE_DRIVER_STATUS",
    "VERIFY_ACCOUNTS"
  ]
}
```

**Note:** This replaces all existing roles with the new set.

### Add Single Role
```
POST /admin/customer-services/:id/roles/:role
Authorization: Bearer <admin_jwt_token>
Role: ADMIN
```

**Example:**
```
POST /admin/customer-services/cs-uuid/roles/MANAGE_DISPUTES
```

**Response:** Updated customer service object with new role added

### Remove Single Role
```
DELETE /admin/customer-services/:id/roles/:role
Authorization: Bearer <admin_jwt_token>
Role: ADMIN
```

**Example:**
```
DELETE /admin/customer-services/cs-uuid/roles/MANAGE_DISPUTES
```

**Response:** Updated customer service object with role removed

### Toggle Account Status (ACTIVE/BLOCKED)
```
PATCH /admin/customer-services/:id/toggle-status
Authorization: Bearer <admin_jwt_token>
Role: ADMIN
```

**Effect:** Toggles between ACTIVE and BLOCKED status

**Response:** Updated customer service object

### Delete Customer Service Account
```
DELETE /admin/customer-services/:id
Authorization: Bearer <admin_jwt_token>
Role: ADMIN
```

**Response:**
```json
{
  "message": "Customer service account deleted successfully"
}
```

---

## Role-Based Access Control

### How It Works

1. **Admin creates CS account** with initial roles
2. **CS logs in** using their credentials
3. **System checks roles** before allowing operations
4. **Admin can modify roles** at any time

### Example Role Combinations

#### Support Agent
```json
{
  "roles": [
    "READ_CUSTOMER_PROFILE",
    "READ_DRIVER_PROFILE",
    "MANAGE_SUPPORT_TICKETS"
  ]
}
```

#### Verification Specialist
```json
{
  "roles": [
    "READ_DRIVER_PROFILE",
    "VERIFY_ACCOUNTS",
    "UPDATE_DRIVER_STATUS"
  ]
}
```

#### Dispute Manager
```json
{
  "roles": [
    "READ_CUSTOMER_PROFILE",
    "READ_DRIVER_PROFILE",
    "MANAGE_DISPUTES",
    "VIEW_DELIVERIES"
  ]
}
```

#### Payment Collector
```json
{
  "roles": [
    "READ_DRIVER_PROFILE",
    "ACCEPT_LOCAL_PAYMENT",
    "VIEW_FINANCIAL_REPORTS"
  ]
}
```

#### Senior CS (All Permissions)
```json
{
  "roles": [
    "READ_DRIVER_PROFILE",
    "READ_CUSTOMER_PROFILE",
    "UPDATE_DRIVER_STATUS",
    "UPDATE_CUSTOMER_STATUS",
    "VERIFY_ACCOUNTS",
    "ACCEPT_LOCAL_PAYMENT",
    "VIEW_DELIVERIES",
    "MANAGE_DISPUTES",
    "MANAGE_SUPPORT_TICKETS",
    "VIEW_FINANCIAL_REPORTS"
  ]
}
```

---

## Usage Examples

### Create CS Account with Roles
```bash
curl -X POST http://localhost:3000/admin/customer-services \
  -H "Authorization: Bearer <admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "telephone": "+1234567890",
    "pseudo": "cs_support1",
    "email": "support1@example.com",
    "password": "SecurePass123",
    "roles": ["READ_CUSTOMER_PROFILE", "MANAGE_SUPPORT_TICKETS"]
  }'
```

### Update Roles
```bash
curl -X PATCH http://localhost:3000/admin/customer-services/<cs-id>/roles \
  -H "Authorization: Bearer <admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "roles": [
      "READ_CUSTOMER_PROFILE",
      "READ_DRIVER_PROFILE",
      "MANAGE_SUPPORT_TICKETS",
      "MANAGE_DISPUTES"
    ]
  }'
```

### Add Single Role
```bash
curl -X POST http://localhost:3000/admin/customer-services/<cs-id>/roles/VERIFY_ACCOUNTS \
  -H "Authorization: Bearer <admin_jwt>"
```

### Remove Single Role
```bash
curl -X DELETE http://localhost:3000/admin/customer-services/<cs-id>/roles/VERIFY_ACCOUNTS \
  -H "Authorization: Bearer <admin_jwt>"
```

### Block CS Account
```bash
curl -X PATCH http://localhost:3000/admin/customer-services/<cs-id>/toggle-status \
  -H "Authorization: Bearer <admin_jwt>"
```

---

## Database Schema

### SuperUser Model
```prisma
model SuperUser {
  id            String        @id @default(uuid())
  telephone     String        @unique
  pseudo        String        @unique
  email         String        @unique
  superPassword String        // Hashed password
  role          SuperUserRole // ADMIN or CUSTOMER_SERVICE
  status        UserStatus    @default(ACTIVE)
  createdAt     DateTime      @default(now())
  
  customerService CustomerService?
}
```

### CustomerService Model
```prisma
model CustomerService {
  id          String                 @id @default(uuid())
  superUserId String                 @unique
  roles       CustomerServiceRole[]  @default([])
  
  superUser SuperUser @relation(...)
}
```

### CustomerServiceRole Enum
```prisma
enum CustomerServiceRole {
  READ_DRIVER_PROFILE
  READ_CUSTOMER_PROFILE
  UPDATE_DRIVER_STATUS
  UPDATE_CUSTOMER_STATUS
  VERIFY_ACCOUNTS
  ACCEPT_LOCAL_PAYMENT
  VIEW_DELIVERIES
  MANAGE_DISPUTES
  MANAGE_SUPPORT_TICKETS
  VIEW_FINANCIAL_REPORTS
}
```

---

## Validation Rules

### Create Account
- `telephone` must be unique
- `pseudo` must be unique
- `email` must be unique and valid email format
- `password` must be at least 8 characters
- `roles` must be valid CustomerServiceRole values

### Update Account
- Cannot change to existing telephone/pseudo/email
- Password is optional, will be hashed if provided
- All fields are optional

### Roles
- Can have zero or more roles
- Cannot add duplicate roles
- Cannot remove non-existent roles

---

## Error Handling

### Common Errors
- **409 Conflict** - Telephone, pseudo, or email already exists
- **404 Not Found** - Customer service account not found
- **400 Bad Request** - Role already assigned or not assigned
- **403 Forbidden** - Non-admin user attempting access

---

## Security Features

1. **Password Hashing**: All passwords hashed with bcrypt (10 rounds)
2. **Admin-Only Access**: Only ADMIN role can manage CS accounts
3. **Status Control**: Blocked CS accounts cannot log in
4. **Role Validation**: Only valid roles can be assigned
5. **Unique Constraints**: Telephone, pseudo, and email must be unique

---

## Integration with Other Modules

### Auth Module
- CS accounts use SuperUser authentication
- Login with telephone/email and password
- JWT tokens include role information

### Restriction Module
- CS accounts can be blocked/unblocked
- Blocked CS cannot access the system

### Driver/Customer Modules
- CS with appropriate roles can view/modify profiles
- Role checks enforce permissions

---

## Best Practices

1. **Principle of Least Privilege**: Assign only necessary roles
2. **Regular Audits**: Review CS roles periodically
3. **Role Combinations**: Group related permissions
4. **Account Lifecycle**: Block instead of delete for audit trail
5. **Password Policy**: Enforce strong passwords (min 8 chars)

---

## Future Enhancements

- Role-based middleware/guards for CS endpoints
- Audit logging for CS actions
- Role templates for common CS types
- Bulk role assignment
- Role expiration dates
- Permission inheritance/hierarchies

---

## Notes

1. **Zero Roles**: CS can have no roles (useful for training accounts)
2. **Role Changes**: Take effect immediately (no re-login required)
3. **Cascading Delete**: Deleting SuperUser deletes CustomerService
4. **Status Toggle**: Convenient for temporary suspension
5. **Password Updates**: Optional in update endpoint

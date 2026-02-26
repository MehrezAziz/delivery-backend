# Complete Testing Guide

## Overview
This guide provides step-by-step instructions to test all implemented features of the delivery backend system.

## Prerequisites

1. **Database Setup**
   ```bash
   # Run migrations
   npx prisma migrate dev
   
   # Generate Prisma client
   npx prisma generate
   ```

2. **Start the Server**
   ```bash
   npm run start:dev
   ```

3. **Base URL**
   ```
   http://localhost:3000
   ```

---

## Testing Order

Follow this order to test features properly:

1. Admin Setup (Geography & Pricing)
2. User Registration & Authentication
3. Customer Service Management
4. User Profile & Address Management
5. Driver Verification
6. Customer Management
7. Order Creation & Management
8. Driver Assignment & Order Flow
9. Restrictions & Guards

---

## 1. Admin Setup

### Step 1.1: Register Admin Account
```bash
POST http://localhost:3000/auth/superuser/register
Content-Type: application/json

{
  "telephone": "+21612345678",
  "pseudo": "admin1",
  "email": "admin@delivery.com",
  "password": "Admin123456",
  "role": "ADMIN"
}
```

**Expected Response:** 200 OK with access_token

**Save:** `ADMIN_TOKEN` from response

---

### Step 1.2: Create Country
```bash
POST http://localhost:3000/admin/geography/countries
Authorization: Bearer {{ADMIN_TOKEN}}
Content-Type: application/json

{
  "name": "Tunisia",
  "isoCode": "TN",
  "currencyCode": "TND",
  "currencySymbol": "د.ت",
  "isActive": true
}
```

**Expected Response:** 201 Created with country object

**Save:** `COUNTRY_ID` from response

---

### Step 1.3: Create Governorate
```bash
POST http://localhost:3000/admin/geography/governorates
Authorization: Bearer {{ADMIN_TOKEN}}
Content-Type: application/json

{
  "nameGovernorate": "Tunis",
  "countryId": "{{COUNTRY_ID}}"
}
```

**Expected Response:** 201 Created

**Save:** `GOVERNORATE_ID` from response

---

### Step 1.4: Create Delegation
```bash
POST http://localhost:3000/admin/geography/delegations
Authorization: Bearer {{ADMIN_TOKEN}}
Content-Type: application/json

{
  "nameDelegation": "Tunis Centre",
  "maxConfirmationDelayMinutes": 15,
  "governorateId": "{{GOVERNORATE_ID}}"
}
```

**Expected Response:** 201 Created

**Save:** `DELEGATION_ID_1` from response

---

### Step 1.5: Create Another Delegation (for testing different zones)
```bash
POST http://localhost:3000/admin/geography/delegations
Authorization: Bearer {{ADMIN_TOKEN}}
Content-Type: application/json

{
  "nameDelegation": "La Marsa",
  "maxConfirmationDelayMinutes": 15,
  "governorateId": "{{GOVERNORATE_ID}}"
}
```

**Save:** `DELEGATION_ID_2` from response

---

### Step 1.6: Create Pricing Policies (All 4 Zone Types)

**SAME_DELEGATION:**
```bash
POST http://localhost:3000/admin/pricing-policies
Authorization: Bearer {{ADMIN_TOKEN}}
Content-Type: application/json

{
  "countryId": "{{COUNTRY_ID}}",
  "deliveryZoneType": "SAME_DELEGATION",
  "pricePerKm": 1.5,
  "baseFee": 5.0,
  "baseWeight": 5.0,
  "extraWeightStep": 1.0,
  "extraWeightPrice": 0.5,
  "nightFee": 2.0,
  "platformFee": 1.0,
  "maxNegativeDays": 7,
  "isActive": true
}
```

**SAME_GOVERNORATE:**
```bash
POST http://localhost:3000/admin/pricing-policies
Authorization: Bearer {{ADMIN_TOKEN}}
Content-Type: application/json

{
  "countryId": "{{COUNTRY_ID}}",
  "deliveryZoneType": "SAME_GOVERNORATE",
  "pricePerKm": 2.0,
  "baseFee": 8.0,
  "baseWeight": 5.0,
  "extraWeightStep": 1.0,
  "extraWeightPrice": 0.75,
  "nightFee": 3.0,
  "platformFee": 1.5,
  "maxNegativeDays": 7,
  "isActive": true
}
```

**DIFFERENT_GOVERNORATE:**
```bash
POST http://localhost:3000/admin/pricing-policies
Authorization: Bearer {{ADMIN_TOKEN}}
Content-Type: application/json

{
  "countryId": "{{COUNTRY_ID}}",
  "deliveryZoneType": "DIFFERENT_GOVERNORATE",
  "pricePerKm": 3.0,
  "baseFee": 15.0,
  "baseWeight": 5.0,
  "extraWeightStep": 1.0,
  "extraWeightPrice": 1.0,
  "nightFee": 5.0,
  "platformFee": 2.0,
  "maxNegativeDays": 7,
  "isActive": true
}
```

**DIFFERENT_COUNTRY:**
```bash
POST http://localhost:3000/admin/pricing-policies
Authorization: Bearer {{ADMIN_TOKEN}}
Content-Type: application/json

{
  "countryId": "{{COUNTRY_ID}}",
  "deliveryZoneType": "DIFFERENT_COUNTRY",
  "pricePerKm": 5.0,
  "baseFee": 30.0,
  "baseWeight": 5.0,
  "extraWeightStep": 1.0,
  "extraWeightPrice": 2.0,
  "nightFee": 10.0,
  "platformFee": 5.0,
  "maxNegativeDays": 7,
  "isActive": true
}
```

**Expected Response:** 201 Created for each

---

## 2. User Registration & Authentication

### Step 2.1: Register Customer
```bash
POST http://localhost:3000/auth/user/register
Content-Type: application/json

{
  "phone": "+21698765432",
  "password": "Customer123",
  "firstName": "Ahmed",
  "secondName": "Ben Ali",
  "role": "CUSTOMER"
}
```

**Expected Response:** 201 Created with access_token

**Save:** `CUSTOMER_TOKEN` and `CUSTOMER_USER_ID` from response

---

### Step 2.2: Register Driver
```bash
POST http://localhost:3000/auth/user/register
Content-Type: application/json

{
  "phone": "+21623456789",
  "password": "Driver123",
  "firstName": "Mohamed",
  "secondName": "Trabelsi",
  "role": "DRIVER"
}
```

**Expected Response:** 201 Created with access_token

**Save:** `DRIVER_TOKEN` and `DRIVER_USER_ID` from response

---

## 3. Customer Service Management

### Step 3.1: Create Customer Service Account
```bash
POST http://localhost:3000/admin/customer-services
Authorization: Bearer {{ADMIN_TOKEN}}
Content-Type: application/json

{
  "telephone": "+21655555555",
  "pseudo": "cs_support1",
  "email": "support1@delivery.com",
  "password": "Support123",
  "roles": [
    "READ_DRIVER_PROFILE",
    "READ_CUSTOMER_PROFILE",
    "VERIFY_ACCOUNTS",
    "MANAGE_SUPPORT_TICKETS"
  ]
}
```

**Expected Response:** 201 Created

**Save:** `CS_ID` from response

---

### Step 3.2: Get All Customer Services
```bash
GET http://localhost:3000/admin/customer-services
Authorization: Bearer {{ADMIN_TOKEN}}
```

**Expected Response:** 200 OK with array of CS accounts

---

### Step 3.3: Add Role to CS
```bash
POST http://localhost:3000/admin/customer-services/{{CS_ID}}/roles/MANAGE_DISPUTES
Authorization: Bearer {{ADMIN_TOKEN}}
```

**Expected Response:** 200 OK with updated CS object

---

### Step 3.4: Remove Role from CS
```bash
DELETE http://localhost:3000/admin/customer-services/{{CS_ID}}/roles/MANAGE_DISPUTES
Authorization: Bearer {{ADMIN_TOKEN}}
```

**Expected Response:** 200 OK

---

## 4. User Profile & Address Management

### Step 4.1: Get Customer Profile
```bash
GET http://localhost:3000/users/profile
Authorization: Bearer {{CUSTOMER_TOKEN}}
```

**Expected Response:** 200 OK with user profile including customer data

---

### Step 4.2: Update Customer Profile
```bash
PATCH http://localhost:3000/users/profile
Authorization: Bearer {{CUSTOMER_TOKEN}}
Content-Type: application/json

{
  "firstName": "Ahmed Updated",
  "myEmail": "ahmed@example.com"
}
```

**Expected Response:** 200 OK with updated profile

---

### Step 4.3: Create Customer Address (Pickup)
```bash
POST http://localhost:3000/addresses
Authorization: Bearer {{CUSTOMER_TOKEN}}
Content-Type: application/json

{
  "latitude": 36.8065,
  "longitude": 10.1815,
  "street": "Avenue Habib Bourguiba",
  "delegationId": "{{DELEGATION_ID_1}}"
}
```

**Expected Response:** 201 Created

**Save:** `CUSTOMER_ADDRESS_1` (pickup address)

---

### Step 4.4: Create Customer Address (Dropoff)
```bash
POST http://localhost:3000/addresses
Authorization: Bearer {{CUSTOMER_TOKEN}}
Content-Type: application/json

{
  "latitude": 36.8500,
  "longitude": 10.2000,
  "street": "Avenue de la Liberté",
  "delegationId": "{{DELEGATION_ID_2}}"
}
```

**Expected Response:** 201 Created

**Save:** `CUSTOMER_ADDRESS_2` (dropoff address)

---

### Step 4.5: Get All Customer Addresses
```bash
GET http://localhost:3000/addresses
Authorization: Bearer {{CUSTOMER_TOKEN}}
```

**Expected Response:** 200 OK with array of addresses

---

### Step 4.6: Create Driver Address
```bash
POST http://localhost:3000/addresses
Authorization: Bearer {{DRIVER_TOKEN}}
Content-Type: application/json

{
  "latitude": 36.8100,
  "longitude": 10.1900,
  "street": "Rue de Marseille",
  "delegationId": "{{DELEGATION_ID_1}}"
}
```

**Expected Response:** 201 Created

---

## 5. Driver Verification

### Step 5.1: Upload Driver Documents
```bash
POST http://localhost:3000/driver/documents
Authorization: Bearer {{DRIVER_TOKEN}}
Content-Type: application/json

{
  "documentType": "ID_CARD",
  "documentImage": "https://example.com/id-front.jpg",
  "selfieImage": "https://example.com/selfie.jpg",
  "docImageTop": "https://example.com/id-top.jpg",
  "docImageBottom": "https://example.com/id-bottom.jpg"
}
```

**Expected Response:** 201 Created

**Note:** Driver status should now be PENDING_REVIEW

---

### Step 5.2: Get Driver Verification Status
```bash
GET http://localhost:3000/driver/verification
Authorization: Bearer {{DRIVER_TOKEN}}
```

**Expected Response:** 200 OK with verification status

---

### Step 5.3: Admin - Get Pending Drivers
```bash
GET http://localhost:3000/admin/drivers/pending
Authorization: Bearer {{ADMIN_TOKEN}}
```

**Expected Response:** 200 OK with array of pending drivers

**Save:** `DRIVER_ID` from response

---

### Step 5.4: Admin - Approve Driver
```bash
POST http://localhost:3000/admin/drivers/{{DRIVER_ID}}/approve
Authorization: Bearer {{ADMIN_TOKEN}}
```

**Expected Response:** 200 OK

**Note:** Driver status should now be VERIFIED

---

## 6. Customer Management

### Step 6.1: Get Customer Profile (as customer)
```bash
GET http://localhost:3000/customers/me
Authorization: Bearer {{CUSTOMER_TOKEN}}
```

**Expected Response:** 200 OK with customer profile including referral codes

---

### Step 6.2: Admin - Get All Customers
```bash
GET http://localhost:3000/admin/customers?page=1&limit=20
Authorization: Bearer {{ADMIN_TOKEN}}
```

**Expected Response:** 200 OK with paginated customers

**Save:** `CUSTOMER_ID` from response

---

### Step 6.3: Admin - Get Customer Statistics
```bash
GET http://localhost:3000/admin/customers/stats
Authorization: Bearer {{ADMIN_TOKEN}}
```

**Expected Response:** 200 OK with statistics

---

### Step 6.4: Admin - Search Customers
```bash
GET http://localhost:3000/admin/customers/search?q=Ahmed
Authorization: Bearer {{ADMIN_TOKEN}}
```

**Expected Response:** 200 OK with matching customers

---

## 7. Order Creation & Management

### Step 7.1: Create Order (SAME_GOVERNORATE)
```bash
POST http://localhost:3000/orders
Authorization: Bearer {{CUSTOMER_TOKEN}}
Content-Type: application/json

{
  "pickupAddressId": "{{CUSTOMER_ADDRESS_1}}",
  "dropoffAddressId": "{{CUSTOMER_ADDRESS_2}}",
  "paymentType": "COD",
  "weight": 3.5,
  "description": "Fragile package",
  "isNightDelivery": false
}
```

**Expected Response:** 201 Created with order details including:
- Calculated distance
- Calculated price based on SAME_GOVERNORATE policy
- Status: SEARCHING_DRIVER

**Save:** `ORDER_ID` from response

---

### Step 7.2: Get Customer Orders
```bash
GET http://localhost:3000/orders/my-orders
Authorization: Bearer {{CUSTOMER_TOKEN}}
```

**Expected Response:** 200 OK with array of orders

---

### Step 7.3: Get Order by ID
```bash
GET http://localhost:3000/orders/{{ORDER_ID}}
Authorization: Bearer {{CUSTOMER_TOKEN}}
```

**Expected Response:** 200 OK with order details

---

## 8. Driver Assignment & Order Flow

### Step 8.1: Driver - Get Available Orders
```bash
GET http://localhost:3000/driver/orders/available
Authorization: Bearer {{DRIVER_TOKEN}}
```

**Expected Response:** 200 OK with orders categorized by zone:
```json
{
  "sameDelegation": [],
  "sameGovernorate": [/* order should be here */],
  "differentGovernorate": [],
  "differentCountry": []
}
```

---

### Step 8.2: Driver - Accept Order
```bash
POST http://localhost:3000/driver/orders/{{ORDER_ID}}/accept
Authorization: Bearer {{DRIVER_TOKEN}}
```

**Expected Response:** 200 OK

**Effects:**
- Order status → DRIVER_ASSIGNED
- Chat room created
- Driver assignment created

---

### Step 8.3: Driver - Get My Orders
```bash
GET http://localhost:3000/driver/orders/my-orders
Authorization: Bearer {{DRIVER_TOKEN}}
```

**Expected Response:** 200 OK with assigned orders

---

### Step 8.4: Get Order (should show driver assignment)
```bash
GET http://localhost:3000/orders/{{ORDER_ID}}
Authorization: Bearer {{CUSTOMER_TOKEN}}
```

**Expected Response:** 200 OK with driver assignment details

---

### Step 8.5: Cancel Assignment (by customer)
```bash
POST http://localhost:3000/driver/orders/{{ORDER_ID}}/cancel-assignment
Authorization: Bearer {{CUSTOMER_TOKEN}}
Content-Type: application/json

{
  "reason": "Need to change delivery details"
}
```

**Expected Response:** 200 OK

**Effects:**
- Order status → SEARCHING_DRIVER
- Chat room closed
- Order available to other drivers again

---

### Step 8.6: Driver - Accept Order Again
```bash
POST http://localhost:3000/driver/orders/{{ORDER_ID}}/accept
Authorization: Bearer {{DRIVER_TOKEN}}
```

**Expected Response:** 200 OK

---

### Step 8.7: Cancel Assignment (by driver)
```bash
POST http://localhost:3000/driver/orders/{{ORDER_ID}}/cancel-assignment
Authorization: Bearer {{DRIVER_TOKEN}}
Content-Type: application/json

{
  "reason": "Cannot reach pickup location"
}
```

**Expected Response:** 200 OK

---

## 9. Restrictions & Guards

### Step 9.1: Admin - Block Customer
```bash
POST http://localhost:3000/admin/restrictions/block
Authorization: Bearer {{ADMIN_TOKEN}}
Content-Type: application/json

{
  "userId": "{{CUSTOMER_USER_ID}}",
  "reason": "Fraudulent activity"
}
```

**Expected Response:** 201 Created

---

### Step 9.2: Try to Create Order (should fail)
```bash
POST http://localhost:3000/orders
Authorization: Bearer {{CUSTOMER_TOKEN}}
Content-Type: application/json

{
  "pickupAddressId": "{{CUSTOMER_ADDRESS_1}}",
  "dropoffAddressId": "{{CUSTOMER_ADDRESS_2}}",
  "paymentType": "COD",
  "weight": 2.0
}
```

**Expected Response:** 403 Forbidden
**Message:** "Your account is not active because Fraudulent activity"

---

### Step 9.3: Admin - Get Active Restrictions
```bash
GET http://localhost:3000/admin/restrictions/user/{{CUSTOMER_USER_ID}}
Authorization: Bearer {{ADMIN_TOKEN}}
```

**Expected Response:** 200 OK with active restrictions

**Save:** `RESTRICTION_ID` from response

---

### Step 9.4: Admin - Lift Restriction
```bash
DELETE http://localhost:3000/admin/restrictions/{{RESTRICTION_ID}}/lift
Authorization: Bearer {{ADMIN_TOKEN}}
```

**Expected Response:** 200 OK

---

### Step 9.5: Try to Create Order Again (should succeed)
```bash
POST http://localhost:3000/orders
Authorization: Bearer {{CUSTOMER_TOKEN}}
Content-Type: application/json

{
  "pickupAddressId": "{{CUSTOMER_ADDRESS_1}}",
  "dropoffAddressId": "{{CUSTOMER_ADDRESS_2}}",
  "paymentType": "COD",
  "weight": 2.0
}
```

**Expected Response:** 201 Created

---

### Step 9.6: Admin - Suspend Driver
```bash
POST http://localhost:3000/admin/restrictions/suspend-driver
Authorization: Bearer {{ADMIN_TOKEN}}
Content-Type: application/json

{
  "driverId": "{{DRIVER_ID}}",
  "reason": "Multiple customer complaints",
  "durationDays": 7
}
```

**Expected Response:** 201 Created

---

### Step 9.7: Driver - Try to Accept Order (should fail)
```bash
POST http://localhost:3000/driver/orders/{{ORDER_ID}}/accept
Authorization: Bearer {{DRIVER_TOKEN}}
```

**Expected Response:** 403 Forbidden
**Message:** "Account restricted (SUSPENSION): Multiple customer complaints"

---

## 10. Additional Tests

### Test 10.1: Update Pricing Policy
```bash
PATCH http://localhost:3000/admin/pricing-policies/{{POLICY_ID}}
Authorization: Bearer {{ADMIN_TOKEN}}
Content-Type: application/json

{
  "pricePerKm": 1.8,
  "baseFee": 6.0
}
```

---

### Test 10.2: Deactivate Pricing Policy
```bash
PATCH http://localhost:3000/admin/pricing-policies/{{POLICY_ID}}/deactivate
Authorization: Bearer {{ADMIN_TOKEN}}
```

---

### Test 10.3: Update Customer Service Roles
```bash
PATCH http://localhost:3000/admin/customer-services/{{CS_ID}}/roles
Authorization: Bearer {{ADMIN_TOKEN}}
Content-Type: application/json

{
  "roles": [
    "READ_DRIVER_PROFILE",
    "READ_CUSTOMER_PROFILE",
    "VERIFY_ACCOUNTS",
    "UPDATE_DRIVER_STATUS",
    "UPDATE_CUSTOMER_STATUS"
  ]
}
```

---

### Test 10.4: Toggle CS Status
```bash
PATCH http://localhost:3000/admin/customer-services/{{CS_ID}}/toggle-status
Authorization: Bearer {{ADMIN_TOKEN}}
```

---

## Expected Results Summary

✅ **Admin Setup:** Countries, governorates, delegations, and pricing policies created
✅ **User Registration:** Customer and driver accounts created with JWT tokens
✅ **CS Management:** CS account created with roles, roles can be added/removed
✅ **Profile Management:** Users can view and update profiles
✅ **Address Management:** Users can create and manage addresses
✅ **Driver Verification:** Driver uploads documents, admin approves, status changes to VERIFIED
✅ **Customer Management:** Admin can view customers, statistics, and search
✅ **Order Creation:** Order created with automatic distance and price calculation
✅ **Driver Assignment:** Driver sees prioritized orders, can accept orders
✅ **Chat Room:** Automatically created when driver accepts order
✅ **Cancellation:** Both parties can cancel assignment, order becomes available again
✅ **Restrictions:** Blocked users cannot create orders, suspended drivers cannot accept orders
✅ **Guards:** UserActiveGuard and UserRestrictionGuard enforce access control

---

## Troubleshooting

### Issue: "Address coordinates are required"
**Solution:** Ensure addresses have latitude and longitude

### Issue: "No active pricing policy found"
**Solution:** Create pricing policies for all 4 zone types

### Issue: "Driver must be verified"
**Solution:** Admin must approve driver verification first

### Issue: "Your account is not active"
**Solution:** Check if user is blocked, lift restriction if needed

### Issue: "Order is not available for assignment"
**Solution:** Order must be in SEARCHING_DRIVER status

---

## Next Steps

After completing these tests:
1. Test with multiple drivers to see order prioritization
2. Test with different zone types (create addresses in different delegations/governorates)
3. Test edge cases (invalid data, missing fields, etc.)
4. Test concurrent operations (multiple drivers accepting same order)
5. Performance testing with large datasets

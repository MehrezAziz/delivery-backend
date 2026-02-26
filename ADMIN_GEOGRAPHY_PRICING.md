# Admin Geography & Pricing Management

## Overview
The Admin module provides complete CRUD operations for managing the geographic hierarchy (Countries, Governorates, Delegations) and pricing policies. Only users with ADMIN role can access these endpoints.

## Geographic Hierarchy

```
Country
  └── Governorate
        └── Delegation
              └── Address (user addresses)
```

---

## API Endpoints

### Country Management

#### Create Country
```
POST /admin/geography/countries
Authorization: Bearer <admin_jwt_token>
Role: ADMIN
```

**Request Body:**
```json
{
  "name": "Tunisia",
  "isoCode": "TN",
  "currencyCode": "TND",
  "currencySymbol": "د.ت",
  "isActive": true
}
```

**Response:**
```json
{
  "id": "country-uuid",
  "name": "Tunisia",
  "isoCode": "TN",
  "currencyCode": "TND",
  "currencySymbol": "د.ت",
  "isActive": true
}
```

#### Get All Countries
```
GET /admin/geography/countries
Authorization: Bearer <admin_jwt_token>
```

**Response:**
```json
[
  {
    "id": "country-uuid",
    "name": "Tunisia",
    "isoCode": "TN",
    "currencyCode": "TND",
    "currencySymbol": "د.ت",
    "isActive": true,
    "_count": {
      "governorates": 24,
      "pricingPolicies": 4
    }
  }
]
```

#### Get Country by ID
```
GET /admin/geography/countries/:id
Authorization: Bearer <admin_jwt_token>
```

**Response:**
```json
{
  "id": "country-uuid",
  "name": "Tunisia",
  "isoCode": "TN",
  "currencyCode": "TND",
  "currencySymbol": "د.ت",
  "isActive": true,
  "governorates": [
    {
      "id": "gov-uuid",
      "nameGovernorate": "Tunis",
      "_count": {
        "delegations": 21
      }
    }
  ],
  "pricingPolicies": [
    {
      "id": "policy-uuid",
      "deliveryZoneType": "SAME_DELEGATION",
      "baseFee": 5.0,
      "pricePerKm": 1.5
    }
  ]
}
```

#### Update Country
```
PATCH /admin/geography/countries/:id
Authorization: Bearer <admin_jwt_token>
```

**Request Body:**
```json
{
  "name": "Tunisia Updated",
  "isActive": false
}
```

#### Delete Country
```
DELETE /admin/geography/countries/:id
Authorization: Bearer <admin_jwt_token>
```

**Note:** Cascades to governorates and delegations

---

### Governorate Management

#### Create Governorate
```
POST /admin/geography/governorates
Authorization: Bearer <admin_jwt_token>
```

**Request Body:**
```json
{
  "nameGovernorate": "Tunis",
  "countryId": "country-uuid"
}
```

#### Get All Governorates
```
GET /admin/geography/governorates?countryId=<country-uuid>
Authorization: Bearer <admin_jwt_token>
```

**Query Parameters:**
- `countryId` (optional) - Filter by country

#### Get Governorate by ID
```
GET /admin/geography/governorates/:id
Authorization: Bearer <admin_jwt_token>
```

#### Update Governorate
```
PATCH /admin/geography/governorates/:id
Authorization: Bearer <admin_jwt_token>
```

#### Delete Governorate
```
DELETE /admin/geography/governorates/:id
Authorization: Bearer <admin_jwt_token>
```

---

### Delegation Management

#### Create Delegation
```
POST /admin/geography/delegations
Authorization: Bearer <admin_jwt_token>
```

**Request Body:**
```json
{
  "nameDelegation": "Tunis",
  "maxConfirmationDelayMinutes": 15,
  "governorateId": "governorate-uuid"
}
```

#### Get All Delegations
```
GET /admin/geography/delegations?governorateId=<governorate-uuid>
Authorization: Bearer <admin_jwt_token>
```

**Query Parameters:**
- `governorateId` (optional) - Filter by governorate

#### Get Delegation by ID
```
GET /admin/geography/delegations/:id
Authorization: Bearer <admin_jwt_token>
```

#### Update Delegation
```
PATCH /admin/geography/delegations/:id
Authorization: Bearer <admin_jwt_token>
```

#### Delete Delegation
```
DELETE /admin/geography/delegations/:id
Authorization: Bearer <admin_jwt_token>
```

---

## Pricing Policy Management

### Important: Zone-Based Pricing
Each country must have **4 separate pricing policies**, one for each DeliveryZoneType:
1. **SAME_DELEGATION** - Lowest rates
2. **SAME_GOVERNORATE** - Medium rates
3. **DIFFERENT_GOVERNORATE** - Higher rates
4. **DIFFERENT_COUNTRY** - Highest rates

Only **ONE active policy** per country per zone type is allowed.

---

### Create Pricing Policy
```
POST /admin/pricing-policies
Authorization: Bearer <admin_jwt_token>
```

**Request Body:**
```json
{
  "countryId": "country-uuid",
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

**Pricing Components:**
- `pricePerKm` - Cost per kilometer
- `baseFee` - Fixed base fee for all orders
- `baseWeight` - Weight included in base fee (kg)
- `extraWeightStep` - Weight increment for extra charges (kg)
- `extraWeightPrice` - Price per extra weight step
- `nightFee` - Additional fee for night deliveries
- `platformFee` - Platform commission
- `maxNegativeDays` - Maximum days driver can have negative balance

**Response:**
```json
{
  "id": "policy-uuid",
  "countryId": "country-uuid",
  "deliveryZoneType": "SAME_DELEGATION",
  "pricePerKm": 1.5,
  "baseFee": 5.0,
  "baseWeight": 5.0,
  "extraWeightStep": 1.0,
  "extraWeightPrice": 0.5,
  "nightFee": 2.0,
  "platformFee": 1.0,
  "maxNegativeDays": 7,
  "isActive": true,
  "createdAt": "2024-01-01T10:00:00Z",
  "country": {
    "id": "country-uuid",
    "name": "Tunisia"
  }
}
```

### Get All Pricing Policies
```
GET /admin/pricing-policies?countryId=<country-uuid>&isActive=true
Authorization: Bearer <admin_jwt_token>
```

**Query Parameters:**
- `countryId` (optional) - Filter by country
- `isActive` (optional) - Filter by active status (true/false)

### Get Pricing Policies by Country
```
GET /admin/pricing-policies/country/:countryId?deliveryZoneType=SAME_DELEGATION
Authorization: Bearer <admin_jwt_token>
```

**Query Parameters:**
- `deliveryZoneType` (optional) - Filter by zone type

### Get Active Pricing Policy
```
GET /admin/pricing-policies/active/:countryId/:deliveryZoneType
Authorization: Bearer <admin_jwt_token>
```

**Example:**
```
GET /admin/pricing-policies/active/country-uuid/SAME_DELEGATION
```

Returns the currently active pricing policy for the specified country and zone type.

### Get Pricing Policy by ID
```
GET /admin/pricing-policies/:id
Authorization: Bearer <admin_jwt_token>
```

### Update Pricing Policy
```
PATCH /admin/pricing-policies/:id
Authorization: Bearer <admin_jwt_token>
```

**Request Body:**
```json
{
  "pricePerKm": 2.0,
  "baseFee": 6.0,
  "isActive": true
}
```

**Note:** If activating a policy, any other active policy for the same country and zone type will cause a conflict error.

### Deactivate Pricing Policy
```
PATCH /admin/pricing-policies/:id/deactivate
Authorization: Bearer <admin_jwt_token>
```

Sets `isActive` to `false`. Useful when you want to create a new policy for the same zone type.

### Delete Pricing Policy
```
DELETE /admin/pricing-policies/:id
Authorization: Bearer <admin_jwt_token>
```

**Note:** Cannot delete policies that have been used in orders. Deactivate instead.

---

## Setup Workflow

### 1. Create Geographic Hierarchy

```bash
# 1. Create Country
curl -X POST http://localhost:3000/admin/geography/countries \
  -H "Authorization: Bearer <admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tunisia",
    "isoCode": "TN",
    "currencyCode": "TND",
    "currencySymbol": "د.ت"
  }'

# 2. Create Governorate
curl -X POST http://localhost:3000/admin/geography/governorates \
  -H "Authorization: Bearer <admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "nameGovernorate": "Tunis",
    "countryId": "<country-uuid>"
  }'

# 3. Create Delegation
curl -X POST http://localhost:3000/admin/geography/delegations \
  -H "Authorization: Bearer <admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "nameDelegation": "Tunis",
    "maxConfirmationDelayMinutes": 15,
    "governorateId": "<governorate-uuid>"
  }'
```

### 2. Create Pricing Policies (All 4 Zone Types)

```bash
# SAME_DELEGATION (Lowest rates)
curl -X POST http://localhost:3000/admin/pricing-policies \
  -H "Authorization: Bearer <admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "countryId": "<country-uuid>",
    "deliveryZoneType": "SAME_DELEGATION",
    "pricePerKm": 1.5,
    "baseFee": 5.0,
    "baseWeight": 5.0,
    "extraWeightStep": 1.0,
    "extraWeightPrice": 0.5,
    "nightFee": 2.0,
    "platformFee": 1.0,
    "maxNegativeDays": 7
  }'

# SAME_GOVERNORATE (Medium rates)
curl -X POST http://localhost:3000/admin/pricing-policies \
  -H "Authorization: Bearer <admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "countryId": "<country-uuid>",
    "deliveryZoneType": "SAME_GOVERNORATE",
    "pricePerKm": 2.0,
    "baseFee": 8.0,
    "baseWeight": 5.0,
    "extraWeightStep": 1.0,
    "extraWeightPrice": 0.75,
    "nightFee": 3.0,
    "platformFee": 1.5,
    "maxNegativeDays": 7
  }'

# DIFFERENT_GOVERNORATE (Higher rates)
curl -X POST http://localhost:3000/admin/pricing-policies \
  -H "Authorization: Bearer <admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "countryId": "<country-uuid>",
    "deliveryZoneType": "DIFFERENT_GOVERNORATE",
    "pricePerKm": 3.0,
    "baseFee": 15.0,
    "baseWeight": 5.0,
    "extraWeightStep": 1.0,
    "extraWeightPrice": 1.0,
    "nightFee": 5.0,
    "platformFee": 2.0,
    "maxNegativeDays": 7
  }'

# DIFFERENT_COUNTRY (Highest rates)
curl -X POST http://localhost:3000/admin/pricing-policies \
  -H "Authorization: Bearer <admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "countryId": "<country-uuid>",
    "deliveryZoneType": "DIFFERENT_COUNTRY",
    "pricePerKm": 5.0,
    "baseFee": 30.0,
    "baseWeight": 5.0,
    "extraWeightStep": 1.0,
    "extraWeightPrice": 2.0,
    "nightFee": 10.0,
    "platformFee": 5.0,
    "maxNegativeDays": 7
  }'
```

---

## Validation Rules

### Country
- `isoCode` must be unique
- Cannot delete country with existing governorates (cascade delete)

### Governorate
- `countryId` must exist
- Cannot delete governorate with existing delegations (cascade delete)

### Delegation
- `governorateId` must exist
- `maxConfirmationDelayMinutes` must be >= 1

### Pricing Policy
- `countryId` must exist
- Only ONE active policy per country per zone type
- All numeric fields must be >= 0
- Cannot delete policy used in orders (deactivate instead)

---

## Error Handling

### Common Errors
- **409 Conflict** - ISO code already exists, or active policy already exists for zone type
- **404 Not Found** - Country, governorate, or delegation not found
- **400 Bad Request** - Cannot delete policy used in orders
- **403 Forbidden** - Non-admin user attempting access

---

## Price Calculation Example

Given:
- Country: Tunisia
- Zone Type: SAME_GOVERNORATE
- Distance: 12 km
- Weight: 7 kg
- Night Delivery: Yes

Pricing Policy:
- baseFee: 8.0
- pricePerKm: 2.0
- baseWeight: 5.0
- extraWeightStep: 1.0
- extraWeightPrice: 0.75
- nightFee: 3.0

Calculation:
```
baseFee = 8.0
distanceFee = 2.0 × 12 = 24.0
extraWeight = 7 - 5 = 2 kg
extraWeightSteps = ceil(2 / 1.0) = 2
extraWeightFee = 2 × 0.75 = 1.5
nightFee = 3.0

totalPrice = 8.0 + 24.0 + 1.5 + 3.0 = 36.5 TND
```

---

## Notes

1. **Cascading Deletes**: Deleting a country deletes all its governorates and delegations
2. **Active Policies**: Only one active policy per country per zone type
3. **Policy History**: Old policies remain in database for order history
4. **Deactivation**: Preferred over deletion for policies used in orders
5. **Zone Types**: All 4 zone types should have policies before orders can be created
6. **ISO Codes**: Use standard ISO 3166-1 alpha-2 codes (e.g., TN, DZ, MA)

---

## Integration with Orders Module

When a customer creates an order:
1. System determines DeliveryZoneType based on pickup/dropoff addresses
2. System fetches active pricing policy for country + zone type
3. System calculates price using policy rates
4. Order is created with calculated price and policy reference

This ensures:
- Prices are always up-to-date with current policies
- Historical orders maintain their original pricing
- Admins can adjust rates without affecting existing orders

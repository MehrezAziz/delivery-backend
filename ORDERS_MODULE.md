# Orders Module Documentation

## Overview
The Orders module provides complete order management functionality including order creation with automatic distance and price calculation, driver assignment with zone-based prioritization, and order state management. The system supports 4 delivery zone types, each with its own pricing policy.

## Key Features

### 1. Automatic Distance Calculation
- Uses Haversine formula to calculate distance between pickup and dropoff addresses
- Calculates distance in kilometers with 2 decimal precision

### 2. Dynamic Price Calculation
- **Zone-Based Pricing**: Each DeliveryZoneType has its own CountryPricingPolicy
  - SAME_DELEGATION
  - SAME_GOVERNORATE
  - DIFFERENT_GOVERNORATE
  - DIFFERENT_COUNTRY
- **Price Components**:
  - Base Fee
  - Distance Fee (pricePerKm × distance)
  - Extra Weight Fee (for weight > baseWeight)
  - Night Fee (optional)

### 3. Driver Assignment with Priority
- Drivers see orders prioritized by proximity:
  1. **SAME_DELEGATION** - Orders in driver's delegation (highest priority)
  2. **SAME_GOVERNORATE** - Orders from delegation to delegation in same governorate
  3. **DIFFERENT_GOVERNORATE** - Orders from governorate to governorate in same country
  4. **DIFFERENT_COUNTRY** - Orders from country to country (lowest priority)

### 4. Order State Machine
```
DRAFT → SEARCHING_DRIVER → DRIVER_ASSIGNED → DRIVER_ARRIVED → 
PICKED_UP → DELIVERING → DELIVERED

Alternative flows:
- SEARCHING_DRIVER → CANCELLED (customer cancels)
- DRIVER_ASSIGNED → SEARCHING_DRIVER (assignment cancelled by driver or customer)
```

### 5. Chat Room Integration
- Automatically creates chat room when driver accepts order
- Closes chat room when assignment is cancelled

---

## API Endpoints

### Customer Endpoints

#### Create Order
```
POST /orders
Authorization: Bearer <customer_jwt_token>
Role: CUSTOMER
Guards: UserActiveGuard, UserRestrictionGuard
```

**Request Body:**
```json
{
  "pickupAddressId": "address-uuid",
  "dropoffAddressId": "address-uuid",
  "paymentType": "COD" | "WALLET",
  "weight": 5.5,
  "description": "Fragile items",
  "isNightDelivery": false
}
```

**Response:**
```json
{
  "id": "order-uuid",
  "customerId": "customer-uuid",
  "status": "SEARCHING_DRIVER",
  "paymentType": "COD",
  "description": "Fragile items",
  "weight": 5.5,
  "distanceKm": 12.45,
  "price": 25.50,
  "nightFee": 0,
  "extraWeightFee": 2.50,
  "isNightDelivery": false,
  "deliveryZoneType": "SAME_GOVERNORATE",
  "createdAt": "2024-01-01T10:00:00Z",
  "pickupAddress": {
    "id": "address-uuid",
    "street": "123 Main St",
    "latitude": 36.8065,
    "longitude": 10.1815,
    "delegation": {
      "nameDelegation": "Tunis",
      "governorate": {
        "nameGovernorate": "Tunis",
        "country": {
          "name": "Tunisia"
        }
      }
    }
  },
  "dropoffAddress": { /* same structure */ }
}
```

#### Get My Orders
```
GET /orders/my-orders
Authorization: Bearer <customer_jwt_token>
Role: CUSTOMER
```

**Response:** Array of OrderResponseDto

#### Get Order by ID
```
GET /orders/:id
Authorization: Bearer <user_jwt_token>
```

**Response:** OrderResponseDto

#### Cancel Order
```
DELETE /orders/:id
Authorization: Bearer <customer_jwt_token>
Role: CUSTOMER
```

**Request Body:**
```json
{
  "reason": "Changed my mind"
}
```

**Note:** Can only cancel orders in DRAFT or SEARCHING_DRIVER status

---

### Driver Endpoints

#### Get Available Orders (Prioritized)
```
GET /driver/orders/available
Authorization: Bearer <driver_jwt_token>
Role: DRIVER
```

**Response:**
```json
{
  "sameDelegation": [/* OrderResponseDto[] */],
  "sameGovernorate": [/* OrderResponseDto[] */],
  "differentGovernorate": [/* OrderResponseDto[] */],
  "differentCountry": [/* OrderResponseDto[] */]
}
```

**Priority Display:**
1. Show SAME_DELEGATION orders first
2. Then SAME_GOVERNORATE orders
3. Then DIFFERENT_GOVERNORATE orders
4. Finally DIFFERENT_COUNTRY orders

#### Get My Orders
```
GET /driver/orders/my-orders
Authorization: Bearer <driver_jwt_token>
Role: DRIVER
```

**Response:** Array of OrderResponseDto

#### Accept Order
```
POST /driver/orders/:id/accept
Authorization: Bearer <driver_jwt_token>
Role: DRIVER
Guards: UserActiveGuard, UserRestrictionGuard
```

**Effects:**
- Creates DriverAssignment record
- Updates order status to DRIVER_ASSIGNED
- Creates ChatRoom between driver and customer
- Sets acceptedAt timestamp

**Response:**
```json
{
  "message": "Order accepted successfully"
}
```

#### Cancel Assignment
```
POST /driver/orders/:id/cancel-assignment
Authorization: Bearer <user_jwt_token>
Role: DRIVER or CUSTOMER
```

**Request Body:**
```json
{
  "reason": "Cannot agree on delivery details"
}
```

**Effects:**
- Updates DriverAssignment with cancellation info
- Returns order status to SEARCHING_DRIVER
- Closes ChatRoom
- Order becomes available to other drivers

**Response:**
```json
{
  "message": "Order assignment cancelled successfully"
}
```

---

## Services

### OrdersService

#### Methods
- `createOrder(customerId, dto)` - Create new order with price calculation
- `getOrderById(orderId, userId)` - Get order details (with access control)
- `getCustomerOrders(customerId)` - Get all customer's orders
- `getDriverOrders(driverId)` - Get all driver's assigned orders
- `cancelOrder(orderId, userId, reason)` - Cancel order before assignment

### PriceCalculationService

#### Methods
- `calculateDistance(lat1, lon1, lat2, lon2)` - Haversine distance calculation
- `determineDeliveryZoneType(pickupAddressId, dropoffAddressId)` - Determine zone type
- `calculatePrice(pickupAddressId, dropoffAddressId, weight, isNightDelivery)` - Calculate total price

#### Price Calculation Logic
```typescript
// 1. Determine delivery zone type
const zoneType = determineDeliveryZoneType(pickup, dropoff);

// 2. Get pricing policy for country + zone type
const policy = await findPricingPolicy(countryId, zoneType);

// 3. Calculate components
baseFee = policy.baseFee
distanceFee = policy.pricePerKm × distance
extraWeightFee = (weight > baseWeight) ? 
  ceil((weight - baseWeight) / extraWeightStep) × extraWeightPrice : 0
nightFee = isNightDelivery ? policy.nightFee : 0

// 4. Total price
totalPrice = baseFee + distanceFee + extraWeightFee + nightFee
```

### DriverAssignmentService

#### Methods
- `getAvailableOrdersForDriver(driverId)` - Get orders prioritized by zone
- `acceptOrder(driverId, orderId)` - Accept order and create chat room
- `cancelAssignment(orderId, userId, reason)` - Cancel assignment

#### Zone Prioritization Logic
```typescript
// Driver's location: Delegation A, Governorate X, Country 1

// Priority 1: SAME_DELEGATION
Orders where pickup is in Delegation A

// Priority 2: SAME_GOVERNORATE  
Orders where pickup is in Governorate X (but not Delegation A)

// Priority 3: DIFFERENT_GOVERNORATE
Orders where pickup is in Country 1 (but not Governorate X)

// Priority 4: DIFFERENT_COUNTRY
Orders where pickup is in different country
```

---

## Database Schema

### Order Model
```prisma
model Order {
  id                String      @id @default(uuid())
  customerId        String
  pricingPolicyId   String
  pickupAddressId   String?
  dropoffAddressId  String?
  status            OrderStatus @default(DRAFT)
  paymentType       PaymentType
  description       String?
  weight            Decimal
  distanceKm        Decimal
  price             Decimal
  nightFee          Decimal     @default(0)
  extraWeightFee    Decimal     @default(0)
  isNightDelivery   Boolean     @default(false)
  createdAt         DateTime    @default(now())
  
  customer            Customer
  pricingPolicy       CountryPricingPolicy
  pickupAddress       Address?
  dropoffAddress      Address?
  driverAssignment    DriverAssignment?
  chatRoom            ChatRoom?
}
```

### DriverAssignment Model
```prisma
model DriverAssignment {
  id                String    @id @default(uuid())
  orderId           String    @unique
  driverId          String
  acceptedAt        DateTime?
  cancelledBy       String?
  cancellationReason String?
  
  order  Order
  driver Driver
}
```

### CountryPricingPolicy Model
```prisma
model CountryPricingPolicy {
  id               String            @id @default(uuid())
  pricePerKm       Decimal
  baseFee          Decimal
  baseWeight       Decimal
  extraWeightStep  Decimal
  extraWeightPrice Decimal
  nightFee         Decimal
  platformFee      Decimal
  deliveryZoneType DeliveryZoneType?  // ← Each zone has its own policy
  isActive         Boolean           @default(true)
  countryId        String
  
  country Country
  orders  Order[]
}
```

---

## Delivery Zone Types

### SAME_DELEGATION
- Pickup and dropoff in the same delegation
- Shortest distance, lowest price
- Example: Tunis → Tunis

### SAME_GOVERNORATE
- Pickup and dropoff in different delegations but same governorate
- Medium distance, medium price
- Example: Tunis → La Marsa (both in Tunis Governorate)

### DIFFERENT_GOVERNORATE
- Pickup and dropoff in different governorates but same country
- Long distance, higher price
- Example: Tunis → Sfax (different governorates in Tunisia)

### DIFFERENT_COUNTRY
- Pickup and dropoff in different countries
- Longest distance, highest price
- Example: Tunisia → Algeria

---

## Order Status Flow

### Customer Journey
1. **DRAFT** - Order created but not submitted
2. **SEARCHING_DRIVER** - Order submitted, waiting for driver
3. **DRIVER_ASSIGNED** - Driver accepted, chat room opened
4. **DRIVER_ARRIVED** - Driver arrived at pickup location
5. **PICKED_UP** - Driver picked up the package
6. **DELIVERING** - Package in transit
7. **DELIVERED** - Package delivered successfully

### Alternative Flows
- **CANCELLED** - Customer cancelled before driver assignment
- **DRIVER_ASSIGNED → SEARCHING_DRIVER** - Assignment cancelled, order available again

---

## Guards & Authorization

### Customer Endpoints
- **JwtUserGuard** - Validates JWT token
- **CustomerGuard** - Ensures role=CUSTOMER
- **UserActiveGuard** - Ensures status=ACTIVE
- **UserRestrictionGuard** - Checks for active restrictions

### Driver Endpoints
- **JwtUserGuard** - Validates JWT token
- **DriverGuard** - Ensures role=DRIVER
- **UserActiveGuard** - Ensures status=ACTIVE (for accepting orders)
- **UserRestrictionGuard** - Checks for active restrictions (for accepting orders)

---

## Error Handling

### Common Errors
- **404 Not Found** - Order or address not found
- **403 Forbidden** - Insufficient permissions or using someone else's addresses
- **400 Bad Request** - Invalid order state for operation
- **Error: "Address coordinates are required"** - Addresses must have lat/long
- **Error: "No active pricing policy found"** - Admin must create pricing policy for zone type

---

## Usage Examples

### Customer: Create Order
```bash
curl -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer <customer_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "pickupAddressId": "addr-1",
    "dropoffAddressId": "addr-2",
    "paymentType": "COD",
    "weight": 5.5,
    "description": "Fragile",
    "isNightDelivery": false
  }'
```

### Driver: Get Available Orders
```bash
curl -X GET http://localhost:3000/driver/orders/available \
  -H "Authorization: Bearer <driver_jwt>"
```

### Driver: Accept Order
```bash
curl -X POST http://localhost:3000/driver/orders/<order-id>/accept \
  -H "Authorization: Bearer <driver_jwt>"
```

### Cancel Assignment
```bash
curl -X POST http://localhost:3000/driver/orders/<order-id>/cancel-assignment \
  -H "Authorization: Bearer <user_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Cannot agree on details"}'
```

---

## Admin Setup Required

Before orders can be created, admins must:

1. **Create Countries**
   ```sql
   INSERT INTO countries (name, iso_code, currency_code, currency_symbol)
   VALUES ('Tunisia', 'TN', 'TND', 'د.ت');
   ```

2. **Create Governorates**
   ```sql
   INSERT INTO governorates (name_governorate, country_id)
   VALUES ('Tunis', '<country-id>');
   ```

3. **Create Delegations**
   ```sql
   INSERT INTO delegations (name_delegation, max_confirmation_delay_minutes, governorate_id)
   VALUES ('Tunis', 15, '<governorate-id>');
   ```

4. **Create Pricing Policies (ONE FOR EACH ZONE TYPE)**
   ```sql
   -- SAME_DELEGATION pricing
   INSERT INTO country_pricing_policies (
     country_id, delivery_zone_type, price_per_km, base_fee, 
     base_weight, extra_weight_step, extra_weight_price, night_fee, platform_fee
   ) VALUES (
     '<country-id>', 'SAME_DELEGATION', 1.5, 5.0, 
     5.0, 1.0, 0.5, 2.0, 1.0
   );
   
   -- SAME_GOVERNORATE pricing (higher rates)
   INSERT INTO country_pricing_policies (
     country_id, delivery_zone_type, price_per_km, base_fee, 
     base_weight, extra_weight_step, extra_weight_price, night_fee, platform_fee
   ) VALUES (
     '<country-id>', 'SAME_GOVERNORATE', 2.0, 8.0, 
     5.0, 1.0, 0.75, 3.0, 1.5
   );
   
   -- DIFFERENT_GOVERNORATE pricing (even higher)
   INSERT INTO country_pricing_policies (
     country_id, delivery_zone_type, price_per_km, base_fee, 
     base_weight, extra_weight_step, extra_weight_price, night_fee, platform_fee
   ) VALUES (
     '<country-id>', 'DIFFERENT_GOVERNORATE', 3.0, 15.0, 
     5.0, 1.0, 1.0, 5.0, 2.0
   );
   
   -- DIFFERENT_COUNTRY pricing (highest rates)
   INSERT INTO country_pricing_policies (
     country_id, delivery_zone_type, price_per_km, base_fee, 
     base_weight, extra_weight_step, extra_weight_price, night_fee, platform_fee
   ) VALUES (
     '<country-id>', 'DIFFERENT_COUNTRY', 5.0, 30.0, 
     5.0, 1.0, 2.0, 10.0, 5.0
   );
   ```

---

## Notes

1. **Distance Calculation**: Uses Haversine formula for accurate distance on Earth's surface
2. **Price Precision**: All prices rounded to 2 decimal places
3. **Zone-Based Pricing**: Each delivery zone type has its own pricing policy
4. **Chat Room**: Automatically created when driver accepts order
5. **Cancellation**: Both driver and customer can cancel assignment before pickup
6. **Address Validation**: Addresses must have coordinates (latitude/longitude)
7. **Driver Location**: Driver's first address is used to determine their location for order prioritization
8. **Order Availability**: Cancelled assignments return order to SEARCHING_DRIVER status

---

## Integration with Other Modules

- **User Module**: Uses addresses for pickup/dropoff
- **Customer Module**: Links orders to customers
- **Driver Module**: Links orders to drivers via assignments
- **Chat Module**: Creates chat rooms on order acceptance
- **Wallet Module**: Handles WALLET payment type
- **Restriction Module**: Prevents restricted users from creating/accepting orders

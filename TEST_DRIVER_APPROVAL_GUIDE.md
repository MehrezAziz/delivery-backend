# Driver Approval Testing Guide

## Quick Test Steps

### Step 1: Get Pending Drivers
```bash
curl http://localhost:3000/api/test/drivers/pending
```

This will return a list of drivers with `PENDING_REVIEW` status. Copy the `driverId` from the response.

### Step 2: Approve a Driver
```bash
curl -X POST http://localhost:3000/api/test/drivers/{DRIVER_ID}/approve
``` 

Replace `{DRIVER_ID}` with the actual driver ID from step 1.

**Expected Response:**
```json
{
  "success": true,
  "message": "Driver approved and initialized successfully",
  "driver": {
    "id": "...",
    "status": "VERIFIED",
    "approvedAt": "2026-03-13T...",
    "user": { ... },
    "performanceMetrics": {
      "id": "...",
      "driverId": "...",
      "totalOrders": 0,
      "completedOrders": 0,
      "cancelledOrders": 0,
      "avgRating": null,
      ...
    },
    "driverAccount": {
      "id": "...",
      "driverId": "...",
      "balance": "0",
      "currency": "TND",
      "completedDeliveries": 0,
      ...
    },
    "weeklyAvailability": {
      "id": "...",
      "status": "ACTIVE",
      "daysCount": 7,
      "days": [
        {
          "dayOfWeek": "MONDAY",
          "timePeriodsCount": 1,
          "timePeriods": [
            {
              "startTime": "1970-01-01T09:00:00.000Z",
              "endTime": "1970-01-01T18:00:00.000Z"
            }
          ]
        },
        ... (6 more days)
      ]
    }
  }
}
```

### Step 3: View All Drivers (Check Initialization)
```bash
curl http://localhost:3000/api/test/drivers/all
```

This shows all drivers with flags indicating which entities are initialized:
- `hasPerformanceMetrics`: true/false
- `hasDriverAccount`: true/false
- `hasWeeklyAvailability`: true/false
- `weeklyAvailabilityDays`: number of days configured

### Step 4: Get Detailed Driver Info
```bash
curl http://localhost:3000/api/test/drivers/{DRIVER_ID}/details
```

This returns complete driver information including:
- User details
- Performance metrics
- Driver account with transactions
- Weekly availability with all days and time periods
- Verification documents

## Using Postman

1. Import the `test-driver-approval.http` file or create requests manually
2. Use the endpoints above
3. No authentication required for test endpoints

## Using Browser

Simply open these URLs in your browser:
- http://localhost:3000/api/test/drivers/pending
- http://localhost:3000/api/test/drivers/all
- http://localhost:3000/api/test/drivers/{DRIVER_ID}/details

For POST requests (approve), use Postman or curl.

## What Gets Created on Approval

When you approve a driver, the system automatically creates:

1. **DriverPerformanceMetrics**
   - Tracks: total orders, completed orders, cancelled orders
   - Metrics: avg rating, avg delivery time, completion rate, on-time rate
   - Initial state: All counters at 0, metrics null

2. **DriverAccount**
   - Balance: 0 TND
   - Tracks completed deliveries and average delivery time
   - Ready for transactions

3. **WeeklyAvailability**
   - Status: ACTIVE
   - 7 DayAvailability entries (Monday-Sunday)
   - Each day has default time period: 9 AM - 6 PM
   - Driver can modify these later

## Testing Workflow

1. Register a driver (complete steps 1-3)
2. Driver status will be `PENDING_REVIEW`
3. Use test endpoint to approve: `POST /api/test/drivers/{id}/approve`
4. Driver status changes to `VERIFIED`
5. All entities are created automatically
6. Check with `/all` or `/details` endpoints to verify

## Important Notes

- Test endpoints have NO authentication (marked with `@Public()`)
- **REMOVE TestDriverController in production!**
- The initialization is idempotent - won't create duplicates
- All entities use cascade delete - removing driver removes all related data

## Cleanup

To remove the test controller before production:
1. Delete `delivery-backend/src/drivers/test.controller.ts`
2. Remove `TestDriverController` from `drivers.module.ts`

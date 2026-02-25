# 🧪 Step-by-Step Testing Guide with Postman

## ✅ Prerequisites Checklist

- [x] Server running on `http://localhost:3000/api`
- [x] PostgreSQL running
- [x] Redis running
- [x] Database seeded with test data

---

## 📥 Import Postman Collection

1. Open Postman
2. Click **Import** button (top left)
3. Drag and drop `Delivery_Auth_API.postman_collection.json`
4. Collection will appear in left sidebar

---

## 🎯 Test Flow 1: Customer Registration & Login

### Step 1: Send OTP to New Customer

**Request:** `1. Send OTP - Customer`

**What happens:**
- Generates 6-digit OTP
- Stores in Redis (expires in 5 minutes)
- In dev mode, returns OTP in response
- OTP auto-saved to collection variable

**Expected Response (200 OK):**
```json
{
  "message": "OTP sent successfully",
  "expiresInSeconds": 300,
  "otp": "123456"
}
```

**✅ Success:** You see the OTP in response  
**❌ If fails:** Check Redis is running

---

### Step 2: Verify OTP & Get Token

**Request:** `2. Verify OTP - Customer Login`

**What happens:**
- Verifies OTP from Redis
- Checks if user exists (phone: +21612345678)
- User exists from seed → logs in
- Generates JWT tokens
- Token auto-saved to collection variable

**Expected Response (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1dWlkLWhlcmUiLCJwaG9uZSI6IisyMTYxMjM0NTY3OCIsInJvbGUiOiJDVVNUT01FUiIsInByb2ZpbGVJZCI6ImN1c3RvbWVyLXV1aWQiLCJ0eXBlIjoiVVNFUiIsImlhdCI6MTcwOTU2NzgwMCwiZXhwIjoxNzEwMTcyNjAwfQ.signature",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 604800
}
```

**✅ Success:** You receive accessToken and refreshToken  
**❌ If "OTP expired":** Send OTP again (Step 1)  
**❌ If "Invalid OTP":** Check you copied the correct OTP

---

### Step 3: Access Protected Route

**Request:** `3. Get Current User Info`

**What happens:**
- Sends request with Bearer token
- JWT strategy validates token
- Returns user information

**Expected Response (200 OK):**
```json
{
  "id": "uuid-here",
  "phone": "+21612345678",
  "role": "CUSTOMER",
  "status": "ACTIVE",
  "profileId": "customer-uuid-here"
}
```

**✅ Success:** You see user details  
**❌ If 401 Unauthorized:** Token not saved correctly, check Authorization header

---

### Step 4: Complete Profile

**Request:** `4. Complete User Profile`

**What happens:**
- Updates user's firstName, secondName, email, image
- Requires authentication

**Expected Response (200 OK):**
```json
{
  "id": "uuid-here",
  "phone": "+21612345678",
  "firstName": "Ahmed",
  "secondName": "Ben Ali",
  "myEmail": "ahmed@example.com",
  "image": "https://example.com/avatar.jpg",
  "role": "CUSTOMER",
  "status": "ACTIVE",
  "createdAt": "2026-02-24T..."
}
```

---

## 🎯 Test Flow 2: Driver Registration

### Step 1: Send OTP to Driver

**Request:** `5. Send OTP - Driver`

Change phone to a NEW number (not in database):
```json
{
  "phone": "+21677777777",
  "role": "DRIVER"
}
```

**Expected:** OTP sent successfully

---

### Step 2: Verify & Auto-Register

**Request:** `6. Verify OTP - Driver Login`

Update phone and use the OTP:
```json
{
  "phone": "+21677777777",
  "role": "DRIVER",
  "otp": "123456"
}
```

**What happens:**
- OTP verified
- User doesn't exist → creates new User + Driver profile
- Driver status set to "INCOMPLETE"
- Returns JWT tokens

**Expected Response (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 604800
}
```

---

### Step 3: Check Driver Info

**Request:** `3. Get Current User Info`

**Expected Response:**
```json
{
  "id": "new-uuid",
  "phone": "+21677777777",
  "role": "DRIVER",
  "status": "ACTIVE",
  "profileId": "driver-uuid"
}
```

---

## 🎯 Test Flow 3: Admin Login

### Step 1: Admin Login

**Request:** `1. Admin Login`

**What happens:**
- Validates email/password
- In dev mode, accepts any password
- Returns JWT tokens for SuperUser

**Expected Response (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 604800
}
```

**Note:** Token is different from User tokens (has type: 'SUPER_USER')

---

## 🧪 Test Flow 4: Error Scenarios

### Test 1: Wrong Role Error

**Request:** `Wrong Role Error` (in Test Scenarios folder)

**What happens:**
- Phone +21612345678 is registered as CUSTOMER
- Try to send OTP with role DRIVER
- Should fail

**Expected Response (400 Bad Request):**
```json
{
  "statusCode": 400,
  "message": "This phone number is registered as CUSTOMER. Please use the correct role.",
  "error": "Bad Request"
}
```

---

### Test 2: Invalid OTP

**Request:** `Invalid OTP`

**What happens:**
- Try to verify with wrong OTP code
- Shows remaining attempts

**Expected Response (400 Bad Request):**
```json
{
  "statusCode": 400,
  "message": "Invalid OTP. 4 attempts remaining.",
  "error": "Bad Request"
}
```

---

### Test 3: Invalid Phone Format

**Request:** `Invalid Phone Format`

**What happens:**
- Validation pipe catches invalid phone
- Returns validation error

**Expected Response (400 Bad Request):**
```json
{
  "statusCode": 400,
  "message": ["Invalid phone number format"],
  "error": "Bad Request"
}
```

---

### Test 4: Missing Authorization

**Request:** `Missing Authorization Header`

**What happens:**
- Try to access protected route without token
- Guard blocks request

**Expected Response (401 Unauthorized):**
```json
{
  "statusCode": 401,
  "message": "Authentication required"
}
```

---

## 🔄 Test Flow 5: Rate Limiting

### Test Rate Limit

1. Send OTP to same phone 5 times quickly
2. On 6th attempt, should get error

**Expected Response (429 Too Many Requests):**
```json
{
  "statusCode": 429,
  "message": "Too many OTP requests. Please wait before requesting another."
}
```

**To reset:** Wait 1 hour OR manually delete from Redis:
```bash
redis-cli
> DEL otp_rate:+21612345678
```

---

## 🔄 Test Flow 6: OTP Expiration

### Test Expired OTP

1. Send OTP
2. Wait 5+ minutes (or manually delete from Redis)
3. Try to verify

**Expected Response (400 Bad Request):**
```json
{
  "statusCode": 400,
  "message": "OTP expired or not found. Please request a new one.",
  "error": "Bad Request"
}
```

**To test quickly:**
```bash
redis-cli
> DEL otp:+21612345678:CUSTOMER
```

---

## 📊 Monitoring & Debugging

### Check Redis Keys

```bash
redis-cli

# List all OTP keys
> KEYS otp:*

# Check specific OTP
> GET otp:+21612345678:CUSTOMER

# Check rate limit
> GET otp_rate:+21612345678

# Check TTL (time to live)
> TTL otp:+21612345678:CUSTOMER
```

### Check Database

```bash
# Connect to PostgreSQL
psql -U postgres -d delivery_platform

# Check users
SELECT id, phone, role, status FROM users;

# Check customers
SELECT u.phone, c.id, c.completed_orders 
FROM customers c 
JOIN users u ON c.user_id = u.id;

# Check drivers
SELECT u.phone, d.status, d.vehicle_type 
FROM drivers d 
JOIN users u ON d.user_id = u.id;
```

### Server Logs

Watch the terminal where `npm run start:dev` is running:
- OTP generation logs
- Authentication attempts
- Errors and warnings

---

## 🎯 Success Criteria

After testing, you should have:

✅ Successfully sent OTP to customer phone  
✅ Verified OTP and received JWT token  
✅ Accessed protected route with token  
✅ Completed user profile  
✅ Registered new driver via OTP  
✅ Admin logged in with email/password  
✅ Tested error scenarios (wrong OTP, wrong role, etc.)  
✅ Verified rate limiting works  
✅ Confirmed OTP expiration works  

---

## 🐛 Common Issues & Solutions

### Issue: "Cannot POST /auth/user/send-otp"
**Solution:** Check base URL is `http://localhost:3000/api` (note the `/api` prefix)

### Issue: OTP not auto-saved in Postman
**Solution:** Check the "Tests" tab in request has the script to save OTP

### Issue: Token not working
**Solution:** 
- Verify format: `Bearer <token>` (note the space)
- Check token hasn't expired
- Ensure you're using the right token (userAccessToken vs superUserAccessToken)

### Issue: "User not found" after login
**Solution:** Run seed script again: `npm run prisma:seed`

### Issue: Redis connection refused
**Solution:** Start Redis: `redis-server` or `docker run -d -p 6379:6379 redis:alpine`

---

## 📝 Quick Reference

### Test Phones (from seed)
- Customer: `+21612345678`
- Driver: `+21698765432`

### Test Emails (from seed)
- Admin: `admin@delivery.com`
- Customer Service: `support@delivery.com`

### Base URL
```
http://localhost:3000/api
```

### Authorization Header Format
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 🚀 Ready to Test!

1. Import the Postman collection
2. Start with "User Auth" folder
3. Run requests in order (1 → 2 → 3 → 4)
4. Check responses match expected results
5. Try error scenarios
6. Test admin login

**Pro tip:** Use Postman's Collection Runner to run all tests automatically!

---

Good luck! 🎉

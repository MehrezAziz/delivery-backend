# Authentication API Testing Guide

## Prerequisites

1. Start PostgreSQL and Redis:
```bash
# Make sure PostgreSQL is running on port 5432
# Make sure Redis is running on port 6379
```

2. Run migrations:
```bash
npx prisma migrate dev
```

3. Start the server:
```bash
npm run start:dev
```

Server will run on: `http://localhost:3000/api`

---

## 📱 USER AUTHENTICATION (Customer & Driver - Phone OTP)

### 1. Send OTP (Customer)

**Endpoint:** `POST http://localhost:3000/api/auth/user/send-otp`

**Body (JSON):**
```json
{
  "phone": "+21612345678",
  "role": "CUSTOMER"
}
```

**Expected Response:**
```json
{
  "message": "OTP sent successfully",
  "expiresInSeconds": 300,
  "otp": "123456"
}
```

Note: `otp` field only appears in development mode for testing.

---

### 2. Send OTP (Driver)

**Endpoint:** `POST http://localhost:3000/api/auth/user/send-otp`

**Body (JSON):**
```json
{
  "phone": "+21698765432",
  "role": "DRIVER"
}
```

---

### 3. Verify OTP & Login/Register

**Endpoint:** `POST http://localhost:3000/api/auth/user/verify-otp`

**Body (JSON):**
```json
{
  "phone": "+21612345678",
  "role": "CUSTOMER",
  "otp": "123456"
}
```

**Expected Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 604800
}
```

**Save the `accessToken` for authenticated requests!**

---

### 4. Get Current User Info

**Endpoint:** `POST http://localhost:3000/api/auth/user/me`

**Headers:**
```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Expected Response:**
```json
{
  "id": "uuid-here",
  "phone": "+21612345678",
  "role": "CUSTOMER",
  "status": "ACTIVE",
  "profileId": "customer-uuid-here"
}
```

---

### 5. Complete User Profile (Optional)

**Endpoint:** `PATCH http://localhost:3000/api/auth/user/complete-profile`

**Headers:**
```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Body (JSON):**
```json
{
  "firstName": "Ahmed",
  "secondName": "Ben Ali",
  "myEmail": "ahmed@example.com",
  "image": "https://example.com/avatar.jpg"
}
```

---

## 👨‍💼 SUPER USER AUTHENTICATION (Admin & Customer Service)

### 6. SuperUser Login

**Endpoint:** `POST http://localhost:3000/api/auth/superuser/login`

**Body (JSON):**
```json
{
  "email": "admin@delivery.com",
  "password": "admin123456"
}
```

**Expected Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 604800
}
```

**Note:** SuperUser login currently accepts any password in development mode. You'll need to:
1. Add a `password` field to the `SuperUser` model in Prisma schema
2. Create a migration
3. Seed admin users with hashed passwords

---

## 🧪 Testing Scenarios

### Scenario 1: New Customer Registration
1. Send OTP to a new phone number with role "CUSTOMER"
2. Copy the OTP from response (dev mode)
3. Verify OTP - this will create a new User + Customer profile
4. Use the access token to call `/auth/user/me`
5. Complete profile with personal info

### Scenario 2: Existing User Login
1. Send OTP to an existing phone number
2. Verify OTP - this will login the existing user
3. Access token is returned

### Scenario 3: Driver Registration
1. Send OTP with role "DRIVER"
2. Verify OTP - creates User + Driver profile with status "INCOMPLETE"
3. Driver needs to complete verification later

### Scenario 4: Wrong Role
1. Register as CUSTOMER with phone "+21611111111"
2. Try to send OTP with same phone but role "DRIVER"
3. Should get error: "This phone number is registered as CUSTOMER"

### Scenario 5: Invalid OTP
1. Send OTP
2. Try to verify with wrong OTP code
3. Should get error with remaining attempts

### Scenario 6: Expired OTP
1. Send OTP
2. Wait 5+ minutes
3. Try to verify - should get "OTP expired" error

### Scenario 7: Rate Limiting
1. Send OTP 5 times in a row for same phone
2. 6th attempt should fail with "Too many OTP requests"

---

## 🔐 Using Protected Routes

For any protected endpoint, add this header:

```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

Example with curl:
```bash
curl -X POST http://localhost:3000/api/auth/user/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## 🐛 Common Issues

### Issue: "Cannot connect to Redis"
**Solution:** Make sure Redis is running:
```bash
redis-server
```

### Issue: "Database connection error"
**Solution:** Check PostgreSQL is running and .env has correct DATABASE_URL

### Issue: "Twilio error" (in production)
**Solution:** Add valid Twilio credentials to .env file

### Issue: "OTP not received"
**Solution:** In development, OTP is returned in the response. In production, it's sent via SMS.

---

## 📝 Next Steps

After authentication works:

1. **Add SuperUser Password Field:**
   - Update Prisma schema to add `password` field to SuperUser
   - Create migration
   - Seed admin users with bcrypt-hashed passwords

2. **Create Seed Script:**
   - Add sample users, drivers, customers
   - Add admin and customer service users
   - Add geographic data (countries, governorates, delegations)

3. **Test Guards:**
   - Create test endpoints that use different guards
   - Test CustomerGuard, DriverGuard, AdminGuard
   - Test UserRestrictionGuard with blocked users

4. **Implement Refresh Token:**
   - Add refresh token endpoint
   - Store refresh tokens in Redis
   - Implement token rotation

---

## 🎯 Success Criteria

✅ Can send OTP to phone number  
✅ Can verify OTP and get JWT token  
✅ Can access protected routes with token  
✅ Can complete user profile  
✅ Different tokens for User vs SuperUser  
✅ Guards properly restrict access by role  
✅ Rate limiting works for OTP requests  
✅ OTP expires after 5 minutes  

---

Good luck with testing! 🚀

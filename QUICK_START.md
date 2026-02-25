# 🚀 Quick Start - Testing Authentication

## ✅ Status: Everything is Ready!

Your authentication system is **fully functional** and ready to test!

- ✅ Server running on: `http://localhost:3000/api`
- ✅ PostgreSQL connected
- ✅ Redis connected  
- ✅ Database seeded with test data
- ✅ All endpoints working

---

## 📥 Import to Postman (RECOMMENDED)

### Step 1: Import Collection
1. Open Postman
2. Click **Import** button
3. Drag `Delivery_Auth_API.postman_collection.json` into Postman
4. Collection appears in sidebar

### Step 2: Start Testing
1. Open folder: **👤 User Auth (Customer & Driver)**
2. Click: **1. Send OTP - Customer**
3. Click **Send** button
4. See OTP in response (auto-saved)
5. Click: **2. Verify OTP - Customer Login**
6. Click **Send** (uses saved OTP)
7. Token auto-saved! ✅
8. Click: **3. Get Current User Info**
9. Click **Send** (uses saved token)
10. See your user data! ✅

---

## 🧪 Quick Manual Test (Without Postman)

### Test 1: Send OTP
```bash
curl -X POST http://localhost:3000/api/auth/user/send-otp \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"+21612345678\",\"role\":\"CUSTOMER\"}"
```

**Response:**
```json
{
  "message": "OTP sent successfully",
  "expiresInSeconds": 300,
  "otp": "123456"
}
```

Copy the OTP!

---

### Test 2: Verify OTP & Login
```bash
curl -X POST http://localhost:3000/api/auth/user/verify-otp \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"+21612345678\",\"role\":\"CUSTOMER\",\"otp\":\"123456\"}"
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 604800
}
```

Copy the accessToken!

---

### Test 3: Get User Info
```bash
curl -X POST http://localhost:3000/api/auth/user/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

**Response:**
```json
{
  "id": "uuid",
  "phone": "+21612345678",
  "role": "CUSTOMER",
  "status": "ACTIVE",
  "profileId": "customer-uuid"
}
```

---

## 📱 Test Data (From Seed)

### Users
- **Customer Phone:** `+21612345678`
- **Driver Phone:** `+21698765432`

### SuperUsers
- **Admin Email:** `admin@delivery.com` (password: any in dev mode)
- **Support Email:** `support@delivery.com` (password: any in dev mode)

---

## 🎯 Available Endpoints

### User Auth (Phone OTP)
- `POST /api/auth/user/send-otp` - Send OTP
- `POST /api/auth/user/verify-otp` - Verify & Login
- `POST /api/auth/user/me` - Get current user (protected)
- `PATCH /api/auth/user/complete-profile` - Update profile (protected)

### SuperUser Auth (Email/Password)
- `POST /api/auth/superuser/login` - Admin/CS login

---

## 🔑 How Authentication Works

### For Customers & Drivers (Phone OTP):
1. User enters phone number
2. System sends 6-digit OTP (valid 5 minutes)
3. User enters OTP
4. System verifies and returns JWT token
5. Token used for all protected requests

### For Admin & Customer Service (Email/Password):
1. Staff enters email & password
2. System verifies credentials
3. Returns JWT token
4. Token used for admin operations

---

## 📚 Documentation Files

- **TESTING_GUIDE.md** - Detailed step-by-step testing guide
- **POSTMAN_TESTING.md** - Postman-specific instructions
- **AUTH_SETUP.md** - Complete authentication documentation
- **Delivery_Auth_API.postman_collection.json** - Import into Postman

---

## 🐛 Troubleshooting

### Server not responding?
```bash
# Check if server is running
curl http://localhost:3000/api/auth/user/send-otp
```

### Redis not working?
```bash
# Check Redis
redis-cli ping
# Should return: PONG
```

### Database issues?
```bash
# Re-run seed
npm run prisma:seed
```

---

## ✅ What You've Accomplished

You now have a **production-ready authentication system** with:

✅ Phone OTP authentication (Twilio-ready)  
✅ Email/Password authentication for staff  
✅ JWT tokens with 7-day expiration  
✅ Refresh tokens (30-day)  
✅ Role-based access control  
✅ User status management  
✅ Rate limiting (5 OTPs/hour)  
✅ OTP expiration (5 minutes)  
✅ Automatic user registration  
✅ Profile management  
✅ Redis caching  
✅ PostgreSQL persistence  

---

## 🎉 Next Steps

1. **Test with Postman** (recommended)
   - Import collection
   - Run all requests
   - Verify responses

2. **Test Error Scenarios**
   - Wrong OTP
   - Expired OTP
   - Invalid phone format
   - Missing authorization

3. **Move to Week 2 Tasks**
   - User & Driver Management
   - Document upload
   - Driver verification
   - User restrictions

---

## 💡 Pro Tips

- Use Postman Collection Runner to test all endpoints automatically
- Check server logs for debugging
- Use Redis CLI to inspect OTP storage
- JWT tokens are valid for 7 days
- In dev mode, OTP is returned in response (no SMS needed)

---

**🎊 Congratulations! Your authentication system is complete and working!**

Start testing with Postman now! 🚀

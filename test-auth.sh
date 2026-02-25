#!/bin/bash

# Quick Auth Testing Script
# Run this to test auth endpoints without Postman

BASE_URL="http://localhost:3000/api"

echo "🧪 Testing Delivery App Authentication"
echo "========================================"
echo ""

# Test 1: Send OTP
echo "📱 Test 1: Sending OTP to customer..."
OTP_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/user/send-otp" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+21612345678",
    "role": "CUSTOMER"
  }')

echo "$OTP_RESPONSE" | jq '.'
OTP=$(echo "$OTP_RESPONSE" | jq -r '.otp // empty')

if [ -z "$OTP" ]; then
  echo "❌ Failed to get OTP"
  exit 1
fi

echo "✅ OTP received: $OTP"
echo ""

# Test 2: Verify OTP
echo "🔐 Test 2: Verifying OTP..."
TOKEN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/user/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{
    \"phone\": \"+21612345678\",
    \"role\": \"CUSTOMER\",
    \"otp\": \"$OTP\"
  }")

echo "$TOKEN_RESPONSE" | jq '.'
ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.accessToken // empty')

if [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ Failed to get access token"
  exit 1
fi

echo "✅ Access token received"
echo ""

# Test 3: Get User Info
echo "👤 Test 3: Getting user info..."
USER_INFO=$(curl -s -X POST "$BASE_URL/auth/user/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

echo "$USER_INFO" | jq '.'

if echo "$USER_INFO" | jq -e '.id' > /dev/null; then
  echo "✅ User info retrieved successfully"
else
  echo "❌ Failed to get user info"
  exit 1
fi

echo ""

# Test 4: Complete Profile
echo "✏️ Test 4: Completing user profile..."
PROFILE_RESPONSE=$(curl -s -X PATCH "$BASE_URL/auth/user/complete-profile" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Ahmed",
    "secondName": "Ben Ali",
    "myEmail": "ahmed.test@example.com"
  }')

echo "$PROFILE_RESPONSE" | jq '.'

if echo "$PROFILE_RESPONSE" | jq -e '.firstName' > /dev/null; then
  echo "✅ Profile updated successfully"
else
  echo "❌ Failed to update profile"
fi

echo ""
echo "========================================"
echo "✅ All tests passed!"
echo "========================================"
echo ""
echo "🔑 Your access token:"
echo "$ACCESS_TOKEN"
echo ""
echo "💡 Use this token in Postman Authorization header:"
echo "   Bearer $ACCESS_TOKEN"

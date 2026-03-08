# Google OAuth Setup for Standalone App

## Overview

Now that you've built a standalone Android app (with `npx expo prebuild`), you need to configure Google OAuth for Android.

---

## Step 1: Get SHA-1 Fingerprint

### For Debug Build (Development)

Run this command in your project:

```bash
cd delivery-frontend/android
./gradlew signingReport
```

Or on Windows:
```bash
cd delivery-frontend\android
gradlew.bat signingReport
```

### Find the SHA-1

Look for output like this:

```
Variant: debug
Config: debug
Store: C:\Users\YOUR_USER\.android\debug.keystore
Alias: androiddebugkey
MD5: XX:XX:XX:...
SHA1: A1:B2:C3:D4:E5:F6:G7:H8:I9:J0:K1:L2:M3:N4:O5:P6:Q7:R8:S9:T0
SHA-256: ...
```

**Copy the SHA-1 value** (the long string with colons)

---

## Step 2: Create Android OAuth Client in Google Console

### 2.1 Go to Google Cloud Console

Visit: https://console.cloud.google.com/apis/credentials

### 2.2 Create New OAuth Client

1. Click **"Create Credentials"**
2. Select **"OAuth client ID"**
3. Choose **"Android"** as application type

### 2.3 Fill in the Details

- **Name**: `Delivery Platform Android`
- **Package name**: `com.delivery.app`
  (This is from your `app.json` → `android.package`)
- **SHA-1 certificate fingerprint**: Paste the SHA-1 you copied

### 2.4 Create

Click **"Create"** button

### 2.5 Copy the Client ID

You'll see a Client ID like:
```
123456789-abcdefghijklmnop.apps.googleusercontent.com
```

**Copy this Client ID!**

---

## Step 3: Update Your Code

### 3.1 Update the Hook

Open `delivery-frontend/hooks/useGoogleAuth.ts` and replace:

```typescript
const GOOGLE_ANDROID_CLIENT_ID = 'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com';
```

With your actual Android Client ID:

```typescript
const GOOGLE_ANDROID_CLIENT_ID = '123456789-abcdefghijklmnop.apps.googleusercontent.com';
```

### 3.2 Keep the Web Client ID

The Web Client ID should remain:
```typescript
const GOOGLE_WEB_CLIENT_ID = '295733709390-cmkprqadbcrannp1l4gl3drlab8b37r9.apps.googleusercontent.com';
```

---

## Step 4: Rebuild and Test

### 4.1 Rebuild the App

```bash
cd delivery-frontend
npx expo run:android
```

### 4.2 Test Google Sign-In

1. Open the app on your emulator/device
2. Go to Customer Register or Login
3. Click "Continue with Google"
4. Sign in with your Google account
5. **It should work!** ✅

---

## Current Configuration Summary

### Google Cloud Console

You should now have **TWO** OAuth clients:

#### 1. Web Application (Existing)
- **Client ID**: `295733709390-cmkprqadbcrannp1l4gl3drlab8b37r9.apps.googleusercontent.com`
- **Used for**: Expo Go testing, web browser
- **Redirect URIs**:
  - `https://auth.expo.io/@aziz_mehrez/delivery-frontend`
  - `http://localhost:8081`
  - `http://localhost:19006`

#### 2. Android Application (New)
- **Client ID**: `YOUR_ANDROID_CLIENT_ID` (you'll get this after creating)
- **Used for**: Standalone Android app
- **Package name**: `com.delivery.app`
- **SHA-1**: Your debug keystore SHA-1

### Backend Configuration

No changes needed! The backend already accepts tokens from any valid Google OAuth client.

**File**: `delivery-backend/.env`
```env
GOOGLE_CLIENT_ID="295733709390-cmkprqadbcrannp1l4gl3drlab8b37r9.apps.googleusercontent.com"
```

This Web Client ID is used by the backend to verify tokens from ALL clients (Web, Android, iOS).

---

## Troubleshooting

### Can't find gradlew

Make sure you're in the `android` folder:
```bash
cd delivery-frontend/android
ls gradlew  # Should show the file
```

### SHA-1 not showing

Make sure you ran `npx expo prebuild` first to generate the android folder.

### "Package name doesn't match"

Make sure the package name in Google Console matches exactly:
- Google Console: `com.delivery.app`
- app.json: `"package": "com.delivery.app"`

### Still getting errors

1. Make sure you updated the Android Client ID in the code
2. Rebuild the app: `npx expo run:android`
3. Check the console logs for the Client IDs being used
4. Verify your email is a test user in OAuth consent screen

---

## For Production

When you're ready to release to production:

### 1. Generate Release Keystore

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

### 2. Get Release SHA-1

```bash
keytool -list -v -keystore my-release-key.keystore -alias my-key-alias
```

### 3. Create Another Android OAuth Client

- Name: `Delivery Platform Android (Production)`
- Package: `com.delivery.app`
- SHA-1: Your release keystore SHA-1

### 4. Update Code

Add the production Client ID to your code or use environment variables.

---

## Quick Reference

### Commands

```bash
# Get SHA-1
cd delivery-frontend/android && gradlew signingReport

# Rebuild app
cd delivery-frontend && npx expo run:android

# Start backend
cd delivery-backend && npm run start:dev
```

### Files to Update

- `delivery-frontend/hooks/useGoogleAuth.ts` - Add Android Client ID
- `delivery-backend/.env` - Already configured (no changes needed)

### Google Console

- Web Client: https://console.cloud.google.com/apis/credentials
- OAuth Consent Screen: https://console.cloud.google.com/apis/credentials/consent

---

## Expected Result

After completing these steps:

1. ✅ Google Sign-In opens in native Android browser
2. ✅ You sign in with your Google account
3. ✅ Browser closes automatically
4. ✅ App receives the ID token
5. ✅ Backend validates and creates/logs in user
6. ✅ You're redirected to customer home
7. ✅ No more "Something went wrong" errors!

---

**Last Updated**: March 7, 2026

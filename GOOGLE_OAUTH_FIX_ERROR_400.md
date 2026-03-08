# Fix Google OAuth Error 400: invalid_request

## Problem
You're seeing "Access blocked: Authorization Error" with "Error 400: invalid_request" when trying to sign in with Google.

## Root Cause
The redirect URI from your Expo app doesn't match the authorized redirect URIs configured in your Google OAuth client.

## Solution

### Step 1: Find Your Expo Username
```bash
cd delivery-frontend
npx expo whoami
```

This will show your Expo username (e.g., `mehrez` or `anonymous` if not logged in).

If you see "Not logged in", run:
```bash
npx expo login
```

### Step 2: Go to Google Cloud Console
1. Visit: https://console.cloud.google.com/apis/credentials
2. Find your OAuth client: `295733709390-cmkprqadbcrannp1l4gl3drlab8b37r9`
3. Click the pencil icon to edit it

### Step 3: Add Authorized Redirect URIs

Add these URIs (replace `YOUR_EXPO_USERNAME` with your actual username from Step 1):

```
https://auth.expo.io/@YOUR_EXPO_USERNAME/delivery-frontend
http://localhost:8081
http://localhost:19006
```

Example if your username is `mehrez`:
```
https://auth.expo.io/@mehrez/delivery-frontend
http://localhost:8081
http://localhost:19006
```

### Step 4: Add Authorized JavaScript Origins

```
https://auth.expo.io
http://localhost:8081
http://localhost:19006
```

### Step 5: Configure OAuth Consent Screen

1. Go to "APIs & Services" → "OAuth consent screen"
2. Make sure your email (sponsormehrez@gmail.com) is added as a test user
3. If not, click "Add Users" and add your email

### Step 6: Save and Test

1. Click "Save" in Google Cloud Console
2. Wait 1-2 minutes for changes to propagate
3. Restart your Expo app:
   ```bash
   cd delivery-frontend
   npx expo start -c
   ```
4. Try Google Sign-In again

## Troubleshooting

### If you see "App not verified"
This is normal for apps in testing mode. Click "Advanced" → "Go to Delivery Platform (unsafe)" to continue.

### If you still get Error 400
1. Double-check the redirect URI matches exactly (including the @username part)
2. Make sure there are no extra spaces
3. Wait a few minutes for Google's changes to propagate
4. Clear Expo cache: `npx expo start -c`

### If you're not logged into Expo
The redirect URI will be:
```
https://auth.expo.io/@anonymous/delivery-frontend
```

But it's better to login to Expo first:
```bash
npx expo login
```

## Quick Test

After configuration, test with these steps:
1. Open your app in Expo Go
2. Go to Customer Register or Login
3. Click "Continue with Google"
4. Sign in with your Google account (sponsormehrez@gmail.com)
5. You should be redirected back to the app successfully

## Current Configuration

Your Client ID: `295733709390-cmkprqadbcrannp1l4gl3drlab8b37r9.apps.googleusercontent.com`

This is already configured in:
- Backend: `delivery-backend/.env`
- Frontend: `delivery-frontend/hooks/useGoogleAuth.ts`

You just need to add the redirect URIs in Google Cloud Console!

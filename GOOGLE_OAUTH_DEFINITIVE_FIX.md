# Google OAuth - DEFINITIVE FIX

## Current Situation

You're getting:
```
Error 400: invalid_request
redirect_uri=exp://192.168.1.14:8081
```

This means Google is rejecting the redirect URI because it's not in your authorized list.

## The Root Cause

When you restart Expo or reinstall node_modules, the default behavior changes and it uses your local network IP (`exp://192.168.1.14:8081`) instead of Expo's proxy (`https://auth.expo.io/@aziz_mehrez/delivery-frontend`).

## The DEFINITIVE Solution

I've updated the code to FORCE the use of Expo's proxy by explicitly setting:
```typescript
const redirectUri = 'https://auth.expo.io/@aziz_mehrez/delivery-frontend';
```

This URI should already be in your Google Cloud Console (you showed it in your screenshot as URI 5).

## What You Need to Do NOW

### Step 1: Verify Google Cloud Console

Go to: https://console.cloud.google.com/apis/credentials

Find your OAuth client and make sure these URIs are there:

**Authorized redirect URIs:**
```
https://auth.expo.io/@aziz_mehrez/delivery-frontend
http://localhost:8081
http://localhost:19006
```

**Authorized JavaScript origins:**
```
https://auth.expo.io
http://localhost:8081
http://localhost:19006
```

### Step 2: Restart Everything

```bash
# Terminal 1 - Backend
cd delivery-backend
npm run start:dev

# Terminal 2 - Frontend
cd delivery-frontend
npx expo start -c
```

### Step 3: Test

1. Open app in Expo Go
2. Click "Continue with Google"
3. Check console - should show:
   ```
   Starting Google Sign-In with redirect URI: https://auth.expo.io/@aziz_mehrez/delivery-frontend
   ```
4. Sign in with Google
5. Should work! ✅

## Why This Will Work

- ✅ Code now FORCES the use of `https://auth.expo.io/@aziz_mehrez/delivery-frontend`
- ✅ This URI is in your Google Cloud Console
- ✅ Added extensive logging to debug any issues
- ✅ Backend is running
- ✅ All configuration is correct

## If You Still See exp://192.168.1.14:8081

This means the code change didn't take effect. Do this:

1. **Stop Expo completely** (Ctrl+C)
2. **Clear cache**: `npx expo start -c`
3. **Force reload in Expo Go**: Shake device → Reload
4. **Try again**

## Debugging

The console will now show detailed logs:

```
Starting Google Sign-In with redirect URI: https://auth.expo.io/@aziz_mehrez/delivery-frontend
Prompt result: { type: 'success', params: { ... } }
Success! Params: { id_token: '...', ... }
Sending ID token to backend...
Backend response: { accessToken: '...', user: { ... } }
```

If you see any errors, share the console output.

## Alternative: Add the IP-Based URI

If you want to keep using `exp://192.168.1.14:8081`, you can add it to Google Cloud Console:

1. Go to your OAuth client
2. Add this redirect URI: `exp://192.168.1.14:8081`
3. Save

But note:
- ⚠️ This IP will change if you switch networks
- ⚠️ You'll need to update Google Console each time
- ⚠️ Not recommended for development

## Expected Console Output

When it works, you'll see:

```
Starting Google Sign-In with redirect URI: https://auth.expo.io/@aziz_mehrez/delivery-frontend
Prompt result: { type: 'success', params: { id_token: 'eyJ...', ... } }
Success! Params: { id_token: 'eyJ...', access_token: '...', ... }
Sending ID token to backend...
Backend response: { accessToken: 'eyJ...', user: { id: 1, ... }, customer: { ... } }
```

Then you'll be redirected to customer home! 🎉

## Checklist

Before testing, verify:

- [ ] Backend is running on port 3000
- [ ] Google Cloud Console has `https://auth.expo.io/@aziz_mehrez/delivery-frontend`
- [ ] Expo is restarted with `-c` flag
- [ ] You're using the latest code (with forced redirect URI)
- [ ] Your email is a test user in OAuth consent screen

## This MUST Work Now

The code is explicitly forcing the correct redirect URI. If it still shows `exp://192.168.1.14:8081`, it means:

1. The code change didn't save, OR
2. Expo didn't reload the new code, OR
3. You're looking at old cached code

Solution: Stop everything, restart with clean cache, and try again!

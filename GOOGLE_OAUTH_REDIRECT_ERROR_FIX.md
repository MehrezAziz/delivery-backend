# Fix: "Something went wrong trying to finish signing in"

## The Problem

You're seeing this error on auth.expo.io after successfully signing in with Google:
```
Something went wrong trying to finish signing in. 
Please close this screen to go back to the app.
```

## Why This Happens

After you sign in with Google, auth.expo.io tries to redirect back to your app using a deep link. But the redirect fails because:
1. The app's deep link scheme isn't properly configured, OR
2. Expo Go can't handle the redirect properly

## The Solution

We need to check what redirect URI your app is actually using and make sure it's configured correctly.

### Step 1: Check the Console Logs

After you click "Continue with Google", check your Expo console for logs. You should see something like:

```
Google Auth Response: { type: 'success', params: { ... } }
```

Or you might see an error. Share what you see.

### Step 2: Try Using Expo's Proxy Explicitly

I've updated the code to log the response. Now restart your app:

```bash
cd delivery-frontend
npx expo start -c
```

### Step 3: Test Again

1. Open app in Expo Go
2. Click "Continue with Google"
3. Sign in with your Google account
4. Check the Expo console for logs
5. Look for "Google Auth Response:" log

### Step 4: Check What Happened

The response will tell us what went wrong:

**If you see `type: 'success'`:**
- ✅ The redirect worked!
- The app should proceed to send the token to backend
- Check backend logs for any errors

**If you see `type: 'error'`:**
- ❌ The redirect failed
- Check the error message in the response
- We may need to configure the redirect URI differently

**If you see `type: 'dismiss'` or `type: 'cancel'`:**
- The auth flow was cancelled
- Try again

## Alternative: Use Web Browser Instead

If the redirect keeps failing, we can configure the auth to stay in the browser instead of trying to redirect back:

This would mean:
1. User clicks "Continue with Google"
2. Browser opens
3. User signs in
4. User manually closes browser
5. App checks for the auth result

Let me know what you see in the console and we'll fix it!

## Common Causes

1. **Expo Go limitations**: Expo Go sometimes has issues with deep links
2. **Network issues**: The redirect might be blocked by network
3. **Scheme mismatch**: The app scheme doesn't match what's expected
4. **Cache issues**: Old auth state is cached

## Quick Fixes to Try

### Fix 1: Clear Expo Cache
```bash
npx expo start -c
```

### Fix 2: Restart Expo Go
Close and reopen the Expo Go app completely

### Fix 3: Check Backend is Running
Make sure your backend is running on port 3000:
```bash
cd delivery-backend
npm run start:dev
```

### Fix 4: Check Network
Make sure your phone and computer are on the same network

## What to Share

If it still doesn't work, share:
1. The console logs after clicking "Continue with Google"
2. Any error messages you see
3. Whether you're using Android or iOS
4. Whether you're using emulator or physical device

## Expected Flow

1. Click "Continue with Google" ✅
2. Browser opens with Google sign-in ✅
3. You sign in successfully ✅
4. auth.expo.io receives the response ✅
5. auth.expo.io redirects to your app ❌ (This is where it's failing)
6. App receives the ID token
7. App sends token to backend
8. Backend validates and creates/logs in user
9. You're redirected to customer home

We need to fix step 5!

# Complete Google OAuth Fix - Error 400: invalid_request

## Summary
You're getting "Error 400: invalid_request" because the redirect URI from your app doesn't match what's configured in Google Cloud Console.

## Two Solutions (Choose One)

### ✅ SOLUTION 1: Use Expo's Default Redirect (RECOMMENDED)

This is the easiest solution for Expo Go testing.

#### Step 1: Update Google Cloud Console

1. Go to: https://console.cloud.google.com/apis/credentials
2. Find OAuth client: `295733709390-cmkprqadbcrannp1l4gl3drlab8b37r9`
3. Click Edit

4. Add these **Authorized redirect URIs**:
   ```
   https://auth.expo.io/@aziz_mehrez/delivery-frontend
   http://localhost:8081
   http://localhost:19006
   ```

5. Add these **Authorized JavaScript origins**:
   ```
   https://auth.expo.io
   http://localhost:8081
   http://localhost:19006
   ```

6. Click **SAVE**

#### Step 2: Add Test User

1. Go to "OAuth consent screen"
2. Scroll to "Test users"
3. Click "ADD USERS"
4. Add: `sponsormehrez@gmail.com`
5. Click "SAVE"

#### Step 3: Test

```bash
cd delivery-frontend
npx expo start -c
```

Open in Expo Go and try Google Sign-In.

---

### ✅ SOLUTION 2: Use Custom Scheme (Alternative)

If Solution 1 doesn't work, use your custom app scheme.

#### Step 1: Find Your Redirect URI

Start your app and check the console logs:
```bash
cd delivery-frontend
npx expo start -c
```

When you click "Continue with Google", look for a log like:
```
Redirect URI: deliveryapp://redirect
```
or
```
Redirect URI: exp://192.168.x.x:8081/--/redirect
```

#### Step 2: Add That URI to Google Cloud Console

1. Go to: https://console.cloud.google.com/apis/credentials
2. Find OAuth client: `295733709390-cmkprqadbcrannp1l4gl3drlab8b37r9`
3. Click Edit
4. Add the redirect URI you found in Step 1
5. Also add:
   ```
   deliveryapp://redirect
   exp://localhost:8081/--/redirect
   ```
6. Click **SAVE**

---

## Current Configuration Status

✅ Backend `.env` has Client ID: `295733709390-cmkprqadbcrannp1l4gl3drlab8b37r9.apps.googleusercontent.com`
✅ Frontend hook has Client ID configured
✅ Code is error-free
❌ Google Cloud Console needs redirect URIs added

## What You Need to Do RIGHT NOW

### Quick Fix (5 minutes):

1. **Open Google Cloud Console**: https://console.cloud.google.com/apis/credentials

2. **Click on your OAuth client** (the one with ID ending in `lab8b37r9`)

3. **Add these 3 Redirect URIs**:
   - `https://auth.expo.io/@aziz_mehrez/delivery-frontend`
   - `http://localhost:8081`
   - `http://localhost:19006`

4. **Add these 3 JavaScript Origins**:
   - `https://auth.expo.io`
   - `http://localhost:8081`
   - `http://localhost:19006`

5. **Click SAVE**

6. **Go to OAuth consent screen** → **Add test user**: `sponsormehrez@gmail.com`

7. **Wait 2 minutes**, then test again

## Verification Checklist

Before testing, verify in Google Cloud Console:

- [ ] OAuth client ID ends with `lab8b37r9.apps.googleusercontent.com`
- [ ] Authorized redirect URIs section has 3 entries
- [ ] First redirect URI is `https://auth.expo.io/@aziz_mehrez/delivery-frontend`
- [ ] Authorized JavaScript origins has 3 entries
- [ ] OAuth consent screen has `sponsormehrez@gmail.com` as test user
- [ ] You clicked the SAVE button
- [ ] You waited 2-3 minutes after saving

## Testing Steps

1. Close your app completely
2. Run: `npx expo start -c`
3. Open in Expo Go
4. Go to Customer Register or Login
5. Click "Continue with Google"
6. Sign in with `sponsormehrez@gmail.com`
7. Should work! ✅

## Expected Behavior After Fix

1. Click "Continue with Google"
2. Browser/WebView opens with Google sign-in
3. You select your Google account
4. You see consent screen (first time only)
5. Browser closes automatically
6. You're back in the app, logged in
7. Redirected to customer home screen

## If Still Not Working

1. Check the console logs for the actual redirect URI being used
2. Make sure that exact URI is in Google Cloud Console
3. Clear Expo cache: `npx expo start -c`
4. Try in a different browser
5. Make sure you're using the correct Google account

## Screenshot of Correct Configuration

Your OAuth client should look like this:

```
Client ID: 295733709390-cmkprqadbcrannp1l4gl3drlab8b37r9.apps.googleusercontent.com
Client secret: [hidden]

Authorized JavaScript origins:
  1  https://auth.expo.io
  2  http://localhost:8081
  3  http://localhost:19006

Authorized redirect URIs:
  1  https://auth.expo.io/@aziz_mehrez/delivery-frontend
  2  http://localhost:8081
  3  http://localhost:19006
```

## Important Notes

- The redirect URI MUST include your Expo username: `@aziz_mehrez`
- The redirect URI MUST use `https://` (not `http://`) for auth.expo.io
- You MUST add your email as a test user in OAuth consent screen
- Changes can take 1-2 minutes to propagate
- The app is in "Testing" mode, so only test users can sign in

## Need Help?

If you're still stuck after following all steps:
1. Take a screenshot of your OAuth client configuration
2. Take a screenshot of your OAuth consent screen test users
3. Share the console logs when you click "Continue with Google"
4. Check if you can access: https://console.cloud.google.com/apis/credentials

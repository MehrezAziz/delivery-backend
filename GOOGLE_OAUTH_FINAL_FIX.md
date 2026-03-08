# Google OAuth Final Fix - Error 400

## What I Found in Your Screenshot

Looking at your Google Cloud Console configuration, I found these issues:

### ❌ Problems:
1. **URI 3 is missing the @ symbol**: `https://auth.expo.io/aziz_mehrez/delivery-frontend` (WRONG)
2. **Inconsistent ports**: You have 8081, 8082, and 19006
3. **Your app was using a custom scheme** (`deliveryapp://redirect`) which wasn't in your Google Console

### ✅ What I Fixed:
1. Updated the code to use Expo's default redirect URI (which will be `https://auth.expo.io/@aziz_mehrez/delivery-frontend`)
2. Removed the custom scheme configuration

## Steps to Fix in Google Cloud Console

### Step 1: Clean Up Your Redirect URIs

Keep ONLY these 3 redirect URIs:

```
https://auth.expo.io/@aziz_mehrez/delivery-frontend
http://localhost:8081
http://localhost:19006
```

**Remove these:**
- ❌ `https://auth.expo.io/aziz_mehrez/delivery-frontend` (missing @)
- ❌ `http://localhost:8082` (not needed)

### Step 2: Clean Up Your JavaScript Origins

Keep ONLY these:

```
https://auth.expo.io
http://localhost:8081
http://localhost:19006
```

**Remove:**
- ❌ `http://localhost:8082` (not needed)

### Step 3: Verify OAuth Consent Screen

1. Go to "OAuth consent screen" tab
2. Make sure `sponsormehrez@gmail.com` is added as a test user
3. If not, click "ADD USERS" and add it

### Step 4: Save and Wait

1. Click "SAVE" button
2. Wait 2-3 minutes for changes to propagate

### Step 5: Test

```bash
cd delivery-frontend
npx expo start -c
```

1. Open app in Expo Go
2. Click "Continue with Google"
3. Check console for "Redirect URI:" log
4. It should show: `https://auth.expo.io/@aziz_mehrez/delivery-frontend`
5. Google sign-in should work!

## Final Configuration

Your OAuth client should look exactly like this:

### Authorized JavaScript Origins:
```
1. https://auth.expo.io
2. http://localhost:8081
3. http://localhost:19006
```

### Authorized Redirect URIs:
```
1. https://auth.expo.io/@aziz_mehrez/delivery-frontend
2. http://localhost:8081
3. http://localhost:19006
```

## Why This Will Work Now

1. ✅ Code now uses Expo's default redirect URI
2. ✅ The redirect URI will be `https://auth.expo.io/@aziz_mehrez/delivery-frontend`
3. ✅ This URI is in your Google Cloud Console (URI 5)
4. ✅ Your email is a test user
5. ✅ All origins are configured

## Troubleshooting

### If you still see Error 400:

1. **Check the console log** - Look for "Redirect URI:" in your Expo console
2. **Make sure that exact URI is in Google Cloud Console**
3. **Verify the @ symbol** - It must be `@aziz_mehrez`, not `aziz_mehrez`
4. **Clear cache**: `npx expo start -c`
5. **Wait 5 minutes** after saving in Google Cloud Console

### If you see "App not verified":

This is normal! Click "Advanced" → "Go to local delivery app (unsafe)"

### If backend returns error:

Check that:
- Backend is running: `npm run start:dev`
- `.env` has correct Client ID: `295733709390-cmkprqadbcrannp1l4gl3drlab8b37r9.apps.googleusercontent.com`
- Backend logs for detailed error

## Expected Flow

1. Click "Continue with Google"
2. Console shows: `Redirect URI: https://auth.expo.io/@aziz_mehrez/delivery-frontend`
3. Browser opens with Google sign-in
4. You sign in with sponsormehrez@gmail.com
5. Google redirects to: `https://auth.expo.io/@aziz_mehrez/delivery-frontend?...`
6. Expo catches the redirect
7. App receives the ID token
8. App sends token to backend
9. Backend validates and creates/logs in user
10. You're redirected to customer home ✅

## Quick Checklist

Before testing, verify:

- [ ] Removed URI without @ symbol from Google Console
- [ ] Kept only 3 redirect URIs
- [ ] Kept only 3 JavaScript origins
- [ ] Added sponsormehrez@gmail.com as test user
- [ ] Clicked SAVE in Google Console
- [ ] Waited 2-3 minutes
- [ ] Backend is running
- [ ] Restarted Expo with `npx expo start -c`

## This Should Work!

The main issue was that your app was trying to use `deliveryapp://redirect` but Google Console didn't have it. Now the app will use `https://auth.expo.io/@aziz_mehrez/delivery-frontend` which IS in your Google Console (URI 5).

Just clean up the duplicate/wrong URIs and it should work! 🎉

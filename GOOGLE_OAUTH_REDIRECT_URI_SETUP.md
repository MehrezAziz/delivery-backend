# Google OAuth Redirect URI Setup - CRITICAL FIX

## Your Error
```
Error 400: invalid_request
Access blocked: Authorization Error
```

## Why This Happens
Your Google OAuth client doesn't have the correct redirect URI configured. When Expo tries to redirect back to your app after Google sign-in, Google rejects it because the redirect URI isn't authorized.

## Your Expo Configuration
- Username: `aziz_mehrez`
- App slug: `delivery-frontend`
- Redirect URI: `https://auth.expo.io/@aziz_mehrez/delivery-frontend`

## EXACT STEPS TO FIX

### Step 1: Open Google Cloud Console
Click this link: https://console.cloud.google.com/apis/credentials

### Step 2: Find Your OAuth Client
Look for the OAuth 2.0 Client ID with this ID:
```
295733709390-cmkprqadbcrannp1l4gl3drlab8b37r9
```

Click the pencil/edit icon next to it.

### Step 3: Add Authorized Redirect URIs

In the "Authorized redirect URIs" section, click "ADD URI" and add these THREE URIs one by one:

```
https://auth.expo.io/@aziz_mehrez/delivery-frontend
```

```
http://localhost:8081
```

```
http://localhost:19006
```

### Step 4: Add Authorized JavaScript Origins

In the "Authorized JavaScript origins" section, click "ADD URI" and add these THREE origins:

```
https://auth.expo.io
```

```
http://localhost:8081
```

```
http://localhost:19006
```

### Step 5: Save
Click the "SAVE" button at the bottom.

### Step 6: Configure OAuth Consent Screen

1. Click "OAuth consent screen" in the left sidebar
2. Make sure these settings are correct:
   - User Type: External
   - App name: Delivery Platform (or similar)
   - User support email: sponsormehrez@gmail.com
   - Developer contact: sponsormehrez@gmail.com

3. Scroll down to "Test users" section
4. Click "ADD USERS"
5. Add your email: `sponsormehrez@gmail.com`
6. Click "SAVE"

### Step 7: Wait and Test

1. Wait 2-3 minutes for Google's changes to propagate
2. Close your Expo app completely
3. Restart Expo:
   ```bash
   cd delivery-frontend
   npx expo start -c
   ```
4. Open the app in Expo Go
5. Try Google Sign-In again

## Visual Guide

When editing your OAuth client, it should look like this:

```
Application type: Web application
Name: Delivery Platform Web

Authorized JavaScript origins:
  1. https://auth.expo.io
  2. http://localhost:8081
  3. http://localhost:19006

Authorized redirect URIs:
  1. https://auth.expo.io/@aziz_mehrez/delivery-frontend
  2. http://localhost:8081
  3. http://localhost:19006
```

## Common Mistakes to Avoid

❌ Don't add spaces before or after the URIs
❌ Don't forget the `@` symbol in the Expo redirect URI
❌ Don't use `http://` for the Expo redirect URI (it must be `https://`)
❌ Don't forget to add your email as a test user

✅ Copy-paste the URIs exactly as shown above
✅ Make sure your username is `aziz_mehrez` (check with `npx expo whoami`)
✅ Wait a few minutes after saving before testing

## Still Not Working?

If you still see the error after following all steps:

1. Double-check the redirect URI matches exactly:
   ```
   https://auth.expo.io/@aziz_mehrez/delivery-frontend
   ```

2. Make sure you're using the correct Google account (sponsormehrez@gmail.com)

3. Check that your email is added as a test user in OAuth consent screen

4. Try clearing Expo cache:
   ```bash
   npx expo start -c
   ```

5. Check the browser console for more detailed error messages

## Screenshot Checklist

When you're in Google Cloud Console editing your OAuth client, verify:

- [ ] Client ID ends with: `...lab8b37r9.apps.googleusercontent.com`
- [ ] Authorized JavaScript origins has 3 entries
- [ ] Authorized redirect URIs has 3 entries
- [ ] The Expo redirect URI includes `@aziz_mehrez`
- [ ] OAuth consent screen has your email as a test user
- [ ] You clicked "SAVE" button

## After Successful Setup

Once it works, you'll see:
1. Google sign-in popup opens
2. You can select your Google account
3. You see a consent screen (first time only)
4. You're redirected back to the app
5. You're logged in successfully

The error will be completely gone!

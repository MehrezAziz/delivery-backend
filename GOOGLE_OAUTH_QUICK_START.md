# Google OAuth Quick Start (Expo Development)

This is a simplified guide for getting Google OAuth working quickly with Expo Go for development/testing.

## 🚀 Quick Setup (5 Minutes)

### Step 1: Get Google Web Client ID

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/

2. **Create a New Project**
   - Click "Select a project" → "New Project"
   - Name: "Delivery Platform"
   - Click "Create"

3. **Enable Google+ API**
   - Go to "APIs & Services" → "Library"
   - Search for "Google+ API"
   - Click "Enable"

4. **Create Web OAuth Client**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - If prompted, configure OAuth consent screen:
     - User Type: "External"
     - App name: "Delivery Platform"
     - User support email: your email
     - Developer contact: your email
     - Click "Save and Continue" through all steps
   
   - Back to "Create OAuth client ID":
     - Application type: **"Web application"**
     - Name: "Delivery Platform Web"
     - Authorized JavaScript origins: 
       - `http://localhost:8081`
       - `http://localhost:19006`
     - Authorized redirect URIs:
       - `http://localhost:8081`
       - `http://localhost:19006`
     - Click "Create"
   
   - **COPY THE CLIENT ID** (looks like: `123456789-abcdefg.apps.googleusercontent.com`)

### Step 2: Update Backend

1. **Open `delivery-backend/.env`**

2. **Replace the placeholder:**
   ```env
   GOOGLE_CLIENT_ID="123456789-abcdefg.apps.googleusercontent.com"
   ```
   (Use your actual Client ID from Step 1)

3. **Restart backend:**
   ```bash
   cd delivery-backend
   npm run start:dev
   ```

### Step 3: Update Frontend

1. **Open `delivery-frontend/hooks/useGoogleAuth.ts`**

2. **Replace all three placeholders with your Web Client ID:**
   ```typescript
   // Use the SAME Web Client ID for all three (for Expo Go testing)
   const GOOGLE_WEB_CLIENT_ID = '123456789-abcdefg.apps.googleusercontent.com';
   const GOOGLE_ANDROID_CLIENT_ID = '123456789-abcdefg.apps.googleusercontent.com';
   const GOOGLE_IOS_CLIENT_ID = '123456789-abcdefg.apps.googleusercontent.com';
   ```

3. **Save the file**

### Step 4: Test It!

1. **Start Expo:**
   ```bash
   cd delivery-frontend
   npx expo start -c
   ```

2. **Open in Expo Go** on your phone or emulator

3. **Go to Customer Login**

4. **Click "Continue with Google"**

5. **Sign in with your Google account**

6. **You should be logged in!** 🎉

## ✅ What Works with This Setup

- ✅ Google Sign-In in Expo Go
- ✅ User registration with Google
- ✅ User login with Google
- ✅ Referral code support
- ✅ Profile creation
- ✅ Works on Android emulator
- ✅ Works on iOS simulator
- ✅ Works on physical devices with Expo Go

## ⚠️ Limitations

- ❌ Won't work in standalone APK/IPA without proper Android/iOS Client IDs
- ❌ Production apps need separate Android/iOS OAuth clients

## 🔄 For Production Apps

When you're ready to build a production app:

1. Run `npx expo prebuild` to generate native folders
2. Get SHA-1 fingerprint for Android
3. Create Android OAuth client in Google Console
4. Create iOS OAuth client in Google Console
5. Update `useGoogleAuth.ts` with proper Client IDs

See `GOOGLE_OAUTH_SETUP_GUIDE.md` for full production setup.

## 🐛 Troubleshooting

### "Invalid Client" Error
- Make sure you copied the correct Web Client ID
- Check that it's updated in both `.env` and `useGoogleAuth.ts`
- Verify the Client ID doesn't have extra spaces

### Google Sign-In Popup Doesn't Open
- Make sure Expo dev server is running
- Try restarting Expo with `npx expo start -c`
- Check console for errors

### "Network request failed"
- Make sure backend is running on `http://localhost:3000`
- Check that API_BASE_URL in `useGoogleAuth.ts` is correct
- For Android emulator, it should be `http://10.0.2.2:3000/api`

### Backend Returns "Invalid Google token"
- Verify GOOGLE_CLIENT_ID in backend `.env` matches your Web Client ID
- Make sure Google+ API is enabled in Google Cloud Console
- Check backend logs for detailed error

## 📝 Testing Checklist

- [ ] Backend running on port 3000
- [ ] Frontend running with Expo
- [ ] Google Client ID added to backend `.env`
- [ ] Google Client ID added to frontend `useGoogleAuth.ts`
- [ ] Google+ API enabled in Google Cloud Console
- [ ] Authorized redirect URIs include `http://localhost:8081`
- [ ] Can click "Continue with Google" button
- [ ] Google sign-in popup opens
- [ ] Can sign in with Google account
- [ ] Redirected to customer home after sign-in

## 🎯 Next Steps

After Google OAuth is working:

1. Test registration with referral code
2. Test login with existing Google account
3. Add Google Sign-In to driver login/register
4. Add Google Sign-In button to customer register screen
5. Prepare for production build with proper OAuth clients

---

**Need more help?** Check `GOOGLE_OAUTH_SETUP_GUIDE.md` for detailed setup or backend logs for errors.

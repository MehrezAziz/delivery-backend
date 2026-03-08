# Google OAuth Setup Guide

This guide will walk you through setting up Google OAuth authentication for your delivery platform.

## ✅ What's Already Done

### Backend
- ✅ Database schema updated with `googleId` and `googleEmail` fields
- ✅ Migration applied to PostgreSQL database
- ✅ Google OAuth service implemented in `AuthService`
- ✅ API endpoint created: `POST /auth/google`
- ✅ DTOs created for Google authentication
- ✅ Referral code support integrated for customer registration

### Frontend
- ✅ Google Auth hook created (`useGoogleAuth.ts`)
- ✅ Customer login screen updated with Google Sign-In button
- ✅ Required packages installed (`expo-auth-session`, `expo-crypto`)

## 🔧 What You Need to Do

### Quick Start (For Expo Go Testing)

If you just want to test quickly with Expo Go, you only need the **Web Client ID**:

1. Go to Google Cloud Console
2. Create only the **Web Application** OAuth client
3. Copy the Web Client ID
4. Update backend `.env` with the Web Client ID
5. Update frontend `useGoogleAuth.ts` - use the same Web Client ID for all three:
   ```typescript
   const GOOGLE_WEB_CLIENT_ID = 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';
   const GOOGLE_ANDROID_CLIENT_ID = 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com'; // Same as web
   const GOOGLE_IOS_CLIENT_ID = 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com'; // Same as web
   ```

**Note:** This works for development but for production apps, you'll need proper Android/iOS client IDs.

---

### Full Setup (For Production)

For a production-ready setup with proper Android/iOS support:

### Step 1: Get Google OAuth Credentials

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/

2. **Create a New Project** (or select existing)
   - Click "Select a project" → "New Project"
   - Name it: "Delivery Platform" (or your preferred name)
   - Click "Create"

3. **Enable Google+ API**
   - Go to "APIs & Services" → "Library"
   - Search for "Google+ API"
   - Click "Enable"

4. **Create OAuth 2.0 Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   
   **For Web Application:**
   - Application type: "Web application"
   - Name: "Delivery Platform Web"
   - Authorized JavaScript origins: `http://localhost:8081`
   - Authorized redirect URIs: `http://localhost:8081`
   - Click "Create"
   - **Copy the Client ID** (looks like: `xxxxx.apps.googleusercontent.com`)

   **For Android:**
   - Application type: "Android"
   - Name: "Delivery Platform Android"
   - Package name: `com.delivery.app` (from your app.json)
   - SHA-1 certificate fingerprint: 
     
     **For Expo Development Build:**
     ```bash
     # First, create a development build to generate the android folder
     cd delivery-frontend
     npx expo prebuild
     ```
     
     Then get the SHA-1:
     ```bash
     cd android
     ./gradlew signingReport
     ```
     
     **OR use Expo's default debug keystore:**
     ```bash
     # On Windows (PowerShell)
     keytool -list -v -keystore $env:USERPROFILE\.android\debug.keystore -alias androiddebugkey -storepass android -keypass android
     
     # On Mac/Linux
     keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
     ```
     
     **Note:** If `keytool` is not found, you need to install Java JDK and add it to PATH:
     - Download Java JDK from: https://www.oracle.com/java/technologies/downloads/
     - After installation, add to PATH: `C:\Program Files\Java\jdk-XX\bin`
     
     **Alternative - Skip Android Client ID for now:**
     - You can skip this and use only Web Client ID for testing
     - Google Sign-In will work in Expo Go with just Web Client ID
     - You'll need Android Client ID only when building standalone APK
   
   - Click "Create"
   - **Copy the Client ID**

   **For iOS:**
   - Application type: "iOS"
   - Name: "Delivery Platform iOS"
   - Bundle ID: `com.delivery.app` (from your app.json)
   - Click "Create"
   - **Copy the Client ID**

### Step 2: Update Backend Configuration

1. **Open `delivery-backend/.env`**

2. **Replace the placeholder with your Web Client ID:**
   ```env
   GOOGLE_CLIENT_ID="YOUR_ACTUAL_WEB_CLIENT_ID.apps.googleusercontent.com"
   ```

3. **Restart the backend server:**
   ```bash
   cd delivery-backend
   npm run start:dev
   ```

### Step 3: Update Frontend Configuration

1. **Open `delivery-frontend/hooks/useGoogleAuth.ts`**

2. **Replace the placeholders with your actual Client IDs:**
   ```typescript
   const GOOGLE_WEB_CLIENT_ID = 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';
   const GOOGLE_ANDROID_CLIENT_ID = 'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com';
   const GOOGLE_IOS_CLIENT_ID = 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com';
   ```

3. **Update `delivery-frontend/app.json`** to add the Google scheme:
   ```json
   {
     "expo": {
       "scheme": "deliveryapp",
       "android": {
         "googleServicesFile": "./google-services.json"  // Optional for Android
       },
       "ios": {
         "bundleIdentifier": "com.delivery.app",
         "googleServicesFile": "./GoogleService-Info.plist"  // Optional for iOS
       }
     }
   }
   ```

### Step 4: Update Customer Register Screen (Optional)

If you want Google Sign-In on the registration screen too:

1. **Open `delivery-frontend/app/(auth)/customer-register.tsx`**

2. **Add the import:**
   ```typescript
   import { useGoogleAuth } from '../../hooks/useGoogleAuth';
   ```

3. **Add the hook in the component:**
   ```typescript
   const { handleGoogleSignIn, isLoading: isGoogleLoading } = useGoogleAuth('CUSTOMER', formData.referralCode);
   ```

4. **Add the handler:**
   ```typescript
   const handleGoogleRegister = async () => {
     const result = await handleGoogleSignIn();
     if (result.success) {
       router.replace('/(customer)/home');
     } else if (result.error) {
       setSubmitError(result.error);
     }
   };
   ```

5. **Add the button in the JSX** (after the register button, before the login link):
   ```typescript
   {/* Divider */}
   <View style={styles.dividerContainer}>
     <View style={styles.divider} />
     <Text style={styles.dividerText}>OR</Text>
     <View style={styles.divider} />
   </View>

   {/* Google Sign-In Button */}
   <TouchableOpacity 
     style={[styles.googleButton, isGoogleLoading && styles.googleButtonDisabled]}
     onPress={handleGoogleRegister}
     disabled={isGoogleLoading || isSubmitting}
   >
     {isGoogleLoading ? (
       <ActivityIndicator size="small" color="#4285F4" />
     ) : (
       <>
         <Text style={styles.googleIcon}>G</Text>
         <Text style={styles.googleButtonText}>Continue with Google</Text>
       </>
     )}
   </TouchableOpacity>
   ```

6. **Copy the styles from customer-login.tsx:**
   - `dividerContainer`
   - `divider`
   - `dividerText`
   - `googleButton`
   - `googleButtonDisabled`
   - `googleIcon`
   - `googleButtonText`

### Step 5: Test the Implementation

1. **Start the backend:**
   ```bash
   cd delivery-backend
   npm run start:dev
   ```

2. **Start the frontend:**
   ```bash
   cd delivery-frontend
   npx expo start -c
   ```

3. **Test on Android/iOS:**
   - Open the app
   - Go to Customer Login
   - Click "Continue with Google"
   - Sign in with your Google account
   - You should be redirected to the customer home screen

## 🔍 Troubleshooting

### "Invalid Google token" Error
- Make sure you've added the correct Client IDs in `useGoogleAuth.ts`
- Verify the GOOGLE_CLIENT_ID in backend `.env` matches your Web Client ID
- Check that the Google+ API is enabled in Google Cloud Console

### "Redirect URI mismatch" Error
- Add `http://localhost:8081` to Authorized redirect URIs in Google Cloud Console
- For Android, make sure the SHA-1 fingerprint is correct
- For iOS, verify the Bundle ID matches

### Google Sign-In Button Not Working
- Check the console logs for errors
- Verify all three Client IDs are set in `useGoogleAuth.ts`
- Make sure `expo-auth-session` and `expo-crypto` are installed

### Backend Returns 400 Error
- Check backend logs for detailed error message
- Verify the ID token is being sent correctly
- Ensure the GOOGLE_CLIENT_ID in `.env` is correct

## 📝 How It Works

### Registration Flow:
1. User clicks "Continue with Google"
2. Google OAuth popup opens
3. User signs in and grants permissions
4. Frontend receives ID token from Google
5. Frontend sends ID token + role + referralCode to backend `/auth/google`
6. Backend verifies token with Google
7. Backend creates new user with Google data
8. Backend generates referral code for customer
9. Backend returns JWT token + user data
10. Frontend stores tokens and navigates to home

### Login Flow:
1. User clicks "Continue with Google"
2. Google OAuth popup opens
3. User signs in
4. Frontend receives ID token
5. Frontend sends ID token + role to backend
6. Backend verifies token and finds existing user
7. Backend returns JWT token
8. Frontend stores token and navigates to home

## 🎯 Features Implemented

- ✅ Google OAuth login for existing users
- ✅ Google OAuth registration for new users
- ✅ Automatic profile creation (Customer/Driver)
- ✅ Referral code support during Google registration
- ✅ JWT token generation
- ✅ User data storage in AsyncStorage
- ✅ Role-based authentication (Customer/Driver)
- ✅ Duplicate account prevention (by Google ID and email)

## 🔐 Security Notes

- ID tokens are verified server-side using Google's OAuth2Client
- Tokens are only valid for your specific Client ID
- User data is stored securely in PostgreSQL
- JWT tokens expire after 7 days (configurable)
- Google email and ID are stored for future logins

## 📚 Additional Resources

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Expo Auth Session Docs](https://docs.expo.dev/versions/latest/sdk/auth-session/)
- [Google Cloud Console](https://console.cloud.google.com/)

---

**Need Help?** Check the backend logs and frontend console for detailed error messages.

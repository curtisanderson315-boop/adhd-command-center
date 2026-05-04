/**
 * Google OAuth2 -- ADHD Command Center
 *
 * Uses expo-auth-session with the iOS native OAuth client (not the Expo proxy).
 * The iOS client validates by bundle ID -- no redirect URI configuration needed
 * in Google Cloud Console. Tokens stored in expo-secure-store (encrypted on device).
 *
 * Redirect flow:
 *   1. App opens Google sign-in in-app browser
 *   2. User signs in
 *   3. Google redirects to com.googleusercontent.apps.{CLIENT_PREFIX}:/
 *   4. iOS routes that URL scheme back to this app (registered in app.json)
 *   5. expo-auth-session extracts the auth code
 *   6. We exchange code for access + refresh tokens
 */

import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

// Required: tells expo-auth-session to complete any in-progress auth session
// when the app is foregrounded via a deep link redirect.
WebBrowser.maybeCompleteAuthSession();

// ---- Client IDs ----------------------------------------------------------------
// iOS-type OAuth client. Google validates against the bundle ID, so no
// redirect URI needs to be registered in Google Cloud Console.
export const GOOGLE_CLIENT_ID =
  '82226617367-kc7m6pnqrv29qjk0l0prn8jri4kuqo6g.apps.googleusercontent.com';

// Redirect URI = reversed client ID + ":/"
// This scheme is registered in app.json ios.infoPlist.CFBundleURLTypes so
// iOS knows to hand the callback back to this app.
const CLIENT_PREFIX = '82226617367-kc7m6pnqrv29qjk0l0prn8jri4kuqo6g';
export const REDIRECT_URI = `com.googleusercontent.apps.${CLIENT_PREFIX}:/`;
// -------------------------------------------------------------------------------

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

const SECURE_STORE_KEYS = {
  accessToken: 'google_access_token',
  refreshToken: 'google_refresh_token',
  tokenExpiry: 'google_token_expiry',
  userEmail: 'google_user_email',
};

export function useGoogleAuth() {
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      scopes: SCOPES,
      redirectUri: REDIRECT_URI,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      // access_type=offline is required to get a refresh token from Google
      extraParams: { access_type: 'offline', prompt: 'consent' },
    },
    {
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
    }
  );

  return { request, response, promptAsync };
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; email: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }).toString(),
  });

  const data = await res.json();

  if (!res.ok) {
    const errMsg = data?.error_description ?? data?.error ?? `HTTP ${res.status}`;
    throw new Error(`Token exchange failed: ${errMsg}`);
  }

  if (!data.access_token) {
    throw new Error('Google returned no access token. Check OAuth client configuration.');
  }

  // Decode email from id_token JWT payload
  let email = '';
  try {
    const payload = JSON.parse(atob(data.id_token.split('.')[1]));
    email = payload.email ?? '';
  } catch {
    // Non-fatal -- email is nice to have but not required
    console.warn('[Auth] Could not decode email from id_token');
  }

  await Promise.all([
    SecureStore.setItemAsync(SECURE_STORE_KEYS.accessToken, data.access_token),
    SecureStore.setItemAsync(SECURE_STORE_KEYS.refreshToken, data.refresh_token ?? ''),
    SecureStore.setItemAsync(
      SECURE_STORE_KEYS.tokenExpiry,
      String(Date.now() + (data.expires_in ?? 3600) * 1000)
    ),
    SecureStore.setItemAsync(SECURE_STORE_KEYS.userEmail, email),
  ]);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? '',
    expiresIn: data.expires_in ?? 3600,
    email,
  };
}

export async function getValidAccessToken(): Promise<string> {
  const [token, expiry, refresh] = await Promise.all([
    SecureStore.getItemAsync(SECURE_STORE_KEYS.accessToken),
    SecureStore.getItemAsync(SECURE_STORE_KEYS.tokenExpiry),
    SecureStore.getItemAsync(SECURE_STORE_KEYS.refreshToken),
  ]);

  // Token still valid (with 60s buffer)
  if (token && expiry && Date.now() < Number(expiry) - 60_000) {
    return token;
  }

  // Refresh using stored refresh token
  if (!refresh) throw new Error('Not signed in to Google. Please connect your account in Settings.');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refresh,
      client_id: GOOGLE_CLIENT_ID,
      grant_type: 'refresh_token',
    }).toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    const errMsg = data?.error_description ?? data?.error ?? `HTTP ${res.status}`;
    throw new Error(`Token refresh failed: ${errMsg}`);
  }

  await Promise.all([
    SecureStore.setItemAsync(SECURE_STORE_KEYS.accessToken, data.access_token),
    SecureStore.setItemAsync(
      SECURE_STORE_KEYS.tokenExpiry,
      String(Date.now() + (data.expires_in ?? 3600) * 1000)
    ),
  ]);

  return data.access_token;
}

export async function signOut(): Promise<void> {
  await Promise.all(
    Object.values(SECURE_STORE_KEYS).map((k) => SecureStore.deleteItemAsync(k))
  );
}

export async function getSavedEmail(): Promise<string | null> {
  return SecureStore.getItemAsync(SECURE_STORE_KEYS.userEmail);
}

export async function isSignedIn(): Promise<boolean> {
  const token = await SecureStore.getItemAsync(SECURE_STORE_KEYS.accessToken);
  return !!token;
}

/**
 * Google OAuth2 — ADHD Command Center
 *
 * Uses expo-auth-session for the OAuth flow.
 * Tokens are stored in expo-secure-store (encrypted on device).
 *
 * SETUP REQUIRED:
 * 1. Go to https://console.cloud.google.com/
 * 2. Create a project → Enable Gmail API + Google Calendar API
 * 3. Create OAuth 2.0 credentials (iOS client ID)
 * 4. Add your bundle ID: com.curtisanderson.adhdcommandcenter
 * 5. Paste the client ID into GOOGLE_CLIENT_ID below
 */

import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

// ─── PASTE YOUR GOOGLE CLIENT ID HERE ────────────────────────────────────────
// iOS client ID from Google Cloud Console
export const GOOGLE_CLIENT_ID =
  '82226617367-kc7m6pnqrv29qjk0l0prn8jri4kuqo6g.apps.googleusercontent.com';
// ─────────────────────────────────────────────────────────────────────────────

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

const discovery = AuthSession.useAutoDiscovery
  ? undefined
  : {
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
    };

export function useGoogleAuth() {
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'adhdcommandcenter' });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      scopes: SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
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
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'adhdcommandcenter' });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  const data = await res.json();

  // Decode email from id_token
  const payload = JSON.parse(atob(data.id_token.split('.')[1]));

  await Promise.all([
    SecureStore.setItemAsync(SECURE_STORE_KEYS.accessToken, data.access_token),
    SecureStore.setItemAsync(SECURE_STORE_KEYS.refreshToken, data.refresh_token ?? ''),
    SecureStore.setItemAsync(
      SECURE_STORE_KEYS.tokenExpiry,
      String(Date.now() + data.expires_in * 1000)
    ),
    SecureStore.setItemAsync(SECURE_STORE_KEYS.userEmail, payload.email ?? ''),
  ]);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    email: payload.email,
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

  // Refresh
  if (!refresh) throw new Error('No refresh token — please sign in again.');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refresh,
      client_id: GOOGLE_CLIENT_ID,
      grant_type: 'refresh_token',
    }).toString(),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const data = await res.json();

  await Promise.all([
    SecureStore.setItemAsync(SECURE_STORE_KEYS.accessToken, data.access_token),
    SecureStore.setItemAsync(
      SECURE_STORE_KEYS.tokenExpiry,
      String(Date.now() + data.expires_in * 1000)
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

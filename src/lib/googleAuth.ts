/**
 * Browser-only Google sign-in using Google Identity Services' token client.
 *
 * - Read-only scope: the app can never change your sheet.
 * - The access token lives only in this module's memory (never localStorage)
 *   and expires after about an hour; the next Refresh asks Google again,
 *   which is usually a popup that closes by itself.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';
export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type: string; message?: string }) => void;
          }): TokenClient;
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

/** The OAuth client ID from .env (VITE_GOOGLE_CLIENT_ID), or null when Sheets isn't set up. */
export const googleClientId: string | null = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || null;

let scriptPromise: Promise<void> | null = null;

/**
 * Load the Google sign-in script. Call this early (on mount): the popup must
 * open soon after the click, and browsers block popups opened after a slow
 * network wait.
 */
export function preloadGoogleAuth(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Couldn’t load Google sign-in. Check your internet connection.'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

let cached: { token: string; expiresAt: number } | null = null;

/** A valid read-only access token, signing in (popup) if needed. */
export async function getAccessToken(clientId: string): Promise<string> {
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
  await preloadGoogleAuth();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SHEETS_SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) {
          reject(new Error(r.error_description || r.error || 'Google sign-in failed.'));
          return;
        }
        cached = { token: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 };
        resolve(r.access_token);
      },
      error_callback: (e) =>
        reject(
          new Error(
            e.type === 'popup_closed'
              ? 'Google sign-in was closed before it finished.'
              : e.type === 'popup_failed_to_open'
                ? 'The Google sign-in popup was blocked. Allow popups for this page and try again.'
                : e.message || 'Google sign-in failed.',
          ),
        ),
    });
    // prompt '' = only show the consent screen if it's actually needed.
    client.requestAccessToken({ prompt: '' });
  });
}

/** Forget the token (and tell Google to revoke it). */
export function signOutGoogle() {
  if (cached && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(cached.token);
  cached = null;
}

/** Called when the API says the token is no longer valid, so the next call signs in again. */
export function dropAccessToken() {
  cached = null;
}

'use client';

import liff from '@line/liff';

let initialized = false;

/**
 * Initialize LIFF with a given LIFF ID.
 *
 * The LIFF ID must be provided explicitly (fetched from the server via
 * `/api/system-settings/public` or similar). There is no env fallback —
 * the single central LIFF ID lives in `system_settings['davis_ai.liff_id']`.
 */
export async function initLiff(liffId: string): Promise<void> {
  if (initialized) return;

  if (!liffId) {
    console.error('[LIFF] LIFF ID not provided — configure it in ตั้งค่า → DAVIS Ai');
    return;
  }

  try {
    await liff.init({ liffId });
    initialized = true;
  } catch (error) {
    console.error('[LIFF] Initialization failed:', error);
    throw error;
  }
}

/**
 * Get the current user's LINE profile from LIFF.
 * Returns userId, displayName, and optional pictureUrl.
 * Throws if LIFF is not initialized or user is not logged in.
 */
export async function getLiffProfile(): Promise<{
  userId: string;
  displayName: string;
  pictureUrl?: string;
}> {
  if (!initialized) {
    throw new Error('[LIFF] Not initialized. Call initLiff() first.');
  }

  if (!liff.isLoggedIn()) {
    throw new Error('[LIFF] User is not logged in.');
  }

  const profile = await liff.getProfile();
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl,
  };
}

/**
 * Check whether the current page is running inside the LINE app (LIFF client).
 */
export function isInLiffClient(): boolean {
  return liff.isInClient();
}

/**
 * Close the LIFF window. Only works when running inside the LINE app.
 */
export function closeLiff(): void {
  if (liff.isInClient()) {
    liff.closeWindow();
  }
}

// ---------------------------------------------------------------------------
// Additional helpers (preserved for existing usage)
// ---------------------------------------------------------------------------

export function isLoggedIn(): boolean {
  return liff.isLoggedIn();
}

export function login(): void {
  liff.login();
}

export function logout(): void {
  liff.logout();
}

export async function getProfile() {
  if (!liff.isLoggedIn()) return null;
  return liff.getProfile();
}

export function getAccessToken(): string | null {
  return liff.getAccessToken();
}

/**
 * @deprecated Use isInLiffClient() instead.
 */
export function isInClient(): boolean {
  return liff.isInClient();
}

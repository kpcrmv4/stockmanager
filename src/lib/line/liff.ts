'use client';

import liff from '@line/liff';

let initialized = false;

/**
 * Initialize LIFF with a given LIFF ID.
 * If already initialized, this is a no-op.
 * Falls back to NEXT_PUBLIC_LIFF_ID env var if no liffId is provided.
 */
export async function initLiff(liffId?: string): Promise<void> {
  if (initialized) return;

  const id = liffId || process.env.NEXT_PUBLIC_LIFF_ID;
  if (!id) {
    console.error('[LIFF] LIFF ID not configured');
    return;
  }

  try {
    await liff.init({ liffId: id });
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

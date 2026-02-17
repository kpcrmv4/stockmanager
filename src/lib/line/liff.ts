'use client';

import liff from '@line/liff';

let initialized = false;

export async function initLiff(): Promise<void> {
  if (initialized) return;

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (!liffId) {
    console.error('LIFF ID not configured');
    return;
  }

  await liff.init({ liffId });
  initialized = true;
}

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

export function isInClient(): boolean {
  return liff.isInClient();
}

export function closeLiff(): void {
  if (liff.isInClient()) {
    liff.closeWindow();
  }
}

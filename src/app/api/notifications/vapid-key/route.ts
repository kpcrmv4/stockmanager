/**
 * VAPID Public Key API
 *
 * GET — Returns the VAPID public key for Web Push subscription.
 * This is a public endpoint (no auth required) since the client needs
 * this key to subscribe to push notifications.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  const publicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;

  if (!publicKey) {
    return NextResponse.json(
      { error: 'VAPID public key not configured' },
      { status: 500 },
    );
  }

  return NextResponse.json({ publicKey });
}

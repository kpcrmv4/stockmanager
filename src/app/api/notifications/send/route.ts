import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  notifyUser,
  notifyStoreStaff,
  notifyStoreOwners,
  checkStoreNotifEnabled,
  type NotificationType,
} from '@/lib/notifications/service';

/**
 * POST /api/notifications/send
 *
 * Server-side notification dispatcher. Called from client pages
 * after successful actions (deposit confirmed, stock explained, etc.)
 *
 * Body:
 * {
 *   action: 'notifyUser' | 'notifyStoreStaff' | 'notifyStoreOwners',
 *   params: { ... }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Verify the caller is authenticated
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, params } = body;

    if (!action || !params) {
      return NextResponse.json(
        { error: 'Missing action or params' },
        { status: 400 },
      );
    }

    // For customer-facing notifications, check store settings first
    if (action === 'notifyUser' && params.type) {
      const storeCheck = await checkStoreNotifEnabled(
        params.storeId,
        params.type as NotificationType,
      );
      if (!storeCheck.enabled) {
        return NextResponse.json({ status: 'skipped', reason: 'store_disabled' });
      }
    }

    switch (action) {
      case 'notifyUser':
        await notifyUser(params);
        break;
      case 'notifyStoreStaff':
        await notifyStoreStaff(params);
        break;
      case 'notifyStoreOwners':
        await notifyStoreOwners(params);
        break;
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('[API] /notifications/send error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

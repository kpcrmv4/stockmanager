/**
 * PWA Push Subscription API
 *
 * POST — Register (upsert) a push subscription for the current user
 * DELETE — Remove a push subscription by endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// POST — Subscribe
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate the user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request body
    const { subscription, device_name } = (await request.json()) as {
      subscription: PushSubscriptionJSON;
      device_name?: string;
    };

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json(
        { error: 'Invalid subscription: missing endpoint' },
        { status: 400 },
      );
    }

    // 3. Upsert into push_subscriptions
    //    On conflict (same user + same endpoint), update the subscription data
    const serviceClient = createServiceClient();

    // Check if a subscription with the same endpoint already exists for this user
    const { data: existing } = await serviceClient
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .filter('subscription->>endpoint', 'eq', subscription.endpoint)
      .single();

    if (existing) {
      // Update existing subscription
      const { error } = await serviceClient
        .from('push_subscriptions')
        .update({
          subscription,
          device_name: device_name || null,
          active: true,
        })
        .eq('id', existing.id);

      if (error) {
        console.error('[Subscribe] Failed to update subscription:', error.message);
        return NextResponse.json(
          { error: 'Failed to update subscription' },
          { status: 500 },
        );
      }
    } else {
      // Insert new subscription
      const { error } = await serviceClient
        .from('push_subscriptions')
        .insert({
          user_id: user.id,
          subscription,
          device_name: device_name || null,
          active: true,
        });

      if (error) {
        console.error('[Subscribe] Failed to insert subscription:', error.message);
        return NextResponse.json(
          { error: 'Failed to save subscription' },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Subscribe] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE — Unsubscribe
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  try {
    // 1. Authenticate the user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request body
    const { endpoint } = (await request.json()) as { endpoint: string };

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Missing endpoint' },
        { status: 400 },
      );
    }

    // 3. Delete from push_subscriptions
    const serviceClient = createServiceClient();

    const { error } = await serviceClient
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .filter('subscription->>endpoint', 'eq', endpoint);

    if (error) {
      console.error('[Subscribe] Failed to delete subscription:', error.message);
      return NextResponse.json(
        { error: 'Failed to delete subscription' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Subscribe] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

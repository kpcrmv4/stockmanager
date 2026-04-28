import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Routes that bypass the Supabase session check entirely.
//
// The customer LIFF flow has no Supabase session — customers authenticate
// client-side via LIFF SDK (LINE access token) or via an HMAC-signed token
// in the URL. Each customer API verifies that proof itself, so the
// middleware just needs to get out of the way. If we redirect them to
// /login, the LIFF page can't even fetch the central LIFF id.
const PUBLIC_ROUTES = [
  '/login',
  '/register',
  '/api/auth/register',
  '/api/auth/callback',
  '/api/auth/liff-verify',       // LIFF SDK access-token verify
  '/api/auth/customer-token',    // HMAC link verify
  '/api/line/webhook',
  '/api/cron',
  '/api/chat/bot-message',
  '/api/system-settings/public', // central bot/LIFF id (whitelisted keys only)
  '/api/public',                 // /api/public/store-lookup etc.
  '/api/customer',               // /api/customer/* — each route does its own auth
  '/customer',                   // LIFF customer page itself
];
const CUSTOMER_ROUTES = ['/customer'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  // Allow static files
  if (pathname.startsWith('/_next') || pathname.startsWith('/icons') || pathname === '/manifest.json' || pathname === '/sw.js') {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // No session → redirect to login
  if (!user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Read role from JWT app_metadata (fast, no DB query)
  // Falls back to profiles query only if app_metadata doesn't have role yet
  let role: string | null = (user.app_metadata?.role as string) || null;

  if (!role) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    role = profile.role;
  }

  // Customer can only access /customer routes
  if (role === 'customer' && !CUSTOMER_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.redirect(new URL('/customer', request.url));
  }

  // Non-customer cannot access /customer routes
  if (role !== 'customer' && CUSTOMER_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

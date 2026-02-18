import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerToken } from '@/lib/auth/customer-token';
import { createServiceClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const BUCKET = 'deposit-photos';

// ---------------------------------------------------------------------------
// POST /api/customer/upload-photo
// ---------------------------------------------------------------------------
// Accepts multipart/form-data with:
//   - file: the image file
//   - folder: optional subfolder (default: "customer-uploads")
//   - token: customer token (optional, can also be in Authorization header)
//   - accessToken: LINE access token (optional, can also be in Authorization header)
//
// Returns { url: string, path: string }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const folder = (formData.get('folder') as string) || 'customer-uploads';

  // -----------------------------------------------------------------------
  // Verify identity via token or accessToken
  // -----------------------------------------------------------------------
  const token =
    (formData.get('token') as string) ||
    request.headers.get('x-customer-token') ||
    null;
  const accessToken =
    (formData.get('accessToken') as string) ||
    request.headers.get('x-line-access-token') ||
    null;

  let lineUserId: string | null = null;

  if (token) {
    lineUserId = verifyCustomerToken(token);
  } else if (accessToken) {
    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (profileRes.ok) {
      const profile = (await profileRes.json()) as { userId: string };
      lineUserId = profile.userId;
    }
  }

  if (!lineUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // -----------------------------------------------------------------------
  // Validate file
  // -----------------------------------------------------------------------
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      {
        error: `Unsupported file type: ${file.type}. Allowed: ${ALLOWED_TYPES.join(', ')}`,
      },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Max ${MAX_FILE_SIZE / 1024 / 1024}MB` },
      { status: 400 },
    );
  }

  // -----------------------------------------------------------------------
  // Upload to Supabase Storage
  // -----------------------------------------------------------------------
  try {
    const supabase = createServiceClient();

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = file.type;
    let ext = file.type.split('/')[1] || 'jpg';
    if (ext === 'heic') ext = 'jpg';

    // Generate unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filePath = `${folder}/${timestamp}-${random}.${ext}`;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        contentType,
        cacheControl: '31536000', // 1 year cache
        upsert: false,
      });

    if (error) {
      console.error('[CustomerUpload] Supabase Storage error:', error);
      return NextResponse.json(
        { error: `Upload failed: ${error.message}` },
        { status: 500 },
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(data.path);

    return NextResponse.json({
      url: urlData.publicUrl,
      path: data.path,
    });
  } catch (error) {
    console.error('[CustomerUpload] Error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

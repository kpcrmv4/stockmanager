import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ROLE_PERMISSIONS } from '@/types/roles';
import type { Permission, UserRole } from '@/types/roles';
import { AUDIT_ACTIONS } from '@/lib/audit';

const ALL_PERMISSIONS: Permission[] = [
  'can_count_stock',
  'can_manage_deposit',
  'can_approve_deposit',
  'can_approve_stock',
  'can_manage_users',
  'can_view_reports',
  'can_manage_settings',
  'can_transfer',
  'can_view_own_deposits',
  'can_request_withdrawal',
  'can_borrow',
  'can_manage_commission',
];

async function assertOwner() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { error: 'Unauthorized', status: 401 as const };

  const { data: caller } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authUser.id)
    .single();

  if (!caller || caller.role !== 'owner') {
    return { error: 'Only owners can manage permissions', status: 403 as const };
  }
  return { callerId: authUser.id };
}

// GET /api/users/[id]/permissions
// คืน: profile, permission ที่ได้จาก role, permission ที่ให้รายบุคคล, และ permission ทั้งหมดในระบบ
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await assertOwner();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const service = createServiceClient();

  const [profileRes, permsRes] = await Promise.all([
    service
      .from('profiles')
      .select('id, username, display_name, role, active')
      .eq('id', id)
      .single(),
    service
      .from('user_permissions')
      .select('permission')
      .eq('user_id', id),
  ]);

  if (profileRes.error || !profileRes.data) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const role = profileRes.data.role as UserRole;
  const rolePerms = ROLE_PERMISSIONS[role];
  const rolePermList: Permission[] | '*' =
    (rolePerms as readonly string[]).includes('*')
      ? '*'
      : ([...(rolePerms as Permission[])] as Permission[]);

  const individual = (permsRes.data || []).map((p) => p.permission as Permission);

  return NextResponse.json({
    profile: profileRes.data,
    rolePermissions: rolePermList,
    individualPermissions: individual,
    allPermissions: ALL_PERMISSIONS,
  });
}

// PUT /api/users/[id]/permissions
// รับ: { permissions: Permission[] } — รายการสิทธิ์ที่ต้องการให้รายบุคคล (replace ทั้งหมด)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await assertOwner();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await req.json()) as { permissions?: string[] };
  const incoming = Array.isArray(body.permissions) ? body.permissions : [];

  // validate permissions
  const valid = incoming.filter((p): p is Permission =>
    (ALL_PERMISSIONS as readonly string[]).includes(p)
  );
  const deduped = Array.from(new Set(valid));

  const service = createServiceClient();

  // ตรวจว่า target user มีจริง
  const { data: targetProfile, error: profileErr } = await service
    .from('profiles')
    .select('id, role')
    .eq('id', id)
    .single();

  if (profileErr || !targetProfile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // ไม่ต้องจัดการสิทธิ์ให้ owner (มี wildcard อยู่แล้ว)
  if (targetProfile.role === 'owner') {
    return NextResponse.json(
      { error: 'Owner already has all permissions' },
      { status: 400 }
    );
  }

  // โหลดสิทธิ์ปัจจุบันเพื่อคำนวน diff
  const { data: existingRows } = await service
    .from('user_permissions')
    .select('permission')
    .eq('user_id', id);

  const existing = new Set<string>(
    (existingRows || []).map((r) => r.permission as string)
  );
  const desired = new Set<string>(deduped);

  const toAdd = [...desired].filter((p) => !existing.has(p));
  const toRemove = [...existing].filter((p) => !desired.has(p));

  // ลบที่ไม่ต้องการ
  if (toRemove.length > 0) {
    const { error: delErr } = await service
      .from('user_permissions')
      .delete()
      .eq('user_id', id)
      .in('permission', toRemove);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  }

  // เพิ่มที่ยังไม่มี
  if (toAdd.length > 0) {
    const { error: insErr } = await service.from('user_permissions').insert(
      toAdd.map((permission) => ({
        user_id: id,
        permission,
        granted_by: auth.callerId,
      }))
    );
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  // audit log (ไม่ throw ถ้า fail)
  if (toAdd.length > 0 || toRemove.length > 0) {
    try {
      await service.from('audit_logs').insert({
        action_type: AUDIT_ACTIONS.USER_UPDATED,
        table_name: 'user_permissions',
        record_id: id,
        old_value: { permissions: [...existing] },
        new_value: { permissions: [...desired], added: toAdd, removed: toRemove },
        changed_by: auth.callerId,
      });
    } catch {
      // ignore audit failure
    }
  }

  return NextResponse.json({
    success: true,
    permissions: [...desired],
    added: toAdd,
    removed: toRemove,
  });
}

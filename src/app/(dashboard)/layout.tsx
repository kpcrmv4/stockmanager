import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isDesktopRole } from '@/lib/auth/permissions';
import type { UserRole } from '@/types/roles';
import type { Store, UserPermission } from '@/types/database';
import type { Permission } from '@/types/roles';
import { DashboardLayoutClient } from './layout-client';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // ดึงข้อมูลผู้ใช้จาก Supabase Auth
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect('/login');
  }

  // ดึงโปรไฟล์ผู้ใช้
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .single();

  if (!profile || !profile.active) {
    redirect('/login');
  }

  // ดึงร้านที่ผู้ใช้สังกัด
  const { data: userStores } = await supabase
    .from('user_stores')
    .select('store_id')
    .eq('user_id', authUser.id);

  const storeIds = (userStores ?? []).map((us: { store_id: string }) => us.store_id);

  // ดึงข้อมูลร้านค้า
  let stores: Store[] = [];
  if (profile.role === 'owner' || profile.role === 'accountant') {
    // เจ้าของร้านและบัญชี เห็นทุกสาขา
    const { data } = await supabase
      .from('stores')
      .select('*')
      .eq('active', true)
      .order('store_name');
    stores = data ?? [];
  } else if (storeIds.length > 0) {
    const { data } = await supabase
      .from('stores')
      .select('*')
      .in('id', storeIds)
      .eq('active', true)
      .order('store_name');
    stores = data ?? [];
  }

  // ดึง permissions พิเศษ
  const { data: extraPermissions } = await supabase
    .from('user_permissions')
    .select('permission')
    .eq('user_id', authUser.id);

  const permissions = (extraPermissions ?? []).map(
    (p: Pick<UserPermission, 'permission'>) => p.permission as Permission
  );

  // สร้าง AuthUser object สำหรับส่งไป client
  const serializedUser = {
    id: authUser.id,
    username: profile.username,
    role: profile.role as UserRole,
    permissions,
    storeIds,
    lineUserId: profile.line_user_id,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
  };

  const useDesktop = isDesktopRole(profile.role as UserRole);

  return (
    <DashboardLayoutClient
      user={serializedUser}
      stores={stores}
      useDesktop={useDesktop}
    >
      {children}
    </DashboardLayoutClient>
  );
}

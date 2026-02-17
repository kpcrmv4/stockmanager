'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import type { AuthUser } from '@/lib/auth/permissions';
import type { Permission } from '@/types/roles';

export function useAuth() {
  const { user, isLoading, setUser, setLoading, logout } = useAuthStore();

  useEffect(() => {
    const supabase = createClient();

    async function loadUser() {
      setLoading(true);
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (!authUser) {
        setUser(null);
        return;
      }

      const [profileRes, permissionsRes, storesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', authUser.id).single(),
        supabase.from('user_permissions').select('permission').eq('user_id', authUser.id),
        supabase.from('user_stores').select('store_id').eq('user_id', authUser.id),
      ]);

      if (!profileRes.data) {
        setUser(null);
        return;
      }

      const appUser: AuthUser = {
        id: profileRes.data.id,
        username: profileRes.data.username,
        role: profileRes.data.role,
        permissions: (permissionsRes.data || []).map((p) => p.permission as Permission),
        storeIds: (storesRes.data || []).map((s) => s.store_id),
        lineUserId: profileRes.data.line_user_id,
        displayName: profileRes.data.display_name,
        avatarUrl: profileRes.data.avatar_url,
      };

      setUser(appUser);
    }

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [setUser, setLoading]);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    logout();
  };

  return { user, isLoading, signOut };
}

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ROLE_HOME_ROUTES } from '@/types/roles';
import type { UserRole } from '@/types/roles';

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = profile?.role as UserRole | undefined;
  const home = role && ROLE_HOME_ROUTES[role] ? ROLE_HOME_ROUTES[role] : '/overview';
  redirect(home);
}

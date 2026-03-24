import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function PrintStationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/print-station');
  }

  // Verify user is active
  const { data: profile } = await supabase
    .from('profiles')
    .select('active, role')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.active) {
    redirect('/login');
  }

  // Customers should not access print station
  if (profile.role === 'customer') {
    redirect('/customer');
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {children}
    </div>
  );
}

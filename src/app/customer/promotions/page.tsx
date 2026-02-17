'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatThaiDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { Megaphone, Tag, Calendar, Loader2 } from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  type: string;
  start_date: string;
  end_date: string | null;
  store?: { store_name: string };
}

const typeConfig: Record<string, { label: string; color: string }> = {
  promotion: { label: 'โปรโมชั่น', color: 'bg-green-50 text-green-700' },
  announcement: { label: 'ประกาศ', color: 'bg-blue-50 text-blue-700' },
  event: { label: 'กิจกรรม', color: 'bg-amber-50 text-amber-700' },
};

export default function CustomerPromotionsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const loadAnnouncements = async () => {
    setIsLoading(true);
    const supabase = createClient();
    const now = new Date().toISOString();

    const { data } = await supabase
      .from('announcements')
      .select('*, store:stores(store_name)')
      .eq('active', true)
      .in('target_audience', ['customer', 'all'])
      .lte('start_date', now)
      .or(`end_date.is.null,end_date.gte.${now}`)
      .order('created_at', { ascending: false });

    if (data) setAnnouncements(data as unknown as Announcement[]);
    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#06C755]" />
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <h2 className="text-lg font-bold text-gray-900">โปรโมชั่น</h2>
      <p className="mt-0.5 text-sm text-gray-500">โปรโมชั่นและประกาศจากร้านค้า</p>

      {announcements.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-2 text-gray-400">
          <Megaphone className="h-12 w-12" />
          <p className="text-sm">ไม่มีโปรโมชั่นในขณะนี้</p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {announcements.map((item) => {
            const config = typeConfig[item.type] || typeConfig.announcement;

            return (
              <div key={item.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                {item.image_url && (
                  <div className="aspect-[2/1] w-full overflow-hidden bg-gray-100">
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-gray-900">{item.title}</h3>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', config.color)}>
                      {config.label}
                    </span>
                  </div>
                  {item.body && (
                    <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">{item.body}</p>
                  )}
                  <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
                    {item.store && (
                      <span className="flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        {item.store.store_name}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatThaiDate(item.start_date)}
                      {item.end_date && ` - ${formatThaiDate(item.end_date)}`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

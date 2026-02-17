'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { useAppStore } from '@/stores/app-store';
import {
  Button,
  Badge,
  Card,
  Tabs,
  EmptyState,
  toast,
} from '@/components/ui';
import { formatThaiDate } from '@/lib/utils/format';
import {
  Megaphone,
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Bell,
  Tag,
  Calendar,
} from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  type: string;
  target_audience: string;
  start_date: string;
  end_date: string | null;
  send_push: boolean;
  push_sent_at: string | null;
  active: boolean;
  created_at: string;
  store?: { store_name: string } | null;
}

const typeConfig: Record<string, { label: string; variant: 'success' | 'info' | 'warning' }> = {
  promotion: { label: 'โปรโมชั่น', variant: 'success' },
  announcement: { label: 'ประกาศ', variant: 'info' },
  event: { label: 'กิจกรรม', variant: 'warning' },
};

const tabs = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'active', label: 'กำลังแสดง' },
  { id: 'inactive', label: 'ปิดแสดง' },
];

export default function AnnouncementsPage() {
  const router = useRouter();
  const { currentStoreId } = useAppStore();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  const loadAnnouncements = useCallback(async () => {
    setIsLoading(true);
    const supabase = createClient();

    let query = supabase
      .from('announcements')
      .select('*, store:stores(store_name)')
      .order('created_at', { ascending: false });

    if (currentStoreId) {
      query = query.or(`store_id.eq.${currentStoreId},store_id.is.null`);
    }

    if (activeTab === 'active') {
      query = query.eq('active', true);
    } else if (activeTab === 'inactive') {
      query = query.eq('active', false);
    }

    const { data } = await query;
    if (data) setAnnouncements(data as unknown as Announcement[]);
    setIsLoading(false);
  }, [currentStoreId, activeTab]);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  const toggleActive = async (id: string, currentActive: boolean) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('announcements')
      .update({ active: !currentActive })
      .eq('id', id);

    if (!error) {
      toast({ type: 'success', title: currentActive ? 'ปิดแสดงประกาศ' : 'เปิดแสดงประกาศ' });
      loadAnnouncements();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('ต้องการลบประกาศนี้?')) return;
    const supabase = createClient();
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (!error) {
      toast({ type: 'success', title: 'ลบประกาศสำเร็จ' });
      loadAnnouncements();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ประกาศ/โปรโมชั่น</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            จัดการประกาศและโปรโมชั่นสำหรับลูกค้า
          </p>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => router.push('/announcements/new')}>
          สร้างประกาศ
        </Button>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
        </div>
      ) : announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="ไม่มีประกาศ"
          description="สร้างประกาศหรือโปรโมชั่นเพื่อส่งถึงลูกค้า"
          action={
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => router.push('/announcements/new')}>
              สร้างประกาศ
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {announcements.map((item) => {
            const config = typeConfig[item.type] || typeConfig.announcement;

            return (
              <Card key={item.id} padding="none">
                <div className="flex flex-col sm:flex-row">
                  {item.image_url && (
                    <div className="h-32 w-full overflow-hidden sm:h-auto sm:w-48">
                      <img
                        src={item.image_url}
                        alt={item.title}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {item.title}
                          </h3>
                          <Badge variant={config.variant}>{config.label}</Badge>
                          {!item.active && <Badge variant="default">ปิดแสดง</Badge>}
                          {item.send_push && item.push_sent_at && (
                            <Badge variant="info">
                              <Bell className="mr-1 h-3 w-3" />
                              ส่ง Push แล้ว
                            </Badge>
                          )}
                        </div>
                        {item.body && (
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                            {item.body}
                          </p>
                        )}
                        <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                          {item.store ? (
                            <span className="flex items-center gap-1">
                              <Tag className="h-3 w-3" />
                              {item.store.store_name}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Tag className="h-3 w-3" />
                              ทุกสาขา
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatThaiDate(item.start_date)}
                            {item.end_date && ` - ${formatThaiDate(item.end_date)}`}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleActive(item.id, item.active)}
                          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                          title={item.active ? 'ปิดแสดง' : 'เปิดแสดง'}
                        >
                          {item.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => router.push(`/announcements/${item.id}`)}
                          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                          title="แก้ไข"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                          title="ลบ"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

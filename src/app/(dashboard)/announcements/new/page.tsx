'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import {
  Button,
  Input,
  Textarea,
  Select,
  Card,
  CardHeader,
  CardContent,
  toast,
} from '@/components/ui';
import { ArrowLeft, Megaphone, Upload, Bell } from 'lucide-react';
import { todayBangkok, toBangkokISO } from '@/lib/utils/date';

interface StoreOption {
  id: string;
  store_name: string;
}

export default function NewAnnouncementPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('promotion');
  const [targetAudience, setTargetAudience] = useState('customer');
  const [storeId, setStoreId] = useState('');
  const [startDate, setStartDate] = useState(todayBangkok());
  const [endDate, setEndDate] = useState('');
  const [sendPush, setSendPush] = useState(false);

  useEffect(() => {
    loadStores();
  }, []);

  const loadStores = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('stores')
      .select('id, store_name')
      .eq('active', true)
      .order('store_name');
    if (data) setStores(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !user) return;

    setIsSubmitting(true);
    const supabase = createClient();

    const { error } = await supabase.from('announcements').insert({
      store_id: storeId || null,
      title: title.trim(),
      body: body.trim() || null,
      type,
      target_audience: targetAudience,
      start_date: toBangkokISO(new Date(startDate + 'T00:00:00+07:00')),
      end_date: endDate ? toBangkokISO(new Date(endDate + 'T23:59:59+07:00')) : null,
      send_push: sendPush,
      active: true,
      created_by: user.id,
    });

    if (error) {
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถสร้างประกาศได้' });
    } else {
      toast({ type: 'success', title: 'สร้างประกาศสำเร็จ' });
      router.push('/announcements');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
      >
        <ArrowLeft className="h-4 w-4" />
        กลับ
      </button>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">สร้างประกาศใหม่</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          สร้างประกาศหรือโปรโมชั่นเพื่อส่งถึงลูกค้า
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card padding="none">
          <CardHeader title="รายละเอียดประกาศ" />
          <CardContent className="space-y-4">
            <Input
              label="หัวข้อ"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น โปรโมชั่นต้อนรับปีใหม่"
              required
            />

            <Textarea
              label="เนื้อหา"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="รายละเอียดประกาศ..."
              rows={4}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="ประเภท"
                value={type}
                onChange={(e) => setType(e.target.value)}
                options={[
                  { value: 'promotion', label: 'โปรโมชั่น' },
                  { value: 'announcement', label: 'ประกาศ' },
                  { value: 'event', label: 'กิจกรรม' },
                ]}
              />
              <Select
                label="กลุ่มเป้าหมาย"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                options={[
                  { value: 'customer', label: 'ลูกค้า' },
                  { value: 'staff', label: 'พนักงาน' },
                  { value: 'all', label: 'ทั้งหมด' },
                ]}
              />
            </div>

            <Select
              label="สาขา"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              options={[
                { value: '', label: 'ทุกสาขา' },
                ...stores.map((s) => ({ value: s.id, label: s.store_name })),
              ]}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="วันเริ่มแสดง"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
              <Input
                label="วันหยุดแสดง (ไม่บังคับ)"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                hint="ปล่อยว่างหากไม่มีวันหมดอายุ"
              />
            </div>

            {/* Image Upload Placeholder */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                รูปภาพ (ไม่บังคับ)
              </label>
              <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800">
                <div className="flex flex-col items-center gap-1 text-gray-400">
                  <Upload className="h-6 w-6" />
                  <p className="text-xs">อัปโหลดรูปภาพ</p>
                  <p className="text-[10px]">PNG, JPG ไม่เกิน 5MB</p>
                </div>
              </div>
            </div>

            {/* Send Push */}
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-indigo-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    ส่ง Push Notification ทันที
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    ส่งแจ้งเตือนไปยังลูกค้าที่เปิดรับ
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSendPush(!sendPush)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  sendPush ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    sendPush ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="outline" type="button" onClick={() => router.back()}>
            ยกเลิก
          </Button>
          <Button
            type="submit"
            isLoading={isSubmitting}
            disabled={!title.trim()}
            icon={<Megaphone className="h-4 w-4" />}
          >
            เผยแพร่
          </Button>
        </div>
      </form>
    </div>
  );
}

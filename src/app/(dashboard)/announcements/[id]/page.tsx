'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
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
import {
  ArrowLeft,
  Save,
  Trash2,
  Loader2,
  Image,
  Send,
  Calendar,
  Bell,
  Upload,
} from 'lucide-react';
import { toBangkokISO } from '@/lib/utils/date';

interface StoreOption {
  id: string;
  store_name: string;
}

export default function EditAnnouncementPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuthStore();

  const [stores, setStores] = useState<StoreOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('promotion');
  const [targetAudience, setTargetAudience] = useState('customer');
  const [storeId, setStoreId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sendPush, setSendPush] = useState(false);
  const [active, setActive] = useState(true);

  const loadStores = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('stores')
      .select('id, store_name')
      .eq('active', true)
      .order('store_name');
    if (data) setStores(data);
  }, []);

  const loadAnnouncement = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      toast({ type: 'error', title: 'ไม่พบประกาศ', message: 'ไม่สามารถโหลดข้อมูลประกาศได้' });
      router.push('/announcements');
      return;
    }

    setTitle(data.title || '');
    setBody(data.body || '');
    setType(data.type || 'promotion');
    setTargetAudience(data.target_audience || 'customer');
    setStoreId(data.store_id || '');
    setStartDate(data.start_date ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date(data.start_date)) : '');
    setEndDate(data.end_date ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date(data.end_date)) : '');
    setImageUrl(data.image_url || '');
    setSendPush(data.send_push || false);
    setActive(data.active ?? true);
    setIsLoading(false);
  }, [id, router]);

  useEffect(() => {
    loadStores();
    loadAnnouncement();
  }, [loadStores, loadAnnouncement]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !user) return;

    setIsSaving(true);
    const supabase = createClient();

    const { error } = await supabase
      .from('announcements')
      .update({
        title: title.trim(),
        body: body.trim() || null,
        type,
        target_audience: targetAudience,
        store_id: storeId || null,
        start_date: startDate ? toBangkokISO(new Date(startDate + 'T00:00:00+07:00')) : toBangkokISO(),
        end_date: endDate ? toBangkokISO(new Date(endDate + 'T23:59:59+07:00')) : null,
        image_url: imageUrl.trim() || null,
        send_push: sendPush,
        active,
      })
      .eq('id', id);

    if (error) {
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถบันทึกประกาศได้' });
    } else {
      toast({ type: 'success', title: 'บันทึกสำเร็จ', message: 'อัปเดตประกาศเรียบร้อยแล้ว' });
      router.push('/announcements');
    }
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm('ต้องการลบประกาศนี้หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้')) return;

    setIsDeleting(true);
    const supabase = createClient();

    const { error } = await supabase.from('announcements').delete().eq('id', id);

    if (error) {
      toast({ type: 'error', title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถลบประกาศได้' });
    } else {
      toast({ type: 'success', title: 'ลบสำเร็จ', message: 'ลบประกาศเรียบร้อยแล้ว' });
      router.push('/announcements');
    }
    setIsDeleting(false);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
        >
          <ArrowLeft className="h-4 w-4" />
          กลับ
        </button>
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">กำลังโหลดข้อมูลประกาศ...</p>
        </div>
      </div>
    );
  }

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

      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">แก้ไขประกาศ</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            แก้ไขรายละเอียดประกาศหรือโปรโมชั่น
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">สถานะ:</span>
          <button
            type="button"
            onClick={() => setActive(!active)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              active ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                active ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <span className={`text-sm font-medium ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`}>
            {active ? 'เปิดแสดง' : 'ปิดแสดง'}
          </span>
        </div>
      </div>

      <form onSubmit={handleSave}>
        {/* Announcement Details */}
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
                label="วันที่เริ่มแสดง"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                leftIcon={<Calendar className="h-4 w-4" />}
                required
              />
              <Input
                label="วันที่หยุดแสดง (ไม่บังคับ)"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                leftIcon={<Calendar className="h-4 w-4" />}
                hint="ปล่อยว่างหากไม่มีวันหมดอายุ"
              />
            </div>

            {/* Image Upload Placeholder */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                รูปภาพ (ไม่บังคับ)
              </label>
              {imageUrl ? (
                <div className="relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                  <img
                    src={imageUrl}
                    alt="รูปประกาศ"
                    className="h-40 w-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-white"
                    >
                      ลบรูปภาพ
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800">
                  <div className="flex flex-col items-center gap-1 text-gray-400">
                    <Image className="h-6 w-6" />
                    <p className="text-xs">อัปโหลดรูปภาพ</p>
                    <p className="text-[10px]">PNG, JPG ไม่เกิน 5MB</p>
                  </div>
                </div>
              )}
            </div>

            {/* Send Push Notification */}
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-indigo-500" />
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

        {/* Actions */}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="danger"
            onClick={handleDelete}
            isLoading={isDeleting}
            icon={<Trash2 className="h-4 w-4" />}
          >
            ลบประกาศ
          </Button>

          <div className="flex items-center gap-3">
            <Button variant="outline" type="button" onClick={() => router.back()}>
              ยกเลิก
            </Button>
            <Button
              type="submit"
              isLoading={isSaving}
              disabled={!title.trim()}
              icon={<Save className="h-4 w-4" />}
            >
              บันทึก
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

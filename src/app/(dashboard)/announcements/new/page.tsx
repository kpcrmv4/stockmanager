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
  PhotoUpload,
  toast,
} from '@/components/ui';
import { ArrowLeft, Megaphone, Bell } from 'lucide-react';
import { todayBangkok, toBangkokISO } from '@/lib/utils/date';
import { useTranslations } from 'next-intl';

interface StoreOption {
  id: string;
  store_name: string;
}

export default function NewAnnouncementPage() {
  const t = useTranslations('announcements');
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
  const [imageUrl, setImageUrl] = useState<string | null>(null);
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
      image_url: imageUrl || null,
      send_push: sendPush,
      active: true,
      created_by: user.id,
    });

    if (error) {
      toast({ type: 'error', title: t('createError'), message: t('createErrorMsg') });
    } else {
      toast({ type: 'success', title: t('createSuccess') });
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
        {t('back')}
      </button>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('newTitle')}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('newSubtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card padding="none">
          <CardHeader title={t('detailsSection')} />
          <CardContent className="space-y-4">
            <Input
              label={t('fieldTitle')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('fieldTitlePlaceholder')}
              required
            />

            <Textarea
              label={t('fieldBody')}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('fieldBodyPlaceholder')}
              rows={4}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label={t('fieldType')}
                value={type}
                onChange={(e) => setType(e.target.value)}
                options={[
                  { value: 'promotion', label: t('typePromotion') },
                  { value: 'announcement', label: t('typeAnnouncement') },
                  { value: 'event', label: t('typeEvent') },
                ]}
              />
              <Select
                label={t('fieldTargetAudience')}
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                options={[
                  { value: 'customer', label: t('targetCustomer') },
                  { value: 'staff', label: t('targetStaff') },
                  { value: 'all', label: t('targetAll') },
                ]}
              />
            </div>

            <Select
              label={t('fieldBranch')}
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              options={[
                { value: '', label: t('allBranches') },
                ...stores.map((s) => ({ value: s.id, label: s.store_name })),
              ]}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label={t('fieldStartDate')}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
              <Input
                label={t('fieldEndDate')}
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                hint={t('fieldEndDateHint')}
              />
            </div>

            {/* Image Upload */}
            <PhotoUpload
              value={imageUrl}
              onChange={setImageUrl}
              folder="announcements"
              label={t('fieldImage')}
              placeholder={t('fieldImagePlaceholder')}
              maxSizeMB={5}
            />

            {/* Send Push */}
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-indigo-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {t('sendPushNow')}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('sendPushDesc')}
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
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            isLoading={isSubmitting}
            disabled={!title.trim()}
            icon={<Megaphone className="h-4 w-4" />}
          >
            {t('publish')}
          </Button>
        </div>
      </form>
    </div>
  );
}

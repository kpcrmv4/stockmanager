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
  PhotoUpload,
  toast,
} from '@/components/ui';
import {
  ArrowLeft,
  Save,
  Trash2,
  Loader2,
  Send,
  Calendar,
  Bell,
} from 'lucide-react';
import { toBangkokISO } from '@/lib/utils/date';
import { useTranslations } from 'next-intl';

interface StoreOption {
  id: string;
  store_name: string;
}

export default function EditAnnouncementPage() {
  const t = useTranslations('announcements');
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
      toast({ type: 'error', title: t('notFound'), message: t('notFoundMsg') });
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
      toast({ type: 'error', title: t('saveError'), message: t('saveErrorMsg') });
    } else {
      toast({ type: 'success', title: t('saveSuccess'), message: t('saveSuccessMsg') });
      router.push('/announcements');
    }
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm(t('confirmDeleteFull'))) return;

    setIsDeleting(true);
    const supabase = createClient();

    const { error } = await supabase.from('announcements').delete().eq('id', id);

    if (error) {
      toast({ type: 'error', title: t('deleteError'), message: t('deleteErrorMsg') });
    } else {
      toast({ type: 'success', title: t('deleteSuccessFull'), message: t('deleteSuccessMsg') });
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
          {t('back')}
        </button>
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{t('loadingAnnouncement')}</p>
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
        {t('back')}
      </button>

      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('editTitle')}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('editSubtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">{t('statusLabel')}</span>
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
            {active ? t('showToggle') : t('hideToggle')}
          </span>
        </div>
      </div>

      <form onSubmit={handleSave}>
        {/* Announcement Details */}
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
                label={t('fieldStartDateEdit')}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                leftIcon={<Calendar className="h-4 w-4" />}
                required
              />
              <Input
                label={t('fieldEndDateEdit')}
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                leftIcon={<Calendar className="h-4 w-4" />}
                hint={t('fieldEndDateHint')}
              />
            </div>

            {/* Image Upload */}
            <PhotoUpload
              value={imageUrl || null}
              onChange={(url) => setImageUrl(url || '')}
              folder="announcements"
              label={t('fieldImage')}
              placeholder={t('fieldImagePlaceholder')}
              maxSizeMB={5}
            />

            {/* Send Push Notification */}
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-indigo-500" />
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

        {/* Actions */}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="danger"
            onClick={handleDelete}
            isLoading={isDeleting}
            icon={<Trash2 className="h-4 w-4" />}
          >
            {t('deleteButton')}
          </Button>

          <div className="flex items-center gap-3">
            <Button variant="outline" type="button" onClick={() => router.back()}>
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              isLoading={isSaving}
              disabled={!title.trim()}
              icon={<Save className="h-4 w-4" />}
            >
              {t('save')}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

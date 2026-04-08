'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';
import { useCustomerAuth } from '../_components/customer-provider';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

function DepositContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { lineUserId, displayName, mode, isLoading: authLoading, error: authError } = useCustomerAuth();
  const t = useTranslations('customer.deposit');

  const storeId = searchParams.get('storeId');
  const token = searchParams.get('token');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Track whether auto-fill already happened to avoid overwriting user input
  const didAutoFill = useRef(false);

  // Cleanup object URL on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview);
      }
    };
    // intentionally only on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-fill from LINE profile
  useEffect(() => {
    if (displayName && !didAutoFill.current) {
      setCustomerName((prev) => prev || displayName);
    }
  }, [displayName]);

  // Auto-fill from previous deposits
  useEffect(() => {
    if (authLoading || didAutoFill.current) return;

    const controller = new AbortController();

    async function fetchPreviousDeposits() {
      try {
        const accessToken = typeof window !== 'undefined'
          ? sessionStorage.getItem('liff_access_token')
          : null;

        let res: Response;

        if (token) {
          res = await fetch(
            `/api/customer/deposits?token=${encodeURIComponent(token)}`,
            { signal: controller.signal },
          );
        } else if (accessToken) {
          res = await fetch('/api/customer/deposits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken }),
            signal: controller.signal,
          });
        } else {
          return;
        }

        if (!res.ok) return;

        const data = await res.json();
        const deposits = data.deposits || data;

        if (Array.isArray(deposits) && deposits.length > 0) {
          const latest = deposits[0];
          didAutoFill.current = true;
          if (latest.customer_name) {
            setCustomerName((prev) => prev || latest.customer_name);
          }
          if (latest.customer_phone) {
            setCustomerPhone((prev) => prev || latest.customer_phone);
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        // silently ignore — auto-fill is best-effort
      }
    }

    fetchPreviousDeposits();
    return () => controller.abort();
  }, [authLoading, token, mode]);

  function getAuthParams(): { token?: string; accessToken?: string } {
    if (token) return { token };
    const accessToken = typeof window !== 'undefined'
      ? sessionStorage.getItem('liff_access_token')
      : null;
    if (accessToken) return { accessToken };
    return {};
  }

  const handlePhotoSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!ACCEPTED_TYPES.includes(file.type) && !file.name.toLowerCase().endsWith('.heic')) {
      setError(t('errorFileType'));
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setError(t('errorFileSize'));
      return;
    }

    setError(null);

    // Revoke old preview URL before creating new one
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });

    // Upload
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const authParams = getAuthParams();
      if (authParams.token) {
        formData.append('token', authParams.token);
      } else if (authParams.accessToken) {
        formData.append('accessToken', authParams.accessToken);
      }

      const res = await fetch('/api/customer/upload-photo', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Upload failed');
      }

      const data = await res.json();
      setPhotoUrl(data.url);
    } catch {
      setError(t('errorUpload'));
      setPhotoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPhotoUrl(null);
    } finally {
      setIsUploading(false);
    }

    // Reset input so same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [token, t]);

  const removePhoto = useCallback(() => {
    setPhotoUrl(null);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!customerName.trim()) {
      setError(t('errorNameRequired'));
      return;
    }

    if (!customerPhone.trim()) {
      setError(t('errorPhoneRequired'));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const authParams = getAuthParams();

      const body: Record<string, string | null | undefined> = {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        tableNumber: tableNumber.trim() || null,
        notes: notes.trim() || null,
        customerPhotoUrl: photoUrl,
        storeId: storeId || undefined,
        ...authParams,
      };

      const res = await fetch('/api/customer/deposit-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Request failed');
      }

      setSuccess(true);
    } catch {
      setError(t('errorSubmit'));
    } finally {
      setIsSubmitting(false);
    }
  }

  // Loading state
  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#06C755]" />
      </div>
    );
  }

  // Auth error
  if (authError) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-sm text-gray-600">{authError}</p>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-8 w-8 text-[#06C755]" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">
          {t('successTitle')}
        </h2>
        <p className="text-sm text-gray-500">{t('successSubtitle')}</p>
        <button
          onClick={() => router.push('/customer')}
          className="mt-2 rounded-full bg-[#06C755] px-8 py-2.5 text-sm font-semibold text-white active:bg-[#05a849]"
        >
          {t('goHome')}
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="mb-4 flex items-center gap-1 text-sm text-gray-500"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('back')}
      </button>

      <h2 className="text-lg font-bold text-gray-900">{t('title')}</h2>
      <p className="mt-0.5 text-sm text-gray-500">
        {t('subtitle')}
      </p>

      {/* Error */}
      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {/* Customer name */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            {t('customerName')} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder={t('customerNamePlaceholder')}
            required
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            {t('phone')} <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder={t('phonePlaceholder')}
            required
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20"
          />
        </div>

        {/* Table number */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            {t('tableNumber')}
          </label>
          <input
            type="text"
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            placeholder={t('tablePlaceholder')}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20"
          />
        </div>

        {/* Photo upload */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            {t('photo')}
          </label>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoSelect}
            className="hidden"
          />

          {photoPreview ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreview}
                alt={t('photoAlt')}
                className="h-48 w-full rounded-xl border border-gray-200 object-cover"
              />
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                </div>
              )}
              {!isUploading && (
                <button
                  type="button"
                  onClick={removePhoto}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white active:bg-black/70"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {photoUrl && !isUploading && (
                <div className="absolute bottom-2 left-2 rounded-full bg-green-500 px-2 py-0.5 text-xs font-medium text-white">
                  {t('uploaded')}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-8 text-gray-400 transition-colors active:border-[#06C755] active:text-[#06C755]"
            >
              <Camera className="h-8 w-8" />
              <span className="text-sm">{t('takePhoto')}</span>
              <span className="text-xs text-gray-300">
                {t('photoFormats')}
              </span>
            </button>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            {t('notes')}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('notesPlaceholder')}
            rows={3}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting || isUploading || !customerName.trim() || !customerPhone.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-[#06C755] py-3 text-sm font-semibold text-white disabled:opacity-60 active:bg-[#05a849]"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
          {isSubmitting ? t('submitting') : t('submit')}
        </button>
      </form>
    </div>
  );
}

export default function CustomerDepositPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#06C755]" />
        </div>
      }
    >
      <DepositContent />
    </Suspense>
  );
}

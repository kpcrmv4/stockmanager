'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Camera,
  CheckCircle2,
  Loader2,
  AlertCircle,
  X,
  Send,
} from 'lucide-react';
import { useCustomerAuth } from './customer-provider';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

interface DepositViewProps {
  onSuccess?: () => void;
}

export function DepositView({ onSuccess }: DepositViewProps) {
  const searchParams = useSearchParams();
  const { displayName, mode, isLoading: authLoading, store } = useCustomerAuth();
  const t = useTranslations('customer.deposit');

  const storeId = store.id || searchParams.get('storeId');
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

  const didAutoFill = useRef(false);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (displayName && !didAutoFill.current) {
      setCustomerName((prev) => prev || displayName);
    }
  }, [displayName]);

  useEffect(() => {
    if (authLoading || didAutoFill.current) return;
    const controller = new AbortController();

    async function fetchPreviousDeposits() {
      try {
        const accessToken =
          typeof window !== 'undefined'
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
      }
    }

    fetchPreviousDeposits();
    return () => controller.abort();
  }, [authLoading, token, mode]);

  function getAuthParams(): { token?: string; accessToken?: string } {
    if (token) return { token };
    const accessToken =
      typeof window !== 'undefined'
        ? sessionStorage.getItem('liff_access_token')
        : null;
    if (accessToken) return { accessToken };
    return {};
  }

  const handlePhotoSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (
        !ACCEPTED_TYPES.includes(file.type) &&
        !file.name.toLowerCase().endsWith('.heic')
      ) {
        setError(t('errorFileType'));
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setError(t('errorFileSize'));
        return;
      }

      setError(null);
      setPhotoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });

      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);

        const authParams = getAuthParams();
        if (authParams.token) formData.append('token', authParams.token);
        else if (authParams.accessToken)
          formData.append('accessToken', authParams.accessToken);

        const res = await fetch('/api/customer/upload-photo', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) throw new Error('Upload failed');
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

      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [token, t],
  );

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

  function resetForm() {
    setCustomerName(displayName || '');
    setCustomerPhone('');
    setTableNumber('');
    setNotes('');
    setPhotoUrl(null);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setError(null);
    setSuccess(false);
  }

  if (success) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(248,215,148,0.18)]">
          <CheckCircle2 className="h-7 w-7 text-[#F8D794]" />
        </div>
        <h2 className="text-base font-bold text-[#F8D794]">
          {t('successTitle')}
        </h2>
        <p className="text-xs text-[rgba(248,215,148,0.6)]">
          {t('successSubtitle')}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={resetForm}
            className="customer-btn-withdraw !w-auto px-5"
          >
            {t('submit')}
          </button>
          {onSuccess && (
            <button
              type="button"
              onClick={onSuccess}
              className="rounded-xl border border-[rgba(248,215,148,0.3)] px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[#F8D794]"
            >
              {t('goHome')}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-3 pb-6">
      <div className="mb-3">
        <h2 className="text-base font-bold text-[#F8D794]">{t('title')}</h2>
        <p className="mt-0.5 text-[11px] text-[rgba(248,215,148,0.6)]">
          {t('subtitle')}
        </p>
      </div>

      {error && (
        <div className="customer-error-banner mb-3">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="customer-field-label">
            {t('customerName')}
            <span className="customer-field-required">*</span>
          </label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder={t('customerNamePlaceholder')}
            required
            className="customer-input"
          />
        </div>

        <div>
          <label className="customer-field-label">
            {t('phone')}
            <span className="customer-field-required">*</span>
          </label>
          <input
            type="tel"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder={t('phonePlaceholder')}
            required
            className="customer-input"
          />
        </div>

        <div>
          <label className="customer-field-label">{t('tableNumber')}</label>
          <input
            type="text"
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            placeholder={t('tablePlaceholder')}
            className="customer-input"
          />
        </div>

        <div>
          <label className="customer-field-label">{t('photo')}</label>
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
                className="h-44 w-full rounded-xl border border-[rgba(248,215,148,0.2)] object-cover"
              />
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50">
                  <Loader2 className="h-7 w-7 animate-spin text-[#F8D794]" />
                </div>
              )}
              {!isUploading && (
                <button
                  type="button"
                  onClick={removePhoto}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
                  aria-label="remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {photoUrl && !isUploading && (
                <div className="absolute bottom-2 left-2 rounded-full bg-[#F8D794] px-2 py-0.5 text-[10px] font-bold text-[#64090C]">
                  {t('uploaded')}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="customer-photo-dropzone"
            >
              <Camera className="h-7 w-7" />
              <span>{t('takePhoto')}</span>
              <span className="text-[10px] text-[rgba(248,215,148,0.4)]">
                {t('photoFormats')}
              </span>
            </button>
          )}
        </div>

        <div>
          <label className="customer-field-label">{t('notes')}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('notesPlaceholder')}
            rows={3}
            className="customer-textarea"
          />
        </div>

        <button
          type="submit"
          disabled={
            isSubmitting ||
            isUploading ||
            !customerName.trim() ||
            !customerPhone.trim()
          }
          className="customer-btn-withdraw"
        >
          {isSubmitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {isSubmitting ? t('submitting') : t('submit')}
        </button>
      </form>
    </div>
  );
}

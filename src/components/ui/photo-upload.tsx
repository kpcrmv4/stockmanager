'use client';

import { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils/cn';
import {
  Camera,
  ImagePlus,
  X,
  Loader2,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';

interface PhotoUploadProps {
  /** Current photo URL (for display) */
  value?: string | null;
  /** Called with the uploaded URL */
  onChange: (url: string | null) => void;
  /** Subfolder in storage bucket */
  folder?: string;
  /** Label text */
  label?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Max file size in MB */
  maxSizeMB?: number;
  /** Compact mode for smaller spaces */
  compact?: boolean;
}

export function PhotoUpload({
  value,
  onChange,
  folder = 'general',
  label,
  required = false,
  disabled = false,
  className,
  placeholder = 'แตะเพื่อถ่ายรูปหรือเลือกรูป',
  maxSizeMB = 10,
  compact = false,
}: PhotoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    async (file: File) => {
      setError(null);

      // Validate type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
      if (!allowedTypes.includes(file.type)) {
        setError('รองรับเฉพาะไฟล์ JPEG, PNG, WebP');
        return;
      }

      // Validate size
      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`ไฟล์ใหญ่เกินไป (สูงสุด ${maxSizeMB}MB)`);
        return;
      }

      // Show preview immediately
      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);

      // Compress on client side if image is large
      let uploadFile = file;
      if (file.size > 2 * 1024 * 1024 && typeof window !== 'undefined') {
        try {
          uploadFile = await compressImage(file);
        } catch {
          // If compression fails, use original
        }
      }

      // Upload to server
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', uploadFile);
        formData.append('folder', folder);

        const response = await fetch('/api/upload/photo', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'อัพโหลดไม่สำเร็จ');
        }

        const { url } = await response.json();
        onChange(url);
        setPreview(null);
        URL.revokeObjectURL(objectUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'อัพโหลดไม่สำเร็จ');
        setPreview(null);
        URL.revokeObjectURL(objectUrl);
      } finally {
        setIsUploading(false);
      }
    },
    [folder, maxSizeMB, onChange]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const handleRemove = () => {
    onChange(null);
    setPreview(null);
    setError(null);
  };

  const displayUrl = value || preview;

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}

      {displayUrl ? (
        /* Photo Preview */
        <div className="relative overflow-hidden rounded-xl">
          <img
            src={displayUrl}
            alt="Uploaded photo"
            className={cn(
              'w-full rounded-xl object-cover',
              compact ? 'max-h-40' : 'max-h-64'
            )}
          />
          {/* Overlay controls */}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent p-3 pt-8">
            {isUploading ? (
              <div className="flex items-center gap-2 text-sm text-white">
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังอัพโหลด...
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className="flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-sm text-white backdrop-blur-sm transition-colors hover:bg-white/30 active:bg-white/40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                เปลี่ยนรูป
              </button>
            )}
            {!isUploading && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={disabled}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-red-500/80 active:bg-red-600/80"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Upload Area */
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          className={cn(
            'flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors',
            'border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50/50 active:bg-indigo-50',
            'dark:border-gray-600 dark:bg-gray-800/50 dark:hover:border-indigo-500 dark:hover:bg-indigo-900/10',
            'disabled:cursor-not-allowed disabled:opacity-50',
            compact ? 'min-h-[100px] p-4' : 'min-h-[140px] p-6'
          )}
        >
          {isUploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                กำลังอัพโหลด...
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/30">
                  <Camera className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700">
                  <ImagePlus className="h-6 w-6 text-gray-500 dark:text-gray-400" />
                </div>
              </div>
              <p className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-300">
                {placeholder}
              </p>
              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                JPEG, PNG, WebP (สูงสุด {maxSizeMB}MB)
              </p>
            </>
          )}
        </button>
      )}

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Hidden file input — capture for mobile camera */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        capture="environment"
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled || isUploading}
      />
    </div>
  );
}

/**
 * Client-side image compression using Canvas API
 */
async function compressImage(file: File, maxWidth = 1920, quality = 0.8): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
            type: 'image/jpeg',
            lastModified: Date.now(),
          }));
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

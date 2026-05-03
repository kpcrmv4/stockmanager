'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import toast from 'react-hot-toast';

export interface LightboxImage {
  url: string;
  caption?: string | null;
  sender?: string | null;
  timestamp?: string | null;
}

interface ImageLightboxProps {
  images: LightboxImage[];
  initialIndex: number;
  onClose: () => void;
}

const MAX_SCALE = 4;
const MIN_SCALE = 1;
const SWIPE_THRESHOLD = 60;

export function ImageLightbox({ images, initialIndex, onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [downloading, setDownloading] = useState(false);

  // Pan / pinch tracking
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartScale = useRef(1);
  const dragStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const swipeStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const total = images.length;
  const current = images[index];

  const reset = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const goPrev = useCallback(() => {
    if (index > 0) {
      setIndex((i) => i - 1);
      reset();
    }
  }, [index, reset]);

  const goNext = useCallback(() => {
    if (index < total - 1) {
      setIndex((i) => i + 1);
      reset();
    }
  }, [index, total, reset]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, goPrev, goNext]);

  // Lock body scroll while open
  useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = orig;
    };
  }, []);

  // ---------- Touch handlers ----------
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist.current = Math.hypot(dx, dy);
      pinchStartScale.current = scale;
      dragStart.current = null;
      swipeStart.current = null;
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      if (scale > 1) {
        dragStart.current = { x: t.clientX, y: t.clientY, tx: translate.x, ty: translate.y };
        swipeStart.current = null;
      } else {
        swipeStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
        dragStart.current = null;
      }
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDist.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const next = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, pinchStartScale.current * (dist / pinchStartDist.current)),
      );
      setScale(next);
      if (next === 1) setTranslate({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && dragStart.current && scale > 1) {
      const t = e.touches[0];
      setTranslate({
        x: dragStart.current.tx + (t.clientX - dragStart.current.x),
        y: dragStart.current.ty + (t.clientY - dragStart.current.y),
      });
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    pinchStartDist.current = null;
    dragStart.current = null;

    if (swipeStart.current && e.changedTouches.length === 1) {
      const t = e.changedTouches[0];
      const dx = t.clientX - swipeStart.current.x;
      const dy = t.clientY - swipeStart.current.y;
      const dt = Date.now() - swipeStart.current.t;

      // Vertical swipe-down to dismiss
      if (Math.abs(dy) > Math.abs(dx) && dy > 120 && dt < 600) {
        onClose();
      } else if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) goPrev();
        else goNext();
      }
    }
    swipeStart.current = null;
  };

  // Double-tap to zoom
  const lastTapRef = useRef<number>(0);
  const onDoubleTap = (e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      e.preventDefault();
      if (scale > 1) {
        reset();
      } else {
        setScale(2.5);
      }
    }
    lastTapRef.current = now;
  };

  // ---------- Download ----------
  const handleDownload = async () => {
    if (!current?.url || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(current.url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const ext = (blob.type.split('/')[1] || 'jpg').split(';')[0];
      a.download = `chat-image-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
      toast.success('บันทึกรูปแล้ว');
    } catch {
      toast.error('ดาวน์โหลดไม่สำเร็จ');
    } finally {
      setDownloading(false);
    }
  };

  if (typeof document === 'undefined' || !current) return null;

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      {/* Top bar */}
      <div className="safe-area-inset-top flex items-center justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 py-3 text-white">
        <button
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 active:bg-white/20"
          aria-label="ปิด"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          {current.sender && (
            <p className="truncate text-sm font-medium">{current.sender}</p>
          )}
          <p className="text-xs text-white/60">
            {index + 1} / {total}
            {current.timestamp ? ` · ${current.timestamp}` : ''}
          </p>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 active:bg-white/20 disabled:opacity-50"
          aria-label="ดาวน์โหลด"
        >
          {downloading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
        </button>
      </div>

      {/* Image area */}
      <div
        className="relative flex-1 overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={onDoubleTap}
      >
        <div className="flex h-full w-full items-center justify-center">
          <img
            key={current.url}
            src={current.url}
            alt={current.caption || 'รูปภาพ'}
            draggable={false}
            className="max-h-full max-w-full select-none object-contain transition-transform"
            style={{
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              touchAction: 'none',
            }}
          />
        </div>

        {/* Side nav (desktop) */}
        {index > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            className="absolute left-2 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-all hover:bg-white/20 sm:flex"
            aria-label="ก่อนหน้า"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {index < total - 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            className={cn(
              'absolute right-2 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-all hover:bg-white/20 sm:flex',
            )}
            aria-label="ถัดไป"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Caption */}
      {current.caption && (
        <div className="bg-gradient-to-t from-black/70 to-transparent px-4 pb-6 pt-4 text-center text-sm text-white/90">
          {current.caption}
        </div>
      )}
    </div>,
    document.body,
  );
}

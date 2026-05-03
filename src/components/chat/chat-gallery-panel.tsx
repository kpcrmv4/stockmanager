'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ImageIcon, X, Loader2 } from 'lucide-react';
import { ImageLightbox, type LightboxImage } from './image-lightbox';

interface ChatGalleryPanelProps {
  roomId: string;
  onClose: () => void;
}

interface GalleryRow {
  id: string;
  content: string;
  created_at: string;
  sender_name: string | null;
}

export function ChatGalleryPanel({ roomId, onClose }: ChatGalleryPanelProps) {
  const [items, setItems] = useState<GalleryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    supabase
      .from('chat_messages')
      .select('id, content, created_at, profiles:sender_id(display_name, username)')
      .eq('room_id', roomId)
      .eq('type', 'image')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          setItems(
            data.map((row) => {
              const p = row.profiles as unknown as { display_name?: string; username?: string } | null;
              return {
                id: row.id,
                content: row.content || '',
                created_at: row.created_at,
                sender_name: p?.display_name || p?.username || null,
              };
            }),
          );
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const lightboxImages: LightboxImage[] = items.map((it) => ({
    url: it.content,
    sender: it.sender_name,
    timestamp: new Date(it.created_at).toLocaleString('th-TH', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
  }));

  return (
    <>
      <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900">
        {/* Header */}
        <div className="safe-area-inset-top flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900">
          <button
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-indigo-500" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              รูปทั้งหมดในห้อง
            </h2>
            <span className="text-xs text-gray-400">{items.length}</span>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-1">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ImageIcon className="h-10 w-10 text-gray-300 dark:text-gray-600" />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                ยังไม่มีรูปในห้องนี้
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-1">
            {items.map((it, i) => (
              <button
                key={it.id}
                type="button"
                onClick={() => setViewerIndex(i)}
                className="aspect-square overflow-hidden rounded-md bg-gray-100 transition-opacity active:opacity-80 dark:bg-gray-800"
              >
                <img
                  src={it.content}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      {viewerIndex !== null && (
        <ImageLightbox
          images={lightboxImages}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </>
  );
}

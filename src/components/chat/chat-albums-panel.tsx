'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { broadcastToChannel, broadcastToMany } from '@/lib/supabase/broadcast';
import { useAuthStore } from '@/stores/auth-store';
import { useChatStore } from '@/stores/chat-store';
import { FolderPlus, X, Loader2, ImagePlus, FolderOpen, ChevronLeft, Trash2 } from 'lucide-react';
import { ImageLightbox, type LightboxImage } from './image-lightbox';
import toast from 'react-hot-toast';
import type { ChatAlbum, ChatAlbumPhoto, ChatMessage, AlbumCardMetadata, UnreadBadgePayload } from '@/types/chat';

interface ChatAlbumsPanelProps {
  roomId: string;
  onClose: () => void;
  /** Optional id to open directly when panel mounts (e.g. from a chat album card) */
  initialAlbumId?: string | null;
  /** Reset signal when initialAlbumId is consumed */
  onConsumeInitial?: () => void;
  /** When true, the create-album form opens automatically on mount */
  initialCreating?: boolean;
  /** Reset signal when initialCreating is consumed */
  onConsumeInitialCreating?: () => void;
}

export function ChatAlbumsPanel({
  roomId,
  onClose,
  initialAlbumId,
  onConsumeInitial,
  initialCreating,
  onConsumeInitialCreating,
}: ChatAlbumsPanelProps) {
  const { user } = useAuthStore();
  const [albums, setAlbums] = useState<ChatAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [activeAlbum, setActiveAlbum] = useState<ChatAlbum | null>(null);

  // Load albums for room
  const loadAlbums = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('chat_albums')
      .select(
        'id, room_id, name, description, cover_url, created_by, created_at, archived_at, profiles:created_by(id, display_name, username)',
      )
      .eq('room_id', roomId)
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    if (data) {
      // Fetch photo counts in one go
      const ids = data.map((a) => a.id);
      const counts = new Map<string, number>();
      if (ids.length > 0) {
        // Supabase v2 doesn't support GROUP BY natively in select; fall back to one query per album would be too many.
        // Instead we fetch all photo (album_id) rows for these albums and group client-side.
        const { data: photos } = await supabase
          .from('chat_album_photos')
          .select('album_id')
          .in('album_id', ids);
        if (photos) {
          for (const p of photos) {
            counts.set(p.album_id, (counts.get(p.album_id) || 0) + 1);
          }
        }
      }
      setAlbums(
        data.map((row) => {
          const creator = row.profiles as unknown as
            | { id: string; display_name: string | null; username: string }
            | null;
          return {
            id: row.id,
            room_id: row.room_id,
            name: row.name,
            description: row.description,
            cover_url: row.cover_url,
            created_by: row.created_by,
            created_at: row.created_at,
            archived_at: row.archived_at,
            photo_count: counts.get(row.id) || 0,
            creator: creator || null,
          } satisfies ChatAlbum;
        }),
      );
    }
    setLoading(false);
  }, [roomId]);

  useEffect(() => {
    loadAlbums();
  }, [loadAlbums]);

  // Open initial album by id once albums have loaded
  useEffect(() => {
    if (!initialAlbumId || albums.length === 0) return;
    const target = albums.find((a) => a.id === initialAlbumId);
    if (target) {
      setActiveAlbum(target);
      onConsumeInitial?.();
    }
  }, [initialAlbumId, albums, onConsumeInitial]);

  // Open the create-album form on mount when requested by the caller
  // (e.g. user picked "สร้างอัลบั้ม" from the chat-input attachment menu)
  useEffect(() => {
    if (!initialCreating) return;
    setCreating(true);
    onConsumeInitialCreating?.();
  }, [initialCreating, onConsumeInitialCreating]);

  const handleCreate = async () => {
    if (!user) return;
    const name = newName.trim();
    if (!name) return;

    const supabase = createClient();
    const { data, error } = await supabase
      .from('chat_albums')
      .insert({ room_id: roomId, name, created_by: user.id })
      .select(
        'id, room_id, name, description, cover_url, created_by, created_at, archived_at',
      )
      .single();

    if (error || !data) {
      toast.error('สร้างอัลบั้มไม่สำเร็จ');
      return;
    }

    const album: ChatAlbum = {
      ...data,
      photo_count: 0,
      creator: user
        ? { id: user.id, display_name: user.displayName || null, username: user.username }
        : null,
    };
    setAlbums((arr) => [album, ...arr]);
    setNewName('');
    setCreating(false);

    // Post system message announcing new album
    await postAlbumSystemMessage(roomId, user.id, {
      kind: 'album_created',
      album_id: album.id,
      album_name: album.name,
      actor_name: user.displayName || user.username,
    });

    toast.success(`สร้างอัลบั้ม "${name}" แล้ว`);
  };

  // ----- Album detail view -----
  if (activeAlbum) {
    return (
      <AlbumDetail
        album={activeAlbum}
        onBack={() => {
          setActiveAlbum(null);
          loadAlbums();
        }}
        onClose={onClose}
        onPhotoCountChange={(delta, coverUrl) => {
          setActiveAlbum((prev) =>
            prev
              ? {
                  ...prev,
                  photo_count: (prev.photo_count || 0) + delta,
                  cover_url: prev.cover_url || coverUrl || null,
                }
              : prev,
          );
          setAlbums((arr) =>
            arr.map((a) =>
              a.id === activeAlbum.id
                ? {
                    ...a,
                    photo_count: (a.photo_count || 0) + delta,
                    cover_url: a.cover_url || coverUrl || null,
                  }
                : a,
            ),
          );
        }}
      />
    );
  }

  // ----- Album list view -----
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="safe-area-inset-top flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900">
        <button
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex flex-1 items-center gap-2">
          <FolderOpen className="h-5 w-5 text-indigo-500" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">อัลบั้มในห้อง</h2>
          <span className="text-xs text-gray-400">{albums.length}</span>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white shadow-sm transition-all active:scale-95"
        >
          <FolderPlus className="h-4 w-4" />
          สร้างอัลบั้ม
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="flex items-center gap-2 border-b border-gray-100 bg-indigo-50/50 px-3 py-2 dark:border-gray-700 dark:bg-indigo-900/10">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') setCreating(false);
            }}
            placeholder="ชื่ออัลบั้ม เช่น งานประจำวัน 2 พ.ค."
            className="h-9 flex-1 rounded-lg border border-indigo-200 bg-white px-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300 dark:border-indigo-700 dark:bg-gray-800 dark:text-white"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="h-9 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            สร้าง
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        )}

        {!loading && albums.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FolderOpen className="h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              ยังไม่มีอัลบั้ม — สร้างอัลบั้มแรกเพื่อรวบรวมรูปงานประจำวัน
            </p>
          </div>
        )}

        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {albums.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setActiveAlbum(a)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-gray-100 dark:active:bg-gray-800"
            >
              {a.cover_url ? (
                <img
                  src={a.cover_url}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-gray-200 dark:ring-gray-700"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-900/40 dark:to-violet-900/30">
                  <FolderOpen className="h-7 w-7 text-indigo-500" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                  {a.name}
                </p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {a.photo_count || 0} รูป · สร้างโดย {a.creator?.display_name || a.creator?.username || 'ไม่ทราบ'}
                </p>
                <p className="text-[11px] text-gray-400">
                  {new Date(a.created_at).toLocaleDateString('th-TH', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// Album Detail View
// ==========================================

interface AlbumDetailProps {
  album: ChatAlbum;
  onBack: () => void;
  onClose: () => void;
  onPhotoCountChange: (delta: number, coverUrl?: string) => void;
}

function AlbumDetail({ album, onBack, onClose, onPhotoCountChange }: AlbumDetailProps) {
  const { user } = useAuthStore();
  const [photos, setPhotos] = useState<ChatAlbumPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    setLoading(true);
    supabase
      .from('chat_album_photos')
      .select(
        'id, album_id, url, caption, uploaded_by, created_at, profiles:uploaded_by(id, display_name, username)',
      )
      .eq('album_id', album.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          setPhotos(
            data.map((row) => {
              const u = row.profiles as unknown as
                | { id: string; display_name: string | null; username: string }
                | null;
              return {
                id: row.id,
                album_id: row.album_id,
                url: row.url,
                caption: row.caption,
                uploaded_by: row.uploaded_by,
                created_at: row.created_at,
                uploader: u,
              } satisfies ChatAlbumPhoto;
            }),
          );
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [album.id]);

  const handleSelectFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) return;
    const files = Array.from(e.target.files || []);
    if (fileRef.current) fileRef.current.value = '';
    if (files.length === 0) return;

    const valid = files.filter(
      (f) => ['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(f.type) && f.size <= 10 * 1024 * 1024,
    );
    if (valid.length !== files.length) {
      toast.error(`ข้ามไฟล์ที่ใหญ่กว่า 10MB หรือไม่ใช่ภาพ (${files.length - valid.length} ไฟล์)`);
    }
    if (valid.length === 0) return;

    setUploading(true);
    const supabase = createClient();
    const inserted: ChatAlbumPhoto[] = [];

    try {
      for (const file of valid) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', `album/${album.id}`);

        const res = await fetch('/api/upload/photo', { method: 'POST', body: formData });
        if (!res.ok) continue;
        const { url } = (await res.json()) as { url?: string };
        if (!url) continue;

        const { data, error } = await supabase
          .from('chat_album_photos')
          .insert({ album_id: album.id, url, uploaded_by: user.id })
          .select(
            'id, album_id, url, caption, uploaded_by, created_at',
          )
          .single();

        if (error || !data) continue;

        inserted.push({
          ...data,
          uploader: {
            id: user.id,
            display_name: user.displayName || null,
            username: user.username,
          },
        });
      }

      if (inserted.length === 0) {
        toast.error('อัปโหลดไม่สำเร็จ');
        return;
      }

      // Set album cover if it has none yet
      if (!album.cover_url) {
        await supabase
          .from('chat_albums')
          .update({ cover_url: inserted[0].url })
          .eq('id', album.id);
      }

      setPhotos((arr) => [...inserted, ...arr]);
      onPhotoCountChange(inserted.length, inserted[0]?.url);

      // Post one consolidated chat notification — bumps album activity to
      // the bottom of the chat feed (LINE-style "latest action")
      await postAlbumSystemMessage(album.room_id, user.id, {
        kind: 'album_upload',
        album_id: album.id,
        album_name: album.name,
        cover_url: album.cover_url || inserted[0].url,
        actor_name: user.displayName || user.username,
        photo_count: inserted.length,
      });

      toast.success(`อัปโหลดแล้ว ${inserted.length} รูป`);
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!user) return;
    if (!window.confirm('ลบรูปนี้ออกจากอัลบั้ม?')) return;

    const supabase = createClient();
    const { error } = await supabase.from('chat_album_photos').delete().eq('id', photoId);
    if (error) {
      toast.error('ลบไม่สำเร็จ');
      return;
    }
    setPhotos((arr) => arr.filter((p) => p.id !== photoId));
    onPhotoCountChange(-1);

    // Bump album activity to the bottom of the chat feed
    await postAlbumSystemMessage(album.room_id, user.id, {
      kind: 'album_remove',
      album_id: album.id,
      album_name: album.name,
      cover_url: album.cover_url,
      actor_name: user.displayName || user.username,
      photo_count: 1,
    });
  };

  // A photo is deletable by its uploader, the album creator, or any
  // global admin (matches the RLS DELETE policy on chat_album_photos).
  const canDelete = (photo: ChatAlbumPhoto): boolean => {
    if (!user) return false;
    if (photo.uploaded_by === user.id) return true;
    if (album.created_by === user.id) return true;
    if (user.role === 'owner' || user.role === 'manager') return true;
    return false;
  };

  const lightboxImages: LightboxImage[] = photos.map((p) => ({
    url: p.url,
    caption: p.caption,
    sender: p.uploader?.display_name || p.uploader?.username || null,
    timestamp: new Date(p.created_at).toLocaleString('th-TH', {
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
            onClick={onBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-gray-900 dark:text-white">
              {album.name}
            </h2>
            <p className="text-xs text-gray-400">{photos.length} รูป</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Upload bar */}
        <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-700">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50 py-2.5 text-sm font-semibold text-indigo-700 transition-all active:scale-[0.99] disabled:opacity-50 dark:border-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
            {uploading ? 'กำลังอัปโหลด...' : 'อัปโหลดรูปเข้าอัลบั้มนี้'}
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/heic"
            onChange={handleSelectFiles}
            className="hidden"
          />
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-1">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          )}
          {!loading && photos.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ImagePlus className="h-10 w-10 text-gray-300 dark:text-gray-600" />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                ยังไม่มีรูปในอัลบั้มนี้ — เริ่มจากอัปโหลดรูปแรก
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-1">
            {photos.map((p, i) => (
              <div key={p.id} className="relative aspect-square overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
                <button
                  type="button"
                  onClick={() => setViewerIndex(i)}
                  className="block h-full w-full"
                >
                  <img
                    src={p.url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform active:scale-95"
                  />
                </button>
                {canDelete(p) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePhoto(p.id);
                    }}
                    className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white shadow-md ring-1 ring-white/20 transition-all active:scale-90"
                    aria-label="ลบรูป"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
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

// ==========================================
// Helper: post a system message announcing album activity in the chat.
// Uses the existing chat_messages table with type='system' so the regular
// realtime/badge pipeline lights it up for everyone.
// ==========================================

async function postAlbumSystemMessage(
  roomId: string,
  senderId: string,
  meta: AlbumCardMetadata,
) {
  const supabase = createClient();

  const actor = meta.actor_name || meta.uploaded_by_name || 'มีคน';
  const count = meta.photo_count ?? 1;
  const summary =
    meta.kind === 'album_upload'
      ? `${actor} เพิ่ม ${count} รูปใน "${meta.album_name}"`
      : meta.kind === 'album_remove'
        ? `${actor} ลบ ${count} รูปจาก "${meta.album_name}"`
        : `สร้างอัลบั้มใหม่: ${meta.album_name}`;

  // Use the bot/system insert RPC (bypasses RLS since sender_id is null)
  const { data, error } = await supabase.rpc('insert_bot_message', {
    p_room_id: roomId,
    p_type: 'system',
    p_content: summary,
    p_metadata: meta as unknown as Record<string, unknown>,
  });

  if (error || !data) {
    console.error('[Album] post system message failed:', error);
    return;
  }

  // Reconstruct full message for broadcast (insert_bot_message returns just id)
  const { data: row } = await supabase
    .from('chat_messages')
    .select('id, room_id, sender_id, type, content, metadata, created_at, archived_at')
    .eq('id', data as string)
    .single();

  const message: ChatMessage | null = row
    ? {
        id: row.id,
        room_id: row.room_id,
        sender_id: row.sender_id,
        type: row.type,
        content: row.content,
        metadata: row.metadata,
        created_at: row.created_at,
        archived_at: row.archived_at,
        sender: null,
      }
    : null;

  if (message) {
    // Optimistically add to local store so the sender sees it immediately,
    // then force scroll to bottom — this is the LINE-style behaviour where
    // any of MY actions on a shared album bump the chat view to the latest.
    useChatStore.getState().addMessage(message);
    useChatStore.getState().bumpScrollToBottom();

    // Broadcast to room
    broadcastToChannel(supabase, `chat:room:${roomId}`, 'new_message', {
      type: 'new_message',
      message,
    } as unknown as Record<string, unknown>).catch(() => {});

    // Broadcast badge to other members so they see unread on this room
    const { data: members } = await supabase
      .from('chat_members')
      .select('user_id')
      .eq('room_id', roomId)
      .neq('user_id', senderId);

    if (members && members.length > 0) {
      const badge: UnreadBadgePayload = {
        room_id: roomId,
        sender_id: senderId,
        sender_name: meta.uploaded_by_name || 'อัลบั้ม',
        preview: summary.slice(0, 100),
        type: 'system',
      };
      broadcastToMany(
        supabase,
        members.map((m) => ({
          channel: `chat:badge:${m.user_id}`,
          event: 'new_message_badge',
          payload: badge as unknown as Record<string, unknown>,
        })),
      ).catch(() => {});
    }
  }
}

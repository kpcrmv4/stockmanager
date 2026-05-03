'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useChatStore } from '@/stores/chat-store';
import { sendChatMessage, sendChatImageMessage } from '@/hooks/use-chat-realtime';
import { notifyStaff } from '@/lib/notifications/client';
import { Send, Plus, Camera, ImageIcon, FolderPlus, X, Loader2, Reply } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { ChatMessage, MentionMetadata, ReplyMetadata } from '@/types/chat';

interface ChatInputProps {
  roomId: string;
  replyTo?: ChatMessage | null;
  onClearReply?: () => void;
  /** Open the albums panel directly into the create-album form */
  onCreateAlbum?: () => void;
}

interface MemberOption {
  user_id: string;
  username: string;
  display_name: string | null;
}

export function ChatInput({ roomId, replyTo, onClearReply, onCreateAlbum }: ChatInputProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();
  const addMessage = useChatStore((s) => s.addMessage);

  // Close attach menu on outside click
  useEffect(() => {
    if (!showAttachMenu) return;
    const handler = (e: PointerEvent | MouseEvent) => {
      if (attachMenuRef.current?.contains(e.target as Node)) return;
      setShowAttachMenu(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [showAttachMenu]);

  // Focus input when reply is set
  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  // Load room members for @mention
  useEffect(() => {
    if (!roomId) return;
    const supabase = createClient();
    supabase
      .from('chat_members')
      .select('user_id, profiles:user_id(username, display_name)')
      .eq('room_id', roomId)
      .then(({ data }) => {
        if (data) {
          setMembers(
            data.map((m) => ({
              user_id: m.user_id,
              username: (m.profiles as unknown as { username: string })?.username || '',
              display_name: (m.profiles as unknown as { display_name: string | null })?.display_name || null,
            }))
          );
        }
      });
  }, [roomId]);

  const senderInfo = user
    ? {
        username: user.username,
        display_name: user.displayName || null,
        avatar_url: user.avatarUrl || null,
        role: user.role,
      }
    : null;

  // Detect @mention query from text
  const updateMentionQuery = useCallback((value: string) => {
    const cursorPos = inputRef.current?.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\S*)$/);
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1].toLowerCase());
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }, []);

  // Special "@ทุกคน" option
  const EVERYONE_OPTION: MemberOption = {
    user_id: '__everyone__',
    username: 'ทุกคน',
    display_name: 'ทุกคน',
  };

  const filteredMembers = useMemo(() => {
    if (mentionQuery === null) return [];
    return [
      // Show @ทุกคน if query matches
      ...('ทุกคน'.includes(mentionQuery) || 'all'.includes(mentionQuery) || mentionQuery === ''
        ? [EVERYONE_OPTION]
        : []),
      // Then show matching members
      ...members.filter(
        (m) =>
          m.user_id !== user?.id &&
          ((m.display_name?.toLowerCase().includes(mentionQuery)) ||
            m.username.toLowerCase().includes(mentionQuery))
      ),
    ];
  }, [mentionQuery, members, user?.id]);

  const insertMention = (member: MemberOption) => {
    const cursorPos = inputRef.current?.selectionStart ?? text.length;
    const textBeforeCursor = text.slice(0, cursorPos);
    const mentionStart = textBeforeCursor.lastIndexOf('@');
    const textAfterCursor = text.slice(cursorPos);
    const name = member.display_name || member.username;
    const newText = text.slice(0, mentionStart) + `@${name} ` + textAfterCursor;
    setText(newText);
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  const handleSend = async () => {
    if (!user || !senderInfo || sending) return;

    // Send image if selected
    if (selectedFile) {
      setSending(true);
      const msg = await sendChatImageMessage(roomId, user.id, selectedFile, senderInfo);
      if (msg) addMessage(msg);
      clearImage();
      setSending(false);
      inputRef.current?.focus();
      return;
    }

    // Send text
    const content = text.trim();
    if (!content) return;

    setSending(true);
    setText('');
    setMentionQuery(null);

    // Extract @mentions from content
    const mentionedMembers = members.filter((m) => {
      const name = m.display_name || m.username;
      return content.includes(`@${name}`) && m.user_id !== user.id;
    });

    // Build metadata: mentions + reply
    let metadata: Record<string, unknown> | null = null;

    if (mentionedMembers.length > 0) {
      metadata = {
        mentions: mentionedMembers.map((m) => ({
          user_id: m.user_id,
          username: m.username,
          display_name: m.display_name,
        })),
      };
    }

    if (replyTo) {
      const replyData: ReplyMetadata = {
        reply_to: replyTo.id,
        reply_preview: replyTo.type === 'image'
          ? 'รูปภาพ'
          : (replyTo.content || '').slice(0, 100),
        reply_sender: replyTo.type === 'system'
          ? 'ข้อความจากระบบ'
          : replyTo.sender?.display_name || replyTo.sender?.username || (replyTo.sender_id ? undefined : 'Bot'),
      };
      metadata = { ...(metadata || {}), ...replyData };
    }

    const msg = await sendChatMessage(roomId, user.id, content, senderInfo, metadata);
    if (msg) {
      addMessage(msg);

      // Collect user IDs to notify (mentions + reply)
      const notifyUserIds = new Set<string>();
      for (const m of mentionedMembers) {
        notifyUserIds.add(m.user_id);
      }
      if (replyTo?.sender_id && replyTo.sender_id !== user.id) {
        notifyUserIds.add(replyTo.sender_id);
      }

      // Send notification
      if (notifyUserIds.size > 0) {
        const supabase = createClient();
        const { data: room } = await supabase
          .from('chat_rooms')
          .select('store_id')
          .eq('id', roomId)
          .single();

        if (room?.store_id) {
          const title = replyTo && !mentionedMembers.length
            ? `${user.displayName || user.username} อ้างถึงข้อความของคุณ`
            : `${user.displayName || user.username} กล่าวถึงคุณ`;
          notifyStaff({
            storeId: room.store_id,
            type: 'new_deposit',
            title,
            body: content.slice(0, 100),
            data: { room_id: roomId },
          });
        }
      }

      // Clear reply
      onClearReply?.();
    }

    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle mention dropdown navigation
    if (mentionQuery !== null && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, filteredMembers.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMembers[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset both inputs so picking the same file twice still triggers change
    if (cameraRef.current) cameraRef.current.value = '';
    if (galleryRef.current) galleryRef.current.value = '';
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (!validTypes.includes(file.type) || file.size > 10 * 1024 * 1024) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const openCamera = () => {
    setShowAttachMenu(false);
    cameraRef.current?.click();
  };

  const openGallery = () => {
    setShowAttachMenu(false);
    galleryRef.current?.click();
  };

  const openCreateAlbum = () => {
    setShowAttachMenu(false);
    onCreateAlbum?.();
  };

  const clearImage = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSelectedFile(null);
  };

  const hasContent = text.trim() || selectedFile;

  return (
    <div className="relative border-t border-gray-200/50 bg-white dark:border-gray-700 dark:bg-gray-800">
      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/50">
          <Reply className="h-4 w-4 shrink-0 text-indigo-500" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
              {replyTo.sender?.display_name || replyTo.sender?.username || 'Bot'}
            </p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              {replyTo.type === 'image' ? 'รูปภาพ' : (replyTo.content || '').slice(0, 80)}
            </p>
          </div>
          <button
            onClick={onClearReply}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* @Mention dropdown */}
      {mentionQuery !== null && filteredMembers.length > 0 && (
        <div className="absolute bottom-full left-2 right-2 z-20 mb-1 max-h-44 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {filteredMembers.map((m, i) => {
            const isEveryone = m.user_id === '__everyone__';
            return (
              <button
                key={m.user_id}
                onClick={() => insertMention(m)}
                className={cn(
                  'flex w-full items-center gap-2 px-4 py-3 text-left text-sm',
                  i === mentionIndex
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                    : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700',
                  isEveryone && 'border-b border-gray-100 dark:border-gray-700'
                )}
              >
                {isEveryone ? (
                  <>
                    <span className="font-bold text-amber-600 dark:text-amber-400">@ทุกคน</span>
                    <span className="text-xs text-gray-400">แจ้งเตือนทุกคนในห้อง</span>
                  </>
                ) : (
                  <>
                    <span className="font-medium">{m.display_name || m.username}</span>
                    {m.display_name && (
                      <span className="text-xs text-gray-400">@{m.username}</span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Image preview */}
      {previewUrl && (
        <div className="relative mx-3 mt-2 inline-block">
          <img
            src={previewUrl}
            alt="preview"
            className="h-20 w-20 rounded-lg object-cover ring-1 ring-gray-200 dark:ring-gray-700"
          />
          <button
            onClick={clearImage}
            className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-gray-800 text-white shadow-sm hover:bg-gray-700 active:bg-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 px-3 py-2">
        {/* Attachment button + popover menu */}
        <div className="relative shrink-0" ref={attachMenuRef}>
          <button
            onClick={() => setShowAttachMenu((v) => !v)}
            disabled={sending}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl transition-all',
              showAttachMenu
                ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300'
                : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300',
            )}
            title="แนบรูป"
            aria-haspopup="menu"
            aria-expanded={showAttachMenu}
          >
            <Plus
              className={cn(
                'h-5 w-5 transition-transform',
                showAttachMenu && 'rotate-45',
              )}
            />
          </button>

          {showAttachMenu && (
            <div
              className="absolute bottom-full left-0 z-30 mb-2 w-48 origin-bottom-left animate-in fade-in zoom-in-95 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-800"
              role="menu"
            >
              <button
                onClick={openCamera}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
                role="menuitem"
              >
                <Camera className="h-4 w-4 text-emerald-500" />
                ถ่ายรูป
              </button>
              <button
                onClick={openGallery}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
                role="menuitem"
              >
                <ImageIcon className="h-4 w-4 text-blue-500" />
                เลือกรูปในเครื่อง
              </button>
              {onCreateAlbum && (
                <>
                  <div className="my-1 h-px bg-gray-100 dark:bg-gray-700" />
                  <button
                    onClick={openCreateAlbum}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
                    role="menuitem"
                  >
                    <FolderPlus className="h-4 w-4 text-indigo-500" />
                    สร้างอัลบั้ม
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Hidden file inputs — one for camera, one for gallery, so we
            can offer both choices on mobile (capture vs no capture). */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Text input */}
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            updateMentionQuery(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder={selectedFile ? 'เพิ่มข้อความ...' : 'พิมพ์ข้อความ...'}
          rows={1}
          disabled={sending}
          className={cn(
            'max-h-24 min-h-[40px] flex-1 resize-none rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm',
            'placeholder:text-gray-400',
            'focus:border-[#5B5FC7]/40 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#5B5FC7]/30',
            'dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500 dark:focus:bg-gray-600'
          )}
          style={{ height: 'auto', minHeight: '40px' }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = `${Math.min(target.scrollHeight, 96)}px`;
          }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!hasContent || sending}
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all',
            hasContent
              ? 'bg-[#5B5FC7] text-white shadow-sm hover:bg-[#4A4EB5] active:scale-95'
              : 'text-gray-300 dark:text-gray-600'
          )}
        >
          {sending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );
}

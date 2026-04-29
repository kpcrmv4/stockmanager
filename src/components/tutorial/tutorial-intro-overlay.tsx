'use client';

import { useEffect, useState } from 'react';
import { X, ArrowDown, ArrowUp, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils/cn';

// First-screen overlay — dark backdrop, white labels with arrows pointing
// at the three main entry points (deposit/withdraw, chat, profile menu).
// Inspired by the gogobot-style coachmark the user shared.
//
// Anchors live on the actual nav components via `data-tutorial-anchor`
// — the overlay reads their bounding rects on mount and on resize, then
// draws a label box near each one. We pick whichever copy is currently
// visible (mobile bottom-nav vs. desktop sidebar) by checking
// offsetParent.

interface AnchorPos {
  top: number;
  left: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

interface AnchorMap {
  deposit?: AnchorPos;
  chat?: AnchorPos;
  profile?: AnchorPos;
}

function findVisibleAnchor(name: string): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const all = document.querySelectorAll<HTMLElement>(
    `[data-tutorial-anchor="${name}"]`,
  );
  for (const el of all) {
    // offsetParent === null means display:none / hidden (e.g. the desktop
    // sidebar on a mobile viewport where it's hidden via CSS).
    if (el.offsetParent !== null) return el;
  }
  return all[0] ?? null;
}

function measure(): AnchorMap {
  if (typeof window === 'undefined') return {};
  const result: AnchorMap = {};
  for (const name of ['deposit', 'chat', 'profile'] as const) {
    const el = findVisibleAnchor(name);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    result[name] = {
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
      centerX: r.left + r.width / 2,
      centerY: r.top + r.height / 2,
    };
  }
  return result;
}

interface LabelProps {
  anchor: AnchorPos;
  /** Where the label sits relative to the anchor */
  side: 'top' | 'bottom' | 'left' | 'right';
  title: string;
  body: string;
  /** Force a specific x in pixels (for the top-right profile case where
   *  the label needs to sit under the anchor but right-aligned). */
  fixedRight?: number;
}

function AnnotationLabel({ anchor, side, title, body, fixedRight }: LabelProps) {
  // Position the label beside the anchor with a 16px gap. We don't draw
  // an arrow line — instead the lucide arrow icon points in the right
  // direction, which is enough at this density.
  const Arrow =
    side === 'top'
      ? ArrowDown
      : side === 'bottom'
        ? ArrowUp
        : side === 'left'
          ? ArrowRight
          : ArrowLeft;

  // Pick a sensible viewport-clamped position.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 360;
  const labelMaxWidth = Math.min(220, vw - 40);

  const style: React.CSSProperties = (() => {
    const GAP = 16;
    if (side === 'top') {
      return {
        top: anchor.top - GAP,
        left: Math.max(12, Math.min(vw - labelMaxWidth - 12, anchor.centerX - labelMaxWidth / 2)),
        transform: 'translateY(-100%)',
        maxWidth: labelMaxWidth,
      };
    }
    if (side === 'bottom') {
      return {
        top: anchor.top + anchor.height + GAP,
        left: fixedRight !== undefined
          ? undefined
          : Math.max(12, Math.min(vw - labelMaxWidth - 12, anchor.centerX - labelMaxWidth / 2)),
        right: fixedRight,
        maxWidth: labelMaxWidth,
      };
    }
    if (side === 'left') {
      return {
        top: anchor.centerY,
        left: anchor.left - GAP,
        transform: 'translate(-100%, -50%)',
        maxWidth: labelMaxWidth,
      };
    }
    return {
      top: anchor.centerY,
      left: anchor.left + anchor.width + GAP,
      transform: 'translateY(-50%)',
      maxWidth: labelMaxWidth,
    };
  })();

  return (
    <div
      className={cn(
        'pointer-events-none absolute z-[61] flex flex-col items-start gap-1 rounded-lg',
        'bg-white/95 px-3 py-2 text-gray-900 shadow-xl backdrop-blur-sm',
        'dark:bg-gray-900/95 dark:text-white',
      )}
      style={style}
    >
      <div className="flex items-center gap-1.5">
        <Arrow className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
        <p className="text-sm font-bold">{title}</p>
      </div>
      <p className="text-xs leading-snug text-gray-600 dark:text-gray-300">
        {body}
      </p>
    </div>
  );
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function TutorialIntroOverlay({ isOpen, onClose }: Props) {
  const [anchors, setAnchors] = useState<AnchorMap>({});

  useEffect(() => {
    if (!isOpen) return;
    let raf = 0;
    const update = () => {
      raf = requestAnimationFrame(() => setAnchors(measure()));
    };
    update();
    // Re-measure a few times in case nav components mount late.
    const timers = [setTimeout(update, 100), setTimeout(update, 400)];
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-label="ภาพรวมเมนูหลัก"
    >
      {/* Dark backdrop — clickable for "tap anywhere to close" */}
      <button
        type="button"
        onClick={onClose}
        aria-label="ปิด"
        className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
      />

      {/* Cutout rings around each anchor — pure visual, no events */}
      {(['deposit', 'chat', 'profile'] as const).map((name) => {
        const a = anchors[name];
        if (!a) return null;
        const PAD = 6;
        return (
          <div
            key={name}
            aria-hidden
            className="pointer-events-none absolute z-[61] rounded-xl ring-4 ring-indigo-300 ring-offset-2 ring-offset-transparent transition-[top,left,width,height] duration-200"
            style={{
              top: a.top - PAD,
              left: a.left - PAD,
              width: a.width + PAD * 2,
              height: a.height + PAD * 2,
            }}
          />
        );
      })}

      {/* Labels */}
      {anchors.deposit && (
        <AnnotationLabel
          anchor={anchors.deposit}
          side="top"
          title="ฝาก / เบิก"
          body="หน้าหลักของระบบ — สร้างรายการฝาก ดูรอยืนยัน เบิกของให้ลูกค้า"
        />
      )}
      {anchors.chat && (
        <AnnotationLabel
          anchor={anchors.chat}
          side="top"
          title="แชทในร้าน"
          body="ห้องแชทของแต่ละสาขา — รับ Action Card จากบาร์/พนักงาน"
        />
      )}
      {anchors.profile && (
        <AnnotationLabel
          anchor={anchors.profile}
          side="bottom"
          title="โปรไฟล์ของคุณ"
          body="เปลี่ยนรหัสผ่าน ตั้งค่า ซ่อนปุ่มสอนการใช้งาน หรือออกจากระบบ"
          fixedRight={12}
        />
      )}

      {/* Title at top, close button at bottom */}
      <div className="pointer-events-none absolute inset-x-0 top-12 flex justify-center px-4">
        <div className="rounded-full bg-white/95 px-4 py-2 shadow-lg dark:bg-gray-900/95">
          <p className="text-sm font-bold text-gray-900 dark:text-white">
            ทำความรู้จักเมนูหลัก
          </p>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-24 flex justify-center px-4 sm:bottom-12">
        <Button
          onClick={onClose}
          icon={<X className="h-4 w-4" />}
          className="min-h-[44px] shadow-2xl"
        >
          ปิดและเลือกฟีเจอร์ที่อยากลอง
        </Button>
      </div>
    </div>
  );
}

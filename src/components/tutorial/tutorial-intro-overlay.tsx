'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils/cn';

// First-screen coachmark. SVG-mask cuts out the three anchor elements
// (deposit / chat nav, profile button) so the dim overlay still shows
// the icons being talked about. Each label is positioned directly
// adjacent to its anchor with a directional arrow icon pointing at
// the target — no cross-screen connector lines, which kept looking
// like random squiggles.

interface AnchorPos {
  top: number;
  left: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

type AnchorName = 'deposit' | 'chat' | 'profile';
type AnchorMap = Partial<Record<AnchorName, AnchorPos>>;

function findVisibleAnchor(name: AnchorName): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const all = document.querySelectorAll<HTMLElement>(
    `[data-tutorial-anchor="${name}"]`,
  );
  for (const el of all) {
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

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

type Side = 'above' | 'below' | 'left' | 'right';

interface LabelConfig {
  anchor: AnchorName;
  title: string;
  body: string;
  side: Side;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function TutorialIntroOverlay({ isOpen, onClose }: Props) {
  const [anchors, setAnchors] = useState<AnchorMap>({});
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    let raf = 0;
    const update = () => {
      raf = requestAnimationFrame(() => {
        setAnchors(measure());
        setVw(window.innerWidth);
        setVh(window.innerHeight);
      });
    };
    update();
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

  if (!isOpen || vw === 0) return null;

  const isNarrow = vw < 768;
  // On mobile we narrow each label so the deposit + chat labels can sit
  // side-by-side above the bottom-nav. On desktop the sidebar takes up
  // the left edge so we can afford a wider label.
  const labelW = isNarrow ? Math.min(168, (vw - 32) / 2) : 240;

  const labels: LabelConfig[] = [
    {
      anchor: 'profile',
      title: 'โปรไฟล์ของคุณ',
      body: 'ตั้งค่า เปลี่ยนรหัสผ่าน หรือซ่อนปุ่มสอน',
      side: 'below',
    },
    {
      anchor: 'deposit',
      title: 'ฝาก / เบิก',
      body: 'หน้าหลัก — ฝาก เบิก รอยืนยัน',
      side: isNarrow ? 'above' : 'right',
    },
    {
      anchor: 'chat',
      title: 'แชทในร้าน',
      body: 'ห้องแชทสาขา — Action Card',
      side: isNarrow ? 'above' : 'right',
    },
  ];

  // Predict each label's bounding box from its anchor + chosen side.
  // We use this to position the label container; the actual rendered
  // height is whatever the content needs (we just clamp into the viewport).
  function positionFor(label: LabelConfig) {
    const a = anchors[label.anchor];
    if (!a) return null;
    const GAP = 14;
    const labelH = 78; // estimated; only used for clamping
    let top = 0;
    let left = 0;
    if (label.side === 'above') {
      top = a.top - GAP - labelH;
      left = a.centerX - labelW / 2;
    } else if (label.side === 'below') {
      top = a.top + a.height + GAP;
      left = a.centerX - labelW / 2;
    } else if (label.side === 'right') {
      top = a.centerY - labelH / 2;
      left = a.left + a.width + GAP;
    } else {
      top = a.centerY - labelH / 2;
      left = a.left - GAP - labelW;
    }
    // Keep inside the viewport with 8px gutter.
    left = clamp(left, 8, vw - labelW - 8);
    top = clamp(top, 60, vh - labelH - 8);
    return { top, left };
  }

  const ArrowIcon: Record<Side, typeof ArrowUp> = {
    above: ArrowDown,
    below: ArrowUp,
    left: ArrowRight,
    right: ArrowLeft,
  };

  const PAD = 8;

  return (
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-label="ภาพรวมเมนูหลัก"
      style={{ fontFamily: 'var(--font-handwriting)' }}
    >
      {/* SVG mask — cuts out the anchored elements so they remain visible */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
      >
        <defs>
          <mask id="tutorial-cutout-mask">
            <rect width="100%" height="100%" fill="white" />
            {(['deposit', 'chat', 'profile'] as const).map((name) => {
              const a = anchors[name];
              if (!a) return null;
              return (
                <rect
                  key={name}
                  x={a.left - PAD}
                  y={a.top - PAD}
                  width={a.width + PAD * 2}
                  height={a.height + PAD * 2}
                  rx={14}
                  ry={14}
                  fill="black"
                />
              );
            })}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.55)"
          mask="url(#tutorial-cutout-mask)"
        />

        {/* Soft glow rings around each cutout */}
        {(['deposit', 'chat', 'profile'] as const).map((name) => {
          const a = anchors[name];
          if (!a) return null;
          return (
            <rect
              key={`ring-${name}`}
              x={a.left - PAD}
              y={a.top - PAD}
              width={a.width + PAD * 2}
              height={a.height + PAD * 2}
              rx={14}
              ry={14}
              fill="none"
              stroke="rgb(165, 180, 252)"
              strokeWidth={2.5}
            />
          );
        })}
      </svg>

      {/* Tap-anywhere-to-close layer */}
      <button
        type="button"
        onClick={onClose}
        aria-label="ปิด"
        className="absolute inset-0 z-[1] h-full w-full cursor-pointer bg-transparent"
      />

      {/* Title pill — top-left so it never collides with the profile label */}
      <div className="pointer-events-none absolute left-3 top-3 z-[3]">
        <div className="rounded-full bg-indigo-500 px-3 py-1.5 shadow-lg">
          <p
            className="text-[13px] font-bold text-white"
            style={{ fontFamily: 'var(--font-handwriting)' }}
          >
            ✨ ทำความรู้จักเมนูหลัก
          </p>
        </div>
      </div>

      {/* Labels */}
      {labels.map((l) => {
        const pos = positionFor(l);
        if (!pos) return null;
        const Arrow = ArrowIcon[l.side];
        return (
          <div
            key={l.anchor}
            className={cn(
              'pointer-events-none absolute z-[2] rounded-2xl px-3 py-2.5',
              'bg-white text-gray-900 shadow-2xl ring-1 ring-indigo-200',
              'dark:bg-gray-900 dark:text-white dark:ring-indigo-700',
            )}
            style={{
              top: pos.top,
              left: pos.left,
              width: labelW,
              fontFamily: 'var(--font-handwriting)',
            }}
          >
            <div className="flex items-center gap-1.5">
              <Arrow className="h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-300" />
              <p className="text-[15px] font-bold leading-tight text-indigo-600 dark:text-indigo-300">
                {l.title}
              </p>
            </div>
            <p className="mt-1 text-[13px] leading-snug text-gray-700 dark:text-gray-200">
              {l.body}
            </p>
          </div>
        );
      })}

      {/* Continue button — center bottom */}
      <div className="absolute inset-x-0 bottom-3 z-[3] flex justify-center px-4 sm:bottom-6">
        <Button
          onClick={onClose}
          icon={<X className="h-4 w-4" />}
          className="min-h-[48px] shadow-2xl"
          style={{ fontFamily: 'var(--font-handwriting)', fontWeight: 700 }}
        >
          เข้าใจแล้ว — เลือกฟีเจอร์
        </Button>
      </div>
    </div>
  );
}

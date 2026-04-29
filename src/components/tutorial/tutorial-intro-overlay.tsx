'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils/cn';

// First-screen coachmark inspired by the gogobot reference. The screen
// is dimmed by an SVG mask that *cuts out* the three anchor elements
// (deposit / chat nav, profile button) so they stay readable. Each
// label is parked in a corner away from anchors, with a curved
// hand-drawn arrow connecting label → target. Mali handwriting font
// gives the whole thing a "sticky note" feel rather than a UI dialog.

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

interface LabelConfig {
  anchor: AnchorName;
  title: string;
  body: string;
  /** Where the label box sits within the viewport */
  pos: { top?: number; bottom?: number; left?: number; right?: number };
  /** Which corner of the label the arrow leaves from */
  arrowFrom: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

function rectFromPos(
  pos: LabelConfig['pos'],
  width: number,
  height: number,
  vw: number,
  vh: number,
) {
  const left = pos.left !== undefined ? pos.left : vw - (pos.right ?? 0) - width;
  const top = pos.top !== undefined ? pos.top : vh - (pos.bottom ?? 0) - height;
  return { left, top, width, height };
}

function arrowOrigin(
  rect: { left: number; top: number; width: number; height: number },
  side: LabelConfig['arrowFrom'],
) {
  const inset = 24;
  if (side === 'top-right') return { x: rect.left + rect.width - inset, y: rect.top };
  if (side === 'top-left') return { x: rect.left + inset, y: rect.top };
  if (side === 'bottom-right')
    return { x: rect.left + rect.width - inset, y: rect.top + rect.height };
  return { x: rect.left + inset, y: rect.top + rect.height };
}

function curvePath(fromX: number, fromY: number, toX: number, toY: number): string {
  const dx = toX - fromX;
  const dy = toY - fromY;
  // Control points biased toward the from-side so the line "throws"
  // outward before homing in on the target — gives the loose, hand-drawn
  // feel of the gogobot example.
  const c1x = fromX + dx * 0.15 + (dy > 0 ? 30 : -30);
  const c1y = fromY + dy * 0.55;
  const c2x = fromX + dx * 0.6;
  const c2y = fromY + dy * 0.25;
  return `M ${fromX} ${fromY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${toX} ${toY}`;
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
  const labelW = Math.min(220, vw - 40);
  // Estimated label height — title (~22px) + body 2 lines (~36px) +
  // padding (~24px). Used only for arrow origin geometry; visual height
  // is whatever the content needs.
  const labelH = 80;

  // Mobile: profile label below the status bar at top-right; deposit +
  // chat labels float above the bottom-nav. Desktop: tighter columns.
  const labels: LabelConfig[] = [
    {
      anchor: 'profile',
      title: 'โปรไฟล์ของคุณ',
      body: 'ตั้งค่า เปลี่ยนรหัสผ่าน หรือซ่อนปุ่มสอนการใช้งาน',
      pos: { top: 70, right: 12 },
      arrowFrom: 'top-right',
    },
    {
      anchor: 'deposit',
      title: 'ฝาก / เบิก',
      body: 'หน้าหลัก — สร้างรายการฝาก รอยืนยัน เบิกของให้ลูกค้า',
      pos: isNarrow ? { bottom: 130, left: 16 } : { bottom: 40, left: 16 },
      arrowFrom: 'bottom-left',
    },
    {
      anchor: 'chat',
      title: 'แชทในร้าน',
      body: 'ห้องแชทสาขา — รับ Action Card จากบาร์/พนักงาน',
      pos: isNarrow ? { bottom: 130, right: 16 } : { bottom: 40, right: 16 },
      arrowFrom: 'bottom-right',
    },
  ];

  const visibleLabels = labels.filter((l) => anchors[l.anchor]);
  const PAD = 8;

  return (
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-label="ภาพรวมเมนูหลัก"
      style={{ fontFamily: 'var(--font-handwriting)' }}
    >
      {/* Mask layer — dims everything except the anchor cutouts so the
          underlying menu stays visible. */}
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
          fill="rgba(0, 0, 0, 0.5)"
          mask="url(#tutorial-cutout-mask)"
        />

        {/* Glow rings around cutouts */}
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
              strokeWidth={3}
            />
          );
        })}

        {/* Curved arrows from each label to its target */}
        {visibleLabels.map((l) => {
          const a = anchors[l.anchor]!;
          const rect = rectFromPos(l.pos, labelW, labelH, vw, vh);
          const origin = arrowOrigin(rect, l.arrowFrom);
          // End point is just outside the cutout ring on the closest side
          const isTop = l.arrowFrom.startsWith('top');
          const targetY = isTop ? a.top - PAD - 6 : a.top + a.height + PAD + 6;
          const targetX = a.centerX;
          const path = curvePath(origin.x, origin.y, targetX, targetY);
          return (
            <g key={`arrow-${l.anchor}`}>
              <path
                d={path}
                stroke="white"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              {/* Solid dot at the target end */}
              <circle cx={targetX} cy={targetY} r={4.5} fill="white" />
            </g>
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

      {/* Title pill — top-left so it never collides with the profile
          label that sits at top-right. */}
      <div className="pointer-events-none absolute left-3 top-2 z-[3]">
        <div className="rounded-full bg-indigo-500 px-3 py-1 shadow-lg">
          <p
            className="text-[13px] font-bold text-white"
            style={{ fontFamily: 'var(--font-handwriting)' }}
          >
            ✨ ทำความรู้จักเมนูหลัก
          </p>
        </div>
      </div>

      {/* Labels — pointer-events-none so taps fall through to the
          close-layer behind them. */}
      {visibleLabels.map((l) => (
        <div
          key={l.anchor}
          className={cn(
            'pointer-events-none absolute z-[2] rounded-2xl bg-white px-4 py-3',
            'shadow-2xl ring-1 ring-indigo-200',
            'dark:bg-gray-900 dark:ring-indigo-700',
          )}
          style={{
            ...l.pos,
            width: labelW,
            fontFamily: 'var(--font-handwriting)',
          }}
        >
          <p className="text-base font-bold leading-tight text-indigo-600 dark:text-indigo-300">
            {l.title}
          </p>
          <p className="mt-1 text-sm leading-snug text-gray-700 dark:text-gray-200">
            {l.body}
          </p>
        </div>
      ))}

      {/* Continue button — center bottom, above the bottom-nav cutout */}
      <div className="absolute inset-x-0 bottom-2 z-[3] flex justify-center px-4 sm:bottom-6">
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

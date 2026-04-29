'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils/cn';

// First-screen coachmark. Three labels are pinned to fixed viewport
// corners so they never overlap each other; clean dashed SVG lines
// with an arrowhead marker connect each label to its anchor cutout.
//
// Layout (mobile): profile label sits below the top-right cutout;
// chat label sits in the upper-middle right; deposit label sits at
// the bottom-left next to the deposit nav. The "เข้าใจแล้ว" CTA
// floats at the vertical center of the dim area where no label lives.

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
  /** CSS-style absolute position */
  pos: { top?: number; bottom?: number; left?: number; right?: number };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/** Pick the midpoint of whichever rect side is closest to the target. */
function nearestEdgeMid(
  rect: { left: number; top: number; width: number; height: number },
  target: { x: number; y: number },
): { x: number; y: number } {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  if (Math.abs(dx) > Math.abs(dy)) {
    return { x: dx > 0 ? rect.left + rect.width : rect.left, y: cy };
  }
  return { x: cx, y: dy > 0 ? rect.top + rect.height : rect.top };
}

export function TutorialIntroOverlay({ isOpen, onClose }: Props) {
  const [anchors, setAnchors] = useState<AnchorMap>({});
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);
  // Measured rendered rects of the labels — needed so the connector
  // lines start exactly at the right edge of each label.
  const labelRefs = useRef<Record<AnchorName, HTMLDivElement | null>>({
    deposit: null,
    chat: null,
    profile: null,
  });
  const [labelRects, setLabelRects] = useState<
    Partial<Record<AnchorName, DOMRect>>
  >({});

  useEffect(() => {
    if (!isOpen) return;
    let raf = 0;
    const update = () => {
      raf = requestAnimationFrame(() => {
        setAnchors(measure());
        setVw(window.innerWidth);
        setVh(window.innerHeight);
        const next: Partial<Record<AnchorName, DOMRect>> = {};
        for (const name of ['deposit', 'chat', 'profile'] as const) {
          const el = labelRefs.current[name];
          if (el) next[name] = el.getBoundingClientRect();
        }
        setLabelRects(next);
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
  const labelW = isNarrow ? Math.min(220, vw - 40) : 240;

  // Three corners chosen so each label gets its own column / row and
  // the connector lines never cross.
  const labels: LabelConfig[] = [
    {
      anchor: 'profile',
      title: 'โปรไฟล์ของคุณ',
      body: 'ตั้งค่า เปลี่ยนรหัสผ่าน หรือซ่อนปุ่มสอนการใช้งาน',
      pos: { top: 70, right: 12 },
    },
    {
      anchor: 'chat',
      title: 'แชทในร้าน',
      body: 'ห้องแชทของแต่ละสาขา — รับ Action Card จากบาร์/พนักงาน',
      // Upper-middle on the right; line drops down to the chat anchor
      // in the bottom-nav.
      pos: isNarrow
        ? { top: Math.round(vh * 0.32), right: 12 }
        : { top: 70, right: 280 },
    },
    {
      anchor: 'deposit',
      title: 'ฝาก / เบิก',
      body: 'หน้าหลัก — สร้างรายการฝาก รอยืนยัน เบิกของให้ลูกค้า',
      // Just above the deposit nav so the line is short and direct.
      pos: isNarrow ? { bottom: 100, left: 12 } : { bottom: 32, left: 12 },
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
      {/* Mask + rings + connector lines all in one SVG layer */}
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
          <marker
            id="tutorial-arrowhead"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="white" />
          </marker>
        </defs>

        {/* Dim layer with cutouts */}
        <rect
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.55)"
          mask="url(#tutorial-cutout-mask)"
        />

        {/* Bright glow rings around cutouts */}
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

        {/* Connector lines — clean dashed straight segments from each
            label edge to its anchor cutout, with an arrowhead at the
            target end. We only know the label rect after the first
            render, so this whole block renders blank on initial mount
            and fills in once labelRects has been measured. */}
        {visibleLabels.map((l) => {
          const a = anchors[l.anchor]!;
          const lr = labelRects[l.anchor];
          if (!lr) return null;
          const target = { x: a.centerX, y: a.centerY };
          const start = nearestEdgeMid(lr, target);
          // Stop the line just outside the cutout ring so the arrow
          // doesn't poke into the icon.
          const dx = target.x - start.x;
          const dy = target.y - start.y;
          const len = Math.max(1, Math.hypot(dx, dy));
          const PULLBACK = (Math.max(a.width, a.height) / 2) + PAD + 4;
          const endX = target.x - (dx / len) * PULLBACK;
          const endY = target.y - (dy / len) * PULLBACK;
          return (
            <line
              key={`line-${l.anchor}`}
              x1={start.x}
              y1={start.y}
              x2={endX}
              y2={endY}
              stroke="white"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray="6 5"
              markerEnd="url(#tutorial-arrowhead)"
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

      {/* Title pill — top-left */}
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
      {visibleLabels.map((l) => (
        <div
          key={l.anchor}
          ref={(el) => {
            labelRefs.current[l.anchor] = el;
          }}
          className={cn(
            'pointer-events-none absolute z-[2] rounded-2xl px-3 py-2.5',
            'bg-white text-gray-900 shadow-2xl ring-1 ring-indigo-200',
            'dark:bg-gray-900 dark:text-white dark:ring-indigo-700',
          )}
          style={{
            ...l.pos,
            width: labelW,
            fontFamily: 'var(--font-handwriting)',
          }}
        >
          <p className="text-[15px] font-bold leading-tight text-indigo-600 dark:text-indigo-300">
            {l.title}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-gray-700 dark:text-gray-200">
            {l.body}
          </p>
        </div>
      ))}

      {/* Continue button — vertical center */}
      <div className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center px-4">
        <Button
          onClick={onClose}
          icon={<X className="h-4 w-4" />}
          className="pointer-events-auto min-h-[48px] shadow-2xl"
          style={{ fontFamily: 'var(--font-handwriting)', fontWeight: 700 }}
        >
          เข้าใจแล้ว — เลือกฟีเจอร์
        </Button>
      </div>
    </div>
  );
}

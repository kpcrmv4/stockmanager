'use client';

import { useEffect, useState } from 'react';
import { useTutorialStore } from '@/stores/tutorial-store';
import { getFlow } from '@/lib/tutorial/steps';

// Renders a non-blocking ring around the element with `data-tutorial-id`
// matching the current step's targetId. We deliberately don't block
// pointer events on the page — the user *should* be able to interact
// with the underlying form, that's the whole point. The ring is just
// a visual cue.
//
// Position is recomputed on resize / scroll so it stays glued to the
// target as the page changes.

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getRect(targetId: string): Rect | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector<HTMLElement>(`[data-tutorial-id="${targetId}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function TutorialSpotlight() {
  const { active, feature, stepIndex } = useTutorialStore();
  const [rect, setRect] = useState<Rect | null>(null);

  const flow = getFlow(feature);
  const targetId = active && flow ? flow.steps[stepIndex]?.targetId : undefined;

  useEffect(() => {
    if (!active || !targetId) {
      setRect(null);
      return;
    }

    let raf = 0;
    const update = () => {
      raf = requestAnimationFrame(() => {
        const next = getRect(targetId);
        setRect(next);
      });
    };

    // Initial position — try a few times in case the target hasn't
    // mounted yet (e.g. user is between pages).
    update();
    const timers = [
      setTimeout(update, 100),
      setTimeout(update, 400),
      setTimeout(update, 1000),
    ];

    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);

    // Scroll the target into view once.
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-tutorial-id="${targetId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [active, targetId, stepIndex]);

  if (!active || !targetId || !rect) return null;

  // Pad a few pixels so the ring isn't flush against the element.
  const PAD = 6;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-30 rounded-lg ring-4 ring-indigo-400 ring-offset-2 ring-offset-indigo-100 transition-[top,left,width,height] duration-300 dark:ring-indigo-500 dark:ring-offset-indigo-900/40"
      style={{
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.15)',
      }}
    />
  );
}

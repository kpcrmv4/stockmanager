'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Sparkles, Info, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { useTutorialStore } from '@/stores/tutorial-store';
import { getFlow } from '@/lib/tutorial/steps';

// A floating side panel that follows the user through the walkthrough.
// Position is dynamic: if the current step's spotlight target is in
// the bottom half of the viewport (e.g. a bottom-nav icon on mobile)
// the panel docks at the top so it doesn't cover the highlight; if
// the target is in the top half, the panel docks at the bottom. On
// desktop the panel still sits in a corner — but the same swap rule
// applies so it doesn't park on top of the highlighted element.
//
// User can also collapse it to a small pill if they want to interact
// with the page first, then expand back to read the next step.

export function TutorialPanel() {
  const { active, feature, stepIndex, next, prev, exit } = useTutorialStore();
  const [collapsed, setCollapsed] = useState(false);
  const [dockTop, setDockTop] = useState(false);

  const flow = getFlow(feature);
  const step = flow?.steps[stepIndex];
  const targetId = step?.targetId;

  // Re-evaluate dock position whenever the step changes. The target
  // element may not be mounted on the very first render (e.g. user is
  // mid-navigation), so we re-measure a few times before giving up.
  useEffect(() => {
    if (!active || !targetId) {
      setDockTop(false);
      return;
    }
    const measure = () => {
      const el = document.querySelector<HTMLElement>(
        `[data-tutorial-id="${targetId}"]`,
      );
      if (!el) return;
      const r = el.getBoundingClientRect();
      const inBottomHalf = r.top + r.height / 2 > window.innerHeight * 0.5;
      setDockTop(inBottomHalf);
    };
    measure();
    const timers = [setTimeout(measure, 100), setTimeout(measure, 400)];
    return () => timers.forEach(clearTimeout);
  }, [active, targetId]);

  if (!active || !flow || !step) return null;

  const isFirst = stepIndex === 0;
  const isLast = step.isFinal === true || stepIndex === flow.steps.length - 1;
  const total = flow.steps.length;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className={cn(
          'fixed z-50 flex items-center gap-2 rounded-full px-4 py-2.5',
          'bg-indigo-600 text-white shadow-lg transition-all hover:bg-indigo-700',
          'right-4 sm:right-6',
          dockTop ? 'top-3 sm:top-6' : 'bottom-20 sm:bottom-6',
          'dark:bg-indigo-500 dark:hover:bg-indigo-600',
        )}
      >
        <GraduationCap className="h-5 w-5" />
        <span className="text-sm font-medium">
          ขั้น {stepIndex + 1}/{total}
        </span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        'fixed z-50 flex flex-col rounded-xl border bg-white shadow-2xl',
        'border-indigo-100 dark:border-indigo-900/50 dark:bg-gray-900',
        // Mobile: sheet that swaps top/bottom based on where the target sits.
        'inset-x-3 max-h-[55vh]',
        dockTop ? 'top-3' : 'bottom-3',
        // Desktop: corner card with the same top/bottom swap.
        'sm:inset-auto sm:right-6 sm:w-96 sm:max-h-[70vh]',
        dockTop ? 'sm:top-6' : 'sm:bottom-6',
      )}
      role="dialog"
      aria-label="ขั้นตอนการสอนการใช้งาน"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              ทดลอง · {flow.label}
            </p>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
              ขั้น {stepIndex + 1} จาก {total}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="ย่อแผง"
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={exit}
            aria-label="ออกจากการทดลอง"
            className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex gap-1 px-4 pt-2">
        {flow.steps.map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i < stepIndex
                ? 'bg-indigo-500'
                : i === stepIndex
                  ? 'bg-indigo-400'
                  : 'bg-gray-200 dark:bg-gray-700',
            )}
          />
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-white">
          {step.title}
        </h3>
        <p className="mt-2 whitespace-pre-line text-sm text-gray-600 dark:text-gray-300">
          {step.body}
        </p>
        {step.hint && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-300">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{step.hint}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-gray-100 p-3 dark:border-gray-800">
        <Button
          variant="outline"
          size="sm"
          onClick={prev}
          disabled={isFirst}
          icon={<ChevronLeft className="h-4 w-4" />}
        >
          ย้อนกลับ
        </Button>
        <div className="flex-1" />
        {isLast ? (
          <Button
            size="sm"
            onClick={exit}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            เสร็จสิ้น
          </Button>
        ) : (
          <Button size="sm" onClick={next} icon={<ChevronRight className="h-4 w-4" />}>
            ถัดไป
          </Button>
        )}
      </div>
    </div>
  );
}

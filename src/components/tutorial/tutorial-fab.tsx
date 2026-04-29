'use client';

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useTutorialStore } from '@/stores/tutorial-store';
import { TutorialIntroOverlay } from './tutorial-intro-overlay';
import { TutorialPickerModal } from './tutorial-picker-modal';
import { TutorialPanel } from './tutorial-panel';
import { TutorialSpotlight } from './tutorial-spotlight';

// The FAB stays mounted globally inside the dashboard layout. Clicking
// it kicks off a 3-stage flow:
//   1. intro overlay  — coachmarks pointing at deposit/chat/profile
//   2. picker modal   — choose which feature to walk through
//   3. side panel     — autopilot walkthrough of the chosen flow
//
// FAB is hidden via the user-menu toggle ("ซ่อนปุ่มสอนการใช้งาน");
// state persisted in localStorage.

export function TutorialFAB() {
  const { hidden, active } = useTutorialStore();
  const [phase, setPhase] = useState<'closed' | 'intro' | 'picker'>('closed');

  return (
    <>
      {!hidden && !active && (
        <button
          type="button"
          onClick={() => setPhase('intro')}
          aria-label="สอนการใช้งาน"
          className={cn(
            'fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full',
            'bg-indigo-600 text-white shadow-lg transition-all hover:bg-indigo-700 hover:shadow-xl',
            'active:scale-95',
            'sm:bottom-6 sm:right-6 sm:h-14 sm:w-14',
            'dark:bg-indigo-500 dark:hover:bg-indigo-600',
          )}
        >
          <HelpCircle className="h-6 w-6 sm:h-7 sm:w-7" />
          <span className="absolute -top-1 -right-1 inline-flex h-3 w-3 animate-ping rounded-full bg-indigo-400 opacity-75" />
        </button>
      )}

      <TutorialIntroOverlay
        isOpen={phase === 'intro'}
        onClose={() => setPhase('picker')}
      />

      <TutorialPickerModal
        isOpen={phase === 'picker'}
        onClose={() => setPhase('closed')}
      />

      {active && <TutorialPanel />}
      {active && <TutorialSpotlight />}
    </>
  );
}

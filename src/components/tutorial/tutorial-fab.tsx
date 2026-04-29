'use client';

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useTutorialStore } from '@/stores/tutorial-store';
import { TutorialPickerModal } from './tutorial-picker-modal';
import { TutorialPanel } from './tutorial-panel';
import { TutorialSpotlight } from './tutorial-spotlight';

// The FAB stays mounted globally inside the dashboard layout. It opens
// the feature picker, and once a flow starts the side panel + spotlight
// take over the screen.
//
// Hidden via the user-menu toggle ("ซ่อนปุ่มสอนการใช้งาน"); state
// persisted in localStorage.

export function TutorialFAB() {
  const { hidden, active } = useTutorialStore();
  const [showPicker, setShowPicker] = useState(false);

  return (
    <>
      {!hidden && !active && (
        <button
          type="button"
          onClick={() => setShowPicker(true)}
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

      <TutorialPickerModal
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
      />

      {active && <TutorialPanel />}
      {active && <TutorialSpotlight />}
    </>
  );
}

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Tutorial / sandbox mode for in-app walkthroughs.
//
// While `active` is true the deposit form (and friends) inserts rows
// flagged is_tutorial=true (so RLS hides them from everyone except the
// current user) and skips every side-effect that would leak the demo
// to a real channel — chat bot, audit log, push notifications, print
// queue, LINE outgoing.
//
// `hidden` controls the floating help button. The user can hide it via
// the profile menu and re-enable from the same place; the choice is
// persisted to localStorage so it survives reloads.

export type TutorialFeature = 'deposit' | 'withdrawal' | 'chat';

interface TutorialState {
  // Floating button visibility (persisted)
  hidden: boolean;

  // Active walkthrough (not persisted — fresh start each session)
  active: boolean;
  feature: TutorialFeature | null;
  stepIndex: number;

  // The deposit_code generated for the current run, so the side-panel
  // can show "ดูรายการทดลอง #DEMO-XXXXX" on the final step.
  createdDepositCode: string | null;

  // Actions
  setHidden: (hidden: boolean) => void;
  start: (feature: TutorialFeature) => void;
  next: () => void;
  prev: () => void;
  goTo: (idx: number) => void;
  setCreatedDepositCode: (code: string | null) => void;
  exit: () => void;
}

export const useTutorialStore = create<TutorialState>()(
  persist(
    (set) => ({
      hidden: false,
      active: false,
      feature: null,
      stepIndex: 0,
      createdDepositCode: null,

      setHidden: (hidden) => set({ hidden }),

      start: (feature) =>
        set({
          active: true,
          feature,
          stepIndex: 0,
          createdDepositCode: null,
        }),

      next: () => set((s) => ({ stepIndex: s.stepIndex + 1 })),
      prev: () => set((s) => ({ stepIndex: Math.max(0, s.stepIndex - 1) })),
      goTo: (idx) => set({ stepIndex: Math.max(0, idx) }),

      setCreatedDepositCode: (code) => set({ createdDepositCode: code }),

      exit: () =>
        set({
          active: false,
          feature: null,
          stepIndex: 0,
          createdDepositCode: null,
        }),
    }),
    {
      name: 'tutorial-prefs',
      // Only the visibility preference persists — walkthrough state is
      // intentionally session-only (otherwise reload on step 5 traps
      // the user in a half-finished demo).
      partialize: (s) => ({ hidden: s.hidden }),
    },
  ),
);

/** Stable read for non-React code (suppress side-effects in helpers). */
export function isTutorialActive(): boolean {
  return useTutorialStore.getState().active;
}

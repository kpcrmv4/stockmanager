'use client';

import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui';
import { Wine, Minus, MessageSquare, ArrowRight, Lock, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useTutorialStore } from '@/stores/tutorial-store';
import { TUTORIAL_FLOWS } from '@/lib/tutorial/steps';
import type { TutorialFeature } from '@/stores/tutorial-store';

const ICONS: Record<TutorialFeature, React.ElementType> = {
  deposit: Wine,
  'receive-deposit': Inbox,
  withdrawal: Minus,
  chat: MessageSquare,
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function TutorialPickerModal({ isOpen, onClose }: Props) {
  const router = useRouter();
  const start = useTutorialStore((s) => s.start);

  const handlePick = (feature: TutorialFeature) => {
    start(feature);
    onClose();
    // Land the user on the right page so the first step's spotlight
    // has something to highlight. (Deposit flow starts on the deposit
    // list, where the "ฝากเหล้าใหม่" button lives. Receive-deposit
    // also starts on /deposit so the "คำขอใหม่" tab card is visible.)
    if (feature === 'deposit') router.push('/deposit');
    else if (feature === 'receive-deposit') router.push('/deposit');
    else if (feature === 'withdrawal') router.push('/deposit/withdrawals');
    else if (feature === 'chat') router.push('/chat');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="เลือกฟีเจอร์ที่อยากลอง" size="md">
      <div className="space-y-3 px-1 pb-1">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          ระบบจะพาคุณกรอกแบบฟอร์มและบันทึกข้อมูลจริง — แต่รายการที่สร้าง
          <span className="font-semibold"> จะเห็นได้เฉพาะคุณ </span>
          และถูกลบอัตโนมัติภายใน 24 ชั่วโมง
        </p>

        <div className="space-y-2">
          {TUTORIAL_FLOWS.map((flow) => {
            const Icon = ICONS[flow.feature];
            return (
              <button
                key={flow.feature}
                type="button"
                disabled={!flow.available}
                onClick={() => flow.available && handlePick(flow.feature)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                  flow.available
                    ? 'border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 dark:border-gray-700 dark:hover:border-indigo-500 dark:hover:bg-indigo-900/10'
                    : 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60 dark:border-gray-700 dark:bg-gray-800/30',
                )}
              >
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                    flow.available
                      ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300'
                      : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500',
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {flow.label}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {flow.description}
                  </p>
                </div>
                {flow.available ? (
                  <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
                ) : (
                  <Lock className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

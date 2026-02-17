'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { X, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';

export interface ToastData {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

const iconMap = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const colorMap = {
  success: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30',
  error: 'border-red-500 bg-red-50 dark:bg-red-900/30',
  warning: 'border-amber-500 bg-amber-50 dark:bg-amber-900/30',
  info: 'border-blue-500 bg-blue-50 dark:bg-blue-900/30',
};

const iconColorMap = {
  success: 'text-emerald-500',
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
};

interface ToastItemProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const Icon = iconMap[toast.type];

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, toast.duration || 5000);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border-l-4 p-4 shadow-lg',
        'animate-in slide-in-from-right',
        colorMap[toast.type]
      )}
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', iconColorMap[toast.type])} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          {toast.title}
        </p>
        {toast.message && (
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
            {toast.message}
          </p>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// Simple global toast state
let toastListeners: Array<(toasts: ToastData[]) => void> = [];
let toasts: ToastData[] = [];

function notify(listeners: Array<(t: ToastData[]) => void>) {
  listeners.forEach((l) => l([...toasts]));
}

export function toast(data: Omit<ToastData, 'id'>) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  toasts = [...toasts, { ...data, id }];
  notify(toastListeners);
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notify(toastListeners);
}

export function ToastContainer() {
  const [items, setItems] = useState<ToastData[]>([]);

  useEffect(() => {
    toastListeners.push(setItems);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== setItems);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 sm:top-4 sm:bottom-auto">
      {items.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismissToast} />
      ))}
    </div>
  );
}

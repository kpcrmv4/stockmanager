'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils/cn';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'w-full rounded-lg border bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors',
            'placeholder:text-gray-400',
            'focus:ring-2 focus:ring-offset-0',
            'disabled:cursor-not-allowed disabled:opacity-60',
            'dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500',
            error
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500'
              : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500/20 dark:border-gray-600 dark:focus:border-indigo-400',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-red-500 dark:text-red-400">{error}</p>
        )}
        {hint && !error && (
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{hint}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

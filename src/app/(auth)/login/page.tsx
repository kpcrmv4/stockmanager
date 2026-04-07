'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { LogIn, Eye, EyeOff, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations('auth');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!identifier.trim()) {
      setError(t('requiredUsername'));
      return;
    }
    if (!password) {
      setError(t('requiredPassword'));
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const trimmed = identifier.trim().toLowerCase();
      const email = trimmed.includes('@') ? trimmed : `${trimmed}@stockmanager.app`;

      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          setError(t('invalidCredentials'));
        } else if (authError.message.includes('Email not confirmed')) {
          setError(t('emailNotConfirmed'));
        } else {
          setError(t('loginError'));
        }
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError(t('networkError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin}>
      {/* Error Alert */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Username */}
      <div className="mb-4">
        <label
          htmlFor="username"
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {t('usernameOrEmail')}
        </label>
        <input
          id="username"
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder={t('enterUsername')}
          autoComplete="username"
          disabled={isLoading}
          className={cn(
            'w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors',
            'placeholder:text-gray-400',
            'focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20',
            'disabled:cursor-not-allowed disabled:opacity-60',
            'dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500',
            'dark:focus:border-indigo-400 dark:focus:ring-indigo-400/20'
          )}
        />
      </div>

      {/* Password */}
      <div className="mb-6">
        <label
          htmlFor="password"
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {t('password')}
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('enterPassword')}
            autoComplete="current-password"
            disabled={isLoading}
            className={cn(
              'w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 pr-11 text-sm text-gray-900 outline-none transition-colors',
              'placeholder:text-gray-400',
              'focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20',
              'disabled:cursor-not-allowed disabled:opacity-60',
              'dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500',
              'dark:focus:border-indigo-400 dark:focus:ring-indigo-400/20'
            )}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors',
          'hover:bg-indigo-700 active:bg-indigo-800',
          'disabled:cursor-not-allowed disabled:opacity-60',
          'dark:bg-indigo-500 dark:hover:bg-indigo-600'
        )}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <LogIn className="h-4 w-4" />
        )}
        {isLoading ? t('loggingIn') : t('login')}
      </button>

      {/* Register Link */}
      <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
        {t('noAccount')}{' '}
        <Link
          href="/register"
          className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          {t('register')}
        </Link>
      </p>
    </form>
  );
}

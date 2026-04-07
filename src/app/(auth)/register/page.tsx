'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { UserPlus, Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react';

export default function RegisterPage() {
  const t = useTranslations('auth');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [registrationCode, setRegistrationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState<{ storeName: string } | null>(null);

  const validateForm = (): string | null => {
    if (!registrationCode.trim()) {
      return t('requiredRegistrationCode');
    }
    if (!username.trim()) {
      return t('requiredUsernameField');
    }
    if (username.trim().length < 3) {
      return t('minUsername');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      return t('usernameFormat');
    }
    if (!password) {
      return t('requiredPasswordField');
    }
    if (password.length < 6) {
      return t('minPasswordLength');
    }
    if (password !== confirmPassword) {
      return t('passwordMismatch');
    }
    return null;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          password,
          displayName: displayName.trim() || null,
          registrationCode: registrationCode.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('registerError'));
        return;
      }

      setSuccess({ storeName: data.storeName });
    } catch {
      setError(t('networkError'));
    } finally {
      setIsLoading(false);
    }
  };

  // Success screen
  if (success) {
    return (
      <div className="text-center">
        <div className="mb-6">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {t('registerSuccess')}
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {t('accountCreatedLinked')}
          </p>
          {success.storeName && (
            <p className="mt-1 text-base font-semibold text-indigo-600 dark:text-indigo-400">
              {success.storeName}
            </p>
          )}
        </div>

        <Link
          href="/login"
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors',
            'hover:bg-indigo-700 active:bg-indigo-800',
            'dark:bg-indigo-500 dark:hover:bg-indigo-600'
          )}
        >
          {t('goToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleRegister}>
      {/* Title */}
      <div className="mb-6 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('registerNewStaff')}
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Registration Code */}
      <div className="mb-4">
        <label
          htmlFor="registrationCode"
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {t('registrationCode')}
        </label>
        <input
          id="registrationCode"
          type="text"
          value={registrationCode}
          onChange={(e) => setRegistrationCode(e.target.value)}
          placeholder={t('enterRegistrationCode')}
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
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          {t('registrationCodeHelp')}
        </p>
      </div>

      {/* Display Name */}
      <div className="mb-4">
        <label
          htmlFor="displayName"
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {t('displayName')}{' '}
          <span className="font-normal text-gray-400">({t('optional', { ns: 'common' })})</span>
        </label>
        <input
          id="displayName"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t('displayNamePlaceholder')}
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

      {/* Username */}
      <div className="mb-4">
        <label
          htmlFor="username"
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {t('username')}
        </label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={t('enterUsernameEn')}
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
      <div className="mb-4">
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
            placeholder={t('minPassword')}
            autoComplete="new-password"
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

      {/* Confirm Password */}
      <div className="mb-6">
        <label
          htmlFor="confirmPassword"
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {t('confirmPassword')}
        </label>
        <div className="relative">
          <input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('enterPasswordAgain')}
            autoComplete="new-password"
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
          <UserPlus className="h-4 w-4" />
        )}
        {isLoading ? t('registering') : t('register')}
      </button>

      {/* Back to Login */}
      <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
        {t('hasAccount')}{' '}
        <Link
          href="/login"
          className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          {t('login')}
        </Link>
      </p>
    </form>
  );
}

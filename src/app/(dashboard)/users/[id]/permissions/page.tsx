'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  Shield,
  ShieldCheck,
  Save,
  Info,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { Button, Card, Badge, toast } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { ROLE_LABELS } from '@/types/roles';
import type { Permission, UserRole } from '@/types/roles';

interface TargetProfile {
  id: string;
  username: string;
  display_name: string | null;
  role: UserRole;
  active: boolean;
}

interface ApiResponse {
  profile: TargetProfile;
  rolePermissions: Permission[] | '*';
  individualPermissions: Permission[];
  allPermissions: Permission[];
}

export default function UserPermissionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const t = useTranslations('permissions');

  const [data, setData] = useState<ApiResponse | null>(null);
  const [selected, setSelected] = useState<Set<Permission>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/users/${id}/permissions`);
        const result = await res.json();
        if (!res.ok) {
          setError(result.error || 'Error');
          return;
        }
        setData(result);
        setSelected(new Set(result.individualPermissions));
      } catch {
        setError('Network error');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [id]);

  const toggle = (perm: Permission) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  };

  const save = async () => {
    if (!data) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/users/${id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: [...selected] }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast({
          type: 'error',
          title: t('saveFailed'),
          message: result.error,
        });
      } else {
        toast({ type: 'success', title: t('saveSuccess') });
      }
    } catch {
      toast({ type: 'error', title: t('networkError') });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link
          href="/users"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
        >
          <ArrowLeft className="h-4 w-4" /> {t('back')}
        </Link>
        <Card>
          <p className="text-sm text-red-600 dark:text-red-400">
            {error || t('notFound')}
          </p>
        </Card>
      </div>
    );
  }

  const rolePermsIsWildcard = data.rolePermissions === '*';
  const rolePermSet: Set<Permission> = rolePermsIsWildcard
    ? new Set(data.allPermissions)
    : new Set(data.rolePermissions as Permission[]);

  const displayName = data.profile.display_name || data.profile.username;
  const hasChanges =
    selected.size !== data.individualPermissions.length ||
    [...selected].some((p) => !data.individualPermissions.includes(p));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/users"
          className="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> {t('back')}
        </Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <Shield className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {t('title')}
              </h1>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                {t('subtitle', { user: displayName })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Target user */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-gray-900 dark:text-white">
              {displayName}
            </p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              @{data.profile.username}
            </p>
          </div>
          <Badge variant="info">{ROLE_LABELS[data.profile.role]}</Badge>
          {!data.profile.active && <Badge variant="danger">{t('disabled')}</Badge>}
        </div>
      </Card>

      {/* Owner edge case */}
      {data.profile.role === 'owner' && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/10">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              {t('ownerNote')}
            </p>
          </div>
        </Card>
      )}

      {/* Info banner */}
      {data.profile.role !== 'owner' && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/10">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <div className="space-y-1 text-sm text-blue-800 dark:text-blue-300">
              <p>{t('infoLine1')}</p>
              <p>{t('infoLine2')}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Permission list */}
      {data.profile.role !== 'owner' && (
        <Card padding="none">
          <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {t('listTitle')}
            </h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {t('listSubtitle')}
            </p>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {data.allPermissions.map((perm) => {
              const fromRole = rolePermSet.has(perm);
              const isGranted = selected.has(perm);
              const effective = fromRole || isGranted;
              const disabled = fromRole; // มีจาก role อยู่แล้ว ไม่ต้องให้ toggle

              return (
                <div
                  key={perm}
                  className={cn(
                    'flex items-start gap-3 px-5 py-4 transition-colors',
                    !disabled && 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                    disabled && 'bg-gray-50/50 dark:bg-gray-800/30'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => !disabled && toggle(perm)}
                    disabled={disabled}
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors',
                      effective
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-gray-300 dark:text-gray-600',
                      !disabled && 'cursor-pointer hover:scale-110',
                      disabled && 'cursor-not-allowed'
                    )}
                    aria-label={perm}
                  >
                    {effective ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Circle className="h-5 w-5" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {t(`perm.${perm}.label`)}
                      </p>
                      {fromRole && (
                        <Badge variant="default">
                          <span className="inline-flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3" />
                            {t('fromRole')}
                          </span>
                        </Badge>
                      )}
                      {!fromRole && isGranted && (
                        <Badge variant="success">{t('granted')}</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {t(`perm.${perm}.description`)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Save bar */}
      {data.profile.role !== 'owner' && (
        <div className="sticky bottom-0 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:shadow-lg dark:border-gray-700 dark:bg-gray-900/95">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {hasChanges ? t('unsavedChanges') : t('noChanges')}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => router.push('/users')}
                disabled={isSaving}
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={save}
                isLoading={isSaving}
                disabled={!hasChanges}
                icon={<Save className="h-4 w-4" />}
              >
                {t('save')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

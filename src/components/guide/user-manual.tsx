'use client';

import { useState, useMemo } from 'react';
import { BookOpen, Filter, ChevronUp } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import type { UserRole } from '@/types/roles';
import { ROLE_LABELS } from '@/types/roles';
import { manualSections, ROLE_COLOR_CLASSES, type ManualSectionId } from './manual-data';
import { useTranslations } from 'next-intl';

import { SectionIntro } from './sections/section-intro';
import { SectionRoles } from './sections/section-roles';
import { SectionLogin } from './sections/section-login';
import { SectionOwner } from './sections/section-owner';
import { SectionManager } from './sections/section-manager';
import { SectionBar } from './sections/section-bar';
import { SectionStaff } from './sections/section-staff';
import { SectionAccountant } from './sections/section-accountant';
import { SectionHq } from './sections/section-hq';
import { SectionCustomer } from './sections/section-customer';
import { SectionDeposit } from './sections/section-deposit';
import { SectionStock } from './sections/section-stock';
import { SectionChat } from './sections/section-chat';
import { SectionTransfer } from './sections/section-transfer';
import { SectionReports } from './sections/section-reports';
import { SectionNotifications } from './sections/section-notifications';
import { SectionSettings } from './sections/section-settings';
import { SectionPrint } from './sections/section-print';
import { SectionCommission } from './sections/section-commission';
import { SectionProfile, SectionTheme, SectionSummary } from './sections/section-extras';

const sectionComponents: Record<ManualSectionId, () => React.JSX.Element> = {
  intro: SectionIntro,
  roles: SectionRoles,
  login: SectionLogin,
  owner: SectionOwner,
  manager: SectionManager,
  bar: SectionBar,
  staff: SectionStaff,
  accountant: SectionAccountant,
  hq: SectionHq,
  customer: SectionCustomer,
  deposit: SectionDeposit,
  stock: SectionStock,
  chat: SectionChat,
  transfer: SectionTransfer,
  reports: SectionReports,
  notifications: SectionNotifications,
  settings: SectionSettings,
  print: SectionPrint,
  commission: SectionCommission,
  profile: SectionProfile,
  theme: SectionTheme,
  summary: SectionSummary,
  images: () => <></>,
};

const STAFF_ROLES: UserRole[] = ['owner', 'manager', 'bar', 'staff', 'accountant', 'hq'];

function isSectionVisible(sectionRoles: 'all' | UserRole[], userRole: UserRole): boolean {
  if (sectionRoles === 'all') return true;
  // Owner can see all role-specific sections
  if (userRole === 'owner') return true;
  return sectionRoles.includes(userRole);
}

export function UserManual() {
  const t = useTranslations('guide');
  const user = useAuthStore((s) => s.user);
  const userRole = user?.role ?? 'staff';
  const [filterRole, setFilterRole] = useState<'auto' | UserRole>('auto');
  const [showFilter, setShowFilter] = useState(false);

  const effectiveRole = filterRole === 'auto' ? userRole : filterRole;

  const visibleSections = useMemo(
    () => manualSections.filter((s) => isSectionVisible(s.roles, effectiveRole)),
    [effectiveRole],
  );

  const tocGroups = useMemo(() => {
    const groups: { nameKey: string; items: typeof visibleSections }[] = [];
    let lastGroup = '';
    for (const section of visibleSections) {
      if (!section.tocGroupKey) continue;
      if (section.tocGroupKey !== lastGroup) {
        groups.push({ nameKey: section.tocGroupKey, items: [] });
        lastGroup = section.tocGroupKey;
      }
      groups[groups.length - 1].items.push(section);
    }
    return groups;
  }, [visibleSections]);

  const scrollToSection = (id: string) => {
    document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-900/40">
            <BookOpen className="h-5 w-5 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('subtitle', { role: ROLE_LABELS[effectiveRole] })}
            </p>
          </div>
        </div>

        {/* Role filter (owner only) */}
        {userRole === 'owner' && (
          <div className="relative">
            <button
              onClick={() => setShowFilter(!showFilter)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                filterRole !== 'auto'
                  ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              <Filter className="h-4 w-4" />
              {filterRole === 'auto' ? t('allRoles') : ROLE_LABELS[filterRole]}
            </button>
            {showFilter && (
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                <button
                  onClick={() => { setFilterRole('auto'); setShowFilter(false); }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${
                    filterRole === 'auto' ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {t('allRolesOwner')}
                </button>
                {STAFF_ROLES.map((role) => {
                  const c = ROLE_COLOR_CLASSES[role];
                  return (
                    <button
                      key={role}
                      onClick={() => { setFilterRole(role); setShowFilter(false); }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${
                        filterRole === role ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <span className={`mr-2 inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${c.badge} ${c.badgeDark}`}>
                        {role}
                      </span>
                      {ROLE_LABELS[role]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hero */}
      <div className="rounded-xl bg-gradient-to-r from-violet-500 to-blue-500 px-6 py-8 text-center text-white">
        <h2 className="mb-2 text-2xl font-extrabold">{t('heroTitle')}</h2>
        <p className="text-sm opacity-90">{t('heroDesc')}</p>
        <span className="mt-3 inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-medium">
          Version 1.0 · March 2026
        </span>
      </div>

      {/* Table of Contents */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-800/50">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
          {t('toc')}
        </h2>
        <div className="space-y-4">
          {tocGroups.map((group) => (
            <div key={group.nameKey}>
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {t(group.nameKey)}
              </div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {group.items.map((s) => {
                  const roleColor =
                    s.roles !== 'all' && s.roles.length === 1
                      ? ROLE_COLOR_CLASSES[s.roles[0]]?.tocNum
                      : undefined;
                  return (
                    <button
                      key={s.id}
                      onClick={() => scrollToSection(s.id)}
                      className="flex items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-left text-sm transition-colors hover:border-gray-200 hover:bg-white dark:hover:border-gray-600 dark:hover:bg-gray-700"
                    >
                      {s.number && (
                        <span
                          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white ${
                            roleColor ?? 'bg-blue-500'
                          }`}
                        >
                          {s.number}
                        </span>
                      )}
                      <span className="font-medium text-gray-700 dark:text-gray-200">{t(s.titleKey)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sections */}
      {visibleSections.map((section) => {
        const SectionContent = sectionComponents[section.id];
        if (!SectionContent) return null;
        return (
          <div key={section.id} id={`sec-${section.id}`} className="scroll-mt-20">
            {/* Section header */}
            <div className="mb-4 flex items-center gap-3 border-b-2 border-gray-200 pb-3 dark:border-gray-700">
              <div
                className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-lg text-white ${section.iconBg}`}
              >
                {section.icon}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {section.number ? `${section.number}. ` : ''}
                  {t(section.titleKey)}
                </h2>
                <div className="text-sm text-gray-500 dark:text-gray-400">{t(section.descKey)}</div>
              </div>
            </div>

            <SectionContent />

            {/* Back to TOC */}
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40"
            >
              <ChevronUp className="h-3.5 w-3.5" />
              {t('backToToc')}
            </button>
          </div>
        );
      })}

      {/* Footer */}
      <div className="border-t border-gray-200 pt-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        <p>StockManager User Manual · Version 1.0 · March 2026</p>
        <p>© StockManager. All rights reserved.</p>
      </div>
    </div>
  );
}

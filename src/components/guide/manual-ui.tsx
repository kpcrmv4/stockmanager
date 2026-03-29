import type { ReactNode } from 'react';
import type { UserRole } from '@/types/roles';
import { ROLE_COLOR_CLASSES } from './manual-data';

export function RoleTag({ role, label }: { role: UserRole; label?: string }) {
  const c = ROLE_COLOR_CLASSES[role];
  const labels: Record<UserRole, string> = {
    owner: 'Owner',
    manager: 'Manager',
    bar: 'Bar',
    staff: 'Staff',
    accountant: 'Accountant',
    hq: 'HQ',
    customer: 'Customer',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-semibold ${c.badge} ${c.badgeDark}`}
    >
      {label ?? labels[role]}
    </span>
  );
}

export function RolesBar({ roles }: { roles: UserRole[] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {roles.map((r) => (
        <RoleTag key={r} role={r} />
      ))}
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      {children}
    </div>
  );
}

export function CardTitle({ icon, children }: { icon?: string; children: ReactNode }) {
  return (
    <h3 className="mb-2.5 flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
      {icon && <span>{icon}</span>}
      {children}
    </h3>
  );
}

export function CardSubtitle({ children }: { children: ReactNode }) {
  return <h4 className="mb-2 mt-4 text-base font-semibold text-gray-900 dark:text-white">{children}</h4>;
}

export function Step({ num, title, children }: { num: number; title: string; children: ReactNode }) {
  return (
    <div className="mb-5 flex gap-4">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-sm font-bold text-white">
        {num}
      </div>
      <div className="flex-1">
        <h4 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h4>
        <div className="text-sm text-gray-500 dark:text-gray-400">{children}</div>
      </div>
    </div>
  );
}

export function TipBox({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 rounded-r-lg border-l-4 border-blue-500 bg-blue-50 px-4 py-3 text-sm text-gray-600 dark:bg-blue-900/20 dark:text-gray-300">
      {children}
    </div>
  );
}

export function WarnBox({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 rounded-r-lg border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
      {children}
    </div>
  );
}

export function MenuItem({
  icon,
  iconBg,
  name,
  desc,
  path,
}: {
  icon: string;
  iconBg: string;
  name: string;
  desc: string;
  path: string;
}) {
  return (
    <div className="mb-2 flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700">
      <div
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-white ${iconBg}`}
      >
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-gray-900 dark:text-white">{name}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{desc}</div>
      </div>
      <code className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
        {path}
      </code>
    </div>
  );
}

export function BottomNavPreview({ items }: { items: { icon: string; label: string; color: string; center?: boolean }[] }) {
  return (
    <div className="my-4 flex items-end justify-around rounded-xl border border-gray-200 bg-white px-2 pb-2.5 pt-3 dark:border-gray-700 dark:bg-gray-800">
      {items.map((item, i) => (
        <div key={i} className="flex flex-col items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
          <div
            className={`flex items-center justify-center rounded-lg text-base ${
              item.center
                ? '-mt-5 h-12 w-12 rounded-full text-white shadow-md ' + item.color
                : 'h-8 w-8'
            }`}
            style={!item.center ? { color: `var(--color-${item.color})` } : undefined}
          >
            {item.icon}
          </div>
          {item.label}
        </div>
      ))}
    </div>
  );
}

export function ImgPlaceholder({ name, desc, icon }: { name: string; desc: string; icon: string }) {
  return (
    <div className="my-4 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-5 py-10 text-center dark:border-gray-600 dark:bg-gray-800/50">
      <div className="mb-2 text-2xl opacity-50">{icon}</div>
      <code className="mb-1 inline-block rounded bg-gray-200 px-3 py-0.5 text-xs font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
        {name}
      </code>
      <div className="text-xs text-gray-500 dark:text-gray-400">{desc}</div>
    </div>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={`border-b border-gray-200 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white ${className ?? ''}`}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td
      className={`border-b border-gray-100 px-4 py-2.5 text-gray-600 dark:border-gray-800 dark:text-gray-300 ${className ?? ''}`}
    >
      {children}
    </td>
  );
}

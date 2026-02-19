/**
 * Tailwind color class mappings for module colors.
 * Used by both bottom-nav and sidebar for per-module color theming.
 * Full class names are spelled out so Tailwind can detect them at build time.
 */

export interface ModuleColorClasses {
  text: string;
  bg: string;
  gradient: string;
}

export const moduleColorMap: Record<string, ModuleColorClasses> = {
  violet: {
    text: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-50 dark:bg-violet-900/30',
    gradient:
      'from-violet-500 to-purple-600 shadow-violet-200/50 dark:shadow-violet-900/40',
  },
  indigo: {
    text: 'text-indigo-600 dark:text-indigo-400',
    bg: 'bg-indigo-50 dark:bg-indigo-900/30',
    gradient:
      'from-indigo-500 to-blue-600 shadow-indigo-200/50 dark:shadow-indigo-900/40',
  },
  emerald: {
    text: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    gradient:
      'from-emerald-500 to-green-600 shadow-emerald-200/50 dark:shadow-emerald-900/40',
  },
  blue: {
    text: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/30',
    gradient:
      'from-blue-500 to-cyan-600 shadow-blue-200/50 dark:shadow-blue-900/40',
  },
  amber: {
    text: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-900/30',
    gradient:
      'from-amber-500 to-orange-600 shadow-amber-200/50 dark:shadow-amber-900/40',
  },
  pink: {
    text: 'text-pink-600 dark:text-pink-400',
    bg: 'bg-pink-50 dark:bg-pink-900/30',
    gradient:
      'from-pink-500 to-rose-600 shadow-pink-200/50 dark:shadow-pink-900/40',
  },
  cyan: {
    text: 'text-cyan-600 dark:text-cyan-400',
    bg: 'bg-cyan-50 dark:bg-cyan-900/30',
    gradient:
      'from-cyan-500 to-teal-600 shadow-cyan-200/50 dark:shadow-cyan-900/40',
  },
  orange: {
    text: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-900/30',
    gradient:
      'from-orange-500 to-red-600 shadow-orange-200/50 dark:shadow-orange-900/40',
  },
  gray: {
    text: 'text-gray-600 dark:text-gray-400',
    bg: 'bg-gray-100 dark:bg-gray-800/50',
    gradient:
      'from-gray-500 to-gray-600 shadow-gray-200/50 dark:shadow-gray-900/40',
  },
  teal: {
    text: 'text-teal-600 dark:text-teal-400',
    bg: 'bg-teal-50 dark:bg-teal-900/30',
    gradient:
      'from-teal-500 to-cyan-600 shadow-teal-200/50 dark:shadow-teal-900/40',
  },
  rose: {
    text: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-900/30',
    gradient:
      'from-rose-500 to-pink-600 shadow-rose-200/50 dark:shadow-rose-900/40',
  },
};

export function getModuleColors(color: string): ModuleColorClasses {
  return moduleColorMap[color] || moduleColorMap.blue;
}

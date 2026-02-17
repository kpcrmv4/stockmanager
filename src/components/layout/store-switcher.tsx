'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Store, Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import type { Store as StoreType } from '@/types/database';

interface StoreSwitcherProps {
  stores: StoreType[];
  collapsed?: boolean;
}

export function StoreSwitcher({ stores, collapsed = false }: StoreSwitcherProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { currentStoreId, setCurrentStoreId } = useAppStore();
  const { user } = useAuthStore();

  const currentStore = stores.find((s) => s.id === currentStoreId);

  // ตั้งค่าร้านเริ่มต้นถ้ายังไม่ได้เลือก
  useEffect(() => {
    if (!currentStoreId && stores.length > 0) {
      setCurrentStoreId(stores[0].id);
    }
  }, [currentStoreId, stores, setCurrentStoreId]);

  // ปิด dropdown เมื่อคลิกข้างนอก
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (stores.length === 0) return null;

  // ถ้ามีร้านเดียว ไม่ต้องเป็น dropdown
  if (stores.length === 1) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-2',
          'bg-gray-100 dark:bg-gray-800',
          collapsed && 'justify-center px-2'
        )}
      >
        <Store className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
        {!collapsed && (
          <span className="truncate text-sm font-medium text-gray-700 dark:text-gray-200">
            {stores[0].store_name}
          </span>
        )}
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-3 py-2',
          'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700',
          'transition-colors duration-150',
          collapsed && 'justify-center px-2'
        )}
      >
        <Store className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-left text-sm font-medium text-gray-700 dark:text-gray-200">
              {currentStore?.store_name ?? 'เลือกสาขา'}
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200',
                open && 'rotate-180'
              )}
            />
          </>
        )}
      </button>

      {open && (
        <div
          className={cn(
            'absolute z-50 mt-1 w-full min-w-[200px] overflow-hidden rounded-lg border',
            'border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800',
            collapsed && 'left-full ml-2 top-0'
          )}
        >
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
            เลือกสาขา
          </div>
          {stores.map((store) => (
            <button
              key={store.id}
              type="button"
              onClick={() => {
                setCurrentStoreId(store.id);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-sm',
                'hover:bg-gray-100 dark:hover:bg-gray-700',
                'transition-colors duration-150',
                store.id === currentStoreId &&
                  'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
              )}
            >
              <span className="flex-1 truncate text-left">{store.store_name}</span>
              {store.id === currentStoreId && (
                <Check className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

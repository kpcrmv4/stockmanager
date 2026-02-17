import type { UserRole, Permission } from '@/types/roles';
import { ROLE_PERMISSIONS } from '@/types/roles';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  permissions: Permission[];
  storeIds: string[];
  lineUserId?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export function hasPermission(user: AuthUser, permission: Permission): boolean {
  const rolePerms = ROLE_PERMISSIONS[user.role];
  if ((rolePerms as string[]).includes('*')) return true;
  return (
    (rolePerms as Permission[]).includes(permission) ||
    user.permissions.includes(permission)
  );
}

export function hasAnyPermission(user: AuthUser, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(user, p));
}

export function hasAllPermissions(user: AuthUser, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(user, p));
}

export function canAccessStore(user: AuthUser, storeId: string): boolean {
  if (user.role === 'owner' || user.role === 'accountant') return true;
  return user.storeIds.includes(storeId);
}

export function isDesktopRole(role: UserRole): boolean {
  return ['owner', 'accountant', 'manager'].includes(role);
}

export function isMobileRole(role: UserRole): boolean {
  return ['staff', 'bar'].includes(role);
}

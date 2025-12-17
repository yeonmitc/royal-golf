// src/utils/admin.js
import { useAdminStore } from '../store/adminStore';

export function requireAdminOrThrow() {
  const ok = useAdminStore.getState().isAuthorized();
  if (!ok) {
    // unify error message for callers
    throw new Error('ADMIN_REQUIRED');
  }
}

export function isAdmin() {
  return useAdminStore.getState().isAuthorized();
}

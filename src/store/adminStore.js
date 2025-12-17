// src/store/adminStore.js
import { create } from 'zustand';

const STORAGE_KEY = 'royal_admin_session_v1';

function nowMs() {
  return Date.now();
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { isAdmin: false, expiresAt: 0 };
    const parsed = JSON.parse(raw);
    const expiresAt = Number(parsed?.expiresAt || 0);
    if (!expiresAt || expiresAt <= nowMs()) return { isAdmin: false, expiresAt: 0 };
    return { isAdmin: true, expiresAt };
  } catch {
    return { isAdmin: false, expiresAt: 0 };
  }
}

function saveSession(expiresAt) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ expiresAt }));
  } catch {
    // ignore
  }
}

function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export const useAdminStore = create((set, get) => ({
  ...loadSession(),

  // UI state
  loginModalOpen: false,
  openLoginModal: () => set({ loginModalOpen: true }),
  closeLoginModal: () => set({ loginModalOpen: false }),

  setSession: (expiresAt) => {
    const exp = Number(expiresAt || 0);
    if (!exp || exp <= nowMs()) {
      clearSession();
      set({ isAdmin: false, expiresAt: 0 });
      return;
    }
    saveSession(exp);
    set({ isAdmin: true, expiresAt: exp });
  },

  logout: () => {
    clearSession();
    set({ isAdmin: false, expiresAt: 0, loginModalOpen: false });
  },

  // true/false only, and auto-expire
  isAuthorized: () => {
    const { isAdmin, expiresAt } = get();
    if (!isAdmin) return false;
    if (!expiresAt || expiresAt <= nowMs()) {
      clearSession();
      set({ isAdmin: false, expiresAt: 0 });
      return false;
    }
    return true;
  },
}));

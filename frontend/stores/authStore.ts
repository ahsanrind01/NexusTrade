import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mirrors the shape returned by auth-service's getProfile controller.
// name/email/id are always present (also returned by /login, /signup,
// /google); the rest only arrive once GET /auth/profile has been fetched.
export interface User {
  id: string;
  email: string;
  name: string;
  provider?: 'LOCAL' | 'GOOGLE';
  profileImage?: string | null;
  phoneNumber?: string | null;
  phoneVerified?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  setAuth: (token: string, user: User) => void;
  updateUser: (patch: Partial<User>) => void;
  clearAuth: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      hasHydrated: false,

      setAuth: (token, user) => set({ token, user, isAuthenticated: true }),

      updateUser: (patch) =>
        set((s) => ({ user: s.user ? { ...s.user, ...patch } : s.user })),

      clearAuth: () => set({ token: null, user: null, isAuthenticated: false }),

      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'nexustrade-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ token: s.token, user: s.user, isAuthenticated: s.isAuthenticated }),
      onRehydrateStorage: () => (state) => {
        // Runs once AsyncStorage has finished restoring state, whether or
        // not a session existed — this is what app/index.tsx waits on
        // before deciding to route to (auth) or (tabs).
        state?.setHasHydrated(true);
      },
    }
  )
);
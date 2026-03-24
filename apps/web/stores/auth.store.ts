import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Plan = 'free' | 'pro' | 'business';
export type Locale = 'ru' | 'pl' | 'ua' | 'en';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  plan: Plan;
  language: Locale;
  createdAt: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setUser: (user: User) => void;
  setAccessToken: (token: string) => void;
  updateLanguage: (language: Locale) => void;
  updatePlan: (plan: Plan) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,

      setUser: (user) =>
        set({ user, isAuthenticated: true }),

      setAccessToken: (accessToken) =>
        set({ accessToken }),

      updateLanguage: (language) =>
        set((state) => ({
          user: state.user ? { ...state.user, language } : null,
        })),

      updatePlan: (plan) =>
        set((state) => ({
          user: state.user ? { ...state.user, plan } : null,
        })),

      logout: () =>
        set({ user: null, accessToken: null, isAuthenticated: false }),
    }),
    {
      name: 'ecompilot-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — Auth Store (Zustand + SecureStore persistence)
// ─────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import * as SecureStore from "expo-secure-store";
import type { User, AuthTokens, Language, Plan } from "@/types";
import { setI18nLanguage } from "@/lib/i18n";
import { authApi, configureApiClient } from "@/lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// SecureStore adapter for Zustand persist
// ─────────────────────────────────────────────────────────────────────────────

const secureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // SecureStore unavailable (simulator without biometrics)
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// State shape
// ─────────────────────────────────────────────────────────────────────────────

interface AuthState {
  // Data
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Preferences
  language: Language;
  biometricEnabled: boolean;

  // Actions
  setUser: (user: User, tokens: AuthTokens) => void;
  setLanguage: (lang: Language) => void;
  setBiometricEnabled: (enabled: boolean) => void;
  clearError: () => void;
  refreshAccessToken: () => Promise<string | null>;
  logout: () => Promise<void>;

  // Computed helpers
  getPlan: () => Plan;
  getAccessToken: () => string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      language: "pl",
      biometricEnabled: false,

      setUser: (user, tokens) => {
        set({
          user,
          tokens,
          isAuthenticated: true,
          error: null,
        });
        setI18nLanguage(user.language);
        // Wire up the API client with current token
        configureApiClient({
          getToken: () => get().getAccessToken(),
          refreshToken: () => get().refreshAccessToken(),
        });
      },

      setLanguage: (lang) => {
        set({ language: lang });
        setI18nLanguage(lang);
      },

      setBiometricEnabled: (enabled) => {
        set({ biometricEnabled: enabled });
      },

      clearError: () => set({ error: null }),

      getAccessToken: () => {
        const { tokens } = get();
        if (tokens === null) return null;
        if (Date.now() > tokens.expiresAt) return null;
        return tokens.accessToken;
      },

      getPlan: () => {
        const { user } = get();
        return user?.plan ?? "free";
      },

      refreshAccessToken: async () => {
        const { tokens } = get();
        if (tokens === null) return null;

        try {
          const result = await authApi.refresh(tokens.refreshToken);
          set((state) => ({
            tokens:
              state.tokens !== null
                ? {
                    ...state.tokens,
                    accessToken: result.accessToken,
                    expiresAt: result.expiresAt,
                  }
                : null,
          }));
          return result.accessToken;
        } catch {
          // Refresh failed — force logout
          await get().logout();
          return null;
        }
      },

      logout: async () => {
        try {
          await authApi.logout();
        } catch {
          // Best-effort logout
        }
        set({
          user: null,
          tokens: null,
          isAuthenticated: false,
          error: null,
        });
      },
    }),
    {
      name: "ecompilot-auth",
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
        isAuthenticated: state.isAuthenticated,
        language: state.language,
        biometricEnabled: state.biometricEnabled,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.user !== null && state?.user !== undefined) {
          setI18nLanguage(state.user.language);
          configureApiClient({
            getToken: () => useAuthStore.getState().getAccessToken(),
            refreshToken: () =>
              useAuthStore.getState().refreshAccessToken(),
          });
        }
      },
    }
  )
);

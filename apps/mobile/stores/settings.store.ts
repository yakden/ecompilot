// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — Settings Store
// ─────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Theme } from "@/types";

interface SettingsState {
  theme: Theme;
  notificationsEnabled: boolean;
  nicheAlerts: boolean;
  aiResponseNotifications: boolean;
  planUpdateNotifications: boolean;
  hapticFeedback: boolean;

  setTheme: (theme: Theme) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setNicheAlerts: (enabled: boolean) => void;
  setAiResponseNotifications: (enabled: boolean) => void;
  setPlanUpdateNotifications: (enabled: boolean) => void;
  setHapticFeedback: (enabled: boolean) => void;
  resetSettings: () => void;
}

const defaultSettings = {
  theme: "system" as Theme,
  notificationsEnabled: true,
  nicheAlerts: true,
  aiResponseNotifications: false,
  planUpdateNotifications: true,
  hapticFeedback: true,
};

// We use AsyncStorage for non-sensitive settings (theme, notifications prefs)
// SecureStore is reserved for auth tokens in auth.store.ts
const asyncStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      // Ignore storage errors
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // Ignore
    }
  },
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,

      setTheme: (theme) => set({ theme }),
      setNotificationsEnabled: (enabled) =>
        set({ notificationsEnabled: enabled }),
      setNicheAlerts: (enabled) => set({ nicheAlerts: enabled }),
      setAiResponseNotifications: (enabled) =>
        set({ aiResponseNotifications: enabled }),
      setPlanUpdateNotifications: (enabled) =>
        set({ planUpdateNotifications: enabled }),
      setHapticFeedback: (enabled) => set({ hapticFeedback: enabled }),

      resetSettings: () => set(defaultSettings),
    }),
    {
      name: "ecompilot-settings",
      storage: createJSONStorage(() => asyncStorageAdapter),
    }
  )
);

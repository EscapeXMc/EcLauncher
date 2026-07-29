import { create } from "zustand";
import { api } from "../lib/api";
import type { Settings, Instance, ThemeColors } from "../lib/types";
import { THEME_VARIANTS, type ThemeVariant } from "../lib/themes";

const CUSTOM_THEMES_KEY = "ec-custom-themes";

function getStoredThemeMode(): ThemeVariant {
  try {
    const stored = localStorage.getItem("ec-theme-mode");
    if (stored === "dark" || stored === "light") return stored;
  } catch {}
  return "dark";
}

function loadCustomThemeColors(themeName: string, mode: ThemeVariant): ThemeColors | null {
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_KEY);
    if (!raw) return null;
    const custom: Record<string, { colors: ThemeColors }> = JSON.parse(raw);
    if (custom[themeName]) return custom[themeName].colors;
  } catch {}
  return null;
}

interface LauncherStore {
  settings: Settings;
  instances: Instance[];
  currentPage: string;
  selectedInstance: string;
  isLoading: boolean;
  loadingMessage: string;
  themeName: string;
  themeColors: ThemeColors;
  themeMode: ThemeVariant;
  logs: string[];
  playTimes: Record<string, number>;
  systemInfo: { cpu: number; ram_pct: number; ram_used: number; ram_total: number; disk_pct: number; disk_used: number; disk_total: number };
  liveVersion: string;
  releaseNotes: string;

  loadSettings: () => Promise<void>;
  saveSettings: (s: Record<string, any>) => Promise<void>;
  setSetting: (key: string, value: any) => Promise<void>;
  loadInstances: () => Promise<void>;
  setPage: (page: string) => void;
  setSelectedInstance: (name: string) => void;
  setLoading: (loading: boolean, message?: string) => void;
  setTheme: (name: string) => void;
  setThemeMode: (mode: ThemeVariant) => void;
  loadLogs: () => Promise<void>;
  log: (msg: string) => void;
  loadPlayTimes: () => Promise<void>;
  loadSystemInfo: () => Promise<void>;
  fetchLiveVersion: () => Promise<void>;
}

const DEFAULT_THEME = "cartoon";
const initialThemeMode = getStoredThemeMode();

export const useLauncherStore = create<LauncherStore>((set, get) => ({
  settings: {},
  instances: [],
  currentPage: "home",
  selectedInstance: "",
  isLoading: false,
  loadingMessage: "",
  themeName: DEFAULT_THEME,
  themeColors: THEME_VARIANTS[initialThemeMode].colors,
  themeMode: initialThemeMode,
  logs: [],
  playTimes: {},
  systemInfo: { cpu: 0, ram_pct: 0, ram_used: 0, ram_total: 0, disk_pct: 0, disk_used: 0, disk_total: 0 },
  liveVersion: "5.9",
  releaseNotes: "",

  loadSettings: async () => {
    try {
      const settings = await api.settings.get();
      const themeName = settings.theme || DEFAULT_THEME;
      const mode = getStoredThemeMode();
      const customColors = loadCustomThemeColors(themeName, mode);
      set({
        settings,
        themeName,
        themeColors: customColors || THEME_VARIANTS[mode].colors,
        themeMode: mode,
      });
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  },

  saveSettings: async (s: Record<string, any>) => {
    try {
      await api.settings.save(s);
      const settings = { ...get().settings, ...s };
      const themeName = settings.theme || DEFAULT_THEME;
      const mode = getStoredThemeMode();
      const customColors = loadCustomThemeColors(themeName, mode);
      set({
        settings,
        themeName,
        themeColors: customColors || THEME_VARIANTS[mode].colors,
        themeMode: mode,
      });
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  },

  setSetting: async (key: string, value: any) => {
    await api.settings.saveOne(key, value);
    const settings = { ...get().settings, [key]: value };
    if (key === "theme") {
      const mode = getStoredThemeMode();
      const customColors = loadCustomThemeColors(value, mode);
      set({
        settings,
        themeName: value,
        themeColors: customColors || THEME_VARIANTS[mode].colors,
        themeMode: mode,
      });
    } else {
      set({ settings });
    }
  },

  loadInstances: async () => {
    try {
      const instances = await api.instances.get();
      set({ instances });
    } catch (err) {
      console.error("Failed to load instances:", err);
    }
  },

  setPage: (page) => set({ currentPage: page }),
  setSelectedInstance: (name) => set({ selectedInstance: name }),
  setLoading: (loading, message = "") => set({ isLoading: loading, loadingMessage: message }),
  setTheme: (name: string) => {
    const mode = getStoredThemeMode();
    const customColors = loadCustomThemeColors(name, mode);
    set({ themeName: name, themeColors: customColors || THEME_VARIANTS[mode].colors });
    api.settings.saveOne("theme", name).catch(console.error);
  },

  setThemeMode: (mode: ThemeVariant) => {
    const variant = THEME_VARIANTS[mode];
    const currentTheme = get().themeName;
    const customColors = loadCustomThemeColors(currentTheme, mode);
    set({ themeMode: mode, themeColors: customColors || variant.colors });
    try {
      localStorage.setItem("ec-theme-mode", mode);
    } catch {}
  },

  loadLogs: async () => {
    try {
      const logs = await api.logs.get();
      set({ logs });
    } catch {}
  },

  log: (msg: string) => {
    const now = new Date().toLocaleTimeString();
    set((s) => ({ logs: [...s.logs, `[${now}] ${msg}`] }));
  },

  loadPlayTimes: async () => {
    try {
      const playTimes = await api.playTimes.get();
      set({ playTimes });
    } catch {}
  },

  loadSystemInfo: async () => {
    try {
      const systemInfo = await api.system.getInfo();
      set({ systemInfo });
    } catch {}
  },

  fetchLiveVersion: async () => {
    try {
      const v = await api.version.getLatest();
      set({ liveVersion: v.tag || "5.9", releaseNotes: v.notes || "" });
    } catch {
      set({ liveVersion: "5.9" });
    }
  },
}));

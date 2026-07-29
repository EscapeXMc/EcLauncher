import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLauncherStore } from "../../stores";
import { THEMES, type ThemeColors } from "../../lib/types";
import { THEME_VARIANTS, type ThemeVariant } from "../../lib/themes";
import { Palette, Plus, Trash2, Copy, Check, ArrowLeft, RotateCcw, Sparkles } from "lucide-react";
import { GlassInput } from "../ui/FormControls";

const CUSTOM_THEMES_KEY = "ec-custom-themes";

function loadCustomThemes(): Record<string, { display_name: string; colors: ThemeColors }> {
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveCustomThemes(themes: Record<string, { display_name: string; colors: ThemeColors }>) {
  localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes));
}

function lighten(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + amount);
  const g = Math.min(255, ((num >> 8) & 0xff) + amount);
  const b = Math.min(255, (num & 0xff) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function darken(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, ((num >> 16) & 0xff) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function hexToHsl(hex: string): [number, number, number] {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = ((num >> 16) & 0xff) / 255;
  const g = ((num >> 8) & 0xff) / 255;
  const b = (num & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}

function generateThemeFromAccent(accent: string, name: string): ThemeColors {
  const [h, s, l] = hexToHsl(accent);
  const bg = darken(accent, 200);
  const bgMain = darken(accent, 220);
  const bgNav = darken(accent, 215);
  const bgCard = darken(accent, 200);
  const bgCard2 = darken(accent, 185);
  const bgGlass = darken(accent, 170);
  const bgHover = darken(accent, 155);

  return {
    bg_main: bgMain,
    bg_nav: bgNav,
    bg_card: bgCard,
    bg_card2: bgCard2,
    bg_glass: bgGlass,
    bg_hover: bgHover,
    accent,
    accent2: lighten(accent, 30),
    accent_hover: lighten(accent, 20),
    accent_dim: darken(accent, 170),
    accent_glow: accent,
    accent_text: "#ffffff",
    text_main: "#e8f0ff",
    text_sub: lighten(accent, 60),
    text_muted: darken(accent, 100),
    border: darken(accent, 130),
    border_bright: darken(accent, 80),
    border_accent: accent,
    danger: "#ff4466",
    warn: "#ffaa00",
    success: "#44ff88",
    blue: accent,
    purple: lighten(accent, 40),
    green: "#44ff88",
    tag_fabric: accent,
    tag_forge: "#ffaa00",
    tag_vanilla: lighten(accent, 10),
    tag_quilt: lighten(accent, 40),
    tag_neo: "#ffaa00",
    nav_active: accent,
    nav_inactive: darken(accent, 100),
    server1: darken(accent, 180),
    server2: darken(accent, 160),
    server3: darken(accent, 140),
    server4: darken(accent, 120),
    server5: darken(accent, 100),
    glass_reflect: lighten(accent, 40),
    particle_color: lighten(accent, 10),
  };
}

const QUICK_COLORS = [
  "#1e88e5", "#ff3366", "#ff0022", "#b847ff", "#00aaff",
  "#00c8e8", "#00e6a0", "#ff4030", "#00e888", "#6366f1",
  "#f59e0b", "#ef4444", "#22c55e", "#ec4899", "#8b5cf6",
];

const COLOR_FIELDS: Array<{ key: keyof ThemeColors; label: string; group: string }> = [
  { key: "accent", label: "Accent", group: "Core" },
  { key: "accent2", label: "Accent 2", group: "Core" },
  { key: "accent_glow", label: "Glow", group: "Core" },
  { key: "bg_main", label: "Background", group: "Background" },
  { key: "bg_nav", label: "Navbar", group: "Background" },
  { key: "bg_card", label: "Card", group: "Background" },
  { key: "bg_card2", label: "Card 2", group: "Background" },
  { key: "bg_glass", label: "Glass", group: "Background" },
  { key: "bg_hover", label: "Hover", group: "Background" },
  { key: "text_main", label: "Text", group: "Text" },
  { key: "text_sub", label: "Sub Text", group: "Text" },
  { key: "text_muted", label: "Muted Text", group: "Text" },
  { key: "border", label: "Border", group: "Borders" },
  { key: "border_bright", label: "Bright Border", group: "Borders" },
  { key: "border_accent", label: "Accent Border", group: "Borders" },
  { key: "danger", label: "Danger", group: "Semantic" },
  { key: "warn", label: "Warning", group: "Semantic" },
  { key: "success", label: "Success", group: "Semantic" },
  { key: "nav_active", label: "Nav Active", group: "Navigation" },
  { key: "nav_inactive", label: "Nav Inactive", group: "Navigation" },
  { key: "particle_color", label: "Particles", group: "Effects" },
  { key: "glass_reflect", label: "Glass Reflect", group: "Effects" },
];

interface ThemeCardProps {
  name: string;
  displayName: string;
  accent: string;
  colors: ThemeColors;
  isActive: boolean;
  isCustom?: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}

function ThemeCard({ name, displayName, accent, colors, isActive, isCustom, onSelect, onDelete }: ThemeCardProps) {
  const { themeColors } = useLauncherStore();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.03, y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className="relative cursor-pointer rounded-2xl overflow-hidden transition-all"
      style={{
        border: isActive ? `2px solid ${colors.accent}` : `1px solid ${themeColors.border}`,
        boxShadow: isActive ? `0 0 20px ${colors.accent}40, 0 8px 32px rgba(0,0,0,0.3)` : `0 4px 16px rgba(0,0,0,0.2)`,
      }}
    >
      {/* Preview */}
      <div className="h-28 relative" style={{ background: colors.bg_main }}>
        <div className="absolute top-2 left-2 right-2 h-5 rounded-lg" style={{ background: colors.bg_nav, border: `1px solid ${colors.border}` }} />
        <div className="absolute top-9 left-2 bottom-2 w-8 rounded-lg" style={{ background: colors.bg_nav, border: `1px solid ${colors.border}` }}>
          <div className="w-5 h-5 mx-auto mt-1.5 rounded-md" style={{ background: colors.accent, opacity: 0.8 }} />
        </div>
        <div className="absolute top-9 left-13 right-2 bottom-2 rounded-lg p-2" style={{ background: colors.bg_card, border: `1px solid ${colors.border}` }}>
          <div className="w-3/4 h-2 rounded" style={{ background: colors.text_main, opacity: 0.3 }} />
          <div className="w-1/2 h-2 rounded mt-1.5" style={{ background: colors.text_sub, opacity: 0.2 }} />
          <div className="flex gap-1.5 mt-2">
            <div className="w-6 h-4 rounded" style={{ background: colors.accent, opacity: 0.6 }} />
            <div className="w-6 h-4 rounded" style={{ background: colors.purple, opacity: 0.4 }} />
            <div className="w-6 h-4 rounded" style={{ background: colors.blue, opacity: 0.4 }} />
          </div>
        </div>
      </div>

      <div className="px-3 py-2.5 flex items-center justify-between" style={{ background: colors.bg_nav, borderTop: `1px solid ${colors.border}` }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ background: accent, boxShadow: `0 0 8px ${accent}60` }} />
          <span className="tinycaps text-[11px] font-bold truncate" style={{ color: colors.text_main }}>{displayName}</span>
        </div>
        <div className="flex items-center gap-1">
          {isCustom && onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="w-6 h-6 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10"
              title="Delete theme"
            >
              <Trash2 size={10} style={{ color: colors.danger }} />
            </button>
          )}
          {isActive && (
            <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: accent }}>
              <Check size={10} color="#fff" />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function ThemesPage() {
  const { themeColors, themeName, themeMode, setTheme } = useLauncherStore();
  const [customThemes, setCustomThemes] = useState<Record<string, { display_name: string; colors: ThemeColors }>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [editColors, setEditColors] = useState<ThemeColors>(themeColors);
  const [editName, setEditName] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("Core");
  const [copiedTheme, setCopiedTheme] = useState<string | null>(null);

  useEffect(() => {
    setCustomThemes(loadCustomThemes());
  }, []);

  const getActiveThemeColors = useCallback((name: string, isCustom: boolean): ThemeColors => {
    if (isCustom && customThemes[name]) return customThemes[name].colors;
    if (THEMES[name]) return THEMES[name].colors;
    return themeColors;
  }, [customThemes, themeColors]);

  const handleSelect = (name: string, isCustom: boolean) => {
    if (isCustom && customThemes[name]) {
      setTheme(name);
      const variant = THEME_VARIANTS[themeMode];
      useLauncherStore.setState({ themeColors: customThemes[name].colors });
    } else if (THEMES[name]) {
      setTheme(name);
      const variant = THEME_VARIANTS[themeMode];
      useLauncherStore.setState({ themeColors: THEMES[name].colors });
    }
  };

  const handleNewTheme = () => {
    const id = `custom-${Date.now()}`;
    const newColors = generateThemeFromAccent(themeColors.accent, id);
    setCustomThemes((prev) => {
      const next = { ...prev, [id]: { display_name: "My Theme", colors: newColors } };
      saveCustomThemes(next);
      return next;
    });
    setEditing(id);
    setEditColors(newColors);
    setEditName("My Theme");
  };

  const handleEditExisting = (id: string, isCustom: boolean) => {
    const colors = getActiveThemeColors(id, isCustom);
    setEditing(id);
    setEditColors({ ...colors });
    setEditName(isCustom ? (customThemes[id]?.display_name || id) : (THEMES[id]?.display_name || id));
  };

  const handleColorChange = (key: keyof ThemeColors, value: string) => {
    setEditColors((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveEdit = () => {
    if (!editing) return;
    const isBuiltIn = !!THEMES[editing];
    const id = isBuiltIn ? `custom-${editing}` : editing;
    const finalName = isBuiltIn ? `${editName} (Custom)` : editName;
    setCustomThemes((prev) => {
      const next = { ...prev, [id]: { display_name: finalName, colors: { ...editColors } } };
      saveCustomThemes(next);
      return next;
    });
    useLauncherStore.setState({ themeColors: { ...editColors } });
    useLauncherStore.getState().setSetting("theme", id);
    setEditing(null);
  };

  const handleDuplicate = (id: string, isCustom: boolean) => {
    const source = isCustom ? customThemes[id] : THEMES[id];
    if (!source) return;
    const newId = `custom-${Date.now()}`;
    setCustomThemes((prev) => {
      const next = { ...prev, [newId]: { display_name: `${source.display_name} Copy`, colors: { ...source.colors } } };
      saveCustomThemes(next);
      return next;
    });
    setCopiedTheme(newId);
    setTimeout(() => setCopiedTheme(null), 2000);
  };

  const handleDelete = (id: string) => {
    setCustomThemes((prev) => {
      const next = { ...prev };
      delete next[id];
      saveCustomThemes(next);
      return next;
    });
    if (editing === id) setEditing(null);
  };

  const handleAutoGenerate = (accent: string) => {
    const newColors = generateThemeFromAccent(accent, editName);
    setEditColors(newColors);
  };

  const handleResetField = (key: keyof ThemeColors, original: ThemeColors) => {
    setEditColors((prev) => ({ ...prev, [key]: original[key] }));
  };

  const groups = [...new Set(COLOR_FIELDS.map((f) => f.group))];
  const filteredFields = COLOR_FIELDS.filter((f) => f.group === selectedGroup);

  const originalColors = editing ? getActiveThemeColors(editing, !!customThemes[editing]) : themeColors;

  if (editing) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: `1px solid ${themeColors.border}` }}>
          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setEditing(null)}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
              style={{ background: `${themeColors.text_muted}15` }}
            >
              <ArrowLeft size={14} style={{ color: themeColors.text_sub }} />
            </motion.button>
            <div>
              <h2 className="tinycaps text-sm font-bold" style={{ color: themeColors.text_main }}>Theme Editor</h2>
              <p className="text-[10px]" style={{ color: themeColors.text_muted }}>Customize colors for your theme</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setEditColors(originalColors)}
              className="px-3 py-1.5 rounded-xl text-[10px] tinycaps font-bold flex items-center gap-1.5"
              style={{ background: `${themeColors.text_muted}15`, color: themeColors.text_sub, border: `1px solid ${themeColors.border}` }}
            >
              <RotateCcw size={10} /> Reset
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSaveEdit}
              className="px-4 py-1.5 rounded-xl text-[10px] tinycaps font-bold flex items-center gap-1.5"
              style={{ background: themeColors.accent, color: "#fff" }}
            >
              <Check size={10} /> Save Theme
            </motion.button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="max-w-4xl mx-auto">
            {/* Name */}
            <div className="mb-5">
              <label className="text-[10px] tinycaps font-bold mb-1.5 block" style={{ color: themeColors.text_sub }}>Theme Name</label>
              <GlassInput value={editName} onChange={setEditName} placeholder="My Theme" />
            </div>

            {/* Quick Accent Colors */}
            <div className="mb-5">
              <label className="text-[10px] tinycaps font-bold mb-1.5 block" style={{ color: themeColors.text_sub }}>Quick Accent Colors</label>
              <div className="flex gap-2 flex-wrap">
                {QUICK_COLORS.map((c) => (
                  <motion.button
                    key={c}
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleAutoGenerate(c)}
                    className="w-7 h-7 rounded-xl transition-all"
                    style={{
                      background: c,
                      boxShadow: editColors.accent === c ? `0 0 12px ${c}80` : "none",
                      border: editColors.accent === c ? "2px solid #fff" : "2px solid transparent",
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="mb-5 rounded-2xl overflow-hidden" style={{ border: `1px solid ${themeColors.border}` }}>
              <div className="h-40 relative" style={{ background: editColors.bg_main }}>
                <div className="absolute top-3 left-3 right-3 h-7 rounded-xl" style={{ background: editColors.bg_nav, border: `1px solid ${editColors.border}` }}>
                  <div className="flex items-center h-full px-3 gap-2">
                    <div className="w-4 h-4 rounded" style={{ background: editColors.accent }} />
                    <span className="text-[10px] font-bold" style={{ color: editColors.text_main }}>EcLauncher</span>
                    <div className="ml-auto flex gap-1.5">
                      <div className="w-12 h-3 rounded" style={{ background: editColors.bg_hover }} />
                      <div className="w-12 h-3 rounded" style={{ background: editColors.bg_hover }} />
                      <div className="w-12 h-3 rounded" style={{ background: editColors.bg_hover }} />
                    </div>
                  </div>
                </div>
                <div className="absolute top-13 left-3 bottom-3 w-16 rounded-xl" style={{ background: editColors.bg_nav, border: `1px solid ${editColors.border}` }}>
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="w-10 h-6 mx-auto mt-2 rounded-lg" style={{ background: i === 0 ? editColors.accent : editColors.bg_hover, opacity: i === 0 ? 0.8 : 0.4 }} />
                  ))}
                </div>
                <div className="absolute top-13 left-22 right-3 bottom-3 rounded-xl p-3" style={{ background: editColors.bg_card, border: `1px solid ${editColors.border}` }}>
                  <div className="w-1/3 h-3 rounded" style={{ background: editColors.text_main, opacity: 0.4 }} />
                  <div className="w-2/3 h-2 rounded mt-2" style={{ background: editColors.text_sub, opacity: 0.2 }} />
                  <div className="flex gap-2 mt-3">
                    {[editColors.accent, editColors.purple, editColors.blue, editColors.success, editColors.warn].map((c, i) => (
                      <div key={i} className="w-10 h-6 rounded-lg" style={{ background: c, opacity: 0.5 }} />
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-12 rounded-lg" style={{ background: editColors.bg_card2, border: `1px solid ${editColors.border}` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Color Groups Tabs */}
            <div className="flex gap-1.5 mb-4 flex-wrap">
              {groups.map((g) => (
                <button
                  key={g}
                  onClick={() => setSelectedGroup(g)}
                  className="px-3 py-1.5 rounded-xl text-[10px] tinycaps font-bold transition-all"
                  style={{
                    background: selectedGroup === g ? editColors.accent : `${themeColors.text_muted}15`,
                    color: selectedGroup === g ? "#fff" : themeColors.text_sub,
                    border: `1px solid ${selectedGroup === g ? editColors.accent : themeColors.border}`,
                  }}
                >
                  {g}
                </button>
              ))}
            </div>

            {/* Color Fields */}
            <div className="grid grid-cols-2 gap-3">
              {filteredFields.map(({ key, label }) => (
                <div
                  key={key}
                  className="flex items-center gap-3 p-3 rounded-xl transition-colors"
                  style={{ background: `${themeColors.bg_card}`, border: `1px solid ${themeColors.border}` }}
                >
                  <input
                    type="color"
                    value={editColors[key]}
                    onChange={(e) => handleColorChange(key, e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border-0 p-0 shrink-0"
                    style={{ background: "transparent" }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] tinycaps font-bold" style={{ color: themeColors.text_main }}>{label}</p>
                    <p className="text-[9px] font-mono" style={{ color: themeColors.text_muted }}>{editColors[key]}</p>
                  </div>
                  <GlassInput
                    value={editColors[key]}
                    onChange={(v) => handleColorChange(key, v)}
                    className="w-20 text-[9px] font-mono"
                  />
                  {editColors[key] !== originalColors[key] && (
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleResetField(key, originalColors)}
                      className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                      title="Reset to original"
                    >
                      <RotateCcw size={8} style={{ color: themeColors.text_muted }} />
                    </motion.button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: `${themeColors.accent}20`, border: `1px solid ${themeColors.accent}30` }}
            >
              <Palette size={18} style={{ color: themeColors.accent }} />
            </div>
            <div>
              <h1 className="tinycaps text-lg font-bold" style={{ color: themeColors.text_main }}>Themes</h1>
              <p className="text-[11px]" style={{ color: themeColors.text_muted }}>Customize your launcher's look and feel</p>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleNewTheme}
            className="px-4 py-2 rounded-xl text-[11px] tinycaps font-bold flex items-center gap-2"
            style={{ background: themeColors.accent, color: "#fff", boxShadow: `0 0 20px ${themeColors.accent}40` }}
          >
            <Plus size={14} /> Create Theme
          </motion.button>
        </div>

        {/* Active Theme Indicator */}
        <div
          className="mb-6 p-4 rounded-2xl flex items-center gap-4"
          style={{ background: `${themeColors.bg_card}`, border: `1px solid ${themeColors.border}` }}
        >
          <div className="w-12 h-12 rounded-2xl" style={{ background: themeColors.accent, boxShadow: `0 0 20px ${themeColors.accent}40` }} />
          <div className="flex-1">
            <p className="text-[10px] tinycaps font-bold" style={{ color: themeColors.text_muted }}>ACTIVE THEME</p>
            <p className="tinycaps text-sm font-bold" style={{ color: themeColors.text_main }}>
              {customThemes[themeName]?.display_name || THEMES[themeName]?.display_name || themeName}
            </p>
          </div>
          <div className="flex gap-1">
            {["bg_main", "bg_nav", "bg_card", "accent", "accent2", "danger", "warn", "success", "purple", "blue"].map((k) => (
              <div key={k} className="w-4 h-4 rounded-full" style={{ background: themeColors[k as keyof ThemeColors] }} />
            ))}
          </div>
        </div>

        {/* Custom Themes */}
        {Object.keys(customThemes).length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} style={{ color: themeColors.accent }} />
              <h2 className="tinycaps text-xs font-bold" style={{ color: themeColors.text_main }}>Your Custom Themes</h2>
              <span className="text-[9px] px-2 py-0.5 rounded-full font-bold" style={{ background: `${themeColors.accent}20`, color: themeColors.accent }}>
                {Object.keys(customThemes).length}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <AnimatePresence>
                {Object.entries(customThemes).map(([id, theme]) => (
                  <ThemeCard
                    key={id}
                    name={id}
                    displayName={theme.display_name}
                    accent={theme.colors.accent}
                    colors={theme.colors}
                    isActive={themeName === id}
                    isCustom
                    onSelect={() => handleSelect(id, true)}
                    onDelete={() => handleDelete(id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Built-in Themes */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Palette size={14} style={{ color: themeColors.text_muted }} />
            <h2 className="tinycaps text-xs font-bold" style={{ color: themeColors.text_main }}>Built-in Themes</h2>
            <span className="text-[9px] px-2 py-0.5 rounded-full font-bold" style={{ background: `${themeColors.text_muted}15`, color: themeColors.text_muted }}>
              {Object.keys(THEMES).length}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {Object.entries(THEMES).map(([id, theme]) => (
              <div key={id} className="relative group">
                <ThemeCard
                  name={id}
                  displayName={theme.display_name}
                  accent={theme.accent}
                  colors={theme.colors}
                  isActive={themeName === id}
                  onSelect={() => handleSelect(id, false)}
                />
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => { e.stopPropagation(); handleDuplicate(id, false); }}
                    className="w-6 h-6 rounded-lg flex items-center justify-center"
                    style={{ background: `${theme.colors.bg_nav}cc`, border: `1px solid ${theme.colors.border}` }}
                    title="Duplicate as custom theme"
                  >
                    {copiedTheme === `custom-${id}` ? <Check size={9} style={{ color: theme.colors.success }} /> : <Copy size={9} style={{ color: theme.colors.text_sub }} />}
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => { e.stopPropagation(); handleEditExisting(id, false); }}
                    className="w-6 h-6 rounded-lg flex items-center justify-center"
                    style={{ background: `${theme.colors.bg_nav}cc`, border: `1px solid ${theme.colors.border}` }}
                    title="Edit theme"
                  >
                    <Palette size={9} style={{ color: theme.colors.text_sub }} />
                  </motion.button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

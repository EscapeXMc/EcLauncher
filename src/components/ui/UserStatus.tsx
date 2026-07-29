import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLauncherStore } from "../../stores";
import { Circle, ChevronDown, Gamepad2, Coffee, Moon, Eye, Clock, Edit3, X } from "lucide-react";

const STATUS_PRESETS = [
  { id: "online", label: "Online", icon: Circle, color: "#00e676", emoji: "\u2714" },
  { id: "gaming", label: "Playing Minecraft", icon: Gamepad2, color: "#8b5cf6", emoji: "\uD83C\uDFAE" },
  { id: "away", label: "Away", icon: Coffee, color: "#ffaa00", emoji: "\u2615" },
  { id: "dnd", label: "Do Not Disturb", icon: Moon, color: "#ff4466", emoji: "\uD83D\uDE34" },
  { id: "invisible", label: "Invisible", icon: Eye, color: "#666666", emoji: "\uD83D\uDC41" },
  { id: "offline", label: "Appear Offline", icon: Circle, color: "#444444", emoji: "\u25CB" },
];

interface UserStatus {
  type: string;
  customText: string;
  playingInstance: string;
  lastSet: number;
}

const STATUS_KEY = "ec-user-status";

function loadStatus(): UserStatus {
  try {
    const raw = localStorage.getItem(STATUS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { type: "online", customText: "", playingInstance: "", lastSet: Date.now() };
}

function saveStatus(s: UserStatus) {
  localStorage.setItem(STATUS_KEY, JSON.stringify(s));
}

export function UserStatus() {
  const { themeColors, settings } = useLauncherStore();
  const [status, setStatus] = useState(loadStatus);
  const [showPicker, setShowPicker] = useState(false);
  const [customText, setCustomText] = useState(status.customText);
  const [editing, setEditing] = useState(false);

  const currentPreset = STATUS_PRESETS.find((p) => p.id === status.type) || STATUS_PRESETS[0];

  const updateStatus = useCallback((type: string, custom?: string, instance?: string) => {
    const newStatus: UserStatus = {
      type,
      customText: custom ?? status.customText,
      playingInstance: instance ?? status.playingInstance,
      lastSet: Date.now(),
    };
    setStatus(newStatus);
    saveStatus(newStatus);
    setShowPicker(false);
  }, [status]);

  // Auto-detect game playing
  useEffect(() => {
    const handleLaunch = (e: CustomEvent) => {
      const name = e.detail?.instanceName;
      if (name) {
        updateStatus("gaming", undefined, name);
      }
    };
    window.addEventListener("ec-launch-game", handleLaunch as EventListener);
    return () => window.removeEventListener("ec-launch-game", handleLaunch as EventListener);
  }, [updateStatus]);

  // Format time ago
  const timeAgo = useCallback(() => {
    const diff = Date.now() - status.lastSet;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }, [status.lastSet]);

  // Listen for Escape to close
  useEffect(() => {
    const handle = () => setShowPicker(false);
    window.addEventListener("ec-escape-pressed", handle);
    return () => window.removeEventListener("ec-escape-pressed", handle);
  }, []);

  return (
    <div className="relative">
      {/* Status button */}
      <motion.button
        onClick={() => setShowPicker(!showPicker)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-xl transition-all"
        style={{
          background: `${themeColors.bg_card}80`,
          border: `1px solid ${themeColors.border}30`,
        }}
        whileHover={{ scale: 1.02, background: `${themeColors.bg_hover}60` }}
        whileTap={{ scale: 0.98 }}
      >
        <div className="relative">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px]"
            style={{
              background: `linear-gradient(135deg, ${themeColors.accent}40, ${themeColors.accent}20)`,
              border: `1.5px solid ${currentPreset.color}80`,
            }}
          >
            {currentPreset.emoji}
          </div>
          <div
            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
            style={{
              background: currentPreset.color,
              borderColor: themeColors.bg_card,
            }}
          />
        </div>
        <div className="text-left hidden sm:block">
          <p className="text-[10px] font-semibold leading-none" style={{ color: themeColors.text_main }}>
            {status.playingInstance && status.type === "gaming"
              ? `Playing ${status.playingInstance}`
              : currentPreset.label}
          </p>
          {status.customText && (
            <p className="text-[8px] leading-none mt-0.5" style={{ color: themeColors.text_muted }}>
              {status.customText}
            </p>
          )}
        </div>
        <ChevronDown size={10} style={{ color: themeColors.text_muted }} />
      </motion.button>

      {/* Picker dropdown */}
      <AnimatePresence>
        {showPicker && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            className="absolute right-0 top-full mt-2 w-64 rounded-2xl overflow-hidden z-[100]"
            style={{
              background: `${themeColors.bg_card}ee`,
              border: `1px solid ${themeColors.border}50`,
              backdropFilter: "blur(24px)",
              boxShadow: `0 8px 32px rgba(0,0,0,0.4)`,
            }}
          >
            {/* Custom status input */}
            <div className="p-3 border-b" style={{ borderColor: `${themeColors.border}30` }}>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder="Set a status..."
                  maxLength={50}
                  className="flex-1 text-xs px-2 py-1.5 rounded-lg outline-none"
                  style={{
                    background: `${themeColors.bg_glass}80`,
                    border: `1px solid ${themeColors.border}30`,
                    color: themeColors.text_main,
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      updateStatus(status.type, customText);
                    }
                    e.stopPropagation();
                  }}
                />
                <button
                  onClick={() => updateStatus(status.type, customText)}
                  className="p-1.5 rounded-lg"
                  style={{ background: `${themeColors.accent}20`, color: themeColors.accent }}
                >
                  <Edit3 size={12} />
                </button>
              </div>
            </div>

            {/* Status presets */}
            <div className="p-2">
              <p className="text-[9px] font-bold uppercase px-2 py-1" style={{ color: themeColors.text_muted }}>
                Status
              </p>
              {STATUS_PRESETS.map((preset) => {
                const Icon = preset.icon;
                const isActive = status.type === preset.id;
                return (
                  <motion.button
                    key={preset.id}
                    onClick={() => updateStatus(preset.id)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-all"
                    style={{
                      background: isActive ? `${preset.color}15` : undefined,
                    }}
                    whileHover={{ backgroundColor: `${themeColors.bg_hover}40` }}
                  >
                    <div className="relative">
                      <Icon size={14} style={{ color: preset.color }} />
                      <div
                        className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border"
                        style={{ background: preset.color, borderColor: themeColors.bg_card }}
                      />
                    </div>
                    <span className="text-xs font-medium" style={{
                      color: isActive ? preset.color : themeColors.text_main,
                    }}>
                      {preset.label}
                    </span>
                    {isActive && (
                      <motion.div
                        layoutId="status-active"
                        className="ml-auto w-1.5 h-1.5 rounded-full"
                        style={{ background: preset.color }}
                      />
                    )}
                  </motion.button>
                );
              })}
            </div>

            {/* Playing instance badge */}
            {status.playingInstance && (
              <div className="px-3 pb-2">
                <div
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
                  style={{ background: `${themeColors.purple}15`, border: `1px solid ${themeColors.purple}30` }}
                >
                  <Gamepad2 size={12} style={{ color: themeColors.purple }} />
                  <span className="text-[10px] font-medium" style={{ color: themeColors.purple }}>
                    {status.playingInstance}
                  </span>
                </div>
              </div>
            )}

            {/* Time */}
            <div className="px-3 pb-2">
              <div className="flex items-center gap-1">
                <Clock size={9} style={{ color: themeColors.text_muted }} />
                <span className="text-[8px]" style={{ color: themeColors.text_muted }}>
                  Last updated {timeAgo()}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

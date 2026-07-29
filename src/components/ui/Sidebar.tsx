import { motion } from "framer-motion";
import { useLauncherStore } from "../../stores";
import { Home, Layers, Puzzle, Package, Boxes, Users, Bot, Settings, FileText, Wrench, Globe, Layout, Trophy, MessageCircle, Palette } from "lucide-react";
import { Tooltip } from "./Tooltip";
import { AnimatedLogo } from "./AnimatedLogo";
import { useSounds } from "./SoundEffects";
import { UserStatus } from "./UserStatus";

const navItems = [
  { id: "home", label: "HOME", icon: Home, shortcut: "" },
  { id: "accounts", label: "LOGIN", icon: Users, shortcut: "" },
  { id: "ecai", label: "ECAI", icon: Bot, shortcut: "" },
  { id: "instances", label: "PROFILES", icon: Layers, shortcut: "Ctrl+N" },
  { id: "mods", label: "MODS", icon: Puzzle, shortcut: "Ctrl+M" },
  { id: "packs", label: "PACKS", icon: Package, shortcut: "" },
  { id: "modpacks", label: "MODPACKS", icon: Boxes, shortcut: "" },
  { id: "tools", label: "TOOLS", icon: Wrench, shortcut: "" },
  { id: "chat", label: "CHAT", icon: MessageCircle, shortcut: "" },
  { id: "multiplayer", label: "MULTI", icon: Globe, shortcut: "Ctrl+P" },
  { id: "templates", label: "TEMPLATES", icon: Layout, shortcut: "" },
  { id: "achievements", label: "ACHIEVE", icon: Trophy, shortcut: "" },
  { id: "themes", label: "THEMES", icon: Palette, shortcut: "Ctrl+T" },
  { id: "settings", label: "SETTINGS", icon: Settings, shortcut: "Ctrl+," },
  { id: "logs", label: "LOGS", icon: FileText, shortcut: "" },
];

export function Sidebar() {
  const { currentPage, setPage, themeColors, liveVersion } = useLauncherStore();
  const { play: playSound } = useSounds();

  return (
    <aside className="w-[72px] shrink-0 flex flex-col items-center py-3 gap-1 overflow-y-auto relative"
      style={{
        background: `${themeColors.bg_nav}99`,
        borderRight: `1px solid ${themeColors.border}`,
        backdropFilter: "blur(32px) saturate(1.4)",
        WebkitBackdropFilter: "blur(32px) saturate(1.4)",
      }}>
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `linear-gradient(180deg, ${themeColors.accent}06 0%, transparent 30%)`,
      }} />

      {/* Logo */}
      <motion.div
        className="relative mb-2 mt-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <AnimatedLogo size={40} animated={true} />
      </motion.div>

      <div className="w-8 h-px mb-1" style={{ background: `${themeColors.border}40` }} />

      {/* User Status */}
      <div className="mb-1">
        <UserStatus />
      </div>

      <div className="w-8 h-px mb-1" style={{ background: `${themeColors.border}40` }} />

      {navItems.map((item, idx) => {
        const isActive = currentPage === item.id;
        const Icon = item.icon;
        const button = (
          <motion.button
            key={item.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.03, duration: 0.3 }}
            onClick={() => { setPage(item.id); playSound("click"); }}
            className="relative w-[56px] flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl transition-all duration-300 group"
            style={{
              background: isActive ? `linear-gradient(135deg, ${themeColors.accent}20, ${themeColors.accent}10)` : "transparent",
              color: isActive ? themeColors.accent : themeColors.nav_inactive,
              border: isActive ? `1px solid ${themeColors.accent}35` : "1px solid transparent",
            }}
            whileHover={{ scale: 1.08, backgroundColor: isActive ? undefined : `${themeColors.bg_hover}40` }}
            whileTap={{ scale: 0.92 }}
          >
            {isActive && (
              <>
                <motion.div
                  layoutId="sidebar-indicator"
                  className="absolute -left-[1px] top-1/2 -translate-y-1/2 w-[3px] h-7 rounded-r-full"
                  style={{ background: themeColors.accent, boxShadow: `0 0 12px ${themeColors.accent_glow}, 0 0 24px ${themeColors.accent_glow}50` }}
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
                <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{
                  background: `radial-gradient(circle at 50% 50%, ${themeColors.accent}08 0%, transparent 70%)`,
                }} />
                <div className="absolute inset-0 rounded-2xl pointer-events-none opacity-50"
                  style={{
                    background: `linear-gradient(180deg, ${themeColors.accent}08 0%, transparent 50%, ${themeColors.accent}05 100%)`,
                  }} />
              </>
            )}
            <Icon size={19} strokeWidth={isActive ? 2.3 : 1.7} />
            <span className="tinycaps text-[8px] font-bold leading-none" style={{
              color: isActive ? themeColors.accent : themeColors.text_muted,
              opacity: isActive ? 1 : 0.7,
            }}>
              {item.label}
            </span>
          </motion.button>
        );

        return (
          <Tooltip
            key={item.id}
            content={item.label}
            shortcut={item.shortcut || undefined}
            side="right"
          >
            {button}
          </Tooltip>
        );
      })}
      <div className="flex-1" />
      <div className="tinycaps text-[7px] font-bold px-1 py-1 rounded-lg" style={{
        color: themeColors.text_muted,
        opacity: 0.4,
      }}>V{liveVersion}</div>
    </aside>
  );
}

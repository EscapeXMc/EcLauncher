import { useEffect, useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLauncherStore } from "../../stores";
import { api } from "../../lib/api";
import { invoke } from "@tauri-apps/api/tauri";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import { GlassCard } from "../ui/GlassCard";
import { GlowButton } from "../ui/GlowButton";
import {
  Play, Clock, HardDrive, Cpu, MemoryStick, Disc,
  Newspaper, ArrowRight, Plus, ExternalLink, Zap,
  TrendingUp, Gamepad2, Settings as SettingsIcon, ChevronRight,
  Sparkles, Box, Loader2, Skull, User, Headphones, MoreVertical,
  Trophy, Volume2, Wifi, Battery, Thermometer, AlertTriangle,
  Camera, Medal, Calendar, ChevronDown, Maximize2, Minimize2,
  Activity, PawPrint, Crown, Image as ImageIcon, MonitorPlay, Timer, History, Lock,
  MessageCircle
} from "lucide-react";
import type { NewsItem, Instance } from "../../lib/types";

interface ScreenshotInfo {
  instance_name: string;
  path: string;
  filename: string;
  timestamp: string;
}

function getRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "never";
  const now = Date.now();
  let then: number;
  try {
    then = new Date(dateStr).getTime();
  } catch {
    return dateStr;
  }
  if (isNaN(then)) return dateStr;
  const diffMs = now - then;
  if (diffMs < 0) return "just now";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatPlayTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const SKIN_FALLBACK = "https://mc-heads.net/avatar/8660ba3e76424a96b46f0b738fcc8806?size=128";

function getSkinHeadUrl(uuid?: string | null): string {
  if (!uuid) return SKIN_FALLBACK;
  const clean = uuid.replace(/-/g, "");
  if (clean.length !== 32) return SKIN_FALLBACK;
  return `https://mc-heads.net/avatar/${clean}?size=128`;
}

const mockPlayerData = {
  username: "Steve",
  uuid: "8660ba3e-7642-4a96-b46f-0b738fcc8806",
  capeUrl: null,
  isCracked: false,
  hasPremiumSkin: true,
  level: 42,
  playtime: 127.5,
  lastPlayed: "2 hours ago",
  achievement: "Master Miner",
};

function SkinPreview({ skinUrl, uuid, className, size = 64 }: {
  skinUrl?: string;
  uuid?: string;
  className?: string;
  size?: number;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const headUrl = skinUrl || getSkinHeadUrl(uuid);

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full border-2 border-white/20 overflow-hidden shadow-2xl transform transition-transform duration-300 hover:scale-110">
        {!loaded && !failed && (
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900 via-purple-800 to-blue-900 animate-pulse" />
        )}
        {failed ? (
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
            <User size={size * 0.45} className="text-white/60" />
          </div>
        ) : (
          <img
            src={headUrl}
            alt="Player skin"
            className="w-full h-full"
            style={{ imageRendering: "pixelated" }}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-dark-900 shadow-md">
        <div className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-30" />
      </div>
      <div className="absolute top-0 left-0 w-5 h-5 rounded-full bg-purple-500 border-2 border-dark-900 shadow-md opacity-80">
        <div className="absolute inset-0 rounded-full bg-purple-500 animate-pulse" />
      </div>
    </div>
  );
}

// Enhanced player statistics card
function PlayerStatsCard({ stats, themeColors }: {
  stats: typeof mockPlayerData;
  themeColors: any;
}) {
  const statItems = [
    { label: "Level", value: stats.level, icon: Crown, color: themeColors.warn, trend: "+2" },
    { label: "Playtime", value: `${stats.playtime}h`, icon: Clock, color: themeColors.accent, trend: "+3h" },
    { label: "Achievements", value: "42", icon: Medal, color: themeColors.success, trend: "+1" },
    { label: "Last Played", value: stats.lastPlayed, icon: Calendar, color: themeColors.blue, trend: null },
  ];

  return (
    <GlassCard className="p-6 relative overflow-hidden group-hover:shadow-2xl transition-all duration-300">
      <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-gradient-to-br from-purple-500/10 to-blue-500/10 -mr-10 -mt-10" />
      <div className="absolute bottom-0 left-0 w-16 h-16 rounded-full bg-gradient-to-tr from-blue-500/10 to-purple-500/10 -ml-8 -mb-8" />

      <div className="relative z-10">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative">
            <SkinPreview uuid={stats.uuid} className="w-20 h-20" />
          </div>
          <div className="flex-1">
            <div className="text-xl font-bold mb-1" style={{ color: themeColors.text_main }}>{stats.username}</div>
            <div className="text-sm flex items-center gap-2" style={{ color: themeColors.text_muted }}>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span>Online</span>
              </div>
              <span>•</span>
              <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: `${themeColors.accent}20`, color: themeColors.accent, border: `1px solid ${themeColors.accent}30` }}>
                {stats.isCracked ? "Cracked" : "Premium"}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {statItems.map((item, index) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.1, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
              className="p-4 rounded-xl transition-all duration-300 hover:scale-105"
              style={{ background: `${item.color}15`, border: `1px solid ${item.color}25` }}
              whileHover={{ y: -5, boxShadow: `0 10px 25px ${item.color}30` }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: `${item.color}30`, border: `1px solid ${item.color}40` }}
                >
                  <item.icon size={16} style={{ color: item.color }} />
                </div>
                <div>
                  <div className="text-lg font-bold" style={{ color: item.color }}>{item.value}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: themeColors.text_muted }}>{item.label}</div>
                </div>
                {item.trend && (
                  <div className="ml-auto">
                    <div className="text-[9px] font-bold" style={{ color: themeColors.green }}>{item.trend}</div>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t" style={{ borderColor: themeColors.border }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium" style={{ color: themeColors.text_main }}>Achievement Progress</span>
            <span className="text-xs" style={{ color: themeColors.text_muted }}>42/100</span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: `${themeColors.text_muted}15` }}>
            <motion.div
              className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: "42%" }}
              transition={{ duration: 1, delay: 0.5, ease: [0.4, 0, 0.2, 1] }}
              style={{ background: `linear-gradient(90deg, ${themeColors.accent}, ${themeColors.purple})` }}
            />
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

// Enhanced instance card with skin preview and more details
function QuickPlayCard({ inst, index, themeColors, onPlay, onSelect, playerSkinUrl }: {
  inst: Instance; index: number; themeColors: any; onPlay: () => void; onSelect: () => void;
  playerSkinUrl?: string;
}) {
  const loaderColors: Record<string, string> = {
    fabric: themeColors.tag_fabric,
    forge: themeColors.tag_forge,
    quilt: themeColors.tag_quilt,
    neoforge: themeColors.tag_neo,
    "": themeColors.tag_vanilla,
  };
  const loaderColor = loaderColors[inst.loader?.toLowerCase()] || themeColors.text_muted;
  const loaderLabel = inst.loader || "Vanilla";

  // Generate a consistent color for the instance based on name
  const getInstanceColor = (name: string) => {
    const colors = [
      themeColors.accent,
      themeColors.purple,
      themeColors.blue,
      themeColors.success,
      themeColors.warn,
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const instanceColor = getInstanceColor(inst.name);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.15 + index * 0.08, ease: [0.4, 0, 0.2, 1] }}
      whileHover={{ y: -8, scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onSelect}
      className="group relative rounded-3xl overflow-hidden cursor-pointer shrink-0"
      style={{
        width: 240,
        background: `linear-gradient(135deg, ${themeColors.bg_card}ee, ${themeColors.bg_card2}ee, ${themeColors.bg_card2}dd)`,
        border: `1px solid ${themeColors.border}40`,
        boxShadow: `0 4px 20px ${themeColors.accent}15`,
      }}
    >
      {/* Animated gradient border on hover */}
      <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <div className="absolute inset-0 rounded-3xl p-[2px] bg-gradient-to-r from-transparent via-${instanceColor.replace('#', '')}/50 to-transparent animate-pulse" />
      </div>

      <div className="relative p-6 flex flex-col gap-5 h-[180px]">
        {/* Top section with icon and player skin */}
        <div className="flex items-start justify-between">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center text-xl relative">
            <div
              style={{ background: `${instanceColor}15`, border: `2px solid ${instanceColor}25` }}
              className="absolute inset-0 rounded-xl shadow-lg"
            />
            <span className="relative z-10 text-3xl drop-shadow-sm">
              {inst.icon === "crafting_table" ? "🔨" : inst.icon === "diamond" ? "💎" :
               inst.icon === "grass" ? "🌱" : inst.icon === "nether_portal" ? "⚡️" : "⛏"}
            </span>
            {index === 0 && playerSkinUrl && (
              <div className="absolute -bottom-2 -right-2">
                <SkinPreview uuid={playerSkinUrl} className="w-10 h-10" size={40} />
              </div>
            )}
          </div>
          <span
            className="text-[11px] font-medium px-3 py-1.5 rounded-full tinycaps shadow-sm"
            style={{ background: `${instanceColor}18`, color: instanceColor, border: `1px solid ${instanceColor}30` }}
          >
            {loaderLabel}
          </span>
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          <div className="text-base font-bold truncate drop-shadow-sm" style={{ color: themeColors.text_main }}>
            {inst.name}
          </div>
          <div className="flex items-center justify-between">
            <div className="text-[12px] tinycaps" style={{ color: themeColors.text_muted }}>
              MC {inst.version}
            </div>
            {inst.version && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <div className="text-[10px] tinycaps font-medium" style={{ color: themeColors.text_muted }}>installed</div>
              </div>
            )}
          </div>
        </div>

        {/* Enhanced stats bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px]">
            <span style={{ color: themeColors.text_muted }}>Performance</span>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            </div>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden shadow-inner" style={{ background: `${themeColors.accent}08` }}>
            <motion.div
              className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: "92%" }}
              transition={{ duration: 0.8, delay: 0.5 + index * 0.1, ease: [0.4, 0, 0.2, 1] }}
              style={{ background: `linear-gradient(90deg, ${themeColors.accent}, ${themeColors.accent2 || themeColors.purple})`, boxShadow: `0 0 12px ${themeColors.accent}40` }}
            />
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
          onClick={(e) => { e.stopPropagation(); onPlay(); }}
          className="w-full py-3 rounded-xl text-[13px] font-bold tinycaps flex items-center justify-center gap-2.5 transition-all shadow-lg"
          style={{ background: `linear-gradient(135deg, ${themeColors.accent}, ${themeColors.accent2 || themeColors.accent})`, color: "#fff", boxShadow: `0 6px 24px ${themeColors.accent}40` }}
        >
          <Play size={16} fill="currentColor" className="drop-shadow-sm" /> Play Now
        </motion.button>
      </div>
    </motion.div>
  );
}

// Enhanced stats cards with trend indicators
function EnhancedStatCard({
  title, icon: Icon, value, sub, color, delay, trend, trendValue, status = "online"
}: {
  title: string; icon: any; value: string | number; sub: string; color: string;
  delay: number; trend?: boolean; trendValue?: string; status?: "online" | "warning" | "critical";
}) {
  const statusColors = {
    online: "bg-green-500",
    warning: "bg-yellow-500",
    critical: "bg-red-500"
  };

  return (
    <GlassCard delay={delay} className="p-6 relative overflow-hidden group-hover:shadow-2xl transition-all duration-300">
      {/* Status indicator */}
      <div className={`absolute top-0 right-0 w-2 h-2 rounded-full ${statusColors[status]} mt-3 mr-3`} />

      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center relative"
            style={{ background: `${color}15`, border: `1px solid ${color}25` }}
          >
            <Icon size={24} style={{ color }} className="drop-shadow-sm" />
            {trend && (
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                <TrendingUp size={10} style={{ color: "#4ade80" }} />
              </div>
            )}
          </div>
          <div>
            <div className="text-sm font-bold tinycaps" style={{ color: "var(--text-main, #e0ecff)" }}>{title}</div>
            <div className="text-[11px] tinycaps mt-0.5" style={{ color: "var(--text-muted, #5a6a80)" }}>{sub}</div>
          </div>
        </div>
        {trend && trendValue && (
          <div className="flex items-center gap-2">
            <div className="text-sm font-bold" style={{ color: color }}>{trendValue}</div>
            <div className="w-7 h-7 rounded-full bg-green-500/20 flex items-center justify-center">
              <TrendingUp size={14} style={{ color: "#4ade80" }} />
            </div>
          </div>
        )}
      </div>

      <div className="mt-6">
        <div className="text-4xl font-extrabold gradient-text" style={{ "--gradient-color": color } as any}>{value}</div>
      </div>
    </GlassCard>
  );
}

// Advanced player profile section with achievements and recent activity
function PlayerProfileSection({ username, uuid, themeColors }: {
  username: string; uuid?: string; themeColors: any;
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 800);
    return () => clearTimeout(timer);
  }, []);

  // Generate recent activity items
  const recentActivity = [
    { icon: Box, title: "Installed new instance", time: "15 min ago", color: themeColors.accent },
    { icon: Clock, title: "Played 1.5h", time: "45 min ago", color: themeColors.purple },
    { icon: Crown, title: "Reached level 40", time: "2 hours ago", color: themeColors.warn },
    { icon: Trophy, title: "Completed daily quest", time: "yesterday", color: themeColors.success },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: isVisible ? 1 : 0, scale: isVisible ? 1 : 0.9, y: isVisible ? 0 : 10 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col gap-4 p-5 rounded-3xl"
               style={{ background: `linear-gradient(135deg, ${themeColors.accent}15, ${themeColors.accent}08), linear-gradient(135deg, ${themeColors.purple}10, transparent)`,
                        border: `1px solid ${themeColors.accent}25` }}
    >
      <div className="flex items-center gap-5">
        <motion.div
          whileHover={{ scale: 1.08, rotate: 8 }}
          transition={{ type: "spring", stiffness: 300 }}
          className="relative"
        >
          <SkinPreview uuid={uuid} className="w-20 h-20" />
          <div className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-purple-500 border-2 border-dark-900 shadow-lg">
            <div className="absolute inset-0 rounded-full bg-purple-500 animate-ping opacity-30" />
          </div>
          <div className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-green-500 border-2 border-dark-900 shadow-md">
            <div className="absolute inset-0 rounded-full bg-green-500 animate-pulse" />
          </div>
        </motion.div>

        <div className="flex-1">
          <div className="text-lg font-bold mb-1" style={{ color: themeColors.text_main }}>{username}</div>
          <div className="text-[12px] tinycaps mt-1 flex items-center gap-3" style={{ color: themeColors.text_muted }}>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span>Online</span>
            </div>
            <span>•</span>
            <span>{mockPlayerData.playtime}h played</span>
            <span>•</span>
            <span>Last: {mockPlayerData.lastPlayed}</span>
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.05, backgroundColor: themeColors.accent }}
          whileTap={{ scale: 0.95 }}
          className="px-5 py-3 rounded-xl text-[12px] font-bold tinycaps transition-all shadow-lg"
          style={{ background: `${themeColors.accent}20`, color: themeColors.accent, border: `1px solid ${themeColors.accent}30` }}
        >
          Edit Profile
        </motion.button>
      </div>

      {/* Recent activity section */}
      <div className="mt-4 pt-4 border-t" style={{ borderColor: themeColors.border }}>
        <div className="text-xs font-bold tinycaps mb-3" style={{ color: themeColors.text_muted }}>RECENT ACTIVITY</div>
        <div className="space-y-2">
          {recentActivity.map((activity, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + index * 0.1, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
              className="flex items-center gap-3 p-3 rounded-xl transition-all hover:bg-white/5"
              style={{ background: `${activity.color}10`, border: `1px solid ${activity.color}20` }}
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: `${activity.color}20`, border: `1px solid ${activity.color}30` }}
              >
                <activity.icon size={14} style={{ color: activity.color }} />
              </div>
              <div className="flex-1">
                <div className="text-[11px] font-medium" style={{ color: themeColors.text_main }}>{activity.title}</div>
                <div className="text-[10px] tinycaps" style={{ color: themeColors.text_muted }}>{activity.time}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export function HomePage() {
  const {
    themeColors, instances, playTimes, systemInfo, settings,
    setPage, setSelectedInstance, setLoading,
    loadPlayTimes, loadSystemInfo
  } = useLauncherStore();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [recentGames, setRecentGames] = useState<Instance[]>([]);
  const [screenshots, setScreenshots] = useState<ScreenshotInfo[]>([]);
  const [screenshotsLoading, setScreenshotsLoading] = useState(true);
  const [homeAchievements, setHomeAchievements] = useState<{id: string; name: string; icon: string; unlocked: boolean}[]>([]);

  const hasCustomBg = (settings.launcher_bg_type === "image" && settings.launcher_bg_image) ||
    (settings.launcher_bg_type === "video") ||
    (!settings.launcher_bg_type || settings.launcher_bg_type === "default") && settings.launcher_bg_video !== "";

  useEffect(() => {
    loadPlayTimes();
    loadSystemInfo();
    api.news.get().then((n) => { setNews(n); setNewsLoading(false); }).catch(() => setNewsLoading(false));

    const installed = instances.filter((i) => i.installed);
    const sorted = [...installed].sort((a, b) => {
      const ta = a.last_played ? new Date(a.last_played).getTime() : 0;
      const tb = b.last_played ? new Date(b.last_played).getTime() : 0;
      return tb - ta;
    });
    setRecentGames(sorted);

    setScreenshotsLoading(true);
    const loadScreenshots = async () => {
      const allScreenshots: ScreenshotInfo[] = [];
      for (const inst of installed) {
        try {
          const shots = await invoke<ScreenshotInfo[]>("get_screenshots", { instanceName: inst.name });
          allScreenshots.push(...shots);
        } catch {}
      }
      allScreenshots.sort((a, b) => {
        try { return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(); }
        catch { return 0; }
      });
      setScreenshots(allScreenshots);
      setScreenshotsLoading(false);
    };
    loadScreenshots();

    api.achievements.get().then((res) => {
      setHomeAchievements((res.achievements || []).slice(0, 6));
    }).catch(() => {});
  }, [instances]);

  const totalPlayMinutes = Object.values(playTimes).reduce((a, b) => a + b, 0);
  const totalPlayHours = Math.floor(totalPlayMinutes / 60);
  const installedInstances = useMemo(() => instances.filter((i) => i.installed), [instances]);

  const playTimeEntries = useMemo(() =>
    Object.entries(playTimes).sort(([, a], [, b]) => b - a).slice(0, 5),
    [playTimes]
  );

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 6) return "resting...";
    if (h < 12) return "good morning";
    if (h < 17) return "good afternoon";
    if (h < 21) return "good evening";
    return "good night";
  }, []);

  const username = settings.username || settings.cracked_username || settings.ely_by_username || "player";

  const handleLaunch = (inst: Instance) => {
    setLoading(true, `Launching ${inst.name}...`);
    setSelectedInstance(inst.name);
    setPage("instances");
  };

  return (
    <div className="space-y-8 max-w-8xl mx-auto">

      {/* ===== ENHANCED HERO SECTION ===== */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        className="relative rounded-3xl overflow-hidden"
        style={{
          background: hasCustomBg
            ? `linear-gradient(145deg, ${themeColors.bg_card}dd, ${themeColors.bg_card2}cc)`
            : `linear-gradient(145deg, ${themeColors.bg_card}, ${themeColors.bg_card2})`,
          border: `1px solid ${themeColors.border}50`,
          boxShadow: `0 8px 40px ${themeColors.accent}12`,
        }}
      >
        {/* Subtle accent glow top-left */}
        <div className="absolute top-0 left-0 w-72 h-72 rounded-full opacity-30 blur-3xl pointer-events-none"
          style={{ background: `radial-gradient(circle, ${themeColors.accent}25, transparent 70%)` }} />

        <div className="relative p-10 flex flex-col lg:flex-row items-center justify-between gap-10">
          <div className="flex-1 space-y-6">
            <motion.div initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="space-y-3">
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="text-sm tinycaps font-medium tracking-wide" style={{ color: themeColors.text_muted }}>
                {greeting}, {username}
              </motion.p>
              <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="text-5xl lg:text-6xl font-extrabold tinycaps leading-tight">
                <span style={{ color: themeColors.text_main }}>your </span>
                <span style={{ color: themeColors.accent }}>adventure</span>
                <br />
                <span style={{ color: themeColors.purple }}>starts now</span>
              </motion.h1>
            </motion.div>

            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="text-sm tinycaps leading-relaxed max-w-lg" style={{ color: themeColors.text_muted }}>
              {installedInstances.length} epic Minecraft world{installedInstances.length !== 1 ? "s" : ""} await{installedInstances.length === 1 ? "s" : ""} your command.
              {totalPlayHours > 0 && ` You've played ${totalPlayHours} hours.`}
            </motion.p>

            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="flex flex-wrap gap-3 pt-2">
              <GlowButton size="lg" onClick={() => setPage("instances")} className="flex items-center gap-2">
                <Plus size={18} /> New Instance
              </GlowButton>
              <GlowButton size="md" variant="secondary" onClick={() => setPage("settings")} className="flex items-center gap-2">
                <SettingsIcon size={16} /> Customize
              </GlowButton>
              <GlowButton size="md" variant="secondary" onClick={() => setPage("chat")} className="flex items-center gap-2">
                <MessageCircle size={16} /> Chat
              </GlowButton>
            </motion.div>
          </div>

          {/* Player Profile Section */}
          <motion.div initial={{ opacity: 0, x: 15, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ delay: 0.5, duration: 0.6 }} className="lg:w-[380px]">
            <PlayerProfileSection username={username} uuid={mockPlayerData.uuid} themeColors={themeColors} />
          </motion.div>
        </div>
      </motion.div>

      {/* ===== RECENT GAMES DASHBOARD ===== */}
      {installedInstances.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${themeColors.accent}20`, border: `1px solid ${themeColors.accent}30` }}>
                <History size={16} style={{ color: themeColors.accent }} />
              </div>
              <h2 className="text-base font-bold tinycaps gradient-text">
                recent games
              </h2>
              <div className="hidden sm:block text-[10px] tinycaps px-3 py-1 rounded-full" style={{ background: `${themeColors.accent}10`, color: themeColors.text_muted, border: `1px solid ${themeColors.accent}15` }}>
                sorted by last played
              </div>
            </div>
            <button onClick={() => setPage("instances")}
              className="group inline-flex items-center gap-1.5 px-4 py-2 rounded-xl transition-all hover:scale-105 shadow-md"
              style={{ background: `${themeColors.accent}15` }}
              onMouseEnter={(e) => { e.currentTarget.style.background = themeColors.accent + '25'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = themeColors.accent + '15'; }}
            >
              <span className="text-[11px] font-bold tinycaps" style={{ color: themeColors.accent }}>all instances</span>
              <ChevronRight size={12} style={{ color: themeColors.accent }} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {recentGames.length === 0 ? (
            <div className="text-center py-12 rounded-3xl" style={{ background: `${themeColors.bg_card}80`, border: `1px solid ${themeColors.border}30` }}>
              <MonitorPlay size={40} className="mx-auto mb-3 opacity-30" style={{ color: themeColors.text_muted }} />
              <p className="text-sm font-medium mb-1" style={{ color: themeColors.text_muted }}>No recent games</p>
              <p className="text-xs mb-4" style={{ color: themeColors.text_muted, opacity: 0.6 }}>Play a game to see it here</p>
              <GlowButton size="sm" onClick={() => setPage("instances")} className="inline-flex items-center gap-2">
                <Plus size={14} /> Create Instance
              </GlowButton>
            </div>
          ) : (
            <div className="flex gap-5 overflow-x-auto pb-4 px-2" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
              <style>{`
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; }
              `}</style>
              <div className="flex gap-5 hide-scrollbar">
                <AnimatePresence>
                  {recentGames.slice(0, 8).map((inst, i) => {
                    const playTimeMin = playTimes[inst.name] || 0;
                    return (
                      <motion.div
                        key={inst.name}
                        initial={{ opacity: 0, y: 16, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.5, delay: i * 0.06, ease: [0.4, 0, 0.2, 1] }}
                        whileHover={{ scale: 1.04, y: -6 }}
                        onClick={() => { setSelectedInstance(inst.name); setPage("instances"); }}
                        className="group relative rounded-2xl overflow-hidden cursor-pointer shrink-0"
                        style={{
                          width: 220,
                          background: `linear-gradient(135deg, ${themeColors.bg_card}ee, ${themeColors.bg_card2}cc)`,
                          border: `1px solid ${themeColors.border}40`,
                          backdropFilter: "blur(16px)",
                          WebkitBackdropFilter: "blur(16px)",
                          boxShadow: `0 4px 20px ${themeColors.accent}10`,
                          transition: "box-shadow 0.3s ease",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 40px ${themeColors.accent}30, 0 0 60px ${themeColors.accent}10`; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 20px ${themeColors.accent}10`; }}
                      >
                        <div className="p-5 flex flex-col gap-3 h-[170px]">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <span className="text-2xl shrink-0">
                                {inst.icon === "crafting_table" ? "🔨" : inst.icon === "diamond" ? "💎" :
                                 inst.icon === "grass" ? "🌱" : inst.icon === "nether_portal" ? "⚡️" : "⛏"}
                              </span>
                              <div className="min-w-0">
                                <div className="text-sm font-bold truncate" style={{ color: themeColors.text_main }}>{inst.name}</div>
                                <div className="text-[10px] tinycaps" style={{ color: themeColors.text_muted }}>MC {inst.version} · {inst.loader || "Vanilla"}</div>
                              </div>
                            </div>
                            <span className="text-[9px] font-medium px-2 py-1 rounded-full shrink-0" style={{ background: `${themeColors.accent}15`, color: themeColors.accent, border: `1px solid ${themeColors.accent}25` }}>
                              {inst.loader?.toLowerCase() || "vanilla"}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-[10px]" style={{ color: themeColors.text_muted }}>
                            <div className="flex items-center gap-1">
                              <Clock size={10} />
                              <span>{getRelativeTime(inst.last_played)}</span>
                            </div>
                            {playTimeMin > 0 && (
                              <div className="flex items-center gap-1">
                                <Timer size={10} />
                                <span>{formatPlayTime(playTimeMin)}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex-1" />

                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={(e) => { e.stopPropagation(); handleLaunch(inst); }}
                            className="w-full py-2.5 rounded-xl text-[12px] font-bold tinycaps flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-lg"
                            style={{ background: `linear-gradient(135deg, ${themeColors.accent}, ${themeColors.accent2 || themeColors.accent})`, color: "#fff", boxShadow: `0 4px 16px ${themeColors.accent}40` }}
                          >
                            <Play size={14} fill="currentColor" /> Play
                          </motion.button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== ENHANCED STATS SECTION ===== */}
      {instances.length > 0 && (
        <div className="space-y-8">
          {/* Section header */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${themeColors.accent}20`, border: `1px solid ${themeColors.accent}30` }}>
                <Zap size={16} style={{ color: themeColors.accent }} />
              </div>
              <h2 className="text-base font-bold tinycaps" style={{ color: themeColors.text_main }}>system dashboard</h2>
              <div className="hidden md:block text-[10px] tinycaps px-3 py-1 rounded-full" style={{ background: `${themeColors.text_muted}10`, color: themeColors.text_muted }}>
                Real-time monitoring
              </div>
            </div>
          </div>

          {/* Stats grid with enhanced cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}>
              <EnhancedStatCard
                title="cpu usage"
                icon={Cpu}
                value={`${Math.round(systemInfo.cpu)}%`}
                sub="Processor load"
                color={systemInfo.cpu > 80 ? themeColors.danger : themeColors.accent}
                delay={0.3}
                trend={systemInfo.cpu > 70}
                trendValue={systemInfo.cpu > 70 ? "rising" : "stable"}
                status={systemInfo.cpu > 80 ? "critical" : systemInfo.cpu > 60 ? "warning" : "online"}
              />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}>
              <EnhancedStatCard
                title="memory"
                icon={MemoryStick}
                value={`${(systemInfo.ram_used / 1024 / 1024 / 1024).toFixed(1)}g`}
                sub={`${systemInfo.ram_pct}% utilized`}
                color={themeColors.purple}
                delay={0.35}
                trend={systemInfo.ram_pct > 60}
                trendValue={systemInfo.ram_pct > 60 ? "high" : "optimal"}
                status={systemInfo.ram_pct > 80 ? "critical" : systemInfo.ram_pct > 60 ? "warning" : "online"}
              />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}>
              <EnhancedStatCard
                title="disk space"
                icon={Disc}
                value={`${(systemInfo.disk_used / 1024 / 1024 / 1024).toFixed(0)}g`}
                sub={`${systemInfo.disk_pct}% used`}
                color={themeColors.blue}
                delay={0.4}
                trend={systemInfo.disk_pct < 80}
                trendValue={systemInfo.disk_pct < 80 ? "healthy" : "caution"}
                status={systemInfo.disk_pct > 90 ? "critical" : systemInfo.disk_pct > 80 ? "warning" : "online"}
              />
            </motion.div>
          </div>

          {/* Additional system stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}>
              <div className="group relative p-5 rounded-2xl overflow-hidden" style={{ background: `linear-gradient(135deg, ${themeColors.bg_card}ee, ${themeColors.bg_card2}dd)` }}>
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: `radial-gradient(circle at 50% 0%, ${themeColors.accent}10, transparent 70%)` }} />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${themeColors.accent}15`, border: `1px solid ${themeColors.accent}25` }}>
                      <Box size={20} style={{ color: themeColors.accent }} />
                    </div>
                    <div>
                      <div className="text-xl font-bold gradient-text">{instances.length}</div>
                      <div className="text-[9px] tinycaps" style={{ color: themeColors.text_muted }}>total profiles</div>
                    </div>
                  </div>
                  <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${themeColors.accent}10` }}>
                    <div className="flex items-center justify-between text-[9px]">
                      <span style={{ color: themeColors.text_muted }}>installed</span>
                      <span style={{ color: themeColors.accent, fontWeight: 600 }}>{installedInstances.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}>
              <div className="group relative p-5 rounded-2xl overflow-hidden" style={{ background: `linear-gradient(135deg, ${themeColors.bg_card}ee, ${themeColors.bg_card2}dd)` }}>
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: `radial-gradient(circle at 50% 0%, ${themeColors.purple}10, transparent 70%)` }} />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${themeColors.purple}15`, border: `1px solid ${themeColors.purple}25` }}>
                      <Clock size={20} style={{ color: themeColors.purple }} />
                    </div>
                    <div>
                      <div className="text-xl font-bold" style={{ color: themeColors.purple }}>{Math.floor((totalPlayMinutes / 60 / 24))}h</div>
                      <div className="text-[9px] tinycaps" style={{ color: themeColors.text_muted }}>daily average</div>
                    </div>
                  </div>
                  <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${themeColors.purple}10` }}>
                    <div className="flex items-center justify-between text-[9px]">
                      <span style={{ color: themeColors.text_muted }}>peak</span>
                      <span style={{ color: themeColors.purple, fontWeight: 600 }}>{Math.floor(totalPlayHours / 24 * 2)}h</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}>
              <div className="group relative p-5 rounded-2xl overflow-hidden" style={{ background: `linear-gradient(135deg, ${themeColors.bg_card}ee, ${themeColors.bg_card2}dd)` }}>
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: `radial-gradient(circle at 50% 0%, ${themeColors.green}10, transparent 70%)` }} />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${themeColors.green}15`, border: `1px solid ${themeColors.green}25` }}>
                      <Headphones size={20} style={{ color: themeColors.green }} />
                    </div>
                    <div>
                      <div className="text-xl font-bold" style={{ color: themeColors.green }}>0%</div>
                      <div className="text-[9px] tinycaps" style={{ color: themeColors.text_muted }}>volume</div>
                    </div>
                  </div>
                  <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${themeColors.green}10` }}>
                    <div className="flex items-center justify-between text-[9px]">
                      <span style={{ color: themeColors.text_muted }}>muted</span>
                      <span style={{ color: themeColors.green, fontWeight: 600 }}>quiet</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}>
              <div className="group relative p-5 rounded-2xl overflow-hidden" style={{ background: `linear-gradient(135deg, ${themeColors.bg_card}ee, ${themeColors.bg_card2}dd)` }}>
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: `radial-gradient(circle at 50% 0%, ${themeColors.blue}10, transparent 70%)` }} />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${themeColors.blue}15`, border: `1px solid ${themeColors.blue}25` }}>
                      <AlertTriangle size={20} style={{ color: themeColors.warn }} />
                    </div>
                    <div>
                      <div className="text-xl font-bold" style={{ color: themeColors.warn }}>0</div>
                      <div className="text-[9px] tinycaps" style={{ color: themeColors.text_muted }}>warnings</div>
                    </div>
                  </div>
                  <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${themeColors.blue}10` }}>
                    <div className="flex items-center justify-between text-[9px]">
                      <span style={{ color: themeColors.text_muted }}>alerts</span>
                      <span style={{ color: themeColors.blue, fontWeight: 600 }}>healthy</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}

      {/* ===== SCREENSHOT GALLERY ===== */}
      {installedInstances.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${themeColors.purple}20`, border: `1px solid ${themeColors.purple}30` }}>
                <Camera size={16} style={{ color: themeColors.purple }} />
              </div>
              <h2 className="text-base font-bold tinycaps" style={{ color: themeColors.text_main }}>screenshot gallery</h2>
              {screenshots.length > 0 && (
                <div className="hidden sm:block text-[10px] tinycaps px-3 py-1 rounded-full" style={{ background: `${themeColors.purple}10`, color: themeColors.text_muted, border: `1px solid ${themeColors.purple}15` }}>
                  {screenshots.length} screenshot{screenshots.length !== 1 ? "s" : ""}
                </div>
              )}
            </div>
            {screenshots.length > 0 && (
              <button onClick={() => setPage("instances")}
                className="group inline-flex items-center gap-1.5 px-4 py-2 rounded-xl transition-all hover:scale-105 shadow-md"
                style={{ background: `${themeColors.purple}15` }}
                onMouseEnter={(e) => { e.currentTarget.style.background = themeColors.purple + '25'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = themeColors.purple + '15'; }}
              >
                <span className="text-[11px] font-bold tinycaps" style={{ color: themeColors.purple }}>View All</span>
                <ChevronRight size={12} style={{ color: themeColors.purple }} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}
          </div>

          {screenshotsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin" style={{ color: themeColors.purple }} />
            </div>
          ) : screenshots.length === 0 ? (
            <div className="text-center py-12 rounded-3xl" style={{ background: `${themeColors.bg_card}80`, border: `1px solid ${themeColors.border}30` }}>
              <ImageIcon size={40} className="mx-auto mb-3 opacity-30" style={{ color: themeColors.text_muted }} />
              <p className="text-sm font-medium mb-1" style={{ color: themeColors.text_muted }}>No screenshots yet</p>
              <p className="text-xs" style={{ color: themeColors.text_muted, opacity: 0.6 }}>Screenshots from your games will appear here</p>
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4 px-2" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
              <style>{`
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; }
              `}</style>
              <div className="flex gap-4 hide-scrollbar">
                <AnimatePresence>
                  {screenshots.slice(0, 16).map((shot, i) => (
                    <motion.div
                      key={`${shot.instance_name}-${shot.filename}`}
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.4, delay: i * 0.04, ease: [0.4, 0, 0.2, 1] }}
                      whileHover={{ scale: 1.08, y: -4 }}
                      className="group relative rounded-2xl overflow-hidden cursor-pointer shrink-0"
                      style={{
                        width: 200,
                        height: 140,
                        border: `2px solid ${themeColors.purple}30`,
                        backdropFilter: "blur(12px)",
                        WebkitBackdropFilter: "blur(12px)",
                        boxShadow: `0 4px 16px ${themeColors.purple}10`,
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = themeColors.purple + '70'; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 32px ${themeColors.purple}30`; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = themeColors.purple + '30'; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 16px ${themeColors.purple}10`; }}
                    >
                      <img
                        src={convertFileSrc(shot.path)}
                        alt={shot.filename}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                        <div className="text-[10px] font-bold truncate" style={{ color: "#fff" }}>{shot.instance_name}</div>
                        <div className="text-[9px]" style={{ color: "rgba(255,255,255,0.7)" }}>
                          {(() => { try { return new Date(shot.timestamp).toLocaleDateString(); } catch { return ""; } })()}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== ACHIEVEMENTS SECTION ===== */}
      {homeAchievements.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${themeColors.warn}20`, border: `1px solid ${themeColors.warn}30` }}>
                <Trophy size={16} style={{ color: themeColors.warn }} />
              </div>
              <h2 className="text-base font-bold tinycaps" style={{ color: themeColors.text_main }}>achievements</h2>
              <div className="hidden sm:block text-[10px] tinycaps px-3 py-1 rounded-full" style={{ background: `${themeColors.warn}10`, color: themeColors.text_muted, border: `1px solid ${themeColors.warn}15` }}>
                {homeAchievements.filter(a => a.unlocked).length}/{homeAchievements.length} unlocked
              </div>
            </div>
            <button onClick={() => setPage("achievements")}
              className="group inline-flex items-center gap-1.5 px-4 py-2 rounded-xl transition-all hover:scale-105 shadow-md"
              style={{ background: `${themeColors.warn}15` }}
              onMouseEnter={(e) => { e.currentTarget.style.background = themeColors.warn + '25'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = themeColors.warn + '15'; }}
            >
              <span className="text-[11px] font-bold tinycaps" style={{ color: themeColors.warn }}>View All</span>
              <ChevronRight size={12} style={{ color: themeColors.warn }} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {homeAchievements.map((ach, i) => (
              <motion.div
                key={ach.id}
                initial={{ opacity: 0, y: 12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.1 + i * 0.06, ease: [0.4, 0, 0.2, 1] }}
                whileHover={{ scale: 1.03, y: -3 }}
                onClick={() => setPage("achievements")}
                className="cursor-pointer rounded-2xl p-4 flex items-center gap-3 transition-all"
                style={{
                  background: ach.unlocked ? `linear-gradient(135deg, ${themeColors.warn}12, ${themeColors.warn}06)` : `${themeColors.bg_card}80`,
                  border: `1px solid ${ach.unlocked ? `${themeColors.warn}30` : `${themeColors.border}40`}`,
                  boxShadow: ach.unlocked ? `0 4px 16px ${themeColors.warn}10` : "none",
                }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 relative"
                  style={{
                    background: ach.unlocked ? `${themeColors.warn}15` : `${themeColors.text_muted}10`,
                    border: `1px solid ${ach.unlocked ? `${themeColors.warn}25` : `${themeColors.text_muted}10`}`,
                  }}>
                  <span className="text-lg">{ach.icon || "🏆"}</span>
                  {!ach.unlocked && (
                    <div className="absolute inset-0 rounded-xl flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
                      <Lock size={12} style={{ color: themeColors.text_muted }} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold truncate" style={{ color: ach.unlocked ? themeColors.text_main : themeColors.text_muted }}>
                    {ach.name}
                  </div>
                  <div className="text-[9px] mt-0.5" style={{ color: themeColors.text_muted }}>
                    {ach.unlocked ? "Unlocked" : "Locked"}
                  </div>
                </div>
                {ach.unlocked && (
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: themeColors.warn, boxShadow: `0 0 8px ${themeColors.warn}60` }} />
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* ===== EMPTY STATE ===== */}
      {instances.length === 0 && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative text-center py-16">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-80 h-80 rounded-full opacity-10 blur-3xl" style={{ background: themeColors.accent }} />
            <div className="w-64 h-64 rounded-full opacity-10 blur-3xl" style={{ background: themeColors.purple }} />
          </div>

          <div className="relative space-y-8">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2, type: "spring", stiffness: 300 }} className="w-28 h-28 mx-auto mb-8 rounded-4xl flex items-center justify-center" style={{ background: `${themeColors.accent}10`, border: `2px solid ${themeColors.accent}20`, boxShadow: `0 10px 40px ${themeColors.accent}20` }}>
              <Box size={48} style={{ color: themeColors.accent }} className="drop-shadow-lg" />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              <h3 className="text-3xl font-bold tinycaps mb-3" style={{ color: themeColors.text_main }}>no instances yet</h3>
              <p className="text-xs mb-4 max-w-md mx-auto tinycaps" style={{ color: themeColors.text_muted }}>
                create your first Minecraft profile to start playing with {username}'s custom setup and personalized 3D player experience
              </p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <GlowButton onClick={() => setPage("instances")} className="inline-flex items-center gap-2 shadow-2xl">
                <Plus size={16} /> Create First Instance
              </GlowButton>
            </motion.div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// MUIcon component for icons
function MUIcon({ 
  children, 
  className, 
  size = 24, 
  color = "currentColor", 
  strokeWidth = 2
}: { 
  children: any; 
  className?: string; 
  size?: number; 
  color?: string; 
  strokeWidth?: number;
}) {
  return (
    <div className={className} style={{ width: size, height: size }}>
      {children}
    </div>
  );
}

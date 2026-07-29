import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLauncherStore } from "../../stores";
import { api } from "../../lib/api";
import { GlassCard } from "../ui/GlassCard";
import { GlowButton } from "../ui/GlowButton";
import { Trophy, Lock, Unlock, Clock, Star, Medal, Award } from "lucide-react";

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlocked_at?: string;
}

function getAchievementIcon(icon: string) {
  const iconMap: Record<string, any> = {
    trophy: Trophy,
    medal: Medal,
    award: Award,
    star: Star,
    lock: Lock,
    unlock: Unlock,
  };
  return iconMap[icon] || Trophy;
}

function getAchievementColor(unlocked: boolean, index: number, themeColors: any) {
  if (unlocked) {
    const colors = [themeColors.warn, themeColors.accent, themeColors.success, themeColors.purple, themeColors.blue];
    return colors[index % colors.length];
  }
  return themeColors.text_muted;
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

export function AchievementsPage() {
  const { themeColors } = useLauncherStore();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    api.achievements.get().then((res) => {
      setAchievements(res.achievements || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const totalCount = achievements.length;
  const progress = totalCount > 0 ? (unlockedCount / totalCount) * 100 : 0;

  const handleCheckNew = async () => {
    setChecking(true);
    try {
      const result = await api.achievements.check();
      if (result.newly_unlocked && result.newly_unlocked.length > 0) {
        const refreshed = await api.achievements.get();
        setAchievements(refreshed.achievements || []);
        alert(`Unlocked ${result.newly_unlocked.length} new achievement(s)!`);
      } else {
        alert("No new achievements to unlock.");
      }
    } catch (err) {
      console.error("Failed to check achievements:", err);
    }
    setChecking(false);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy size={20} style={{ color: themeColors.warn }} />
          <div>
            <h1 className="tinycaps text-xl font-bold gradient-text" style={{ "--accent": themeColors.warn, "--accent2": themeColors.accent } as any}>Achievements</h1>
            <p className="text-xs mt-0.5" style={{ color: themeColors.text_muted }}>
              {unlockedCount} of {totalCount} unlocked
            </p>
          </div>
        </div>
        <GlowButton size="sm" onClick={handleCheckNew} disabled={checking} className="flex items-center gap-1">
          <Star size={12} /> {checking ? "Checking..." : "Check for New"}
        </GlowButton>
      </div>

      <GlassCard>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs tinycaps font-bold" style={{ color: themeColors.text_muted }}>PROGRESS</span>
          <span className="text-xs tinycaps font-bold" style={{ color: themeColors.warn }}>{unlockedCount}/{totalCount}</span>
        </div>
        <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: `${themeColors.text_muted}15` }}>
          <motion.div
            className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1] }}
            style={{ background: `linear-gradient(90deg, ${themeColors.warn}, ${themeColors.accent})`, boxShadow: `0 0 16px ${themeColors.warn}40` }}
          />
        </div>
      </GlassCard>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: themeColors.warn, borderTopColor: "transparent" }} />
        </div>
      ) : achievements.length === 0 ? (
        <div className="text-center py-16 rounded-3xl" style={{ background: `${themeColors.bg_card}80`, border: `1px solid ${themeColors.border}30` }}>
          <Trophy size={40} className="mx-auto mb-3 opacity-30" style={{ color: themeColors.text_muted }} />
          <p className="text-sm font-medium mb-1" style={{ color: themeColors.text_muted }}>No achievements yet</p>
          <p className="text-xs" style={{ color: themeColors.text_muted, opacity: 0.6 }}>Play Minecraft to unlock achievements</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <AnimatePresence>
            {achievements.map((achievement, i) => {
              const color = getAchievementColor(achievement.unlocked, i, themeColors);
              const Icon = getAchievementIcon(achievement.icon);
              return (
                <motion.div
                  key={achievement.id}
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.4, delay: i * 0.04, ease: [0.4, 0, 0.2, 1] }}
                >
                  <GlassCard
                    className={`relative overflow-hidden ${achievement.unlocked ? "" : "opacity-50"}`}
                    style={achievement.unlocked ? {
                      boxShadow: `0 0 24px ${color}15, 0 4px 16px ${color}08`,
                      border: `1px solid ${color}30`,
                    } : {}}
                  >
                    {achievement.unlocked && (
                      <div className="absolute top-0 right-0 w-24 h-24 opacity-5 pointer-events-none"
                        style={{ background: `radial-gradient(circle at 100% 0%, ${color}, transparent 70%)` }}
                      />
                    )}

                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 relative"
                        style={{
                          background: achievement.unlocked ? `${color}15` : `${themeColors.text_muted}10`,
                          border: `1px solid ${achievement.unlocked ? `${color}30` : `${themeColors.text_muted}15`}`,
                        }}>
                        <Icon size={20} style={{ color: achievement.unlocked ? color : themeColors.text_muted }} />
                        {achievement.unlocked && (
                          <motion.div
                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                            style={{ background: color, boxShadow: `0 0 8px ${color}60` }}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 500, damping: 20, delay: 0.3 + i * 0.04 }}
                          >
                            <Unlock size={8} style={{ color: "#fff" }} />
                          </motion.div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="tinycaps text-sm font-bold" style={{ color: achievement.unlocked ? themeColors.text_main : themeColors.text_muted }}>
                          {achievement.name}
                        </h3>
                        <p className="text-[11px] mt-0.5" style={{ color: themeColors.text_muted }}>
                          {achievement.description}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between" style={{ borderTop: `1px solid ${themeColors.border}` }}>
                      {achievement.unlocked ? (
                        <div className="flex items-center gap-1.5 text-[10px]" style={{ color }}>
                          <Clock size={10} />
                          {formatDate(achievement.unlocked_at)}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[10px]" style={{ color: themeColors.text_muted }}>
                          <Lock size={10} />
                          Locked
                        </div>
                      )}
                      <span className="text-[9px] px-2 py-0.5 rounded-full tinycaps font-bold"
                        style={{
                          background: achievement.unlocked ? `${color}15` : `${themeColors.text_muted}10`,
                          color: achievement.unlocked ? color : themeColors.text_muted,
                          border: `1px solid ${achievement.unlocked ? `${color}25` : `${themeColors.text_muted}15`}`,
                        }}>
                        {achievement.unlocked ? "Unlocked" : "Locked"}
                      </span>
                    </div>
                  </GlassCard>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

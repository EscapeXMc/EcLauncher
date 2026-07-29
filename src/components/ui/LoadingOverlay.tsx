import { motion } from "framer-motion";
import { useLauncherStore } from "../../stores";

export function LoadingOverlay() {
  const { loadingMessage, themeColors } = useLauncherStore();
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
      <div className="relative w-16 h-16 mb-4">
        <div className="absolute inset-0 rounded-full border-2 animate-spin"
          style={{ borderColor: "transparent", borderTopColor: themeColors.accent, borderRightColor: `${themeColors.accent}40` }} />
        <div className="absolute inset-1.5 rounded-full border animate-spin"
          style={{ borderColor: "transparent", borderBottomColor: themeColors.purple || themeColors.accent2, animationDirection: "reverse", animationDuration: "1.5s" }} />
        <div className="absolute inset-3 rounded-full"
          style={{ background: `${themeColors.accent}15`, animation: "pulseRing 2s ease-in-out infinite" }} />
        <div className="absolute inset-0 rounded-full"
          style={{ boxShadow: `0 0 30px ${themeColors.accent}30, 0 0 60px ${themeColors.accent}10` }} />
      </div>
      {loadingMessage && (
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="tinycaps text-xs font-semibold tracking-wider" style={{ color: themeColors.text_sub }}>
          {loadingMessage}
        </motion.p>
      )}
    </motion.div>
  );
}

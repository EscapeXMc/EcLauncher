import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLauncherStore } from "../../stores";

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const { themeColors } = useLauncherStore();
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"logo" | "loading" | "exit">("logo");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("loading"), 800);
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) { clearInterval(interval); return 100; }
        return p + Math.random() * 15 + 5;
      });
    }, 120);
    const t2 = setTimeout(() => setPhase("exit"), 2800);
    const t3 = setTimeout(() => onComplete(), 3200);
    return () => { clearTimeout(t1); clearInterval(interval); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  const particles = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 4 + 1,
    delay: Math.random() * 2,
    duration: Math.random() * 3 + 2,
  }));

  return (
    <AnimatePresence>
      {phase !== "exit" && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
          style={{ background: themeColors.bg_main }}
        >
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {particles.map((p) => (
              <motion.div
                key={p.id}
                className="absolute rounded-full"
                style={{
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  width: p.size,
                  height: p.size,
                  background: `radial-gradient(circle, ${themeColors.accent} 0%, transparent 70%)`,
                }}
                animate={{
                  opacity: [0, 0.6, 0],
                  scale: [0, 1.5, 0],
                  y: [0, -60],
                }}
                transition={{
                  duration: p.duration,
                  delay: p.delay,
                  repeat: Infinity,
                  ease: "easeOut",
                }}
              />
            ))}
          </div>

          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at 50% 40%, ${themeColors.accent}15 0%, transparent 60%)`,
            }}
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
          />

          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
            className="relative mb-8"
          >
            <motion.div
              className="w-24 h-24 rounded-3xl flex items-center justify-center relative overflow-hidden"
              style={{
                boxShadow: `0 0 60px ${themeColors.accent}50, 0 0 120px ${themeColors.accent}20, 0 20px 40px rgba(0,0,0,0.4)`,
              }}
              animate={{
                boxShadow: [
                  `0 0 60px ${themeColors.accent}50, 0 0 120px ${themeColors.accent}20, 0 20px 40px rgba(0,0,0,0.4)`,
                  `0 0 80px ${themeColors.accent}70, 0 0 160px ${themeColors.accent}30, 0 20px 40px rgba(0,0,0,0.4)`,
                  `0 0 60px ${themeColors.accent}50, 0 0 120px ${themeColors.accent}20, 0 20px 40px rgba(0,0,0,0.4)`,
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <img src="/logo.png" alt="EcLauncher" className="w-full h-full object-contain" />
              <motion.div
                className="absolute inset-0 rounded-3xl"
                style={{
                  background: `linear-gradient(135deg, transparent 30%, rgba(255,255,255,0.2) 50%, transparent 70%)`,
                }}
                animate={{ x: [-100, 200] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 1.5, ease: "easeInOut" }}
              />
            </motion.div>

            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute inset-0 rounded-3xl"
                style={{ border: `2px solid ${themeColors.accent}` }}
                animate={{ scale: [1, 1.5 + i * 0.3], opacity: [0.4, 0] }}
                transition={{ duration: 2, delay: i * 0.3, repeat: Infinity }}
              />
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="text-center mb-10"
          >
            <h1 className="tinycaps text-2xl font-black tracking-wider mb-2 gradient-text-animated" style={{ "--accent": themeColors.accent, "--accent2": themeColors.purple || themeColors.accent2 } as any}>
              eclauncher
            </h1>
            <p className="tinycaps text-xs tracking-widest" style={{ color: themeColors.text_muted }}>
              your minecraft experience
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 280 }}
            transition={{ delay: 0.8, duration: 0.4 }}
            className="relative"
          >
            <div className="h-1 rounded-full overflow-hidden" style={{ background: `${themeColors.accent}15` }}>
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${themeColors.accent}, ${themeColors.purple || themeColors.accent2})`,
                  boxShadow: `0 0 12px ${themeColors.accent}60`,
                }}
                animate={{ width: `${Math.min(progress, 100)}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>
            <motion.div
              className="absolute top-0 left-0 h-1 rounded-full"
              style={{
                width: `${Math.min(progress, 100)}%`,
                background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)`,
                animation: "shimmer 1.5s infinite",
              }}
            />
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ delay: 1, duration: 1.5, repeat: Infinity }}
            className="mt-4 tinycaps text-[10px] tracking-widest"
            style={{ color: themeColors.text_muted }}
          >
            {progress < 30 ? "initializing..." : progress < 60 ? "loading resources..." : progress < 90 ? "almost ready..." : "ready!"}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

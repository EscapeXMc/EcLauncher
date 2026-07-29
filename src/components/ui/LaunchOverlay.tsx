import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLauncherStore } from "../../stores";

export function LaunchOverlay({ instanceName, onComplete }: { instanceName: string; onComplete: () => void }) {
  const { themeColors } = useLauncherStore();
  const [phase, setPhase] = useState<"shake" | "launch" | "done">("shake");
  const [dots, setDots] = useState("");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("launch"), 1800);
    const t2 = setTimeout(() => setPhase("done"), 4500);
    const t3 = setTimeout(() => onComplete(), 5000);
    const dotInterval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearInterval(dotInterval); };
  }, [onComplete]);

  const stars = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2.5 + 0.5,
    delay: Math.random() * 2,
    duration: Math.random() * 3 + 1,
  }));

  const exhaustParticles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: (Math.random() - 0.5) * 30,
    delay: Math.random() * 0.5,
    size: Math.random() * 8 + 3,
    duration: Math.random() * 0.8 + 0.4,
  }));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="fixed inset-0 z-[90] flex flex-col items-center justify-center"
        style={{
          background: "radial-gradient(ellipse at 50% 120%, #0a0a1a 0%, #000008 60%, #000005 100%)",
        }}
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {stars.map((s) => (
            <motion.div
              key={s.id}
              className="absolute rounded-full bg-white"
              style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size }}
              animate={{
                opacity: [0.2, 0.8, 0.2],
                scale: [0.8, 1.2, 0.8],
              }}
              transition={{ duration: s.duration, delay: s.delay, repeat: Infinity }}
            />
          ))}
        </div>

        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 70%, ${themeColors.accent}10 0%, transparent 50%)`,
          }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        />

        <motion.div
          className="relative"
          animate={
            phase === "shake"
              ? { x: [0, -3, 3, -2, 2, 0], y: [0, 2, -1, 1, -1, 0] }
              : phase === "launch"
              ? { y: [0, -800], scale: [1, 0.6] }
              : { y: -800, opacity: 0 }
          }
          transition={
            phase === "shake"
              ? { duration: 0.4, repeat: 4, ease: "easeInOut" }
              : phase === "launch"
              ? { duration: 2.5, ease: [0.2, 0.8, 0.3, 1] }
              : { duration: 0.3 }
          }
        >
          <div className="relative" style={{ perspective: "600px" }}>
            <motion.div
              className="relative"
              style={{
                transformStyle: "preserve-3d",
                transform: "rotateX(-5deg)",
              }}
            >
              <div className="relative mx-auto" style={{ width: 44, height: 120 }}>
                <div
                  className="absolute inset-x-2 top-6 bottom-0 rounded-t-full rounded-b-lg"
                  style={{
                    background: `linear-gradient(180deg, #e8e8f0 0%, #c0c0d0 30%, #9090a8 100%)`,
                    boxShadow: "inset -4px 0 8px rgba(0,0,0,0.3), inset 4px 0 8px rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.5)",
                  }}
                />
                <div
                  className="absolute left-1/2 -translate-x-1/2 top-10 w-5 h-5 rounded-full"
                  style={{
                    background: `radial-gradient(circle at 35% 35%, ${themeColors.accent} 0%, ${themeColors.accent}80 60%, ${themeColors.accent}40 100%)`,
                    boxShadow: `0 0 12px ${themeColors.accent}80, inset 0 -2px 4px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.3)`,
                  }}
                />
                <div
                  className="absolute top-0 left-1/2 -translate-x-1/2"
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: "12px solid transparent",
                    borderRight: "12px solid transparent",
                    borderBottom: "20px solid #d03040",
                    filter: "drop-shadow(0 -2px 4px rgba(208,48,64,0.4))",
                  }}
                />
                <div
                  className="absolute bottom-0 -left-2"
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: "14px solid transparent",
                    borderRight: "0px solid transparent",
                    borderTop: "16px solid #c03040",
                    transform: "skewY(15deg)",
                  }}
                />
                <div
                  className="absolute bottom-0 -right-2"
                  style={{
                    width: 0,
                    height: 0,
                    borderRight: "14px solid transparent",
                    borderLeft: "0px solid transparent",
                    borderTop: "16px solid #c03040",
                    transform: "skewY(-15deg)",
                  }}
                />
              </div>
            </motion.div>

            {phase !== "done" && (
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2" style={{ width: 40 }}>
                <motion.div
                  className="mx-auto rounded-b-full"
                  style={{
                    width: 20,
                    background: `linear-gradient(180deg, #ff6600 0%, #ff3300 40%, #ff0000 70%, transparent 100%)`,
                    filter: "blur(2px)",
                  }}
                  animate={{ height: [20, 40, 25, 35, 20], opacity: [0.8, 1, 0.7, 1, 0.8] }}
                  transition={{ duration: 0.3, repeat: Infinity }}
                />
                <motion.div
                  className="absolute -left-3 top-0 mx-auto rounded-b-full"
                  style={{
                    width: 12,
                    background: `linear-gradient(180deg, #ff880080 0%, #ff440040 50%, transparent 100%)`,
                    filter: "blur(3px)",
                  }}
                  animate={{ height: [15, 30, 18, 28, 15], opacity: [0.5, 0.8, 0.4, 0.7, 0.5] }}
                  transition={{ duration: 0.25, repeat: Infinity, delay: 0.05 }}
                />
                <motion.div
                  className="absolute -right-3 top-0 mx-auto rounded-b-full"
                  style={{
                    width: 12,
                    background: `linear-gradient(180deg, #ff880080 0%, #ff440040 50%, transparent 100%)`,
                    filter: "blur(3px)",
                  }}
                  animate={{ height: [18, 35, 20, 32, 18], opacity: [0.6, 0.9, 0.5, 0.8, 0.6] }}
                  transition={{ duration: 0.28, repeat: Infinity, delay: 0.1 }}
                />
                {exhaustParticles.map((p) => (
                  <motion.div
                    key={p.id}
                    className="absolute left-1/2 rounded-full"
                    style={{
                      width: p.size,
                      height: p.size,
                      background: `radial-gradient(circle, #ff660080, #ff330040, transparent)`,
                      filter: "blur(1px)",
                    }}
                    animate={{
                      y: [0, 80 + Math.random() * 40],
                      x: [p.x, p.x * 2],
                      opacity: [0.7, 0],
                      scale: [1, 0.2],
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
            )}
          </div>
        </motion.div>

        {phase === "shake" && (
          <motion.div
            className="absolute bottom-32 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <motion.p
              className="tinycaps text-lg font-bold tracking-wider"
              style={{ color: "#fff", textShadow: `0 0 20px ${themeColors.accent}80` }}
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              Launching {instanceName}{dots}
            </motion.p>
            <div className="flex items-center justify-center gap-2 mt-3">
              <motion.div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: themeColors.accent }}
                animate={{ scale: [1, 1.5, 1] }}
                transition={{ duration: 0.6, repeat: Infinity }}
              />
              <motion.div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: themeColors.purple || themeColors.accent }}
                animate={{ scale: [1, 1.5, 1] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
              />
              <motion.div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: themeColors.blue || themeColors.accent }}
                animate={{ scale: [1, 1.5, 1] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
              />
            </div>
          </motion.div>
        )}

        {phase === "launch" && (
          <motion.div
            className="absolute bottom-32 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 2 }}
          >
            <p className="tinycaps text-sm font-bold tracking-wider" style={{ color: themeColors.accent }}>
              Have fun playing!
            </p>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLauncherStore } from "../../stores";

interface LaunchAnimProps {
  instanceName: string;
  onComplete: () => void;
}

export function LaunchAnimation({ instanceName, onComplete }: LaunchAnimProps) {
  const { themeColors } = useLauncherStore();
  const [phase, setPhase] = useState<"portal" | "warp" | "done">("portal");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("warp"), 2000);
    const t2 = setTimeout(() => setPhase("done"), 3500);
    const t3 = setTimeout(() => onComplete(), 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  const portalParticles = useMemo(() =>
    Array.from({ length: 60 }, (_, i) => ({
      id: i,
      angle: (i / 60) * Math.PI * 2,
      radius: 80 + Math.random() * 120,
      size: 2 + Math.random() * 4,
      delay: Math.random() * 0.5,
      color: `hsl(${260 + Math.random() * 40}, 80%, ${50 + Math.random() * 30}%)`,
    })), []);

  const warpLines = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      angle: (i / 40) * 360,
      length: 100 + Math.random() * 200,
      width: 1 + Math.random() * 2,
      delay: Math.random() * 0.3,
    })), []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.95)" }}
    >
      <AnimatePresence>
        {phase === "portal" && (
          <motion.div
            key="portal"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 3 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="relative"
          >
            {/* End Portal ring */}
            <div
              className="w-48 h-48 rounded-full relative"
              style={{
                background: "radial-gradient(circle, #000 30%, #1a0a2e 60%, transparent 70%)",
                boxShadow: `0 0 60px rgba(100,0,200,0.5), 0 0 120px rgba(80,0,180,0.3), inset 0 0 40px rgba(50,0,120,0.4)`,
                animation: "portalSpin 3s linear infinite",
              }}
            >
              {/* Portal eye particles */}
              {portalParticles.map((p) => (
                <div
                  key={p.id}
                  className="absolute rounded-full"
                  style={{
                    left: `${50 + Math.cos(p.angle) * (p.radius / 3)}%`,
                    top: `${50 + Math.sin(p.angle) * (p.radius / 3)}%`,
                    width: `${p.size}px`,
                    height: `${p.size}px`,
                    background: p.color,
                    animation: `portalParticle ${1.5 + Math.random()}s ease-in-out ${p.delay}s infinite alternate`,
                    boxShadow: `0 0 6px ${p.color}`,
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}

        {phase === "warp" && (
          <motion.div
            key="warp"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            {warpLines.map((l) => (
              <div
                key={l.id}
                className="absolute"
                style={{
                  width: `${l.length}px`,
                  height: `${l.width}px`,
                  background: `linear-gradient(90deg, transparent, ${themeColors.accent}, transparent)`,
                  transform: `rotate(${l.angle}deg)`,
                  animation: `warpLine 0.8s ease-out ${l.delay}s forwards`,
                  opacity: 0,
                }}
              />
            ))}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: [0, 2, 0] }}
              transition={{ duration: 1.5 }}
              className="w-4 h-4 rounded-full"
              style={{
                background: themeColors.accent,
                boxShadow: `0 0 40px ${themeColors.accent}, 0 0 80px ${themeColors.accent}80`,
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Instance name */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: phase === "portal" ? 1 : 0, y: phase === "portal" ? 0 : -20 }}
        className="absolute bottom-20 text-center"
      >
        <p className="tinycaps text-[10px] font-bold mb-1" style={{ color: themeColors.text_muted }}>LAUNCHING</p>
        <p className="tinycaps text-lg font-bold" style={{ color: themeColors.accent }}>{instanceName}</p>
      </motion.div>

      <style>{`
        @keyframes portalSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes portalParticle { 0% { transform: scale(0.5); opacity: 0.3; } 100% { transform: scale(1.5); opacity: 1; } }
        @keyframes warpLine { 0% { opacity: 0; transform: rotate(var(--angle)) scaleX(0); } 50% { opacity: 1; } 100% { opacity: 0; transform: rotate(var(--angle)) scaleX(1); } }
      `}</style>
    </motion.div>
  );
}

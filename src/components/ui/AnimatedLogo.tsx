import { motion } from "framer-motion";
import { useLauncherStore } from "../../stores";
import { useState, useEffect } from "react";

interface AnimatedLogoProps {
  size?: number;
  animated?: boolean;
}

export function AnimatedLogo({ size = 40, animated = true }: AnimatedLogoProps) {
  const { themeColors } = useLauncherStore();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (animated) {
      const t = setTimeout(() => setLoaded(true), 500);
      return () => clearTimeout(t);
    }
    setLoaded(true);
  }, [animated]);

  return (
    <motion.div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      initial={animated ? { opacity: 0, scale: 0, rotate: -180 } : {}}
      animate={animated && loaded ? { opacity: 1, scale: 1, rotate: 0 } : {}}
      transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
    >
      {/* Glow ring */}
      <motion.div
        className="absolute inset-0 rounded-xl"
        style={{
          background: `conic-gradient(from 0deg, ${themeColors.accent}40, transparent, ${themeColors.accent}40)`,
          filter: "blur(6px)",
        }}
        animate={animated ? { rotate: 360 } : {}}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />

      {/* Inner glow pulse */}
      <motion.div
        className="absolute inset-[-4px] rounded-xl"
        style={{ background: `radial-gradient(circle, ${themeColors.accent}20 0%, transparent 70%)` }}
        animate={animated ? { scale: [1, 1.15, 1], opacity: [0.5, 1, 0.5] } : {}}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Logo image */}
      <motion.div
        className="relative rounded-xl overflow-hidden"
        style={{
          width: size - 4,
          height: size - 4,
          boxShadow: `0 2px 16px ${themeColors.accent}40, 0 0 32px ${themeColors.accent}20`,
        }}
        whileHover={animated ? {
          scale: 1.12,
          rotate: 5,
          boxShadow: `0 4px 24px ${themeColors.accent}60, 0 0 48px ${themeColors.accent}30`,
        } : {}}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
      >
        <img src="/logo.png" alt="EcLauncher" className="w-full h-full object-contain" />
      </motion.div>

      {/* Orbiting dot via CSS animation */}
      {animated && (
        <>
          <div
            className="absolute rounded-full"
            style={{
              width: 5,
              height: 5,
              background: themeColors.accent,
              boxShadow: `0 0 8px ${themeColors.accent}`,
              top: "50%",
              left: "50%",
              marginLeft: -2.5,
              marginTop: -2.5,
              animation: `logoOrbit 3s linear infinite`,
              transformOrigin: `0px -${size / 2 - 2}px`,
            }}
          />
          <style>{`
            @keyframes logoOrbit {
              0% { transform: rotate(0deg) translateX(0px); }
              100% { transform: rotate(360deg) translateX(0px); }
            }
          `}</style>
        </>
      )}
    </motion.div>
  );
}

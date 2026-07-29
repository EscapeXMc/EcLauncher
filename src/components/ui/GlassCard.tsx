import { motion } from "framer-motion";
import { useLauncherStore } from "../../stores";
import type { ReactNode, MouseEvent } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
  onClick?: () => void;
  onDragOver?: (e: any) => void;
  onDragLeave?: () => void;
  onDrop?: (e: any) => void;
  style?: React.CSSProperties;
  delay?: number;
}

export function GlassCard({ children, className = "", hover = false, glow = false, onClick, onDragOver, onDragLeave, onDrop, style, delay = 0 }: GlassCardProps) {
  const { themeColors } = useLauncherStore();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.4, 0, 0.2, 1] }}
      whileHover={hover ? { scale: 1.015, y: -3 } : undefined}
      whileTap={onClick ? { scale: 0.985 } : undefined}
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`glass-card ${glow ? "glow-border" : ""} rounded-2xl p-4 ${hover || onClick ? "cursor-pointer" : ""} ${className}`}
      style={{
        "--accent": themeColors.accent,
        "--accent2": themeColors.purple || themeColors.blue,
        "--glow-color": `${themeColors.accent}15`,
        "--glow-border": `${themeColors.accent}25`,
        boxShadow: `0 2px 16px rgba(0,0,0,0.15)`,
        ...style,
      } as React.CSSProperties}
      onMouseMove={(e: MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        e.currentTarget.style.setProperty("--mx", `${x}%`);
        e.currentTarget.style.setProperty("--my", `${y}%`);
      }}
    >
      {children}
    </motion.div>
  );
}

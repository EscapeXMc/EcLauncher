import { motion } from "framer-motion";
import { useLauncherStore } from "../../stores";
import type { ReactNode } from "react";

interface GlowButtonProps {
  children: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
  fullWidth?: boolean;
  style?: React.CSSProperties;
}

export function GlowButton({
  children,
  onClick,
  variant = "primary",
  size = "md",
  disabled = false,
  className = "",
  fullWidth = false,
  style,
}: GlowButtonProps) {
  const { themeColors } = useLauncherStore();

  const baseStyles: Record<string, { bg: string; border: string; shadow: string }> = {
    primary: {
      bg: `linear-gradient(135deg, ${themeColors.accent} 0%, ${themeColors.accent2 || themeColors.accent} 100%)`,
      border: `${themeColors.accent}60`,
      shadow: `0 0 20px ${themeColors.accent}40, 0 0 60px ${themeColors.accent}15, inset 0 1px 0 rgba(255,255,255,0.15)`,
    },
    secondary: {
      bg: `${themeColors.bg_card2}bb`,
      border: `${themeColors.border}80`,
      shadow: `0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)`,
    },
    danger: {
      bg: `linear-gradient(135deg, ${themeColors.danger} 0%, #ff2244 100%)`,
      border: `${themeColors.danger}60`,
      shadow: `0 0 20px ${themeColors.danger}30, inset 0 1px 0 rgba(255,255,255,0.15)`,
    },
  };

  const sizes: Record<string, string> = {
    sm: "px-3.5 py-1.5 text-[11px] rounded-xl",
    md: "px-5 py-2.5 text-[12px] rounded-xl",
    lg: "px-8 py-3.5 text-sm rounded-2xl",
  };

  const s = baseStyles[variant];

  return (
    <motion.button
      whileHover={disabled ? undefined : { scale: 1.04, boxShadow: variant === "primary" ? `0 0 30px ${themeColors.accent}60, 0 0 80px ${themeColors.accent}20, inset 0 1px 0 rgba(255,255,255,0.2)` : undefined }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`tinycaps font-bold transition-all duration-200 relative overflow-hidden ${sizes[size]} ${fullWidth ? "w-full" : ""} ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"} ${className}`}
      style={{
        background: s.bg,
        color: variant === "primary" || variant === "danger" ? "#fff" : themeColors.text_main,
        border: `1px solid ${s.border}`,
        boxShadow: disabled ? "none" : s.shadow,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        ...style,
      }}
    >
      <span className="relative z-10 flex items-center justify-center gap-1.5">{children}</span>
    </motion.button>
  );
}

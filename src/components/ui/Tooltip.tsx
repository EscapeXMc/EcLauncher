import { useState, useRef, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLauncherStore } from "../../stores";

interface TooltipProps {
  children: ReactNode;
  content: string;
  shortcut?: string;
  side?: "left" | "right" | "top" | "bottom";
  delay?: number;
}

export function Tooltip({ children, content, shortcut, side = "right", delay = 400 }: TooltipProps) {
  const { themeColors } = useLauncherStore();
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = () => {
    timer.current = setTimeout(() => setShow(true), delay);
  };
  const handleLeave = () => {
    if (timer.current) clearTimeout(timer.current);
    setShow(false);
  };

  const posClass =
    side === "left" ? "right-full mr-3 top-1/2 -translate-y-1/2" :
    side === "right" ? "left-full ml-3 top-1/2 -translate-y-1/2" :
    side === "top" ? "bottom-full mb-3 left-1/2 -translate-x-1/2" :
    "top-full mt-3 left-1/2 -translate-x-1/2";

  return (
    <div className="relative inline-flex" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-50 pointer-events-none ${posClass}`}
          >
            <div
              className="px-2.5 py-1.5 rounded-xl flex items-center gap-2 whitespace-nowrap"
              style={{
                background: themeColors.bg_glass,
                border: `1px solid ${themeColors.border}`,
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                boxShadow: `0 8px 32px rgba(0,0,0,0.4)`,
              }}
            >
              <span className="text-[10px] tinycaps font-medium" style={{ color: themeColors.text_main }}>
                {content}
              </span>
              {shortcut && (
                <span
                  className="text-[9px] font-mono px-1.5 py-0.5 rounded-md font-bold"
                  style={{ background: `${themeColors.accent}20`, color: themeColors.accent }}
                >
                  {shortcut}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

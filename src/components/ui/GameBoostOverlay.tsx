import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLauncherStore } from "../../stores";
import { Zap, Check, Loader2 } from "lucide-react";
import { api } from "../../lib/api";

interface GameBoostOverlayProps {
  instanceName: string;
  onComplete: (success: boolean) => void;
}

export function GameBoostOverlay({ instanceName, onComplete }: GameBoostOverlayProps) {
  const { themeColors } = useLauncherStore();
  const [status, setStatus] = useState<"boosting" | "done">("boosting");
  const [details, setDetails] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState("");

  useEffect(() => {
    let cancelled = false;

    const runBoost = async () => {
      try {
        // Show step-by-step progress while the actual boost runs
        const stepMessages = [
          "Killing unnecessary processes...",
          "Clearing temp folders...",
          "Cleaning launcher cache...",
          "Emptying recycle bin...",
          "Flushing DNS cache...",
          "Clearing thumbnail cache...",
          "Installing FPS boost mods...",
          "Optimizing system memory...",
        ];

        // Animate through steps
        for (let i = 0; i < stepMessages.length; i++) {
          if (cancelled) return;
          setCurrentStep(stepMessages[i]);
          await new Promise((r) => setTimeout(r, 400));
        }

        // Run actual boost
        const result = await api.gameBoost.run(instanceName);

        if (cancelled) return;

        if (result.success) {
          setDetails(result.details || []);
          setStatus("done");
          await new Promise((r) => setTimeout(r, 1500));
          onComplete(true);
        } else {
          onComplete(true); // Still proceed even if boost fails
        }
      } catch (err) {
        console.error("Game boost failed:", err);
        onComplete(true); // Still proceed even if boost fails
      }
    };

    runBoost();
    return () => { cancelled = true; };
  }, [instanceName, onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="w-[420px] rounded-3xl overflow-hidden"
        style={{
          background: themeColors.bg_card,
          border: `1px solid ${themeColors.border}`,
          boxShadow: `0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px ${themeColors.accent}15`,
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-5 flex items-center gap-4"
          style={{ borderBottom: `1px solid ${themeColors.border}` }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${themeColors.accent}30, ${themeColors.purple || themeColors.accent2}30)`,
              boxShadow: `0 0 24px ${themeColors.accent}25`,
            }}
          >
            {status === "done" ? (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400 }}>
                <Check size={22} style={{ color: themeColors.success }} />
              </motion.div>
            ) : (
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                <Zap size={22} style={{ color: themeColors.accent }} />
              </motion.div>
            )}
          </div>
          <div>
            <h2 className="tinycaps text-sm font-bold" style={{ color: themeColors.text_main }}>
              {status === "done" ? "Boost Complete" : "Boosting..."}
            </h2>
            <p className="text-[10px] mt-0.5" style={{ color: themeColors.text_muted }}>
              {status === "done"
                ? `Optimized ${details.length} system areas`
                : "Optimizing your PC for Minecraft"}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {status === "boosting" ? (
            <div className="space-y-3">
              {/* Current step */}
              <div className="flex items-center gap-3 py-2">
                <Loader2 size={14} className="animate-spin" style={{ color: themeColors.accent }} />
                <span className="text-[11px] tinycaps font-medium" style={{ color: themeColors.text_main }}>
                  {currentStep}
                </span>
              </div>

              {/* Progress steps */}
              <div className="space-y-1.5">
                {["Processes", "Temp Files", "Cache", "Recycle Bin", "DNS", "Thumbnails", "FPS Mods", "Memory"].map((step, i) => {
                  const stepIdx = [
                    "Killing unnecessary processes",
                    "Clearing temp folders",
                    "Cleaning launcher cache",
                    "Emptying recycle bin",
                    "Flushing DNS cache",
                    "Clearing thumbnail cache",
                    "Installing FPS boost mods",
                    "Optimizing system memory",
                  ].findIndex((s) => currentStep.startsWith(s.slice(0, 10)));
                  const done = i < stepIdx;
                  const active = i === stepIdx;
                  return (
                    <div key={step} className="flex items-center gap-2 py-1">
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          background: done ? themeColors.success : active ? themeColors.accent : `${themeColors.text_muted}30`,
                          boxShadow: active ? `0 0 8px ${themeColors.accent}60` : "none",
                        }}
                      />
                      <span
                        className="text-[10px] tinycaps"
                        style={{ color: done ? themeColors.success : active ? themeColors.text_main : themeColors.text_muted }}
                      >
                        {step}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Done - show details */
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {details.map((detail, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-2 py-1"
                >
                  <Check size={9} style={{ color: themeColors.success }} />
                  <span className="text-[10px] tinycaps" style={{ color: themeColors.text_sub }}>{detail}</span>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom accent line */}
        <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${themeColors.accent}, ${themeColors.purple || themeColors.accent2}, ${themeColors.accent})` }} />
      </motion.div>
    </motion.div>
  );
}

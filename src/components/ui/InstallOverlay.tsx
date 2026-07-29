import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { listen } from "@tauri-apps/api/event";
import { useLauncherStore } from "../../stores";
import { api } from "../../lib/api";
import { GlowButton } from "./GlowButton";
import { Download, Check, Play, X, Terminal } from "lucide-react";

interface InstallOverlayProps {
  instanceName: string;
  version: string;
  loader: string;
  loaderVersion: string;
  onClose: () => void;
  onPlay: () => void;
}

interface InstallEvent {
  step: string;
  message: string;
  progress: number;
  done?: boolean;
  error?: string;
}

export function InstallOverlay({ instanceName, version, loader, loaderVersion, onClose, onPlay }: InstallOverlayProps) {
  const { themeColors } = useLauncherStore();
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("Starting...");
  const [isDone, setIsDone] = useState(false);
  const [isError, setIsError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string) => {
    const now = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${now}] ${msg}`]);
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const setup = async () => {
      unlisten = await listen<InstallEvent>("install-progress", (event) => {
        if (cancelled) return;
        const { step, message, progress: p, done, error } = event.payload;

        if (error) {
          setIsError(error);
          addLog(`ERROR: ${error}`);
          setCurrentStep("Failed");
          return;
        }

        setCurrentStep(step);
        setProgress(p);
        addLog(message);

        if (done) {
          setIsDone(true);
          addLog("Installation complete!");
        }
      });

      if (!cancelled) {
        try {
          await api.instances.install(instanceName, version, loader, loaderVersion);
        } catch (err: any) {
          if (!cancelled) {
            setIsError(err?.toString() || "Unknown error");
            addLog(`ERROR: ${err}`);
            setCurrentStep("Failed");
          }
        }
      }
    };

    setup();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [instanceName, version, loader, loaderVersion, addLog]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: "rgba(0,0,0,0.8)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
      }}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="w-[520px] max-h-[80vh] rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: `${themeColors.bg_card}ee`,
          border: `1px solid ${themeColors.border}`,
          boxShadow: `0 24px 80px rgba(0,0,0,0.5), 0 0 40px ${themeColors.accent}15`,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${themeColors.border}` }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: `${themeColors.accent}15` }}
            >
              <Download size={18} style={{ color: themeColors.accent }} />
            </div>
            <div>
              <h2 className="tinycaps text-sm font-bold" style={{ color: themeColors.text_main }}>
                Installing {instanceName}
              </h2>
              <p className="text-[10px]" style={{ color: themeColors.text_muted }}>
                {version} · {loader} {loaderVersion}
              </p>
            </div>
          </div>
          {!isDone && !isError && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: themeColors.accent }} />
              <span className="text-[10px] tinycaps font-medium" style={{ color: themeColors.text_muted }}>
                {currentStep}
              </span>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="px-5 pt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] tinycaps font-medium" style={{ color: themeColors.text_sub }}>
              {isDone ? "Complete" : isError ? "Failed" : currentStep}
            </span>
            <span className="text-[10px] tinycaps font-bold" style={{ color: isDone ? themeColors.success : isError ? themeColors.danger : themeColors.accent }}>
              {Math.round(progress)}%
            </span>
          </div>
          <div
            className="w-full h-2 rounded-full overflow-hidden"
            style={{ background: `${themeColors.bg_card2}` }}
          >
            <motion.div
              className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              style={{
                background: isError
                  ? `linear-gradient(90deg, ${themeColors.danger}, ${themeColors.danger}cc)`
                  : isDone
                  ? `linear-gradient(90deg, ${themeColors.success}, ${themeColors.success}cc)`
                  : `linear-gradient(90deg, ${themeColors.accent}, ${themeColors.purple || themeColors.accent2})`,
                boxShadow: `0 0 12px ${isDone ? themeColors.success : isError ? themeColors.danger : themeColors.accent}40`,
              }}
            />
          </div>
        </div>

        {/* Log terminal */}
        <div className="px-5 pt-3 pb-2 flex-1 min-h-0">
          <div className="flex items-center gap-1.5 mb-2">
            <Terminal size={11} style={{ color: themeColors.text_muted }} />
            <span className="text-[9px] tinycaps font-semibold tracking-wider" style={{ color: themeColors.text_muted }}>
              INSTALL LOG
            </span>
          </div>
          <div
            ref={logRef}
            className="rounded-xl overflow-y-auto font-mono text-[11px] leading-relaxed p-3"
            style={{
              background: `${themeColors.bg_card2}cc`,
              border: `1px solid ${themeColors.border}`,
              maxHeight: "280px",
              minHeight: "120px",
              scrollbarWidth: "thin",
              scrollbarColor: `${themeColors.accent}30 transparent`,
            }}
          >
            {logs.length === 0 ? (
              <span style={{ color: themeColors.text_muted }}>Waiting for install to start...</span>
            ) : (
              logs.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap break-all" style={{ color: line.startsWith("[ERROR") ? themeColors.danger : themeColors.text_sub }}>
                  {line}
                </div>
              ))
            )}
            {!isDone && !isError && logs.length > 0 && (
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                style={{ color: themeColors.accent }}
              >
                _
              </motion.span>
            )}
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-end gap-2 px-5 py-4" style={{ borderTop: `1px solid ${themeColors.border}` }}>
          {isDone ? (
            <>
              <GlowButton size="sm" variant="secondary" onClick={onClose} className="flex items-center gap-1">
                <X size={12} /> Close
              </GlowButton>
              <GlowButton size="sm" onClick={onPlay} className="flex items-center gap-1">
                <Play size={12} /> Play Now
              </GlowButton>
            </>
          ) : isError ? (
            <GlowButton size="sm" variant="danger" onClick={onClose} className="flex items-center gap-1">
              <X size={12} /> Close
            </GlowButton>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full animate-spin" style={{ borderTop: `2px solid ${themeColors.accent}`, borderRight: `2px solid ${themeColors.accent}30`, borderBottom: `2px solid transparent`, borderLeft: `2px solid transparent` }} />
              <span className="text-[10px]" style={{ color: themeColors.text_muted }}>Installing...</span>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

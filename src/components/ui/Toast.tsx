import { useState, useCallback, createContext, useContext, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, AlertCircle, Info, X, AlertTriangle } from "lucide-react";
import { useLauncherStore } from "../../stores";

export type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (type: ToastType, title: string, message?: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { themeColors } = useLauncherStore();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, title: string, message?: string, duration = 4000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-4), { id, type, title, message, duration }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const icons = {
    success: <CheckCircle size={14} />,
    error: <AlertCircle size={14} />,
    warning: <AlertTriangle size={14} />,
    info: <Info size={14} />,
  };

  const colors = {
    success: themeColors.success,
    error: themeColors.danger,
    warning: themeColors.warn,
    info: themeColors.blue,
  };

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed top-12 right-3 z-[9999] flex flex-col gap-2 pointer-events-none" style={{ width: "300px" }}>
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 50, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="pointer-events-auto rounded-2xl overflow-hidden"
              style={{
                background: themeColors.bg_glass,
                border: `1px solid ${colors[t.type]}30`,
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${colors[t.type]}15`,
              }}
            >
              <div className="flex items-start gap-3 p-3">
                <div
                  className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: `${colors[t.type]}15`, color: colors[t.type] }}
                >
                  {icons[t.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] tinycaps font-bold" style={{ color: themeColors.text_main }}>{t.title}</p>
                  {t.message && (
                    <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: themeColors.text_muted }}>{t.message}</p>
                  )}
                </div>
                <button
                  onClick={() => removeToast(t.id)}
                  className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0 transition-colors hover:bg-white/10"
                >
                  <X size={10} style={{ color: themeColors.text_muted }} />
                </button>
              </div>
              {/* Progress bar */}
              <div className="h-0.5 mx-3 mb-2 rounded-full overflow-hidden" style={{ background: `${colors[t.type]}15` }}>
                <motion.div
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: (t.duration || 4000) / 1000, ease: "linear" }}
                  className="h-full rounded-full"
                  style={{ background: colors[t.type] }}
                />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

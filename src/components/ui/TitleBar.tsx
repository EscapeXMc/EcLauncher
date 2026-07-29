import { appWindow } from "@tauri-apps/api/window";
import { useLauncherStore } from "../../stores";
import { Minus, Square, X, Sun, Moon } from "lucide-react";

export function TitleBar() {
  const { themeColors, liveVersion, themeMode, setThemeMode } = useLauncherStore();
  return (
    <div data-tauri-drag-region className="flex items-center justify-between h-9 px-3 shrink-0 select-none relative"
      style={{
        background: `${themeColors.bg_nav}bb`,
        borderBottom: `1px solid ${themeColors.border}`,
        backdropFilter: "blur(32px) saturate(1.4)",
        WebkitBackdropFilter: "blur(32px) saturate(1.4)",
      }}>
      <div className="absolute bottom-0 left-0 right-0 h-px" style={{
        background: `linear-gradient(90deg, transparent, ${themeColors.accent}30, ${themeColors.purple || themeColors.accent2 || themeColors.accent}20, transparent)`,
      }} />
      <div className="flex items-center gap-2.5 ml-1" data-tauri-drag-region>
        <img src="/logo.png" alt="EcLauncher" className="w-5 h-5 rounded-lg object-contain" style={{ boxShadow: `0 0 12px ${themeColors.accent_glow}80, 0 2px 8px rgba(0,0,0,0.3)` }} />
        <span className="tinycaps text-[11px] font-bold" style={{ color: themeColors.text_sub, letterSpacing: "0.08em" }}>eclauncher v{liveVersion}</span>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => setThemeMode(themeMode === "dark" ? "light" : "dark")}
          className="w-7 h-7 flex items-center justify-center rounded-xl transition-all duration-200 hover:bg-white/10"
          title={themeMode === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {themeMode === "dark" ? (
            <Sun size={12} style={{ color: themeColors.text_muted }} />
          ) : (
            <Moon size={12} style={{ color: themeColors.text_muted }} />
          )}
        </button>
        <button onClick={() => appWindow.minimize()}
          className="w-7 h-7 flex items-center justify-center rounded-xl transition-all duration-200 hover:bg-white/10">
          <Minus size={12} style={{ color: themeColors.text_muted }} />
        </button>
        <button onClick={() => appWindow.toggleMaximize()}
          className="w-7 h-7 flex items-center justify-center rounded-xl transition-all duration-200 hover:bg-white/10">
          <Square size={8} style={{ color: themeColors.text_muted }} />
        </button>
        <button onClick={() => appWindow.close()}
          className="w-7 h-7 flex items-center justify-center rounded-xl transition-all duration-200 hover:bg-red-500/80 hover:scale-110">
          <X size={11} className="text-white" />
        </button>
      </div>
    </div>
  );
}

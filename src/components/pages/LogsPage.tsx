import { useState, useEffect, useRef, useCallback } from "react";
import { useLauncherStore } from "../../stores";
import { api } from "../../lib/api";
import { invoke } from "@tauri-apps/api/tauri";
import { GlassCard } from "../ui/GlassCard";
import { GlowButton } from "../ui/GlowButton";
import { GlassInput } from "../ui/FormControls";
import { FileText, Trash2, RefreshCcw, Gamepad2, Copy, Check, Search, Pause, Play as PlayIcon, Terminal, ScrollText } from "lucide-react";

export function LogsPage() {
  const { themeColors, settings, instances } = useLauncherStore();
  const [tab, setTab] = useState<"launcher" | "game" | "live">("launcher");
  const [launcherLogs, setLauncherLogs] = useState<string[]>([]);
  const [gameLogs, setGameLogs] = useState<string[]>([]);
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [copied, setCopied] = useState(false);
  const [paused, setPaused] = useState(false);
  const [liveInstance, setLiveInstance] = useState<string>("");
  const logsRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);

  pausedRef.current = paused;

  const runningInstance = settings?.game_session_start || "";

  useEffect(() => {
    if (runningInstance && !liveInstance) {
      setLiveInstance(runningInstance);
      setTab("live");
    }
  }, [runningInstance]);

  useEffect(() => {
    loadLogs();
    const interval = setInterval(loadLogs, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (tab === "live" && liveInstance && !paused) {
      const poll = setInterval(async () => {
        try {
          const logs = await invoke<string[]>("get_game_logs", { instanceName: liveInstance });
          setLiveLogs(logs);
        } catch {}
      }, 2000);
      return () => clearInterval(poll);
    }
  }, [tab, liveInstance, paused]);

  useEffect(() => {
    if (!paused && logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [launcherLogs, gameLogs, paused]);

  useEffect(() => {
    if (!paused && liveRef.current) liveRef.current.scrollTop = liveRef.current.scrollHeight;
  }, [liveLogs, paused]);

  const loadLogs = async () => {
    try {
      const [lg, gg] = await Promise.all([api.logs.get(), api.logs.getGameOutput()]);
      setLauncherLogs(lg);
      setGameLogs(gg);
    } catch {}
  };

  const clearLogs = async () => {
    if (tab === "launcher") {
      await api.logs.clear();
      setLauncherLogs([]);
    } else if (tab === "game") {
      await api.logs.clearGameOutput();
      setGameLogs([]);
    } else {
      setLiveLogs([]);
    }
  };

  const copyLogs = async () => {
    const tabLogs = tab === "launcher" ? launcherLogs : tab === "game" ? gameLogs : liveLogs;
    const allLogs = tabLogs.join("\n");
    try {
      const { writeText } = await import("@tauri-apps/api/clipboard");
      await writeText(allLogs);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = allLogs;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLogsForTab = useCallback(() => {
    return tab === "launcher" ? launcherLogs : tab === "game" ? gameLogs : liveLogs;
  }, [tab, launcherLogs, gameLogs, liveLogs]);

  const logs = getLogsForTab();
  const filtered = filter
    ? logs.filter((l) => l.toLowerCase().includes(filter.toLowerCase()))
    : logs;

  const getLogColor = (line: string) => {
    const lower = line.toLowerCase();
    if (lower.includes("error") || lower.includes("exception") || lower.includes("fatal") || lower.includes("crash")) return themeColors.danger;
    if (lower.includes("warn") || lower.includes("warning")) return themeColors.warn;
    if (lower.includes("info") || lower.includes("info]")) return themeColors.success;
    if (lower.includes("debug") || lower.includes("trace")) return themeColors.text_muted;
    return themeColors.text_sub || themeColors.text_muted;
  };

  return (
    <div className="flex flex-col h-full max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText size={20} style={{ color: themeColors.accent }} />
          <div>
            <h1 className="tinycaps text-xl font-bold gradient-text" style={{ "--accent": themeColors.accent, "--accent2": themeColors.purple || themeColors.blue } as any}>Logs</h1>
            <p className="text-xs mt-0.5" style={{ color: themeColors.text_muted }}>
              {tab === "launcher" ? `${launcherLogs.length} launcher log lines` :
               tab === "game" ? `${gameLogs.length} game output lines` :
               `${liveLogs.length} live lines${liveInstance ? ` (${liveInstance})` : ""}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GlowButton size="sm" onClick={copyLogs} className="flex items-center gap-1">
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied!" : "Copy"}
          </GlowButton>
          <GlowButton size="sm" onClick={loadLogs} className="flex items-center gap-1">
            <RefreshCcw size={12} /> Refresh
          </GlowButton>
          <GlowButton size="sm" onClick={clearLogs} className="flex items-center gap-1" style={{ background: themeColors.danger }}>
            <Trash2 size={12} /> Clear
          </GlowButton>
          {tab === "live" && (
            <GlowButton size="sm" onClick={() => setPaused(!paused)} className="flex items-center gap-1" style={{ background: paused ? themeColors.success : themeColors.warn }}>
              {paused ? <PlayIcon size={12} /> : <Pause size={12} />}
              {paused ? "Resume" : "Pause"}
            </GlowButton>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        {([
          { key: "launcher" as const, label: "Launcher", icon: FileText },
          { key: "game" as const, label: "Game Output", icon: Gamepad2 },
          { key: "live" as const, label: "Live Stream", icon: Terminal },
        ]).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1"
            style={{
              background: tab === t.key ? `${themeColors.accent}15` : "transparent",
              color: tab === t.key ? themeColors.accent : themeColors.text_muted,
              border: `1px solid ${tab === t.key ? `${themeColors.accent}30` : "transparent"}`,
            }}>
            <t.icon size={12} />
            {t.label}
            {t.key === "live" && runningInstance && (
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1" />
            )}
          </button>
        ))}
      </div>

      {tab === "live" && (
        <div className="flex items-center gap-2 mb-3">
          <GlassInput value={liveInstance} onChange={setLiveInstance} placeholder="Instance name for live logs..." />
          {instances.filter(i => i.installed).map(i => (
            <button key={i.name} onClick={() => setLiveInstance(i.name)}
              className="px-2 py-1 rounded-lg text-[10px] font-medium transition-all shrink-0"
              style={{
                background: liveInstance === i.name ? `${themeColors.accent}20` : `${themeColors.text_muted}10`,
                color: liveInstance === i.name ? themeColors.accent : themeColors.text_muted,
                border: `1px solid ${liveInstance === i.name ? `${themeColors.accent}30` : `${themeColors.text_muted}15`}`,
              }}>
              {i.name}
            </button>
          ))}
        </div>
      )}

      <div className="relative mb-3">
        <GlassInput value={filter} onChange={setFilter} placeholder={`Filter ${tab === "live" ? "live " : ""}logs...`} />
        {filter && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Search size={14} style={{ color: themeColors.text_muted }} />
          </div>
        )}
      </div>

      <GlassCard className="flex-1 mt-1 overflow-hidden">
        <div ref={tab === "live" ? liveRef : logsRef} className="h-full overflow-y-auto p-3" style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace" }}>
          {filtered.length === 0 ? (
            <div className="text-center py-8">
              {tab === "live" ? (
                <>
                  <ScrollText size={32} className="mx-auto mb-2" style={{ color: themeColors.text_muted, opacity: 0.4 }} />
                  <p className="text-sm" style={{ color: themeColors.text_muted }}>
                    {liveInstance ? "Waiting for live output..." : "Select an instance to stream logs"}
                  </p>
                </>
              ) : (
                <>
                  <FileText size={32} className="mx-auto mb-2" style={{ color: themeColors.text_muted, opacity: 0.4 }} />
                  <p className="text-sm" style={{ color: themeColors.text_muted }}>No logs available</p>
                </>
              )}
            </div>
          ) : (
            <pre className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap">
              {filtered.map((line, i) => (
                <div key={i} className="flex gap-3 hover:bg-white/5 rounded px-1 py-0.5 transition-colors">
                  <span className="select-none shrink-0 text-right" style={{ color: `${themeColors.text_muted}80`, minWidth: "32px" }}>
                    {i + 1}
                  </span>
                  <span style={{ color: getLogColor(line) }}>{line}</span>
                </div>
              ))}
            </pre>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

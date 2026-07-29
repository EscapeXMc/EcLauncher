import { useState, useEffect, useRef } from "react";
import { useLauncherStore } from "../../stores";
import { api } from "../../lib/api";
import { GlassCard } from "../ui/GlassCard";
import { GlowButton } from "../ui/GlowButton";
import {
  Wrench, Palette, Monitor, Download, Trash2, RefreshCcw,
  FileText, ExternalLink, Gamepad2
} from "lucide-react";

export function ToolsPage() {
  const { themeColors, instances, setPage, setSelectedInstance, setLoading } = useLauncherStore();
  const [skinInfo, setSkinInfo] = useState<{ custom_skin_path: string; has_skin: boolean } | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ update_available: boolean; latest_version?: string; download_url?: string } | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    api.skin.getInfo().then(setSkinInfo).catch(console.error);
  }, []);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const info = await api.updates.check();
      setUpdateInfo(info);
    } catch {}
    setCheckingUpdate(false);
  };

  const handleOpenLogs = () => setPage("logs");

  const handleOptimize = (instanceName: string) => {
    setSelectedInstance(instanceName);
    setPage("instances");
  };

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center gap-2">
        <Wrench size={20} style={{ color: themeColors.accent }} />
        <div>
          <h1 className="tinycaps text-xl font-bold gradient-text" style={{ "--accent": themeColors.accent, "--accent2": themeColors.purple || themeColors.blue } as any}>Tools</h1>
          <p className="text-xs mt-0.5" style={{ color: themeColors.text_muted }}>Quick actions and utilities</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <GlassCard>
          <div className="flex items-center gap-2 mb-3">
            <Palette size={16} style={{ color: themeColors.accent }} />
            <h3 className="tinycaps text-sm font-semibold" style={{ color: themeColors.text_main }}>Skin Manager</h3>
          </div>
          <p className="text-xs mb-3" style={{ color: themeColors.text_muted }}>View and change your Minecraft skin</p>
          <div className="space-y-2">
            <div className="w-16 h-24 rounded-lg mx-auto flex items-center justify-center"
              style={{ background: themeColors.bg_card2, border: `1px solid ${themeColors.border}` }}>
              {skinInfo?.has_skin ? (
                <Gamepad2 size={24} style={{ color: themeColors.accent }} />
              ) : (
                <Gamepad2 size={24} style={{ color: themeColors.text_muted, opacity: 0.4 }} />
              )}
            </div>
            <p className="text-xs text-center" style={{ color: themeColors.text_muted }}>
              {skinInfo?.has_skin ? "Custom skin active" : "No custom skin set"}
            </p>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-2 mb-3">
            <Monitor size={16} style={{ color: themeColors.purple }} />
            <h3 className="tinycaps text-sm font-semibold" style={{ color: themeColors.text_main }}>Instance Optimizer</h3>
          </div>
          <p className="text-xs mb-3" style={{ color: themeColors.text_muted }}>Optimize your instances for better performance</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {instances.filter((i) => i.installed).map((inst) => (
              <button key={inst.name} onClick={() => handleOptimize(inst.name)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors"
                style={{ color: themeColors.text_sub, border: `1px solid ${themeColors.border}` }}>
                <span>{inst.name}</span>
                <Wrench size={10} />
              </button>
            ))}
            {instances.filter((i) => i.installed).length === 0 && (
              <p className="text-xs text-center py-2" style={{ color: themeColors.text_muted }}>No installed instances</p>
            )}
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-2 mb-3">
            <Download size={16} style={{ color: themeColors.blue }} />
            <h3 className="tinycaps text-sm font-semibold" style={{ color: themeColors.text_main }}>Downloads</h3>
          </div>
          <p className="text-xs mb-3" style={{ color: themeColors.text_muted }}>Manage your download queue and history</p>
          <div className="text-center py-4">
            <p className="text-xs" style={{ color: themeColors.text_muted }}>No active downloads</p>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-2 mb-3">
            <RefreshCcw size={16} style={{ color: themeColors.success }} />
            <h3 className="tinycaps text-sm font-semibold" style={{ color: themeColors.text_main }}>Launcher Updates</h3>
          </div>
          <p className="text-xs mb-3" style={{ color: themeColors.text_muted }}>Check for EcLauncher updates</p>
          {updateInfo ? (
            <div className="space-y-2">
              <div className="px-3 py-2 rounded-lg text-xs"
                style={{ background: updateInfo.update_available ? `${themeColors.warn}15` : `${themeColors.success}15`, color: updateInfo.update_available ? themeColors.warn : themeColors.success }}>
                {updateInfo.update_available ? `Update available: v${updateInfo.latest_version}` : "You're up to date!"}
              </div>
              {updateInfo.update_available && updateInfo.download_url && (
                <a href={updateInfo.download_url} target="_blank" rel="noreferrer"
                  className="flex items-center justify-center gap-1 text-xs px-3 py-1.5 rounded-lg"
                  style={{ color: themeColors.accent, border: `1px solid ${themeColors.accent}30` }}>
                  <ExternalLink size={12} /> Download Update
                </a>
              )}
            </div>
          ) : (
            <GlowButton size="sm" onClick={handleCheckUpdate} disabled={checkingUpdate} className="w-full flex items-center justify-center gap-1">
              <RefreshCcw size={12} className={checkingUpdate ? "animate-spin" : ""} />
              {checkingUpdate ? "Checking..." : "Check for Updates"}
            </GlowButton>
          )}
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-2 mb-3">
            <FileText size={16} style={{ color: themeColors.warn }} />
            <h3 className="tinycaps text-sm font-semibold" style={{ color: themeColors.text_main }}>Logs</h3>
          </div>
          <p className="text-xs mb-3" style={{ color: themeColors.text_muted }}>View launcher and game logs</p>
          <GlowButton size="sm" onClick={handleOpenLogs} className="w-full flex items-center justify-center gap-1">
            <FileText size={12} /> View Logs
          </GlowButton>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-2 mb-3">
            <Trash2 size={16} style={{ color: themeColors.danger }} />
            <h3 className="tinycaps text-sm font-semibold" style={{ color: themeColors.text_main }}>Cleanup</h3>
          </div>
          <p className="text-xs mb-3" style={{ color: themeColors.text_muted }}>Clean up old files and cache</p>
          <div className="space-y-1.5">
            <button className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs"
              style={{ color: themeColors.text_sub, border: `1px solid ${themeColors.border}` }}>
              <span>Clear Version Manifest Cache</span>
              <RefreshCcw size={10} />
            </button>
            <button className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs"
              style={{ color: themeColors.text_sub, border: `1px solid ${themeColors.border}` }}>
              <span>Clear Modrinth Cache</span>
              <RefreshCcw size={10} />
            </button>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

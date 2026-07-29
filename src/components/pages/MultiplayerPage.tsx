import { useState, useEffect, useCallback } from "react";
import { useLauncherStore } from "../../stores";
import { api } from "../../lib/api";
import { GlassCard } from "../ui/GlassCard";
import { GlowButton } from "../ui/GlowButton";
import { GlassInput } from "../ui/FormControls";
import {
  Globe, Download, Play, Server, Trash2, Plus, Wifi, WifiOff, RefreshCw,
} from "lucide-react";
import type { ServerEntry, ServerPing } from "../../lib/types";

export function MultiplayerPage() {
  const { themeColors, setPage, setLoading } = useLauncherStore();

  const [selfhostStatus, setSelfhostStatus] = useState<{ exists: boolean; path: string } | null>(null);
  const [selfhostLoading, setSelfhostLoading] = useState(false);
  const [selfhostDownloading, setSelfhostDownloading] = useState(false);
  const [selfhostLaunching, setSelfhostLaunching] = useState(false);

  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [pings, setPings] = useState<Record<string, ServerPing>>({});
  const [pinging, setPinging] = useState<string | null>(null);

  const [newServerName, setNewServerName] = useState("");
  const [newServerAddress, setNewServerAddress] = useState("");
  const [newServerPort, setNewServerPort] = useState("25565");
  const [addingServer, setAddingServer] = useState(false);
  const [deletingServer, setDeletingServer] = useState<string | null>(null);

  const loadSelfhost = useCallback(async () => {
    try {
      const status = await api.selfhost.getStatus();
      setSelfhostStatus(status);
    } catch {
      setSelfhostStatus({ exists: false, path: "" });
    }
  }, []);

  const loadServers = useCallback(async () => {
    try {
      const list = await api.servers.get();
      setServers(list);
    } catch {
      setServers([]);
    }
  }, []);

  useEffect(() => {
    loadSelfhost();
    loadServers();
  }, [loadSelfhost, loadServers]);

  const handleDownloadSelfhost = async () => {
    setSelfhostDownloading(true);
    setLoading(true, "Downloading self-host server...");
    try {
      const result = await api.selfhost.download();
      if (result.success) {
        await loadSelfhost();
      } else {
        alert(`Download failed: ${result.error || "Unknown error"}`);
      }
    } catch (e) {
      console.error("Failed to download self-host:", e);
    }
    setSelfhostDownloading(false);
    setLoading(false);
  };

  const handleLaunchSelfhost = async () => {
    setSelfhostLaunching(true);
    setLoading(true, "Launching self-host server...");
    try {
      const result = await api.selfhost.launch();
      if (!result.success) {
        alert(`Launch failed: ${result.error || "Unknown error"}`);
      }
    } catch (e) {
      console.error("Failed to launch self-host:", e);
    }
    setSelfhostLaunching(false);
    setLoading(false);
  };

  const handleAddServer = async () => {
    if (!newServerName.trim() || !newServerAddress.trim()) return;
    const port = parseInt(newServerPort, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      alert("Invalid port number");
      return;
    }
    setAddingServer(true);
    try {
      const result = await api.servers.add(newServerName.trim(), newServerAddress.trim(), port);
      if (result.success) {
        setNewServerName("");
        setNewServerAddress("");
        setNewServerPort("25565");
        await loadServers();
      } else {
        alert(`Failed to add server: ${result.error || "Unknown error"}`);
      }
    } catch (e) {
      console.error("Failed to add server:", e);
    }
    setAddingServer(false);
  };

  const handleDeleteServer = async (name: string) => {
    setDeletingServer(name);
    try {
      await api.servers.delete(name);
      await loadServers();
      setPings((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    } catch (e) {
      console.error("Failed to delete server:", e);
    }
    setDeletingServer(null);
  };

  const handlePingServer = async (server: ServerEntry) => {
    const key = server.name;
    setPinging(key);
    try {
      const result = await api.servers.ping(server.address, server.port);
      setPings((prev) => ({ ...prev, [key]: result }));
    } catch {
      setPings((prev) => ({ ...prev, [key]: { online: false, error: "Ping failed" } }));
    }
    setPinging(null);
  };

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center gap-2">
        <Globe size={20} style={{ color: themeColors.accent }} />
        <div>
          <h1 className="tinycaps text-xl font-bold gradient-text" style={{ "--accent": themeColors.accent, "--accent2": themeColors.purple || themeColors.blue } as any}>Multiplayer</h1>
          <p className="text-xs mt-0.5" style={{ color: themeColors.text_muted }}>Self-host servers and manage your server list</p>
        </div>
      </div>

      <GlassCard>
        <div className="flex items-center gap-2 mb-3">
          <Server size={16} style={{ color: themeColors.accent }} />
          <h3 className="tinycaps text-sm font-semibold" style={{ color: themeColors.text_main }}>Self-Host Server</h3>
          {selfhostStatus && (
            <span className="text-[9px] px-1.5 py-0.5 rounded"
              style={{
                background: selfhostStatus.exists ? `${themeColors.success}15` : `${themeColors.text_muted}15`,
                color: selfhostStatus.exists ? themeColors.success : themeColors.text_muted,
              }}>
              {selfhostStatus.exists ? "Installed" : "Not Installed"}
            </span>
          )}
        </div>
        <p className="text-xs mb-3" style={{ color: themeColors.text_muted }}>
          Run a Minecraft server directly from the launcher
        </p>
        <div className="flex items-center gap-2">
          {selfhostStatus && selfhostStatus.exists ? (
            <>
              <GlowButton size="sm" onClick={handleLaunchSelfhost} disabled={selfhostLaunching} className="flex items-center gap-1">
                <Play size={12} /> {selfhostLaunching ? "Launching..." : "Launch Server"}
              </GlowButton>
              <GlowButton size="sm" variant="secondary" onClick={() => api.openUrl(selfhostStatus.path)} className="flex items-center gap-1">
                Open Folder
              </GlowButton>
            </>
          ) : (
            <GlowButton size="sm" onClick={handleDownloadSelfhost} disabled={selfhostDownloading} className="flex items-center gap-1">
              <Download size={12} /> {selfhostDownloading ? "Downloading..." : "Download Server"}
            </GlowButton>
          )}
        </div>
      </GlassCard>

      <GlassCard>
        <div className="flex items-center gap-2 mb-3">
          <Wifi size={16} style={{ color: themeColors.blue }} />
          <h3 className="tinycaps text-sm font-semibold" style={{ color: themeColors.text_main }}>Server List</h3>
          <span className="text-[10px]" style={{ color: themeColors.text_muted }}>({servers.length})</span>
        </div>

        {servers.length === 0 ? (
          <div className="text-center py-6">
            <Server size={28} className="mx-auto mb-2" style={{ color: themeColors.text_muted, opacity: 0.4 }} />
            <p className="text-xs" style={{ color: themeColors.text_muted }}>No servers saved yet. Add one below.</p>
          </div>
        ) : (
          <div className="space-y-1 mb-4">
            <div className="grid grid-cols-12 gap-2 px-2 py-1 text-[10px] font-medium" style={{ color: themeColors.text_muted }}>
              <div className="col-span-3">Name</div>
              <div className="col-span-3">Address</div>
              <div className="col-span-1">Port</div>
              <div className="col-span-3">Status</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>
            {servers.map((server) => {
              const ping = pings[server.name];
              return (
                <div key={server.name}
                  className="grid grid-cols-12 gap-2 items-center px-2 py-2 rounded-lg transition-colors"
                  style={{ background: `${themeColors.bg_card2}`, border: `1px solid ${themeColors.border}` }}>
                  <div className="col-span-3 min-w-0">
                    <span className="text-xs font-medium truncate block" style={{ color: themeColors.text_main }}>{server.name}</span>
                  </div>
                  <div className="col-span-3 min-w-0">
                    <span className="text-xs truncate block" style={{ color: themeColors.text_sub }}>{server.address}</span>
                  </div>
                  <div className="col-span-1">
                    <span className="text-xs" style={{ color: themeColors.text_sub }}>{server.port}</span>
                  </div>
                  <div className="col-span-3">
                    {ping ? (
                      <div className="flex items-center gap-1.5">
                        {ping.online ? (
                          <Wifi size={11} style={{ color: themeColors.success }} />
                        ) : (
                          <WifiOff size={11} style={{ color: themeColors.danger }} />
                        )}
                        <span className="text-[10px]" style={{ color: ping.online ? themeColors.success : themeColors.danger }}>
                          {ping.online ? "Online" : "Offline"}
                        </span>
                        {ping.online && ping.players && (
                          <span className="text-[9px]" style={{ color: themeColors.text_muted }}>
                            {ping.players.online}/{ping.players.max} players
                          </span>
                        )}
                        {ping.online && ping.version && (
                          <span className="text-[9px]" style={{ color: themeColors.text_muted }}>
                            MC {ping.version}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px]" style={{ color: themeColors.text_muted }}>Unknown</span>
                    )}
                    {ping?.motd && (
                      <div className="text-[9px] truncate max-w-[200px]" style={{ color: themeColors.text_muted }}>{ping.motd}</div>
                    )}
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    <GlowButton size="sm" variant="secondary" onClick={() => handlePingServer(server)}
                      disabled={pinging === server.name} className="flex items-center gap-1">
                      <RefreshCw size={10} className={pinging === server.name ? "animate-spin" : ""} /> Ping
                    </GlowButton>
                    <button onClick={() => handleDeleteServer(server.name)}
                      disabled={deletingServer === server.name}
                      className="p-1 transition-colors hover:opacity-80"
                      style={{ color: themeColors.danger }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ borderTop: `1px solid ${themeColors.border}` }} className="pt-3 mt-1">
          <h4 className="tinycaps text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: themeColors.text_sub }}>
            <Plus size={12} /> Add Server
          </h4>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <GlassInput value={newServerName} onChange={setNewServerName} placeholder="Server Name" />
            </div>
            <div className="flex-1 min-w-0">
              <GlassInput value={newServerAddress} onChange={setNewServerAddress} placeholder="Address (e.g. mc.example.com)" />
            </div>
            <div className="w-24">
              <GlassInput value={newServerPort} onChange={setNewServerPort} placeholder="Port" />
            </div>
            <GlowButton size="sm" onClick={handleAddServer} disabled={addingServer || !newServerName.trim() || !newServerAddress.trim()} className="flex items-center gap-1 shrink-0">
              <Plus size={12} /> {addingServer ? "Adding..." : "Add"}
            </GlowButton>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLauncherStore } from "../../stores";
import { api } from "../../lib/api";
import { invoke } from "@tauri-apps/api/tauri";
import { GlassCard } from "../ui/GlassCard";
import { GlowButton } from "../ui/GlowButton";
import { GlassInput } from "../ui/FormControls";
import { InstallOverlay } from "../ui/InstallOverlay";
  import {
    Monitor, Plus, Trash2, Download, Play, Settings as SettingsIcon,
    ChevronRight, Package, AlertCircle, Check, FolderOpen, Zap, Clock,
    Puzzle, Boxes, Box, Image, Edit3, CheckCircle, XCircle, ToggleLeft, ToggleRight,
    ExternalLink, Eye, Search, Loader, Copy, X, RefreshCcw, HardDrive,
    Grid3x3, List, Pin, Upload, FileJson
  } from "lucide-react";
import type { ModrinthHit } from "../../lib/types";

type DetailTab = "info" | "mods" | "packs" | "modpacks" | "customize" | "profiles";

export function InstancesPage() {
  const { instances, selectedInstance, themeColors, setPage, setSelectedInstance, loadInstances, setLoading } = useLauncherStore();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newVersion, setNewVersion] = useState("");
  const [newLoader, setNewLoader] = useState("vanilla");
  const [newLoaderVersion, setNewLoaderVersion] = useState("");
  const [newServerType, setNewServerType] = useState("vanilla");
  const [versions, setVersions] = useState<{ all_versions: string[]; groups: Record<string, string[]> }>({ all_versions: [], groups: {} });
  const [searchVersions, setSearchVersions] = useState("");
  const [supportedLoaders, setSupportedLoaders] = useState<string[]>(["vanilla"]);
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [launching, setLaunching] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [playTimes, setPlayTimes] = useState<Record<string, number>>({});
  const [detailTab, setDetailTab] = useState<DetailTab>("info");

  const [detailMods, setDetailMods] = useState<any[]>([]);
  const [detailRps, setDetailRps] = useState<any[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [installModSearch, setInstallModSearch] = useState("");
  const [installModResults, setInstallModResults] = useState<ModrinthHit[]>([]);
  const [searchingMods, setSearchingMods] = useState(false);
  const [installingModSlug, setInstallingModSlug] = useState<string | null>(null);

  const [installRPSearch, setInstallRPSearch] = useState("");
  const [installRPResults, setInstallRPResults] = useState<ModrinthHit[]>([]);
  const [searchingRP, setSearchingRP] = useState(false);
  const [installingRPSlug, setInstallingRPSlug] = useState<string | null>(null);

  const [installMPSearch, setInstallMPSearch] = useState("");
  const [installMPResults, setInstallMPResults] = useState<ModrinthHit[]>([]);
  const [searchingMP, setSearchingMP] = useState(false);
  const [installingMPSlug, setInstallingMPSlug] = useState<string | null>(null);
  const [mpCreateNew, setMpCreateNew] = useState(false);
  const [mpNewName, setMpNewName] = useState("");

  const [installingPerfMods, setInstallingPerfMods] = useState(false);
  const [perfModsResult, setPerfModsResult] = useState<string | null>(null);

  const [javaStatus, setJavaStatus] = useState<{ mc_version: string; required_java: number; current_java_version: number | null; current_compatible: boolean } | null>(null);

  const [installOverlay, setInstallOverlay] = useState<{
    instanceName: string;
    version: string;
    loader: string;
    loaderVersion: string;
  } | null>(null);

  const [iconUploading, setIconUploading] = useState(false);
  const [instanceIcon, setInstanceIcon] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profiles, setProfiles] = useState<any[]>([]);
  const [profileName, setProfileName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [applyingProfile, setApplyingProfile] = useState<string | null>(null);

  const [instanceJavaStatuses, setInstanceJavaStatuses] = useState<Record<string, { required_java: number; current_java_version: number | null; current_compatible: boolean }>>({});

  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    return (localStorage.getItem("ec-view-mode") as "grid" | "list") || "list";
  });
  const [sortBy, setSortBy] = useState<"name" | "last_played" | "version" | "status">(() => {
    return (localStorage.getItem("ec-sort-by") as any) || "last_played";
  });
  const [pinnedInstances, setPinnedInstances] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("ec-pinned-instances");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [dragOverInstance, setDragOverInstance] = useState<string | null>(null);
  const [selectedBatchMods, setSelectedBatchMods] = useState<Set<string>>(new Set());
  const configFileInputRef = useRef<HTMLInputElement>(null);

  const detailInstance = instances.find((i) => i.name === selectedDetail);

  const loadDetailData = useCallback(async (name: string) => {
    setLoadingDetail(true);
    try {
      const [mods, rps] = await Promise.all([
        api.instances.getMods(name).catch(() => []),
        api.instances.getResourcePacks(name).catch(() => []),
      ]);
      setDetailMods(mods);
      setDetailRps(rps);
      const icon = await api.instances.getIcon(name).catch(() => ({ success: false, icon: null }));
      setInstanceIcon(icon.success ? icon.icon : null);
    } catch {}
    setLoadingDetail(false);
  }, []);

  useEffect(() => {
    api.versions.getMinecraft().then(setVersions).catch(console.error);
    api.playTimes.get().then(setPlayTimes).catch(console.error);
    api.instances.get().then(async (insts) => {
      const statuses: Record<string, any> = {};
      for (const i of insts) {
        if (!i.version) continue;
        try {
          const result = await api.java.checkCompatibility(i.version);
          statuses[i.name] = result;
          setInstanceJavaStatuses({ ...statuses });
        } catch {}
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handleOpenCreate = () => setCreating(true);
    const handleEscape = () => { if (selectedDetail) setSelectedDetail(null); };
    window.addEventListener("ec-open-create-instance", handleOpenCreate);
    window.addEventListener("ec-escape-pressed", handleEscape);
    return () => {
      window.removeEventListener("ec-open-create-instance", handleOpenCreate);
      window.removeEventListener("ec-escape-pressed", handleEscape);
    };
  }, [selectedDetail]);

  useEffect(() => {
    if (newVersion) {
      api.versions.getSupportedLoaders(newVersion).then((loaders) => {
        setSupportedLoaders(loaders);
        if (!loaders.includes(newLoader)) {
          setNewLoader(loaders[0] || "vanilla");
        }
      }).catch(() => setSupportedLoaders(["vanilla"]));
    }
  }, [newVersion]);

  useEffect(() => {
    if (selectedDetail) {
      loadDetailData(selectedDetail);
      setDetailTab("info");
      setEditingName(false);
      setConfirmDelete(false);
      setInstanceIcon(null);
      const inst = instances.find(i => i.name === selectedDetail);
      if (inst?.version) {
        api.java.checkCompatibility(inst.version).then(setJavaStatus).catch(() => setJavaStatus(null));
      }
    }
  }, [selectedDetail, loadDetailData]);

  useEffect(() => {
    if (detailTab === "profiles") {
      api.profiles.list().then(setProfiles).catch(() => {});
    }
  }, [detailTab]);

  useEffect(() => { localStorage.setItem("ec-view-mode", viewMode); }, [viewMode]);
  useEffect(() => { localStorage.setItem("ec-sort-by", sortBy); }, [sortBy]);
  useEffect(() => {
    localStorage.setItem("ec-pinned-instances", JSON.stringify([...pinnedInstances]));
  }, [pinnedInstances]);

  const filteredVersions = versions.all_versions.filter((v) =>
    v.toLowerCase().includes(searchVersions.toLowerCase())
  );

  const handleCreate = async () => {
    if (!newName.trim() || !newVersion) return;
    const createdName = newName.trim();
    const createdVersion = newVersion;
    const createdLoader = newLoader;
    const createdLoaderVersion = newLoaderVersion;
    setLoading(true, `Creating instance "${createdName}"...`);
    try {
      await api.instances.create(createdName, createdVersion, createdLoader, createdLoaderVersion);
      await loadInstances();
      setCreating(false);
      setNewName("");
      setNewVersion("");
      setNewLoader("vanilla");
      setNewLoaderVersion("");
      setLoading(false);
      setInstalling(createdName);
      setInstallOverlay({
        instanceName: createdName,
        version: createdVersion,
        loader: createdLoader,
        loaderVersion: createdLoaderVersion,
      });
      return;
    } catch (err) {
      console.error("Failed to create instance:", err);
    }
    setLoading(false);
  };

  const handleInstall = async (name: string, version: string, loader: string, loaderVersion: string) => {
    setInstalling(name);
    setInstallOverlay({ instanceName: name, version, loader, loaderVersion });
  };

  const handleInstallComplete = async () => {
    if (installOverlay) {
      await loadInstances();
      const settings = await api.settings.get();
      const mcParts = installOverlay.version.split(".").map(Number);
      const mcMinor = mcParts[1] || 0;
      if (settings.perf_auto_mods && installOverlay.loader.toLowerCase() !== "vanilla" && mcMinor >= 16) {
        try {
          const result = await api.perfMods.install(installOverlay.instanceName, installOverlay.version, installOverlay.loader);
          if (result.installed > 0) {
            setPerfModsResult(`Auto-installed ${result.installed}/${result.total} performance mods`);
            setTimeout(() => setPerfModsResult(null), 5000);
          }
        } catch (e) {
          console.error("Failed to install performance mods:", e);
        }
      }
    }
    setInstalling(null);
    setInstallOverlay(null);
  };

  const handleInstallClose = async () => {
    if (installOverlay) {
      await loadInstances();
    }
    setInstalling(null);
    setInstallOverlay(null);
  };

  const handleInstallPlay = async () => {
    if (installOverlay) {
      const name = installOverlay.instanceName;
      setInstallOverlay(null);
      setInstalling(null);
      await loadInstances();
      handleLaunch(name);
    }
  };

  const handleLaunch = async (name: string) => {
    setLaunching(name);
    setLoading(true, `Launching "${name}"...`);
    const inst = instances.find((i: any) => i.name === name);
    window.dispatchEvent(new CustomEvent("ec-launch-game", { detail: {
      instanceName: name,
      version: inst?.version || "",
      loader: inst?.loader || "",
    } }));
    // Don't launch directly - App.tsx handles boost → launch flow
    setLaunching(null);
    setLoading(false);
  };

  const handleDelete = async (name: string) => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(name);
    try {
      await api.instances.delete(name);
      if (selectedDetail === name) setSelectedDetail(null);
      await loadInstances();
    } catch (err) {
      console.error("Failed to delete:", err);
    }
    setDeleting(null);
    setConfirmDelete(false);
  };

  const handleRename = async () => {
    if (!detailInstance || !nameValue.trim() || nameValue.trim() === detailInstance.name) { setEditingName(false); return; }
    setLoading(true, `Renaming to "${nameValue.trim()}"...`);
    try {
      await api.instances.rename(detailInstance.name, nameValue.trim());
      setSelectedDetail(nameValue.trim());
      await loadInstances();
    } catch {}
    setEditingName(false);
    setLoading(false);
  };

  const handleOpenFolder = async (name: string) => {
    try { await api.instances.openFolder(name); } catch {}
  };

  const togglePin = (name: string) => {
    setPinnedInstances((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const handleExportConfig = async (name: string) => {
    try {
      const result: any = await invoke("export_config", { instanceName: name });
      if (result?.path) alert(`Config exported to: ${result.path}`);
      else if (result?.success === false) alert(`Export failed: ${result.error || "Unknown error"}`);
    } catch (err) {
      console.error("Failed to export config:", err);
    }
  };

  const handleImportConfig = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedDetail) return;
    const filePath = (file as any).path || file.name;
    try {
      await invoke("import_config", { instanceName: selectedDetail, filePath });
      alert("Config imported successfully");
    } catch (err) {
      console.error("Failed to import config:", err);
    }
    if (configFileInputRef.current) configFileInputRef.current.value = "";
  };

  const handleToggleMod = async (filename: string) => {
    if (!selectedDetail) return;
    try {
      const result = await api.instances.toggleMod(selectedDetail, filename);
      setDetailMods((prev) => prev.map((m) =>
        m.filename === filename ? { ...m, filename: result.filename, enabled: result.enabled } : m
      ));
    } catch {}
  };

  const handleToggleRP = async (filename: string) => {
    if (!selectedDetail) return;
    try {
      const result = await api.resourcePack.toggle(selectedDetail, filename);
      setDetailRps((prev) => prev.map((r) =>
        r.filename === filename ? { ...r, enabled: result.enabled } : r
      ));
    } catch {}
  };

  const handleDeleteMod = async (filename: string) => {
    if (!selectedDetail) return;
    try {
      await api.instances.deleteMod(selectedDetail, filename);
      setDetailMods((prev) => prev.filter((m) => m.filename !== filename));
    } catch {}
  };

  const handleDeleteRP = async (filename: string) => {
    if (!selectedDetail) return;
    try {
      await api.instances.deleteResourcePack(selectedDetail, filename);
      setDetailRps((prev) => prev.filter((r) => r.filename !== filename));
    } catch {}
  };

  const handleInstallPerfMods = async () => {
    if (!detailInstance) return;
    setInstallingPerfMods(true);
    setPerfModsResult(null);
    setLoading(true, `Installing performance mods for "${detailInstance.name}"...`);
    try {
      const result = await api.perfMods.install(detailInstance.name, detailInstance.version, detailInstance.loader || "vanilla");
      setPerfModsResult(result.message);
      setTimeout(() => setPerfModsResult(null), 8000);
    } catch (err) {
      console.error("Failed to install performance mods:", err);
      setPerfModsResult("Failed to install performance mods");
      setTimeout(() => setPerfModsResult(null), 5000);
    }
    setInstallingPerfMods(false);
    setLoading(false);
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedDetail) return;
    setIconUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        await api.instances.setIcon(selectedDetail, base64);
        setInstanceIcon(dataUrl);
        setIconUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setIconUploading(false);
    }
  };

  const searchModsToInstall = async (query: string) => {
    if (!query.trim()) { setInstallModResults([]); return; }
    setSearchingMods(true);
    try {
      const results = await api.mods.search(query, "mod", detailInstance?.loader, detailInstance?.version, 10);
      setInstallModResults(results);
    } catch {}
    setSearchingMods(false);
  };

  const searchRPToInstall = async (query: string) => {
    if (!query.trim()) { setInstallRPResults([]); return; }
    setSearchingRP(true);
    try {
      const results = await api.mods.search(query, "resourcepack", undefined, detailInstance?.version, 10);
      setInstallRPResults(results);
    } catch {}
    setSearchingRP(false);
  };

  const searchMPToInstall = async (query: string) => {
    if (!query.trim()) { setInstallMPResults([]); return; }
    setSearchingMP(true);
    try {
      const results = await api.mods.search(query, "modpack", undefined, detailInstance?.version, 10);
      setInstallMPResults(results);
    } catch {}
    setSearchingMP(false);
  };

  const handleInstallMod = async (slug: string) => {
    if (!selectedDetail) return;
    setInstallingModSlug(slug);
    try {
      await api.mods.install(selectedDetail, slug);
      const mods = await api.instances.getMods(selectedDetail);
      setDetailMods(mods);
    } catch {}
    setInstallingModSlug(null);
  };

  const handleBatchInstall = async () => {
    if (!selectedDetail || selectedBatchMods.size === 0) return;
    setLoading(true, `Installing ${selectedBatchMods.size} mod(s)...`);
    for (const slug of selectedBatchMods) {
      try {
        await api.mods.install(selectedDetail, slug);
      } catch (err) {
        console.error(`Failed to install mod ${slug}:`, err);
      }
    }
    const mods = await api.instances.getMods(selectedDetail);
    setDetailMods(mods);
    setSelectedBatchMods(new Set());
    setLoading(false);
  };

  const toggleBatchMod = (slug: string) => {
    setSelectedBatchMods((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  };

  const handleInstallRP = async (slug: string) => {
    if (!selectedDetail) return;
    setInstallingRPSlug(slug);
    try {
      const result = await api.mods.installResourcepack(selectedDetail, slug);
      if ((result as any).filename) {
        await api.resourcePack.autoEnable(selectedDetail, (result as any).filename);
      }
      const rps = await api.instances.getResourcePacks(selectedDetail);
      setDetailRps(rps);
    } catch {}
    setInstallingRPSlug(null);
  };

  const handleInstallMP = async (slug: string) => {
    if (!selectedDetail || !detailInstance) return;
    setInstallingMPSlug(slug);
    setLoading(true, `Installing modpack as new instance...`);
    try {
      const name = mpCreateNew && mpNewName.trim() ? mpNewName.trim() : `${detailInstance.name} - ${slug}`;
      await api.instances.createFromModpack(name, detailInstance.version, detailInstance.loader || "vanilla", detailInstance.loader_version || "", slug);
      await loadInstances();
      setMpCreateNew(false);
      setMpNewName("");
    } catch {}
    setInstallingMPSlug(null);
    setLoading(false);
  };

  const sortedInstances = [...instances].sort((a, b) => {
    const aPinned = pinnedInstances.has(a.name);
    const bPinned = pinnedInstances.has(b.name);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    switch (sortBy) {
      case "name": return a.name.localeCompare(b.name);
      case "last_played": {
        const aTime = playTimes[a.name] || 0;
        const bTime = playTimes[b.name] || 0;
        return bTime - aTime;
      }
      case "version": return (b.version || "").localeCompare(a.version || "", undefined, { numeric: true });
      case "status":
        if (a.installed && !b.installed) return -1;
        if (!a.installed && b.installed) return 1;
        return a.name.localeCompare(b.name);
      default: return 0;
    }
  });

  if (creating) {
    return (
      <div className="space-y-5 max-w-xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plus size={20} style={{ color: themeColors.accent }} />
            <h1 className="tinycaps text-xl font-bold" style={{ color: themeColors.text_main }}>Create Instance</h1>
          </div>
          <GlowButton size="sm" onClick={() => setCreating(false)} variant="danger">Cancel</GlowButton>
        </div>
        <GlassCard>
          <div className="space-y-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: themeColors.text_sub }}>Instance Name</label>
              <GlassInput value={newName} onChange={setNewName} placeholder="My Instance" />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: themeColors.text_sub }}>Minecraft Version</label>
              <GlassInput value={searchVersions} onChange={setSearchVersions} placeholder="Search versions..." />
              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg" style={{ border: `1px solid ${themeColors.border}` }}>
                {filteredVersions.length === 0 && (
                  <p className="text-xs p-3 text-center" style={{ color: themeColors.text_muted }}>No versions found</p>
                )}
                {filteredVersions.map((v) => (
                  <button key={v} onClick={() => { setNewVersion(v); setSearchVersions(""); }}
                    className="w-full px-3 py-2 text-left text-sm transition-colors hover:opacity-80"
                    style={{
                      color: newVersion === v ? themeColors.accent : themeColors.text_main,
                      background: newVersion === v ? `${themeColors.accent}10` : "transparent",
                    }}>
                    {v}
                  </button>
                ))}
              </div>
              {newVersion && <p className="text-xs mt-1" style={{ color: themeColors.accent }}>Selected: {newVersion}</p>}
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: themeColors.text_sub }}>Loader</label>
              <select value={newLoader} onChange={(e) => setNewLoader(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ background: themeColors.bg_card2, border: `1px solid ${themeColors.border}`, color: themeColors.text_main }}>
                {supportedLoaders.map((l) => (
                  <option key={l} value={l} style={{ background: themeColors.bg_card }}>{l === "vanilla" ? "Vanilla" : l.charAt(0).toUpperCase() + l.slice(1)}</option>
                ))}
              </select>
            </div>
            {newLoader !== "vanilla" && (
              <div>
                <label className="text-xs mb-1 block" style={{ color: themeColors.text_sub }}>Loader Version (optional)</label>
                <GlassInput value={newLoaderVersion} onChange={setNewLoaderVersion} placeholder="Auto (latest)" />
              </div>
            )}
            <GlowButton onClick={handleCreate} disabled={!newName.trim() || !newVersion}
              className="w-full flex items-center justify-center gap-1">
              <Plus size={14} /> Create Instance
            </GlowButton>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor size={20} style={{ color: themeColors.accent }} />
          <div>
            <h1 className="tinycaps text-xl font-bold gradient-text" style={{ "--accent": themeColors.accent, "--accent2": themeColors.purple || themeColors.blue } as any}>Instances</h1>
            <p className="text-xs mt-0.5" style={{ color: themeColors.text_muted }}>
              Manage your Minecraft profiles · {instances.length} instance{instances.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
            className="px-2 py-1.5 rounded-lg text-xs outline-none"
            style={{ background: themeColors.bg_card2, border: `1px solid ${themeColors.border}`, color: themeColors.text_main }}>
            <option value="name" style={{ background: themeColors.bg_card }}>Name</option>
            <option value="last_played" style={{ background: themeColors.bg_card }}>Last Played</option>
            <option value="version" style={{ background: themeColors.bg_card }}>Version</option>
            <option value="status" style={{ background: themeColors.bg_card }}>Status</option>
          </select>
          <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${themeColors.border}` }}>
            <button onClick={() => setViewMode("grid")} className="p-1.5 transition-colors"
              style={{ background: viewMode === "grid" ? `${themeColors.accent}20` : "transparent", color: viewMode === "grid" ? themeColors.accent : themeColors.text_muted }}>
              <Grid3x3 size={14} />
            </button>
            <button onClick={() => setViewMode("list")} className="p-1.5 transition-colors"
              style={{ background: viewMode === "list" ? `${themeColors.accent}20` : "transparent", color: viewMode === "list" ? themeColors.accent : themeColors.text_muted }}>
              <List size={14} />
            </button>
          </div>
          <GlowButton onClick={() => setCreating(true)} className="flex items-center gap-1">
            <Plus size={14} /> Create Instance
          </GlowButton>
        </div>
      </div>

      <div className="flex gap-5">
        <div className={`${
          viewMode === "grid"
            ? `shrink-0 transition-all duration-300 ${selectedDetail ? "w-[calc(100%-280px)]" : "w-full"} grid ${selectedDetail ? "grid-cols-2" : "grid-cols-3"} gap-3`
            : `${selectedDetail ? "w-72" : "w-full"} space-y-2 shrink-0 transition-all duration-300`
        }`}>
          {sortedInstances.length === 0 ? (
            <GlassCard>
              <div className="text-center py-8">
                <Monitor size={32} className="mx-auto mb-3" style={{ color: themeColors.text_muted, opacity: 0.4 }} />
                <p className="text-sm mb-3" style={{ color: themeColors.text_muted }}>No instances yet</p>
                <GlowButton onClick={() => setCreating(true)} className="flex items-center gap-1 mx-auto">
                  <Plus size={14} /> Create Your First Instance
                </GlowButton>
              </div>
            </GlassCard>
          ) : (
            sortedInstances.map((inst) => {
              const isSelected = selectedDetail === inst.name;
              const playTime = playTimes[inst.name] || 0;
              const isPinned = pinnedInstances.has(inst.name);
              const isDragOver = dragOverInstance === inst.name;

              const handleCardDrop = async (e: React.DragEvent) => {
                e.preventDefault();
                setDragOverInstance(null);
                const files = e.dataTransfer.files;
                if (files.length === 0) return;
                for (let i = 0; i < files.length; i++) {
                  const file = files[i];
                  const name = file.name;
                  const filePath = (file as any).path || name;
                  try {
                    if (name.endsWith(".jar")) {
                      await invoke("move_mod_file", { instanceName: inst.name, sourcePath: filePath });
                    } else if (name.endsWith(".zip")) {
                      await invoke("move_resourcepack_file", { instanceName: inst.name, sourcePath: filePath });
                    }
                  } catch (err) { console.error("Failed to move file:", err); }
                }
                if (inst.name === selectedDetail) loadDetailData(inst.name);
              };

              if (viewMode === "grid") {
                return (
                  <GlassCard key={inst.name} hover className={`transition-all cursor-pointer ${isSelected ? "ring-1" : ""} ${isDragOver ? "ring-2" : ""}`}
                    style={{
                      ...(isPinned ? { boxShadow: `0 0 10px ${(themeColors.purple || themeColors.accent)}30` } : {}),
                      ...(isSelected ? { borderColor: themeColors.accent, boxShadow: `0 0 12px ${themeColors.accent}20` } : {}),
                      ...(isDragOver ? { borderColor: themeColors.accent, boxShadow: `0 0 24px ${themeColors.accent}50` } : {}),
                    }}
                    onClick={() => setSelectedDetail(isSelected ? null : inst.name)}
                    onDragOver={(e) => { e.preventDefault(); setDragOverInstance(inst.name); }}
                    onDragLeave={() => setDragOverInstance(null)}
                    onDrop={handleCardDrop}>
                    <div className="flex flex-col items-center text-center p-3">
                      <div className="w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden mb-2"
                        style={{ background: `${themeColors.accent}10` }}>
                        <Monitor size={24} style={{ color: inst.installed ? themeColors.success : themeColors.warn }} />
                      </div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {isPinned && <Pin size={10} fill="currentColor" style={{ color: themeColors.purple || themeColors.accent }} />}
                        <h3 className="tinycaps text-sm font-semibold truncate" style={{ color: themeColors.text_main }}>{inst.name}</h3>
                      </div>
                      <div className="text-[10px] mb-1" style={{ color: themeColors.text_muted }}>MC {inst.version}</div>
                      <div className="flex items-center gap-1.5 mb-1">
                        {inst.installed ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${themeColors.success}15`, color: themeColors.success }}>Ready</span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${themeColors.warn}15`, color: themeColors.warn }}>Not Installed</span>
                        )}
                        {inst.loader && inst.loader !== "vanilla" && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${themeColors.blue}15`, color: themeColors.blue }}>{inst.loader}</span>
                        )}
                      </div>
                      {playTime > 0 && (
                        <div className="text-[10px] mb-1 flex items-center gap-0.5" style={{ color: themeColors.text_muted }}>
                          <Clock size={9} /> {Math.floor(playTime / 60)}h {playTime % 60}m
                        </div>
                      )}
                      {isDragOver && (
                        <div className="text-[10px] font-semibold mb-1" style={{ color: themeColors.accent }}>Drop here</div>
                      )}
                      <div className="flex items-center gap-1 mt-1">
                        {inst.installed ? (
                          <GlowButton size="sm" onClick={(e) => { e.stopPropagation(); handleLaunch(inst.name); }}
                            disabled={launching === inst.name} className="flex items-center gap-1">
                            <Play size={12} /> {launching === inst.name ? "..." : "Play"}
                          </GlowButton>
                        ) : (
                          <GlowButton size="sm" onClick={(e) => { e.stopPropagation(); handleInstall(inst.name, inst.version, inst.loader || "vanilla", inst.loader_version || ""); }}
                            disabled={installing === inst.name} className="flex items-center gap-1">
                            <Download size={12} /> {installing === inst.name ? "..." : "Install"}
                          </GlowButton>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); togglePin(inst.name); }}
                          className="p-1 rounded transition-colors"
                          style={{ color: isPinned ? (themeColors.purple || themeColors.accent) : themeColors.text_muted }}>
                          <Pin size={12} fill={isPinned ? "currentColor" : "none"} />
                        </button>
                      </div>
                    </div>
                  </GlassCard>
                );
              }

              return (
                <GlassCard key={inst.name} hover className={`transition-all cursor-pointer ${isSelected ? "ring-1" : ""} ${isDragOver ? "ring-2" : ""}`}
                  style={{
                    ...(isPinned ? { boxShadow: `0 0 8px ${(themeColors.purple || themeColors.accent)}25` } : {}),
                    ...(isSelected ? { borderColor: themeColors.accent, boxShadow: `0 0 12px ${themeColors.accent}20` } : {}),
                    ...(isDragOver ? { borderColor: themeColors.accent, boxShadow: `0 0 20px ${themeColors.accent}40` } : {}),
                  }}
                  onClick={() => setSelectedDetail(isSelected ? null : inst.name)}
                  onDragOver={(e) => { e.preventDefault(); setDragOverInstance(inst.name); }}
                  onDragLeave={() => setDragOverInstance(null)}
                  onDrop={handleCardDrop}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden shrink-0"
                      style={{ background: `${themeColors.accent}10` }}>
                      <Monitor size={18} style={{ color: inst.installed ? themeColors.success : themeColors.warn }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="tinycaps text-sm font-semibold truncate" style={{ color: themeColors.text_main }}>{inst.name}</h3>
                        {isPinned && <Pin size={10} fill="currentColor" style={{ color: themeColors.purple || themeColors.accent }} />}
                        {inst.installed ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${themeColors.success}15`, color: themeColors.success }}>Ready</span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${themeColors.warn}15`, color: themeColors.warn }}>Not Installed</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] mt-0.5" style={{ color: themeColors.text_muted }}>
                        <span>MC {inst.version}</span>
                        <span>{inst.loader || "Vanilla"} {inst.loader_version || ""}</span>
                        {playTime > 0 && <span className="flex items-center gap-0.5"><Clock size={9} /> {Math.floor(playTime / 60)}h {playTime % 60}m</span>}
                        {instanceJavaStatuses[inst.name] && !instanceJavaStatuses[inst.name].current_compatible && (
                          <span className="flex items-center gap-0.5" style={{ color: themeColors.warn }}>
                            <HardDrive size={9} /> Need Java {instanceJavaStatuses[inst.name].required_java}
                          </span>
                        )}
                      </div>
                    </div>
                    {isDragOver && (
                      <div className="text-[10px] font-semibold shrink-0" style={{ color: themeColors.accent }}>Drop here</div>
                    )}
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); togglePin(inst.name); }}
                        className="p-1 rounded transition-colors"
                        style={{ color: isPinned ? (themeColors.purple || themeColors.accent) : themeColors.text_muted }}>
                        <Pin size={12} fill={isPinned ? "currentColor" : "none"} />
                      </button>
                      {inst.installed ? (
                        <GlowButton size="sm" onClick={(e) => { e.stopPropagation(); handleLaunch(inst.name); }}
                          disabled={launching === inst.name} className="flex items-center gap-1">
                          <Play size={12} /> {launching === inst.name ? "..." : "Play"}
                        </GlowButton>
                      ) : (
                        <GlowButton size="sm" onClick={(e) => { e.stopPropagation(); handleInstall(inst.name, inst.version, inst.loader || "vanilla", inst.loader_version || ""); }}
                          disabled={installing === inst.name} className="flex items-center gap-1">
                          <Download size={12} /> {installing === inst.name ? "..." : "Install"}
                        </GlowButton>
                      )}
                      <GlowButton size="sm" variant="secondary" onClick={(e) => {
                        e.stopPropagation();
                        const newName = window.prompt("New instance name:");
                        if (newName && newName.trim()) {
                          api.clone.instance(inst.name, newName.trim()).then(async (result) => {
                            if (result.success) {
                              await loadInstances();
                            } else {
                              alert(`Clone failed: ${result.error || "Unknown error"}`);
                            }
                          });
                        }
                      }} className="flex items-center gap-1">
                        <Copy size={12} /> Clone
                      </GlowButton>
                    </div>
                  </div>
                </GlassCard>
              );
            })
          )}
        </div>

        {selectedDetail && detailInstance && (
          <div className="flex-1 space-y-3 min-w-0">
            <GlassCard>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden cursor-pointer relative group"
                    style={{ background: `${themeColors.accent}10`, border: `1px solid ${themeColors.border}` }}
                    onClick={() => fileInputRef.current?.click()}>
                    {instanceIcon ? (
                      <img src={instanceIcon} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Monitor size={20} style={{ color: themeColors.accent }} />
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Image size={14} className="text-white" />
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleIconUpload} />
                  </div>
                  <div>
                    {editingName ? (
                      <div className="flex items-center gap-1">
                        <GlassInput value={nameValue} onChange={setNameValue}
                          onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setEditingName(false); }}
                          className="w-48" />
                        <button onClick={handleRename} className="p-1" style={{ color: themeColors.success }}><Check size={14} /></button>
                        <button onClick={() => setEditingName(false)} className="p-1" style={{ color: themeColors.danger }}><X size={14} /></button>
                      </div>
                    ) : (
                      <h3 className="tinycaps text-lg font-bold flex items-center gap-1.5" style={{ color: themeColors.text_main }}>
                        {detailInstance.name}
                        <button onClick={() => { setEditingName(true); setNameValue(detailInstance.name); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5">
                          <Edit3 size={12} style={{ color: themeColors.text_muted }} />
                        </button>
                      </h3>
                    )}
                    <div className="flex items-center gap-2 text-xs mt-0.5" style={{ color: themeColors.text_muted }}>
                      <span>MC {detailInstance.version}</span>
                      <span>·</span>
                      <span>{detailInstance.loader || "Vanilla"}</span>
                      {detailInstance.loader_version && <span>{detailInstance.loader_version}</span>}
                    </div>
                    {javaStatus && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <HardDrive size={11} style={{ color: javaStatus.current_compatible ? themeColors.success : themeColors.warn }} />
                        <span className="text-[10px]" style={{ color: javaStatus.current_compatible ? themeColors.success : themeColors.warn }}>
                          {javaStatus.current_compatible
                            ? `Java ${javaStatus.current_java_version} ✓`
                            : `Needs Java ${javaStatus.required_java} (have ${javaStatus.current_java_version || "?"})`
                          }
                        </span>
                        {!javaStatus.current_compatible && (
                          <button onClick={async () => {
                            setLoading(true, `Downloading Java ${javaStatus.required_java}...`);
                            try {
                              await api.java.download(javaStatus.required_java);
                              const updated = await api.java.checkCompatibility(detailInstance.version);
                              setJavaStatus(updated);
                            } catch {}
                            setLoading(false);
                          }} className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{ background: `${themeColors.accent}15`, color: themeColors.accent, border: `1px solid ${themeColors.accent}30` }}>
                            Auto-Fix
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <GlowButton size="sm" onClick={() => handleLaunch(detailInstance.name)}
                    disabled={launching === detailInstance.name || !detailInstance.installed}
                    className="flex items-center gap-1">
                    <Play size={12} /> Play
                  </GlowButton>
                </div>
              </div>

              <div className="flex gap-1 mt-3 pt-2" style={{ borderTop: `1px solid ${themeColors.border}` }}>
                {(["info", "mods", "packs", "modpacks", "customize", "profiles"] as DetailTab[]).map((t) => (
                  <button key={t} onClick={() => setDetailTab(t)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize tinycaps"
                    style={{
                      background: detailTab === t ? `${themeColors.accent}20` : "transparent",
                      color: detailTab === t ? themeColors.accent : themeColors.text_muted,
                      border: detailTab === t ? `1px solid ${themeColors.accent}30` : "1px solid transparent",
                    }}>
                    {t === "info" ? "Info" : t === "mods" ? `Mods (${detailMods.length})` : t === "packs" ? `Packs (${detailRps.length})` : t === "modpacks" ? "Modpacks" : t === "profiles" ? "Profiles" : "Customize"}
                  </button>
                ))}
              </div>
            </GlassCard>

            {detailTab === "info" && (
              <GlassCard>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="px-3 py-2 rounded-lg" style={{ background: `${themeColors.accent}08`, border: `1px solid ${themeColors.border}` }}>
                      <div className="text-[10px]" style={{ color: themeColors.text_muted }}>Status</div>
                      <div className="text-sm font-semibold flex items-center gap-1" style={{ color: detailInstance.installed ? themeColors.success : themeColors.warn }}>
                        {detailInstance.installed ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                        {detailInstance.installed ? "Ready to Play" : "Not Installed"}
                      </div>
                    </div>
                    <div className="px-3 py-2 rounded-lg" style={{ background: `${themeColors.purple}08`, border: `1px solid ${themeColors.border}` }}>
                      <div className="text-[10px]" style={{ color: themeColors.text_muted }}>Play Time</div>
                      <div className="text-sm font-semibold" style={{ color: themeColors.text_main }}>
                        {Math.floor((playTimes[detailInstance.name] || 0) / 60)}h {(playTimes[detailInstance.name] || 0) % 60}m
                      </div>
                    </div>
                    <div className="px-3 py-2 rounded-lg" style={{ background: `${themeColors.blue}08`, border: `1px solid ${themeColors.border}` }}>
                      <div className="text-[10px]" style={{ color: themeColors.text_muted }}>Loader</div>
                      <div className="text-sm font-semibold capitalize" style={{ color: themeColors.text_main }}>
                        {detailInstance.loader || "Vanilla"}
                      </div>
                    </div>
                    <div className="px-3 py-2 rounded-lg" style={{ background: `${themeColors.success}08`, border: `1px solid ${themeColors.border}` }}>
                      <div className="text-[10px]" style={{ color: themeColors.text_muted }}>Version</div>
                      <div className="text-sm font-semibold" style={{ color: themeColors.text_main }}>
                        {detailInstance.version}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    {detailInstance.installed && (
                      <GlowButton size="sm" onClick={() => handleOpenFolder(detailInstance.name)} variant="secondary" className="flex items-center gap-1">
                        <FolderOpen size={12} /> Open Folder
                      </GlowButton>
                    )}
                    {detailInstance.installed && detailInstance.loader !== "vanilla" && (
                      <GlowButton size="sm" onClick={handleInstallPerfMods} variant="secondary" disabled={installingPerfMods} className="flex items-center gap-1"
                        style={{ borderColor: `${themeColors.success}40`, color: themeColors.success }}>
                        <Zap size={12} /> {installingPerfMods ? "Installing..." : "Install FPS Mods"}
                      </GlowButton>
                    )}
                    {detailInstance.installed && (
                      <GlowButton size="sm" onClick={() => { setPage("tools"); }} variant="secondary" className="flex items-center gap-1">
                        <Zap size={12} /> Optimizer
                      </GlowButton>
                    )}
                    {detailInstance.installed && (
                      <GlowButton size="sm" onClick={() => { setSelectedInstance(detailInstance.name); setPage("configeditor"); }} variant="secondary" className="flex items-center gap-1">
                        <SettingsIcon size={12} /> Config Editor
                      </GlowButton>
                    )}
                    {detailInstance.installed && (
                      <GlowButton size="sm" onClick={async () => {
                        setLoading(true, "Checking for mod updates...");
                        try {
                          const result = await api.modUpdates.check(detailInstance.name);
                          alert(`Found ${(result as any).updates?.length || 0} update(s)`);
                        } catch {}
                        setLoading(false);
                      }} variant="secondary" className="flex items-center gap-1">
                        <RefreshCcw size={12} /> Check Updates
                      </GlowButton>
                    )}
                    {detailInstance.installed && (
                      <GlowButton size="sm" onClick={async () => {
                        setLoading(true, "Detecting mod conflicts...");
                        try {
                          const result = await api.conflicts.detect(detailInstance.name);
                          const conflicts = (result as any).conflicts || [];
                          if (conflicts.length === 0) {
                            alert("No mod conflicts detected!");
                          } else {
                            alert(`Found ${conflicts.length} conflict(s):\n${conflicts.map((c: any) => `${c.mod1} vs ${c.mod2}: ${c.reason}`).join("\n")}`);
                          }
                        } catch {}
                        setLoading(false);
                      }} variant="secondary" className="flex items-center gap-1">
                        <AlertCircle size={12} /> Check Conflicts
                      </GlowButton>
                    )}
                    {detailInstance.installed && (
                      <GlowButton size="sm" onClick={async () => {
                        setLoading(true, "Exporting as modpack...");
                        try {
                          const result = await api.export.mrpack(detailInstance.name, detailInstance.name, detailInstance.version, `${detailInstance.name}.mrpack`);
                          if ((result as any).success) {
                            alert(`Exported to: ${(result as any).path}`);
                          } else {
                            alert(`Export failed: ${(result as any).error}`);
                          }
                        } catch {}
                        setLoading(false);
                      }} variant="secondary" className="flex items-center gap-1">
                        <ExternalLink size={12} /> Export .mrpack
                      </GlowButton>
                    )}
                    {detailInstance.installed && (
                      <GlowButton size="sm" onClick={() => handleExportConfig(detailInstance.name)} variant="secondary" className="flex items-center gap-1">
                        <FileJson size={12} /> Export Config
                      </GlowButton>
                    )}
                    {detailInstance.installed && (
                      <>
                        <input ref={configFileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportConfig} />
                        <GlowButton size="sm" onClick={() => configFileInputRef.current?.click()} variant="secondary" className="flex items-center gap-1">
                          <Upload size={12} /> Import Config
                        </GlowButton>
                      </>
                    )}
                    {!confirmDelete ? (
                      <GlowButton size="sm" onClick={() => handleDelete(detailInstance.name)} variant="danger" className="flex items-center gap-1">
                        <Trash2 size={12} /> Delete
                      </GlowButton>
                    ) : (
                      <div className="flex items-center gap-1">
                        <GlowButton size="sm" onClick={() => handleDelete(detailInstance.name)} variant="danger" className="flex items-center gap-1">
                          <Trash2 size={12} /> Confirm Delete
                        </GlowButton>
                        <GlowButton size="sm" onClick={() => setConfirmDelete(false)} variant="secondary">Cancel</GlowButton>
                      </div>
                    )}
                  </div>
                  {perfModsResult && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                      className="mt-2 px-3 py-2 rounded-lg text-xs"
                      style={{ background: `${themeColors.success}15`, color: themeColors.success, border: `1px solid ${themeColors.success}30` }}>
                      {perfModsResult}
                    </motion.div>
                  )}
                </div>
              </GlassCard>
            )}

            {detailTab === "mods" && (
              <div className="space-y-3">
                <GlassCard>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1">
                      <GlassInput value={installModSearch} onChange={(v) => { setInstallModSearch(v); if (v.length >= 2) searchModsToInstall(v); else setInstallModResults([]); }}
                        placeholder="Search mods to install..." />
                    </div>
                  </div>
                  {installModResults.length > 0 && (
                    <div className="space-y-1 mb-3 max-h-48 overflow-y-auto">
                      {installModResults.map((mod) => (
                        <div key={mod.slug} className="flex items-center justify-between px-2 py-1.5 rounded-lg"
                          style={{ background: `${themeColors.bg_card2}`, border: `1px solid ${themeColors.border}` }}>
                          <div className="flex items-center gap-2 min-w-0">
                            <input type="checkbox" checked={selectedBatchMods.has(mod.slug)}
                              onChange={() => toggleBatchMod(mod.slug)}
                              className="w-3.5 h-3.5 rounded shrink-0" style={{ accentColor: themeColors.accent }} />
                            {mod.icon_url && <img src={mod.icon_url} alt="" className="w-6 h-6 rounded object-cover shrink-0" />}
                            <div className="min-w-0">
                              <div className="text-xs font-medium truncate" style={{ color: themeColors.text_main }}>{mod.title}</div>
                              <div className="text-[9px] truncate" style={{ color: themeColors.text_muted }}>↓ {mod.downloads?.toLocaleString()}</div>
                            </div>
                          </div>
                          <GlowButton size="sm" onClick={() => handleInstallMod(mod.slug)}
                            disabled={installingModSlug === mod.slug} className="shrink-0">
                            {installingModSlug === mod.slug ? "..." : "Install"}
                          </GlowButton>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedBatchMods.size > 0 && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className="sticky bottom-0 flex items-center justify-between px-3 py-2 rounded-lg"
                      style={{ background: `${themeColors.accent}15`, border: `1px solid ${themeColors.accent}30` }}>
                      <span className="text-xs font-medium" style={{ color: themeColors.accent }}>
                        {selectedBatchMods.size} mod{selectedBatchMods.size !== 1 ? "s" : ""} selected
                      </span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setSelectedBatchMods(new Set())} className="text-xs" style={{ color: themeColors.text_muted }}>Clear</button>
                        <GlowButton size="sm" onClick={handleBatchInstall} className="flex items-center gap-1">
                          <Download size={12} /> Batch Install
                        </GlowButton>
                      </div>
                    </motion.div>
                  )}
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="tinycaps text-sm font-semibold" style={{ color: themeColors.text_main }}>Installed Mods ({detailMods.length})</h3>
                    <button onClick={() => setPage("mods")} className="text-[10px] flex items-center gap-0.5" style={{ color: themeColors.accent }}>
                      Browse <ChevronRight size={10} />
                    </button>
                  </div>
                  {loadingDetail ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: themeColors.accent, borderTopColor: "transparent" }} />
                    </div>
                  ) : detailMods.length === 0 ? (
                    <p className="text-xs py-4 text-center" style={{ color: themeColors.text_muted }}>No mods installed</p>
                  ) : (
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {detailMods.map((mod) => (
                        <div key={mod.filename} className="flex items-center justify-between px-2 py-1.5 rounded-lg group"
                          style={{ background: mod.enabled ? "transparent" : `${themeColors.danger}08` }}>
                          <div className="flex items-center gap-2 min-w-0">
                            <Package size={10} style={{ color: mod.enabled ? themeColors.accent : themeColors.text_muted }} />
                            <span className="text-xs truncate" style={{ color: mod.enabled ? themeColors.text_main : themeColors.text_muted, opacity: mod.enabled ? 1 : 0.6 }}>
                              {mod.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleToggleMod(mod.filename)} className="p-0.5" style={{ color: mod.enabled ? themeColors.success : themeColors.text_muted }}>
                              {mod.enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                            </button>
                            <button onClick={() => handleDeleteMod(mod.filename)} className="p-0.5" style={{ color: themeColors.danger }}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </GlassCard>
              </div>
            )}

            {detailTab === "packs" && (
              <div className="space-y-3">
                <GlassCard>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1">
                      <GlassInput value={installRPSearch} onChange={(v) => { setInstallRPSearch(v); if (v.length >= 2) searchRPToInstall(v); else setInstallRPResults([]); }}
                        placeholder="Search resource packs to install..." />
                    </div>
                  </div>
                  {installRPResults.length > 0 && (
                    <div className="space-y-1 mb-3 max-h-48 overflow-y-auto">
                      {installRPResults.map((rp) => (
                        <div key={rp.slug} className="flex items-center justify-between px-2 py-1.5 rounded-lg"
                          style={{ background: `${themeColors.bg_card2}`, border: `1px solid ${themeColors.border}` }}>
                          <div className="flex items-center gap-2 min-w-0">
                            {rp.icon_url && <img src={rp.icon_url} alt="" className="w-6 h-6 rounded object-cover shrink-0" />}
                            <div className="min-w-0">
                              <div className="text-xs font-medium truncate" style={{ color: themeColors.text_main }}>{rp.title}</div>
                              <div className="text-[9px] truncate" style={{ color: themeColors.text_muted }}>↓ {rp.downloads?.toLocaleString()}</div>
                            </div>
                          </div>
                          <GlowButton size="sm" onClick={() => handleInstallRP(rp.slug)}
                            disabled={installingRPSlug === rp.slug} className="shrink-0">
                            {installingRPSlug === rp.slug ? "..." : "Install"}
                          </GlowButton>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="tinycaps text-sm font-semibold" style={{ color: themeColors.text_main }}>Installed Resource Packs ({detailRps.length})</h3>
                    <button onClick={() => setPage("packs")} className="text-[10px] flex items-center gap-0.5" style={{ color: themeColors.accent }}>
                      Browse <ChevronRight size={10} />
                    </button>
                  </div>
                  {loadingDetail ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: themeColors.accent, borderTopColor: "transparent" }} />
                    </div>
                  ) : detailRps.length === 0 ? (
                    <p className="text-xs py-4 text-center" style={{ color: themeColors.text_muted }}>No resource packs installed</p>
                  ) : (
                    <div className="space-y-1 max-h-72 overflow-y-auto">
                      {detailRps.map((rp) => (
                        <div key={rp.filename} className="flex items-center justify-between px-2 py-1.5 rounded-lg group"
                          style={{ background: rp.enabled ? 'transparent' : `${themeColors.danger}08` }}>
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${themeColors.accent}10`, border: `1px solid ${themeColors.border}` }}>
                              <Box size={20} style={{ color: rp.enabled ? themeColors.accent : themeColors.text_muted }} />
                            </div>
                            <span className="text-sm truncate" style={{ color: rp.enabled ? themeColors.text_main : themeColors.text_muted, opacity: rp.enabled ? 1 : 0.6 }}>
                              {rp.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleToggleRP(rp.filename)} className="p-0.5" style={{ color: rp.enabled ? themeColors.success : themeColors.text_muted }}>
                              {rp.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                            </button>
                            <button onClick={() => handleDeleteRP(rp.filename)} className="p-0.5" style={{ color: themeColors.danger }}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </GlassCard>
              </div>
            )}

            {detailTab === "modpacks" && (
              <div className="space-y-3">
                <GlassCard>
                  <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Install Modpack (Creates New Instance)</h3>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={mpCreateNew} onChange={(e) => setMpCreateNew(e.target.checked)}
                        className="w-4 h-4 rounded accent-current" style={{ accentColor: themeColors.accent }} />
                      <span className="text-xs" style={{ color: themeColors.text_sub }}>Create as new instance</span>
                    </label>
                    {mpCreateNew && (
                      <GlassInput value={mpNewName} onChange={setMpNewName} placeholder="New instance name..." />
                    )}
                  </div>
                  <div className="mt-3">
                    <GlassInput value={installMPSearch} onChange={(v) => { setInstallMPSearch(v); if (v.length >= 2) searchMPToInstall(v); else setInstallMPResults([]); }}
                      placeholder="Search modpacks on Modrinth..." />
                  </div>
                  {installMPResults.length > 0 && (
                    <div className="space-y-1 mt-3 max-h-64 overflow-y-auto">
                      {installMPResults.map((mp) => (
                        <div key={mp.slug} className="flex items-center justify-between px-2 py-2 rounded-lg"
                          style={{ background: `${themeColors.bg_card2}`, border: `1px solid ${themeColors.border}` }}>
                          <div className="flex items-center gap-2 min-w-0">
                            {mp.icon_url && <img src={mp.icon_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />}
                            <div className="min-w-0">
                              <div className="text-xs font-medium truncate" style={{ color: themeColors.text_main }}>{mp.title}</div>
                              <div className="text-[9px] truncate" style={{ color: themeColors.text_muted }}>{mp.description?.slice(0, 80)}</div>
                            </div>
                          </div>
                          <GlowButton size="sm" onClick={() => handleInstallMP(mp.slug)}
                            disabled={installingMPSlug === mp.slug} className="shrink-0 flex items-center gap-1">
                            {installingMPSlug === mp.slug ? <Loader size={12} className="animate-spin" /> : <Download size={12} />}
                            {installingMPSlug === mp.slug ? "Installing..." : "Install"}
                          </GlowButton>
                        </div>
                      ))}
                    </div>
                  )}
                </GlassCard>
              </div>
            )}

            {detailTab === "profiles" && (
              <div className="space-y-3">
                <GlassCard>
                  <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Save Current as Profile</h3>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <GlassInput value={profileName} onChange={setProfileName} placeholder="Profile name..." />
                    </div>
                    <GlowButton size="sm" onClick={async () => {
                      if (!profileName.trim() || !selectedDetail) return;
                      setSavingProfile(true);
                      try {
                        await api.profiles.save(selectedDetail, profileName.trim());
                        setProfileName("");
                        const list = await api.profiles.list();
                        setProfiles(list);
                      } catch {}
                      setSavingProfile(false);
                    }} disabled={savingProfile || !profileName.trim()} className="flex items-center gap-1 shrink-0">
                      <Check size={12} /> {savingProfile ? "Saving..." : "Save"}
                    </GlowButton>
                  </div>
                </GlassCard>
                <GlassCard>
                  <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Saved Profiles ({profiles.length})</h3>
                  {profiles.length === 0 ? (
                    <p className="text-xs py-4 text-center" style={{ color: themeColors.text_muted }}>No profiles saved yet</p>
                  ) : (
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {profiles.map((p: any) => (
                        <div key={p.name} className="flex items-center justify-between px-2 py-1.5 rounded-lg"
                          style={{ background: `${themeColors.bg_card2}`, border: `1px solid ${themeColors.border}` }}>
                          <div className="min-w-0">
                            <div className="text-xs font-medium truncate" style={{ color: themeColors.text_main }}>{p.name}</div>
                            {p.description && <div className="text-[9px] truncate" style={{ color: themeColors.text_muted }}>{p.description}</div>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <GlowButton size="sm" onClick={async () => {
                              if (!selectedDetail) return;
                              setApplyingProfile(p.name);
                              setLoading(true, `Applying profile "${p.name}"...`);
                              try {
                                await api.profiles.apply(selectedDetail, p.name);
                                await loadDetailData(selectedDetail);
                              } catch {}
                              setApplyingProfile(null);
                              setLoading(false);
                            }} disabled={applyingProfile === p.name} variant="secondary" className="flex items-center gap-1">
                              {applyingProfile === p.name ? "..." : "Apply"}
                            </GlowButton>
                            <button onClick={async () => {
                              try {
                                await api.profiles.delete(p.name);
                                const list = await api.profiles.list();
                                setProfiles(list);
                              } catch {}
                            }} className="p-0.5" style={{ color: themeColors.danger }}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </GlassCard>
              </div>
            )}

            {detailTab === "customize" && (
              <GlassCard>
                <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Customize Instance</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: themeColors.text_sub }}>Instance Icon</label>
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center"
                        style={{ background: `${themeColors.accent}10`, border: `2px dashed ${themeColors.border}` }}>
                        {instanceIcon ? (
                          <img src={instanceIcon} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Monitor size={24} style={{ color: themeColors.text_muted }} />
                        )}
                      </div>
                      <div className="space-y-2">
                        <GlowButton size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-1" disabled={iconUploading}>
                          <Image size={12} /> {iconUploading ? "Uploading..." : "Upload Image"}
                        </GlowButton>
                        <p className="text-[10px]" style={{ color: themeColors.text_muted }}>PNG or JPG, max 1MB</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs mb-1 block" style={{ color: themeColors.text_sub }}>Instance Name</label>
                    <div className="flex gap-2">
                      <GlassInput value={editingName ? nameValue : detailInstance.name}
                        onChange={setNameValue} disabled={!editingName} />
                      {!editingName ? (
                        <GlowButton size="sm" variant="secondary" onClick={() => { setEditingName(true); setNameValue(detailInstance.name); }} className="shrink-0 flex items-center gap-1">
                          <Edit3 size={12} /> Edit
                        </GlowButton>
                      ) : (
                        <div className="flex gap-1 shrink-0">
                          <GlowButton size="sm" onClick={handleRename} className="flex items-center gap-1">
                            <Check size={12} /> Save
                          </GlowButton>
                          <GlowButton size="sm" variant="secondary" onClick={() => setEditingName(false)}>Cancel</GlowButton>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs mb-1 block" style={{ color: themeColors.text_sub }}>Quick Actions</label>
                    <div className="grid grid-cols-2 gap-2">
                      <GlowButton size="sm" variant="secondary" onClick={() => handleOpenFolder(detailInstance.name)} className="flex items-center justify-center gap-1">
                        <FolderOpen size={12} /> Open Folder
                      </GlowButton>
                      <GlowButton size="sm" variant="secondary" onClick={() => { setPage("tools"); }} className="flex items-center justify-center gap-1">
                        <Zap size={12} /> Optimizer
                      </GlowButton>
                      <GlowButton size="sm" variant="secondary" onClick={() => setPage("mods")} className="flex items-center justify-center gap-1">
                        <Puzzle size={12} /> Browse Mods
                      </GlowButton>
                      <GlowButton size="sm" variant="secondary" onClick={() => setPage("packs")} className="flex items-center justify-center gap-1">
                        <Image size={12} /> Browse Packs
                      </GlowButton>
                    </div>
                  </div>

                  <div className="pt-2" style={{ borderTop: `1px solid ${themeColors.border}` }}>
                    <label className="text-xs mb-1 block" style={{ color: themeColors.text_sub }}>Danger Zone</label>
                    <div className="flex gap-2">
                      {!confirmDelete ? (
                        <GlowButton size="sm" variant="danger" onClick={() => handleDelete(detailInstance.name)} className="flex items-center gap-1">
                          <Trash2 size={12} /> Delete Instance
                        </GlowButton>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs" style={{ color: themeColors.danger }}>Are you sure?</span>
                          <GlowButton size="sm" variant="danger" onClick={() => handleDelete(detailInstance.name)}>Yes, Delete</GlowButton>
                          <GlowButton size="sm" variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</GlowButton>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </GlassCard>
            )}
          </div>
        )}
      </div>
    </div>

      <AnimatePresence>
        {installOverlay && (
          <InstallOverlay
            instanceName={installOverlay.instanceName}
            version={installOverlay.version}
            loader={installOverlay.loader}
            loaderVersion={installOverlay.loaderVersion}
            onClose={handleInstallClose}
            onPlay={handleInstallPlay}
          />
        )}
      </AnimatePresence>
    </>
  );
}

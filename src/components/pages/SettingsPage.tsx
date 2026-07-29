import { useState, useEffect, useRef } from "react";
import { useLauncherStore } from "../../stores";
import { api } from "../../lib/api";
import { GlassCard } from "../ui/GlassCard";
import { GlowButton } from "../ui/GlowButton";
import { GlassInput } from "../ui/FormControls";
import { THEMES } from "../../lib/types";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import {
  Settings as SettingsIcon, Download, Globe, FolderOpen, Bell, Palette,
  Info, RefreshCcw, ExternalLink, Check, X, Save, Image, Film,
  Monitor, Layout, Type, Gamepad2, Sliders, Eye, Paintbrush,
  HardDrive, AlertTriangle, Sun, Moon, Link, Trash2
} from "lucide-react";

const TABS = [
  { id: "general", label: "General", icon: SettingsIcon },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "background", label: "Background", icon: Image },
  { id: "java", label: "Java & Game", icon: Monitor },
  { id: "downloads", label: "Downloads", icon: Download },
  { id: "integrations", label: "Integrations", icon: Globe },
  { id: "directories", label: "Directories", icon: FolderOpen },
  { id: "updates", label: "Updates", icon: RefreshCcw },
  { id: "about", label: "About", icon: Info },
];

export function SettingsPage() {
  const { settings, saveSettings, themeColors, setTheme, themeName, liveVersion, releaseNotes } = useLauncherStore();
  const [tab, setTab] = useState("general");
  const [local, setLocal] = useState<Record<string, any>>({});
  const [saved, setSaved] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ update_available: boolean; latest_version?: string; download_url?: string } | null>(null);
  const bgImageInputRef = useRef<HTMLInputElement>(null);
  const bgVideoInputRef = useRef<HTMLInputElement>(null);
  const [bgPreview, setBgPreview] = useState("");
  const [bgVideoPreview, setBgVideoPreview] = useState("");
  const [bgUrlInput, setBgUrlInput] = useState("");
  const [javaInstallations, setJavaInstallations] = useState<any[]>([]);
  const [downloadingJava, setDownloadingJava] = useState<number | null>(null);
  const [javaDownloadResult, setJavaDownloadResult] = useState<string>("");

  useEffect(() => { setLocal({ ...settings }); }, [settings]);
  useEffect(() => {
    api.java.getInstallations().then(setJavaInstallations).catch(() => {});
  }, []);

  useEffect(() => {
    if (local.launcher_bg_type === "image" && local.launcher_bg_image === "file") {
      api.background.getFilePath().then((p) => { if (p) setBgPreview(convertFileSrc(p)); }).catch(() => {});
    } else if (local.launcher_bg_image && local.launcher_bg_image.startsWith("http")) {
      setBgPreview(local.launcher_bg_image);
    } else if (local.launcher_bg_image && local.launcher_bg_image.startsWith("data:")) {
      setBgPreview(local.launcher_bg_image);
    } else {
      setBgPreview("");
    }
  }, [local.launcher_bg_type, local.launcher_bg_image]);

  useEffect(() => {
    if (local.launcher_bg_type === "video" && local.launcher_bg_video === "file") {
      api.background.getVideoPath().then((p) => { if (p) setBgVideoPreview(convertFileSrc(p)); }).catch(() => {});
    } else if (local.launcher_bg_video && local.launcher_bg_video.startsWith("http")) {
      setBgVideoPreview(local.launcher_bg_video);
    } else {
      setBgVideoPreview("");
    }
  }, [local.launcher_bg_type, local.launcher_bg_video]);

  const set = (key: string, value: any) => setLocal((p) => ({ ...p, [key]: value }));

  const doSave = async () => {
    await saveSettings(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const checkUpdates = async () => {
    try {
      const info = await api.updates.check();
      setUpdateInfo(info);
    } catch {}
  };

  const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        const result = await api.background.saveFile(dataUrl);
        if (result.success) {
          set("launcher_bg_type", "image");
          set("launcher_bg_image", "file");
        }
      } catch (err) {
        console.error("Failed to save bg file:", err);
        set("launcher_bg_type", "image");
        set("launcher_bg_image", dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleBgVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        const result = await api.background.saveVideo(dataUrl);
        if (result.success) {
          set("launcher_bg_type", "video");
          set("launcher_bg_video", "file");
        }
      } catch (err) {
        console.error("Failed to save video file:", err);
        set("launcher_bg_type", "video");
        set("launcher_bg_video", dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const toggle = (key: string) => set(key, !local[key]);
  const Toggle = ({ label, k }: { label: string; k: string }) => (
    <label className="flex items-center justify-between py-1">
      <span className="text-sm" style={{ color: themeColors.text_sub }}>{label}</span>
      <div className="w-10 h-5 rounded-full relative cursor-pointer transition-colors"
        style={{ background: local[k] ? themeColors.accent : themeColors.bg_card2 }}
        onClick={() => toggle(k)}>
        <div className="w-4 h-4 rounded-full absolute top-0.5 transition-all"
          style={{ background: "#fff", left: local[k] ? "22px" : "2px" }} />
      </div>
    </label>
  );

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SettingsIcon size={20} style={{ color: themeColors.accent }} />
          <div>
            <h1 className="tinycaps text-xl font-bold gradient-text" style={{ "--accent": themeColors.accent, "--accent2": themeColors.purple || themeColors.blue } as any}>Settings</h1>
            <p className="text-xs mt-0.5" style={{ color: themeColors.text_muted }}>Configure your launcher</p>
          </div>
        </div>
        <GlowButton onClick={doSave} size="sm" className="flex items-center gap-1">
          {saved ? <Check size={14} /> : <Save size={14} />}
          {saved ? "Saved!" : "Save"}
        </GlowButton>
      </div>

      <div className="flex gap-3">
        <div className="w-40 space-y-1 shrink-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-all"
              style={{
                background: tab === id ? `${themeColors.accent}15` : "transparent",
                color: tab === id ? themeColors.accent : themeColors.text_sub,
                border: tab === id ? `1px solid ${themeColors.accent}30` : "1px solid transparent",
              }}>
              <Icon size={14} /> <span className="tinycaps">{label}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-4 min-w-0">
          {tab === "general" && (
            <div className="space-y-4">
              <GlassCard>
                <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Launcher Behavior</h3>
                <div className="space-y-1">
                  <Toggle label="Close launcher when game starts" k="close_on_start" />
                  <Toggle label="Keep launcher open after game closes" k="keep_open" />
                  <Toggle label="Show development builds" k="show_dev_builds" />
                  <Toggle label="Animations enabled" k="animations_enabled" />
                  <Toggle label="Compact mode" k="compact_mode" />
                  <Toggle label="Auto-check for updates" k="auto_check_updates" />
                  <Toggle label="Force update on next launch" k="force_update" />
                  <Toggle label="Auto-check for mod updates on launch" k="auto_mod_updates" />
                  <Toggle label="Auto-enable resource packs after install" k="auto_enable_rps" />
                </div>
              </GlassCard>
              <GlassCard>
                <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Default Page</h3>
                <select value={local.default_page || "home"} onChange={(e) => set("default_page", e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ background: themeColors.bg_card2, border: `1px solid ${themeColors.border}`, color: themeColors.text_main }}>
                  {["home", "instances", "mods", "packs", "modpacks", "accounts", "tools"].map(p => (
                    <option key={p} value={p} style={{ background: themeColors.bg_card }}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </GlassCard>
              <GlassCard>
                <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Pre/Post Launch Commands</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: themeColors.text_sub }}>Pre-launch command (runs before game)</label>
                    <GlassInput value={local.pre_launch_cmd || ""} onChange={(v) => set("pre_launch_cmd", v)} placeholder="Optional command..." />
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: themeColors.text_sub }}>Post-launch command (runs after game closes)</label>
                    <GlassInput value={local.post_launch_cmd || ""} onChange={(v) => set("post_launch_cmd", v)} placeholder="Optional command..." />
                  </div>
                </div>
              </GlassCard>
              <GlassCard>
                <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Mod Management</h3>
                <div className="space-y-1">
                  <Toggle label="Auto-check for mod updates on launch" k="auto_mod_updates" />
                  <Toggle label="Auto-enable resource packs after install" k="auto_enable_rps" />
                  <Toggle label="Auto-resolve mod dependencies" k="auto_resolve_deps" />
                </div>
              </GlassCard>
            </div>
          )}

          {tab === "appearance" && (
            <div className="space-y-4">
              <GlassCard>
                <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Theme</h3>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(THEMES).map(([name, theme]) => (
                    <button key={name} onClick={() => setTheme(name)}
                      className="p-3 rounded-lg text-left transition-all relative"
                      style={{
                        background: theme.colors.bg_card,
                        border: `2px solid ${themeName === name ? theme.colors.accent : theme.colors.border}`,
                        boxShadow: themeName === name ? `0 0 12px ${theme.colors.accent}30` : "none",
                      }}>
                      <div className="flex gap-1 mb-2">
                        <div className="w-3 h-3 rounded-full" style={{ background: theme.colors.accent }} />
                        <div className="w-3 h-3 rounded-full" style={{ background: theme.colors.purple }} />
                        <div className="w-3 h-3 rounded-full" style={{ background: theme.colors.blue }} />
                      </div>
                      <span className="text-xs font-medium" style={{ color: theme.colors.text_main }}>{theme.display_name}</span>
                      {themeName === name && (
                        <div className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
                          style={{ background: theme.colors.accent }}>
                          <Check size={10} color="#fff" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </GlassCard>
              <GlassCard>
                <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Display Options</h3>
                <div className="space-y-1">
                  <Toggle label="Show play time on home page" k="show_playtime" />
                  <Toggle label="Show system stats on home page" k="show_system_stats" />
                  <Toggle label="Show news on home page" k="show_news_home" />
                </div>
              </GlassCard>
            </div>
          )}

          {tab === "background" && (
            <div className="space-y-4">
              <GlassCard>
                <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Background Type</h3>
                <div className="flex gap-2">
                  {([
                    { value: "default", label: "Theme Default", icon: Paintbrush },
                    { value: "image", label: "Custom Image", icon: Image },
                    { value: "video", label: "Custom Video", icon: Film },
                  ] as const).map(({ value, label, icon: Icon }) => (
                    <button key={value} onClick={() => set("launcher_bg_type", value)}
                      className="flex-1 p-3 rounded-lg text-center transition-all"
                      style={{
                        background: (local.launcher_bg_type || "default") === value ? `${themeColors.accent}15` : themeColors.bg_card2,
                        border: `2px solid ${(local.launcher_bg_type || "default") === value ? themeColors.accent : themeColors.border}`,
                      }}>
                      <Icon size={20} className="mx-auto mb-1" style={{ color: (local.launcher_bg_type || "default") === value ? themeColors.accent : themeColors.text_muted }} />
                      <div className="text-xs font-medium" style={{ color: (local.launcher_bg_type || "default") === value ? themeColors.text_main : themeColors.text_muted }}>{label}</div>
                    </button>
                  ))}
                </div>
              </GlassCard>

              {/* URL Input for images/videos */}
              {(local.launcher_bg_type === "image" || local.launcher_bg_type === "video") && (
                <GlassCard>
                  <h3 className="tinycaps text-sm font-semibold mb-2" style={{ color: themeColors.text_main }}>
                    {local.launcher_bg_type === "image" ? "Image URL" : "Video URL"}
                  </h3>
                  <p className="text-[10px] mb-2" style={{ color: themeColors.text_muted }}>
                    Paste a direct link to an image or video (JPG, PNG, GIF, WebP, MP4, WebM)
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={bgUrlInput}
                      onChange={(e) => setBgUrlInput(e.target.value)}
                      placeholder="https://example.com/image.jpg"
                      className="flex-1 px-3 py-2 rounded-lg text-xs outline-none"
                      style={{ background: themeColors.bg_card2, border: `1px solid ${themeColors.border}`, color: themeColors.text_main }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && bgUrlInput.trim()) {
                          const url = bgUrlInput.trim();
                          if (local.launcher_bg_type === "image") {
                            api.background.deleteFile();
                            set("launcher_bg_image", url);
                          } else {
                            api.background.deleteVideo();
                            set("launcher_bg_video", url);
                          }
                          setBgUrlInput("");
                        }
                        e.stopPropagation();
                      }}
                    />
                    <GlowButton size="sm" onClick={() => {
                      if (bgUrlInput.trim()) {
                        const url = bgUrlInput.trim();
                        if (local.launcher_bg_type === "image") {
                          api.background.deleteFile();
                          set("launcher_bg_image", url);
                        } else {
                          api.background.deleteVideo();
                          set("launcher_bg_video", url);
                        }
                        setBgUrlInput("");
                      }
                    }} className="flex items-center gap-1">
                      <Link size={12} /> Load
                    </GlowButton>
                  </div>
                </GlassCard>
              )}

              {(local.launcher_bg_type === "image") && (
                <GlassCard>
                  <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Background Image</h3>
                  <div className="space-y-3">
                    {bgPreview && (
                      <div className="relative rounded-lg overflow-hidden h-40" style={{ border: `1px solid ${themeColors.border}` }}>
                        <img src={bgPreview} alt="" className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        <button onClick={() => { api.background.deleteFile(); set("launcher_bg_image", ""); set("launcher_bg_type", "default"); }}
                          className="absolute top-2 right-2 p-1.5 rounded-lg flex items-center gap-1 text-xs text-white"
                          style={{ background: `${themeColors.danger}cc` }}>
                          <Trash2 size={12} /> Remove
                        </button>
                      </div>
                    )}
                    <GlowButton size="sm" variant="secondary" onClick={() => bgImageInputRef.current?.click()} className="flex items-center gap-1">
                      <Image size={12} /> {bgPreview ? "Change Image" : "Upload from File"}
                    </GlowButton>
                    <input ref={bgImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleBgImageUpload} />
                  </div>
                </GlassCard>
              )}

              {(local.launcher_bg_type === "video") && (
                <GlassCard>
                  <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Background Video (loops automatically)</h3>
                  <div className="space-y-3">
                    {bgVideoPreview && (
                      <div className="relative rounded-lg overflow-hidden h-40" style={{ border: `1px solid ${themeColors.border}` }}>
                        <video src={bgVideoPreview} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                        <button onClick={() => { api.background.deleteVideo(); set("launcher_bg_video", ""); set("launcher_bg_type", "default"); }}
                          className="absolute top-2 right-2 p-1.5 rounded-lg flex items-center gap-1 text-xs text-white"
                          style={{ background: `${themeColors.danger}cc` }}>
                          <Trash2 size={12} /> Remove
                        </button>
                      </div>
                    )}
                    <GlowButton size="sm" variant="secondary" onClick={() => bgVideoInputRef.current?.click()} className="flex items-center gap-1">
                      <Film size={12} /> {bgVideoPreview ? "Change Video" : "Upload from File"}
                    </GlowButton>
                    <p className="text-[10px]" style={{ color: themeColors.text_muted }}>MP4, WebM. Video will loop continuously.</p>
                    <input ref={bgVideoInputRef} type="file" accept="video/*" className="hidden" onChange={handleBgVideoUpload} />
                  </div>
                </GlassCard>
              )}

              {(local.launcher_bg_type === "image" || local.launcher_bg_type === "video") && (
                <GlassCard>
                  <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Adjustments</h3>
                  <div className="space-y-4">
                    {/* Opacity */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="flex items-center gap-1" style={{ color: themeColors.text_muted }}>
                          <Eye size={12} /> Opacity
                        </span>
                        <span style={{ color: themeColors.accent }}>{local.launcher_bg_opacity ?? 100}%</span>
                      </div>
                      <input type="range" min={5} max={100} value={local.launcher_bg_opacity ?? 100}
                        onChange={(e) => set("launcher_bg_opacity", parseInt(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                        style={{ background: `linear-gradient(to right, ${themeColors.accent} ${((local.launcher_bg_opacity ?? 100) - 5) / 95 * 100}%, rgba(255,255,255,0.1) ${((local.launcher_bg_opacity ?? 100) - 5) / 95 * 100}%)`, accentColor: themeColors.accent }} />
                    </div>

                    {/* Brightness */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="flex items-center gap-1" style={{ color: themeColors.text_muted }}>
                          <Sun size={12} /> Brightness
                        </span>
                        <span style={{ color: themeColors.accent }}>{local.launcher_bg_brightness ?? 100}%</span>
                      </div>
                      <input type="range" min={10} max={200} value={local.launcher_bg_brightness ?? 100}
                        onChange={(e) => set("launcher_bg_brightness", parseInt(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                        style={{ background: `linear-gradient(to right, ${themeColors.accent} ${((local.launcher_bg_brightness ?? 100) - 10) / 190 * 100}%, rgba(255,255,255,0.1) ${((local.launcher_bg_brightness ?? 100) - 10) / 190 * 100}%)`, accentColor: themeColors.accent }} />
                    </div>

                    {/* Blur */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="flex items-center gap-1" style={{ color: themeColors.text_muted }}>
                          <Sliders size={12} /> Blur
                        </span>
                        <span style={{ color: themeColors.accent }}>{local.launcher_bg_blur ?? 0}px</span>
                      </div>
                      <input type="range" min={0} max={30} value={local.launcher_bg_blur ?? 0}
                        onChange={(e) => set("launcher_bg_blur", parseInt(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                        style={{ background: `linear-gradient(to right, ${themeColors.accent} ${(local.launcher_bg_blur ?? 0) / 30 * 100}%, rgba(255,255,255,0.1) ${(local.launcher_bg_blur ?? 0) / 30 * 100}%)`, accentColor: themeColors.accent }} />
                    </div>

                    {/* Dark Dimming Overlay */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="flex items-center gap-1" style={{ color: themeColors.text_muted }}>
                          <Moon size={12} /> Dark Overlay (Dimming)
                        </span>
                        <span style={{ color: themeColors.accent }}>{local.launcher_bg_dimming ?? 0}%</span>
                      </div>
                      <input type="range" min={0} max={80} value={local.launcher_bg_dimming ?? 0}
                        onChange={(e) => set("launcher_bg_dimming", parseInt(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                        style={{ background: `linear-gradient(to right, ${themeColors.accent} ${(local.launcher_bg_dimming ?? 0) / 80 * 100}%, rgba(255,255,255,0.1) ${(local.launcher_bg_dimming ?? 0) / 80 * 100}%)`, accentColor: themeColors.accent }} />
                      <p className="text-[10px] mt-1" style={{ color: themeColors.text_muted }}>
                        Adds a dark overlay on top — useful for light/bright images
                      </p>
                    </div>

                    {/* Fit Mode */}
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: themeColors.text_muted }}>Fit Mode</label>
                      <div className="grid grid-cols-4 gap-1">
                        {(["cover", "contain", "fill", "stretch"] as const).map((mode) => (
                          <button key={mode} onClick={() => set("launcher_bg_fit", mode)}
                            className="px-2 py-1.5 rounded-lg text-[11px] capitalize transition-all"
                            style={{
                              background: (local.launcher_bg_fit || "cover") === mode ? `${themeColors.accent}20` : themeColors.bg_card2,
                              color: (local.launcher_bg_fit || "cover") === mode ? themeColors.accent : themeColors.text_muted,
                              border: `1px solid ${(local.launcher_bg_fit || "cover") === mode ? themeColors.accent : themeColors.border}40`,
                            }}>
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Reset button */}
                    <GlowButton size="sm" variant="secondary" onClick={() => {
                      set("launcher_bg_opacity", 100);
                      set("launcher_bg_brightness", 100);
                      set("launcher_bg_blur", 0);
                      set("launcher_bg_dimming", 0);
                      set("launcher_bg_fit", "cover");
                    }} className="flex items-center gap-1">
                      <RefreshCcw size={12} /> Reset All Adjustments
                    </GlowButton>
                  </div>
                </GlassCard>
              )}

              <GlassCard>
                <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Quick Presets</h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Minecraft Landscape", type: "image", url: "https://cdn.pixabay.com/photo/2016/08/24/21/34/minecraft-1618089_1280.jpg" },
                    { label: "Dark Caves", type: "image", url: "https://cdn.pixabay.com/photo/2021/08/12/06/46/minecraft-6539860_1280.jpg" },
                    { label: "Night Sky", type: "image", url: "https://cdn.pixabay.com/photo/2017/08/30/01/05/milky-way-2695569_1280.jpg" },
                    { label: "Ocean Waves", type: "image", url: "https://cdn.pixabay.com/photo/2016/11/14/04/45/sea-1822458_1280.jpg" },
                    { label: "Forest Path", type: "image", url: "https://cdn.pixabay.com/photo/2016/02/18/22/18/path-1205630_1280.jpg" },
                    { label: "Galaxy", type: "image", url: "https://cdn.pixabay.com/photo/2019/04/06/06/42/galaxy-4106300_1280.jpg" },
                    { label: "Anime Sunset", type: "image", url: "https://cdn.pixabay.com/photo/2017/02/01/09/17/background-2029999_1280.jpg" },
                    { label: "Default Dark", type: "default", url: "" },
                  ].map((preset) => (
                    <button key={preset.label} onClick={() => {
                      api.background.deleteFile();
                      api.background.deleteVideo();
                      if (preset.type === "default") {
                        set("launcher_bg_type", "default");
                        set("launcher_bg_image", "");
                        set("launcher_bg_video", "");
                      } else {
                        set("launcher_bg_type", "image");
                        set("launcher_bg_image", preset.url);
                      }
                    }}
                      className="p-3 rounded-lg text-left text-xs transition-all"
                      style={{ background: themeColors.bg_card2, border: `1px solid ${(local.launcher_bg_type || "default") === preset.type && (preset.type === "default" || local.launcher_bg_image === preset.url) ? themeColors.accent : themeColors.border}` }}>
                      <span style={{ color: themeColors.text_main }}>{preset.label}</span>
                    </button>
                  ))}
                </div>
              </GlassCard>
            </div>
          )}

          {tab === "java" && (
            <div className="space-y-4">
              <GlassCard>
                <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Java Settings</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: themeColors.text_sub }}>Java Path (empty for auto-detect)</label>
                    <GlassInput value={local.java_path || ""} onChange={(v) => set("java_path", v)} placeholder="Auto-detect" />
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: themeColors.text_sub }}>JVM Arguments</label>
                    <GlassInput value={local.jvm_args || ""} onChange={(v) => set("jvm_args", v)} placeholder="-Xmx2G -Xms1G" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: themeColors.text_sub }}>Min Memory (MB)</label>
                      <GlassInput value={String(local.min_memory || 2048)} onChange={(v) => set("min_memory", parseInt(v) || 2048)} />
                    </div>
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: themeColors.text_sub }}>Max Memory (MB)</label>
                      <GlassInput value={String(local.max_memory || 4096)} onChange={(v) => set("max_memory", parseInt(v) || 4096)} />
                    </div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <HardDrive size={16} style={{ color: themeColors.accent }} />
                    <h3 className="tinycaps text-sm font-semibold" style={{ color: themeColors.text_main }}>Java Installations</h3>
                  </div>
                  <GlowButton size="sm" variant="secondary" onClick={() => api.java.getInstallations().then(setJavaInstallations).catch(() => {})} className="flex items-center gap-1">
                    <RefreshCcw size={12} /> Refresh
                  </GlowButton>
                </div>
                {javaInstallations.length === 0 ? (
                  <div className="px-3 py-2 rounded-lg text-xs" style={{ background: `${themeColors.warn}10`, color: themeColors.warn, border: `1px solid ${themeColors.warn}20` }}>
                    No Java installations detected. Install Java or click Download below.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {javaInstallations.map((j, idx) => (
                      <div key={idx} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                        style={{ background: themeColors.bg_card2, border: `1px solid ${themeColors.border}` }}>
                        <HardDrive size={14} style={{ color: j.managed ? themeColors.success : themeColors.blue }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate" style={{ color: themeColors.text_main }}>{j.name}</div>
                          <div className="text-[10px] truncate" style={{ color: themeColors.text_muted }}>{j.path}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 rounded" style={{
                            background: j.managed ? `${themeColors.success}20` : `${themeColors.blue}20`,
                            color: j.managed ? themeColors.success : themeColors.blue,
                          }}>
                            Java {j.major_version}
                          </span>
                          {j.managed && <span className="text-[10px]" style={{ color: themeColors.text_muted }}>Managed</span>}
                          {String(local.java_path || "") === j.path && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${themeColors.accent}20`, color: themeColors.accent }}>Active</span>
                          )}
                          <button onClick={() => { set("java_path", j.path); }}
                            className="text-[10px] px-2 py-0.5 rounded transition-all"
                            style={{ background: `${themeColors.accent}15`, color: themeColors.accent, border: `1px solid ${themeColors.accent}30` }}>
                            Use
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>

              <GlassCard>
                <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Auto-Download Java</h3>
                <p className="text-xs mb-3" style={{ color: themeColors.text_muted }}>
                  Download the correct Java version for your Minecraft version. The launcher will also auto-download when launching.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { version: 8, desc: "MC 1.8 – 1.16.x" },
                    { version: 16, desc: "MC 1.17.x" },
                    { version: 17, desc: "MC 1.18 – 1.20.x" },
                    { version: 21, desc: "MC 1.21+" },
                  ].map(({ version, desc }) => (
                    <button key={version}
                      onClick={async () => {
                        setDownloadingJava(version);
                        setJavaDownloadResult("");
                        try {
                          const result = await api.java.download(version);
                          if (result.success) {
                            setJavaDownloadResult(`Java ${version} downloaded successfully!`);
                            const updated = await api.java.getInstallations();
                            setJavaInstallations(updated);
                          } else {
                            setJavaDownloadResult(`Failed: ${result.error}`);
                          }
                        } catch (e: any) {
                          setJavaDownloadResult(`Error: ${e.message}`);
                        }
                        setDownloadingJava(null);
                      }}
                      disabled={downloadingJava !== null}
                      className="p-3 rounded-lg text-left transition-all flex items-center gap-3"
                      style={{ background: themeColors.bg_card2, border: `1px solid ${themeColors.border}` }}>
                      {downloadingJava === version ? (
                        <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: `${themeColors.accent} transparent`, borderTopColor: themeColors.accent }} />
                      ) : (
                        <Download size={16} style={{ color: themeColors.accent }} />
                      )}
                      <div>
                        <div className="text-xs font-medium" style={{ color: themeColors.text_main }}>Java {version}</div>
                        <div className="text-[10px]" style={{ color: themeColors.text_muted }}>{desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
                {javaDownloadResult && (
                  <div className="mt-3 px-3 py-2 rounded-lg text-xs" style={{
                    background: javaDownloadResult.includes("Failed") || javaDownloadResult.includes("Error") ? `${themeColors.danger}10` : `${themeColors.success}10`,
                    color: javaDownloadResult.includes("Failed") || javaDownloadResult.includes("Error") ? themeColors.danger : themeColors.success,
                    border: `1px solid ${javaDownloadResult.includes("Failed") || javaDownloadResult.includes("Error") ? themeColors.danger : themeColors.success}20`,
                  }}>
                    {javaDownloadResult}
                  </div>
                )}
              </GlassCard>

              <GlassCard>
                <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Game Window</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: themeColors.text_sub }}>Resolution Width</label>
                      <GlassInput value={String(local.game_resolution_width || 854)} onChange={(v) => set("game_resolution_width", parseInt(v) || 854)} />
                    </div>
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: themeColors.text_sub }}>Resolution Height</label>
                      <GlassInput value={String(local.game_resolution_height || 480)} onChange={(v) => set("game_resolution_height", parseInt(v) || 480)} />
                    </div>
                  </div>
                  <Toggle label="Start in fullscreen" k="game_fullscreen" />
                </div>
              </GlassCard>
              <GlassCard>
                <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Performance Defaults</h3>
                <div className="space-y-1">
                  <Toggle label="Auto-configure game settings for FPS" k="perf_game_config" />
                  <Toggle label="Aggressive JVM optimization" k="perf_jvm_aggressive" />
                  <Toggle label="Auto-install 20 best FPS performance mods" k="perf_auto_mods" />
                  <Toggle label="RAM optimization" k="perf_ram_opt" />
                </div>
                {local.perf_auto_mods && (
                  <div className="mt-3 px-3 py-2 rounded-lg text-[10px]" style={{ background: `${themeColors.success}10`, color: themeColors.success, border: `1px solid ${themeColors.success}20` }}>
                    Will auto-install Sodium, Lithium, FerriteCore, Starlight, EntityCulling, and 15 more FPS mods when installing Fabric/Forge instances.
                  </div>
                )}
              </GlassCard>
              <GlassCard>
                <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Game Boost</h3>
                <div className="space-y-1">
                  <Toggle label="Kill unnecessary background processes" k="boost_kill_processes" />
                  <Toggle label="Clear temp folders" k="boost_clear_temp" />
                  <Toggle label="Empty recycle bin" k="boost_empty_recycle" />
                  <Toggle label="Flush DNS cache" k="boost_flush_dns" />
                  <Toggle label="Clear thumbnail cache" k="boost_clear_thumbs" />
                  <Toggle label="Optimize system memory" k="boost_optimize_memory" />
                </div>
                <div className="mt-3 px-3 py-2 rounded-lg text-[10px]" style={{ background: `${themeColors.accent}10`, color: themeColors.text_sub, border: `1px solid ${themeColors.accent}20` }}>
                  Each boost step is off by default. Enable only what you want Game Boost to do when launching.
                </div>
              </GlassCard>
              <GlassCard>
                <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>In-Game Defaults</h3>
                <div className="space-y-1">
                  <Toggle label="Disable VSync" k="def_vsync_off" />
                  <Toggle label="Disable music" k="def_no_music" />
                  <Toggle label="Enable gamma/brightness" k="def_gamma" />
                  <Toggle label="Full bright mode" k="def_full_bright" />
                </div>
              </GlassCard>
            </div>
          )}

          {tab === "downloads" && (
            <GlassCard>
              <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Download Settings</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: themeColors.text_sub }}>Concurrent Downloads</label>
                  <GlassInput value={String(local.concurrent_downloads || 8)} onChange={(v) => set("concurrent_downloads", parseInt(v) || 8)} />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: themeColors.text_sub }}>Download Speed Limit (KB/s, 0 = unlimited)</label>
                  <GlassInput value={String(local.download_speed_limit || 0)} onChange={(v) => set("download_speed_limit", parseInt(v) || 0)} />
                </div>
                <Toggle label="Skip already downloaded files" k="skip_existing" />
              </div>
            </GlassCard>
          )}

          {tab === "integrations" && (
              <GlassCard>
                <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Integrations</h3>
                <div className="space-y-1">
                  <Toggle label="Use authlib-injector for Ely.by skins" k="use_authlib" />
                  <Toggle label="Show Ely.by accounts in account switcher" k="show_elyby" />
                  <Toggle label="Discord Rich Presence" k="discord_rpc" />
                </div>
                {local.discord_rpc && (
                  <div className="mt-3 px-3 py-2 rounded-lg text-[10px]" style={{ background: `${themeColors.blue}10`, color: themeColors.blue, border: `1px solid ${themeColors.blue}20` }}>
                    Shows your launcher activity and currently playing Minecraft instance on your Discord profile.
                  </div>
                )}
              </GlassCard>
          )}

          {tab === "directories" && (
            <GlassCard>
              <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Directories</h3>
              <div className="space-y-3">
                {[
                  { key: "game_directory", label: "Minecraft Directory" },
                  { key: "java_directory", label: "Java Directory" },
                  { key: "mods_directory", label: "Mods Directory" },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-xs mb-1 block" style={{ color: themeColors.text_sub }}>{label}</label>
                    <GlassInput value={local[key] || ""} onChange={(v) => set(key, v)} disabled />
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {tab === "updates" && (
            <GlassCard>
              <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Updates</h3>
              <div className="space-y-3">
                <Toggle label="Auto-check for updates on startup" k="auto_check_updates" />
                <GlowButton size="sm" onClick={checkUpdates} className="flex items-center gap-1">
                  <RefreshCcw size={14} /> Check for Updates
                </GlowButton>
                {updateInfo && (
                  <div className="px-3 py-2 rounded-lg text-sm"
                    style={{ background: updateInfo.update_available ? `${themeColors.warn}15` : `${themeColors.success}15`, color: updateInfo.update_available ? themeColors.warn : themeColors.success }}>
                    {updateInfo.update_available ? `Update available: ${updateInfo.latest_version}` : "You are up to date!"}
                  </div>
                )}
              </div>
            </GlassCard>
          )}

          {tab === "about" && (
            <GlassCard>
              <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>About EcLauncher</h3>
              <div className="space-y-2 text-sm" style={{ color: themeColors.text_sub }}>
                <p>Version: {liveVersion || "5.9"} (Tauri Rewrite)</p>
                <p>Author: EscapeXOG</p>
                <p>License: MIT</p>
                <div className="pt-2 flex gap-2">
                  <a href="https://github.com/EscapeXOG/EcLauncher" target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
                    style={{ color: themeColors.accent, border: `1px solid ${themeColors.border}` }}>
                    <ExternalLink size={12} /> GitHub
                  </a>
                </div>
              </div>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}

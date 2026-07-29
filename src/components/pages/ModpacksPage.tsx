import { useState, useRef, useCallback, useEffect } from "react";
import { useLauncherStore } from "../../stores";
import { api } from "../../lib/api";
import { GlassCard } from "../ui/GlassCard";
import { GlowButton } from "../ui/GlowButton";
import { GlassInput } from "../ui/FormControls";
import { Search, Download, ExternalLink, ChevronDown, ChevronUp, AlertCircle, Box, Eye } from "lucide-react";

export function ModpacksPage() {
  const { themeColors, instances, selectedInstance, setSelectedInstance } = useLauncherStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [detailProject, setDetailProject] = useState<any>(null);
  const [detailVersions, setDetailVersions] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  const targetInstance = instances.find((i) => i.name === selectedInstance);

  const doSearch = useCallback(async (q: string) => {
    setSearching(true);
    setError(null);
    setHasSearched(true);
    try {
      const hits = await api.mods.search(q, "modpack", undefined, undefined, 20);
      setResults(hits);
    } catch (err: any) {
      console.error("Search failed:", err);
      setError(err?.toString() || "Search failed");
      setResults([]);
    }
    setSearching(false);
  }, []);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      doSearch("");
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      doSearch(query);
    }
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      doSearch("");
      setHasSearched(false);
      return;
    }
    debounceRef.current = setTimeout(() => doSearch(query), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  const handleInstall = async (slug: string) => {
    if (!targetInstance) return;
    setInstalling(slug);
    try {
      await api.mods.installModpack(targetInstance.name, slug);
    } catch (err) {
      console.error("Install failed:", err);
    }
    setInstalling(null);
  };

  const handleView = async (slug: string) => {
    setDetailLoading(true);
    try {
      const [project, versions] = await Promise.all([
        api.mods.getProject(slug),
        api.mods.getVersions(slug),
      ]);
      setDetailProject(project);
      setDetailVersions(Array.isArray(versions) ? versions : []);
    } catch (err) {
      console.error("Failed to load project:", err);
    }
    setDetailLoading(false);
  };

  const handleInstallVersion = async (slug: string, versionId: string) => {
    if (!targetInstance) return;
    setInstalling(versionId);
    try {
      await api.mods.installModpack(targetInstance.name, slug, versionId);
    } catch (err) {
      console.error("Install failed:", err);
    }
    setInstalling(null);
  };

  if (detailProject) {
    return (
      <div className="space-y-5 max-w-4xl mx-auto">
        <button onClick={() => setDetailProject(null)} className="text-sm flex items-center gap-1" style={{ color: themeColors.accent }}>
          &larr; Back to search
        </button>
        <GlassCard>
          <div className="flex items-start gap-4">
            {detailProject.icon_url && (
              <img src={detailProject.icon_url} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
            )}
            <div className="flex-1">
              <h1 className="tinycaps text-xl font-bold" style={{ color: themeColors.text_main }}>{detailProject.title}</h1>
              <p className="text-sm mt-1" style={{ color: themeColors.text_sub }}>{detailProject.description}</p>
              <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: themeColors.text_muted }}>
                <span style={{ color: themeColors.accent }}>↓ {detailProject.downloads?.toLocaleString()}</span>
                {detailProject.author && <span>by {detailProject.author}</span>}
              </div>
              <div className="flex gap-2 mt-3">
                <GlowButton onClick={() => targetInstance && handleInstall(detailProject.slug)} disabled={!targetInstance} size="sm">
                  <Download size={14} className="inline mr-1" /> Install Latest
                </GlowButton>
                {detailProject.source_url && (
                  <a href={detailProject.source_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
                    style={{ color: themeColors.text_muted, border: `1px solid ${themeColors.border}` }}>
                    <ExternalLink size={12} /> Source
                  </a>
                )}
              </div>
            </div>
          </div>
        </GlassCard>
        <GlassCard>
          <h3 className="tinycaps text-sm font-semibold mb-3" style={{ color: themeColors.text_main }}>Available Versions</h3>
          {detailVersions.length === 0 ? (
            <p className="text-xs py-4 text-center" style={{ color: themeColors.text_muted }}>No versions available</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {detailVersions.map((v: any) => {
                const typeColor = v.version_type === "release" ? themeColors.success
                  : v.version_type === "beta" ? themeColors.warn : themeColors.danger;
                return (
                  <div key={v.id} className="flex items-center justify-between px-3 py-2 rounded-lg"
                    style={{ border: `1px solid ${themeColors.border}` }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium" style={{ color: themeColors.text_main }}>{v.version_number || v.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${typeColor}20`, color: typeColor }}>{v.version_type}</span>
                      </div>
                      <p className="text-[10px] mt-0.5" style={{ color: themeColors.text_muted }}>
                        MC {v.game_versions?.join(", ") || "Unknown"}
                      </p>
                    </div>
                    <GlowButton size="sm" onClick={() => handleInstallVersion(detailProject.slug, v.id)}
                      disabled={!targetInstance || installing === v.id}>
                      {installing === v.id ? "Installing..." : "Install"}
                    </GlowButton>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center gap-2">
        <Box size={20} style={{ color: themeColors.accent }} />
        <div>
          <h1 className="tinycaps text-xl font-bold gradient-text" style={{ "--accent": themeColors.accent, "--accent2": themeColors.purple || themeColors.blue } as any}>Modpacks</h1>
          <p className="text-xs mt-0.5" style={{ color: themeColors.text_muted }}>Browse and install modpacks for your profiles</p>
        </div>
      </div>

      {instances.length > 0 && (
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: themeColors.text_sub }}>Target Instance</label>
          <select value={selectedInstance} onChange={(e) => setSelectedInstance(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
            style={{ background: themeColors.bg_card2, border: `1px solid ${themeColors.border}`, color: themeColors.text_main }}>
            <option value="" style={{ background: themeColors.bg_card }}>Select instance...</option>
            {instances.filter((i) => i.installed).map((inst) => (
              <option key={inst.name} value={inst.name} style={{ background: themeColors.bg_card }}>{inst.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-2">
        <div className="flex-1">
          <GlassInput value={query} onChange={setQuery} onKeyDown={handleKeyDown}
            placeholder="Search modpacks (e.g. cobblemon, all the mods)..." />
        </div>
        <GlowButton onClick={() => doSearch(query)} disabled={searching || !query.trim()} size="sm" className="flex items-center gap-1 shrink-0">
          <Search size={14} /> {searching ? "Searching..." : "Search"}
        </GlowButton>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: `${themeColors.danger}15`, color: themeColors.danger }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {searching && results.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: themeColors.accent, borderTopColor: "transparent" }} />
          <span className="ml-3 text-sm" style={{ color: themeColors.text_muted }}>Searching Modrinth...</span>
        </div>
      )}

      <div className="space-y-2">
        {results.map((modpack) => {
          const isOpen = expanded === modpack.slug;
          return (
            <GlassCard key={modpack.slug} hover>
              <div className="flex items-start gap-3 cursor-pointer" onClick={() => setExpanded(isOpen ? null : modpack.slug)}>
                {modpack.icon_url && <img src={modpack.icon_url} alt={modpack.title} className="w-10 h-10 rounded-lg object-cover shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="tinycaps text-sm font-semibold truncate" style={{ color: themeColors.text_main }}>{modpack.title}</h3>
                    {isOpen ? <ChevronUp size={14} style={{ color: themeColors.text_muted }} /> : <ChevronDown size={14} style={{ color: themeColors.text_muted }} />}
                  </div>
                  <p className="text-xs mt-0.5 line-clamp-2" style={{ color: themeColors.text_sub }}>{modpack.description}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px]" style={{ color: themeColors.text_muted }}>
                    <span style={{ color: themeColors.accent }}>↓ {modpack.downloads?.toLocaleString() || 0}</span>
                    {modpack.categories && <span>{modpack.categories.slice(0, 3).join(", ")}</span>}
                  </div>
                </div>
              </div>
              {isOpen && (
                <div className="mt-3 pt-3 flex gap-2 items-center" style={{ borderTop: `1px solid ${themeColors.border}` }}>
                  <GlowButton size="sm" onClick={(e) => { e.stopPropagation(); handleView(modpack.slug); }} className="flex items-center gap-1">
                    <Eye size={12} /> View
                  </GlowButton>
                  <GlowButton size="sm" onClick={(e) => { e.stopPropagation(); handleInstall(modpack.slug); }}
                    disabled={!targetInstance || installing === modpack.slug} className="flex items-center gap-1">
                    <Download size={12} /> {installing === modpack.slug ? "Installing..." : "Install"}
                  </GlowButton>
                </div>
              )}
            </GlassCard>
          );
        })}

        {!searching && results.length === 0 && hasSearched && (
          <div className="text-center py-12">
            <Box size={32} className="mx-auto mb-2" style={{ color: themeColors.text_muted, opacity: 0.4 }} />
            <p className="text-sm" style={{ color: themeColors.text_muted }}>No modpacks found for "{query}"</p>
          </div>
        )}

        {!searching && results.length === 0 && !hasSearched && (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: themeColors.accent, borderTopColor: "transparent" }} />
            <span className="ml-3 text-sm" style={{ color: themeColors.text_muted }}>Loading popular modpacks...</span>
          </div>
        )}
      </div>
    </div>
  );
}

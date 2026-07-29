import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLauncherStore } from "../../stores";
import { api } from "../../lib/api";
import { GlassCard } from "../ui/GlassCard";
import { GlowButton } from "../ui/GlowButton";
import { GlassInput } from "../ui/FormControls";
import { Layout, Search, Download, Check, Filter, Package, Puzzle } from "lucide-react";

interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  mods: { slug: string; name: string }[];
}

const categories = ["All", "Fabric", "Forge", "Vanilla", "Server"];

export function TemplatesPage() {
  const { themeColors, instances, selectedInstance, setLoading } = useLauncherStore();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoadingState] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [confirmTemplate, setConfirmTemplate] = useState<Template | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string>(selectedInstance || "");

  useEffect(() => {
    setLoadingState(true);
    api.templates.get().then((res) => {
      setTemplates(res.templates || []);
      setLoadingState(false);
    }).catch(() => setLoadingState(false));
  }, []);

  useEffect(() => {
    if (selectedInstance && !selectedTarget) {
      setSelectedTarget(selectedInstance);
    }
  }, [selectedInstance]);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase());
      const matchCategory = activeCategory === "All" || t.category.toLowerCase() === activeCategory.toLowerCase();
      return matchSearch && matchCategory;
    });
  }, [templates, search, activeCategory]);

  const handleApply = async (template: Template) => {
    if (!selectedTarget) {
      alert("Please select an instance first");
      return;
    }
    setApplyingId(template.id);
    setLoading(true, `Applying template "${template.name}"...`);
    try {
      const result = await api.templates.apply(selectedTarget, template.id);
      if (result.success) {
        alert(`Template "${template.name}" applied! ${result.installed} mod(s) installed.`);
      } else {
        alert(`Template applied with ${result.errors} error(s).`);
      }
    } catch (err) {
      console.error("Failed to apply template:", err);
      alert("Failed to apply template");
    }
    setApplyingId(null);
    setLoading(false);
    setConfirmTemplate(null);
  };

  const installedInstances = instances.filter((i) => i.installed);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layout size={20} style={{ color: themeColors.accent }} />
          <div>
            <h1 className="tinycaps text-xl font-bold gradient-text" style={{ "--accent": themeColors.accent, "--accent2": themeColors.purple || themeColors.blue } as any}>Template Browser</h1>
            <p className="text-xs mt-0.5" style={{ color: themeColors.text_muted }}>
              Browse and apply pre-configured instance templates
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedTarget}
            onChange={(e) => setSelectedTarget(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs outline-none tinycaps"
            style={{ background: themeColors.bg_card2, border: `1px solid ${themeColors.border}`, color: themeColors.text_main }}
          >
            <option value="" style={{ background: themeColors.bg_card }}>Select target instance...</option>
            {installedInstances.map((inst) => (
              <option key={inst.name} value={inst.name} style={{ background: themeColors.bg_card }}>{inst.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <GlassInput value={search} onChange={setSearch} placeholder="Search templates..." />
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: themeColors.text_muted }} />
        </div>
      </div>

      <div className="flex gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className="px-4 py-2 rounded-xl text-xs font-bold tinycaps transition-all"
            style={{
              background: activeCategory === cat ? `${themeColors.accent}20` : `${themeColors.bg_card2}`,
              color: activeCategory === cat ? themeColors.accent : themeColors.text_muted,
              border: activeCategory === cat ? `1px solid ${themeColors.accent}35` : `1px solid ${themeColors.border}`,
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: themeColors.accent, borderTopColor: "transparent" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 rounded-3xl" style={{ background: `${themeColors.bg_card}80`, border: `1px solid ${themeColors.border}30` }}>
          <Layout size={40} className="mx-auto mb-3 opacity-30" style={{ color: themeColors.text_muted }} />
          <p className="text-sm font-medium mb-1" style={{ color: themeColors.text_muted }}>No templates found</p>
          <p className="text-xs" style={{ color: themeColors.text_muted, opacity: 0.6 }}>Try a different search or category</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <AnimatePresence>
            {filtered.map((template, i) => (
              <motion.div
                key={template.id}
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3, delay: i * 0.05, ease: [0.4, 0, 0.2, 1] }}
              >
                <GlassCard
                  hover
                  className="h-full flex flex-col"
                  onClick={() => setConfirmTemplate(template)}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                      style={{ background: `${themeColors.accent}12`, border: `1px solid ${themeColors.accent}25` }}>
                      {template.icon || "📦"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="tinycaps text-sm font-bold truncate" style={{ color: themeColors.text_main }}>{template.name}</h3>
                      <span className="text-[9px] px-2 py-0.5 rounded-full inline-block mt-1"
                        style={{ background: `${themeColors.blue}15`, color: themeColors.blue, border: `1px solid ${themeColors.blue}25` }}>
                        {template.category}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs mb-3 flex-1" style={{ color: themeColors.text_muted }}>
                    {template.description}
                  </p>
                  <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${themeColors.border}` }}>
                    <div className="flex items-center gap-1 text-[10px]" style={{ color: themeColors.text_muted }}>
                      <Puzzle size={10} />
                      {template.mods.length} mod{template.mods.length !== 1 ? "s" : ""}
                    </div>
                    <GlowButton
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setConfirmTemplate(template); }}
                      disabled={applyingId === template.id}
                      className="flex items-center gap-1"
                    >
                      {applyingId === template.id ? "..." : <><Download size={10} /> Apply</>}
                    </GlowButton>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {confirmTemplate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
            onClick={() => setConfirmTemplate(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md"
            >
              <GlassCard>
                <div className="text-center mb-4">
                  <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center text-3xl mb-3"
                    style={{ background: `${themeColors.accent}15`, border: `1px solid ${themeColors.accent}30` }}>
                    {confirmTemplate.icon || "📦"}
                  </div>
                  <h3 className="tinycaps text-lg font-bold" style={{ color: themeColors.text_main }}>{confirmTemplate.name}</h3>
                  <p className="text-xs mt-1" style={{ color: themeColors.text_muted }}>{confirmTemplate.description}</p>
                </div>

                <div className="mb-4 p-3 rounded-xl" style={{ background: `${themeColors.bg_card2}`, border: `1px solid ${themeColors.border}` }}>
                  <div className="text-[10px] tinycaps font-bold mb-2" style={{ color: themeColors.text_muted }}>INCLUDED MODS</div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {confirmTemplate.mods.map((mod) => (
                      <div key={mod.slug} className="flex items-center gap-2 text-xs" style={{ color: themeColors.text_main }}>
                        <Puzzle size={10} style={{ color: themeColors.accent }} />
                        {mod.name}
                      </div>
                    ))}
                  </div>
                </div>

                {!selectedTarget && (
                  <div className="mb-4">
                    <label className="text-xs mb-1 block tinycaps" style={{ color: themeColors.text_sub }}>Target Instance</label>
                    <select
                      value={selectedTarget}
                      onChange={(e) => setSelectedTarget(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl text-xs outline-none tinycaps"
                      style={{ background: themeColors.bg_card2, border: `1px solid ${themeColors.border}`, color: themeColors.text_main }}
                    >
                      <option value="" style={{ background: themeColors.bg_card }}>Select an instance...</option>
                      {installedInstances.map((inst) => (
                        <option key={inst.name} value={inst.name} style={{ background: themeColors.bg_card }}>{inst.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex gap-2">
                  <GlowButton onClick={() => setConfirmTemplate(null)} variant="secondary" className="flex-1">
                    Cancel
                  </GlowButton>
                  <GlowButton onClick={() => handleApply(confirmTemplate)} className="flex-1 flex items-center justify-center gap-1">
                    <Download size={12} /> Apply Template
                  </GlowButton>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

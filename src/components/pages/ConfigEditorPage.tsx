import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLauncherStore } from "../../stores";
import { api } from "../../lib/api";
import { GlassCard } from "../ui/GlassCard";
import { GlowButton } from "../ui/GlowButton";
import { FileText, Settings, Code, Save, X, FolderOpen } from "lucide-react";

interface ConfigFile {
  name: string;
  path: string;
  size: number;
  type: string;
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "properties") return Settings;
  if (ext === "toml") return FileText;
  if (ext === "json") return Code;
  if (ext === "yml" || ext === "yaml") return FileText;
  if (ext === "cfg") return Settings;
  if (ext === "txt") return FileText;
  if (ext === "xml") return Code;
  return FileText;
}

function getFileColor(name: string, themeColors: any) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "properties") return themeColors.success;
  if (ext === "toml") return themeColors.blue;
  if (ext === "json") return themeColors.warn;
  if (ext === "yml" || ext === "yaml") return themeColors.purple;
  if (ext === "cfg") return themeColors.accent;
  return themeColors.text_muted;
}

function highlightProperties(content: string, themeColors: any) {
  const lines = content.split("\n");
  return lines.map((line, i) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("#") || trimmed.startsWith("//")) {
      return <div key={i} style={{ color: themeColors.text_muted, opacity: 0.6 }}>{line}</div>;
    }
    const eqIdx = line.indexOf("=");
    if (eqIdx !== -1) {
      const key = line.substring(0, eqIdx + 1);
      const val = line.substring(eqIdx + 1);
      return (
        <div key={i}>
          <span style={{ color: themeColors.accent }}>{key}</span>
          <span style={{ color: themeColors.text_muted }}>{val}</span>
        </div>
      );
    }
    return <div key={i} style={{ color: themeColors.text_main }}>{line}</div>;
  });
}

export function ConfigEditorPage() {
  const { themeColors, selectedInstance, instances, setPage, setLoading } = useLauncherStore();
  const [targetInstance, setTargetInstance] = useState(selectedInstance || "");
  const [files, setFiles] = useState<ConfigFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<ConfigFile | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const loadFiles = useCallback(async (instanceName: string) => {
    if (!instanceName) return;
    setLoadingFiles(true);
    setSelectedFile(null);
    setFileContent("");
    setOriginalContent("");
    setHasChanges(false);
    try {
      const res = await api.configEditor.getFiles(instanceName);
      setFiles(res.files || []);
    } catch (err) {
      console.error("Failed to load config files:", err);
      setFiles([]);
    }
    setLoadingFiles(false);
  }, []);

  useEffect(() => {
    if (targetInstance) loadFiles(targetInstance);
  }, [targetInstance, loadFiles]);

  useEffect(() => {
    if (selectedInstance && !targetInstance) {
      setTargetInstance(selectedInstance);
    }
  }, [selectedInstance]);

  const loadFileContent = async (file: ConfigFile) => {
    if (!targetInstance) return;
    setSelectedFile(file);
    setLoadingContent(true);
    try {
      const res = await api.configEditor.readFile(targetInstance, file.path);
      setFileContent(res.content);
      setOriginalContent(res.content);
      setHasChanges(false);
    } catch (err) {
      console.error("Failed to load file:", err);
    }
    setLoadingContent(false);
  };

  const handleContentChange = (newContent: string) => {
    setFileContent(newContent);
    setHasChanges(newContent !== originalContent);
  };

  const handleSave = async () => {
    if (!targetInstance || !selectedFile) return;
    setSaving(true);
    setLoading(true, `Saving ${selectedFile.name}...`);
    try {
      const res = await api.configEditor.writeFile(targetInstance, selectedFile.path, fileContent);
      if (res.success) {
        setOriginalContent(fileContent);
        setHasChanges(false);
        setBackupNotice(`${selectedFile.name}.bak`);
        setTimeout(() => setBackupNotice(null), 4000);
      } else {
        alert(`Save failed: ${res.error}`);
      }
    } catch (err) {
      console.error("Failed to save file:", err);
    }
    setSaving(false);
    setLoading(false);
  };

  const installedInstances = instances.filter((i) => i.installed);

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings size={20} style={{ color: themeColors.accent }} />
          <div>
            <h1 className="tinycaps text-xl font-bold gradient-text" style={{ "--accent": themeColors.accent, "--accent2": themeColors.purple || themeColors.blue } as any}>Config Editor</h1>
            <p className="text-xs mt-0.5" style={{ color: themeColors.text_muted }}>
              Edit instance configuration files
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={targetInstance}
            onChange={(e) => setTargetInstance(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs outline-none tinycaps"
            style={{ background: themeColors.bg_card2, border: `1px solid ${themeColors.border}`, color: themeColors.text_main }}
          >
            <option value="" style={{ background: themeColors.bg_card }}>Select instance...</option>
            {installedInstances.map((inst) => (
              <option key={inst.name} value={inst.name} style={{ background: themeColors.bg_card }}>{inst.name}</option>
            ))}
          </select>
        </div>
      </div>

      {!targetInstance ? (
        <div className="text-center py-16 rounded-3xl" style={{ background: `${themeColors.bg_card}80`, border: `1px solid ${themeColors.border}30` }}>
          <FolderOpen size={40} className="mx-auto mb-3 opacity-30" style={{ color: themeColors.text_muted }} />
          <p className="text-sm font-medium mb-1" style={{ color: themeColors.text_muted }}>Select an instance to edit configs</p>
        </div>
      ) : (
        <div className="flex gap-4" style={{ height: "calc(100vh - 180px)" }}>
          <div className="w-64 shrink-0">
            <GlassCard className="h-full overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
              <h3 className="tinycaps text-xs font-bold mb-3" style={{ color: themeColors.text_muted }}>CONFIG FILES</h3>
              {loadingFiles ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: themeColors.accent, borderTopColor: "transparent" }} />
                </div>
              ) : files.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: themeColors.text_muted }}>No config files found</p>
              ) : (
                <div className="space-y-1">
                  {files.map((file) => {
                    const Icon = getFileIcon(file.name);
                    const color = getFileColor(file.name, themeColors);
                    const isSelected = selectedFile?.path === file.path;
                    return (
                      <button
                        key={file.path}
                        onClick={() => loadFileContent(file)}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all text-xs"
                        style={{
                          background: isSelected ? `${color}15` : "transparent",
                          border: isSelected ? `1px solid ${color}30` : "1px solid transparent",
                          color: isSelected ? color : themeColors.text_main,
                        }}
                      >
                        <Icon size={13} style={{ color }} />
                        <span className="truncate flex-1">{file.name}</span>
                        <span className="text-[9px]" style={{ color: themeColors.text_muted }}>
                          {file.size > 1024 ? `${(file.size / 1024).toFixed(1)}k` : `${file.size}b`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </GlassCard>
          </div>

          <div className="flex-1 min-w-0">
            <GlassCard className="h-full flex flex-col">
              {selectedFile ? (
                <>
                  <div className="flex items-center justify-between mb-3 pb-3" style={{ borderBottom: `1px solid ${themeColors.border}` }}>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const Icon = getFileIcon(selectedFile.name);
                        const color = getFileColor(selectedFile.name, themeColors);
                        return <Icon size={16} style={{ color }} />;
                      })()}
                      <span className="tinycaps text-sm font-bold" style={{ color: themeColors.text_main }}>{selectedFile.name}</span>
                      {hasChanges && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: `${themeColors.warn}15`, color: themeColors.warn }}>
                          Modified
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <GlowButton size="sm" onClick={handleSave} disabled={!hasChanges || saving} className="flex items-center gap-1">
                        <Save size={11} /> {saving ? "Saving..." : "Save"}
                      </GlowButton>
                    </div>
                  </div>

                  <div className="flex-1 overflow-hidden relative">
                    {loadingContent ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: themeColors.accent, borderTopColor: "transparent" }} />
                      </div>
                    ) : (
                      <div className="flex h-full rounded-xl overflow-hidden" style={{ background: "rgba(0,0,0,0.2)", border: `1px solid ${themeColors.border}` }}>
                        <div className="w-10 shrink-0 py-3 text-right pr-2 overflow-hidden" style={{ borderRight: `1px solid ${themeColors.border}` }}>
                          {fileContent.split("\n").map((_, i) => (
                            <div key={i} className="text-[10px] leading-[1.6]" style={{ color: themeColors.text_muted, opacity: 0.4 }}>
                              {i + 1}
                            </div>
                          ))}
                        </div>
                        <textarea
                          value={fileContent}
                          onChange={(e) => handleContentChange(e.target.value)}
                          className="flex-1 p-3 text-xs leading-[1.6] outline-none resize-none"
                          style={{
                            background: "transparent",
                            color: themeColors.text_main,
                            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
                            tabSize: 4,
                          }}
                          spellCheck={false}
                        />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <FileText size={40} className="mx-auto mb-3 opacity-20" style={{ color: themeColors.text_muted }} />
                    <p className="text-xs" style={{ color: themeColors.text_muted }}>Select a file to edit</p>
                  </div>
                </div>
              )}
            </GlassCard>
          </div>
        </div>
      )}

      <AnimatePresence>
        {backupNotice && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 px-4 py-3 rounded-xl text-xs tinycaps font-bold"
            style={{
              background: `${themeColors.success}15`,
              border: `1px solid ${themeColors.success}30`,
              color: themeColors.success,
              backdropFilter: "blur(12px)",
            }}
          >
            Backup created at {backupNotice}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { useState, useRef, useEffect, useCallback } from "react";
import { useLauncherStore } from "../../stores";
import { GlassCard } from "../ui/GlassCard";
import { GlowButton } from "../ui/GlowButton";
import { GlassInput } from "../ui/FormControls";
import {
  AlertTriangle, Bot, FileText, Search, Send, User, Sparkles,
  Terminal, Folder, FolderOpen, File, Trash2, ChevronRight,
  Play, ArrowUp, Copy, Download, RefreshCw, Wrench
} from "lucide-react";
import { api } from "../../lib/api";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

type TabType = "chat" | "terminal" | "files" | "crash";

export function EcAIPage() {
  const { themeColors } = useLauncherStore();
  const [activeTab, setActiveTab] = useState<TabType>("chat");
  const chatRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "system",
      content: "Welcome to EcAI! I have full system access to help you:\n\n• Run terminal commands on your PC\n• Read, write, and manage files\n• Fix Minecraft crashes and issues\n• Optimize your system for gaming\n• Download and manage Java versions\n\nHow can I help you today?"
    }
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);

  // Terminal state
  const [terminalHistory, setTerminalHistory] = useState<string[]>([]);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalRunning, setTerminalRunning] = useState(false);
  const terminalInputRef = useRef<HTMLInputElement>(null);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  // File manager state
  const [currentPath, setCurrentPath] = useState("C:\\");
  const [dirEntries, setDirEntries] = useState<{ name: string; is_dir: boolean; size: number; path: string }[]>([]);
  const [fileContent, setFileContent] = useState("");
  const [editingFile, setEditingFile] = useState("");
  const [fileLoading, setFileLoading] = useState(false);

  // Crash state
  const [crashInstance, setCrashInstance] = useState("");
  const [crashInstances, setCrashInstances] = useState<any[]>([]);
  const [crashResult, setCrashResult] = useState<any>(null);
  const [analyzingCrash, setAnalyzingCrash] = useState(false);

  // Quick commands
  const quickCommands = [
    { label: "Kill Minecraft", cmd: "taskkill /F /IM javaw.exe & taskkill /F /IM java.exe" },
    { label: "Flush DNS", cmd: "ipconfig /flushdns" },
    { label: "Clear Temp", cmd: "del /q /f /s %TEMP%\\*" },
    { label: "System Info", cmd: "systeminfo" },
    { label: "Check Java", cmd: "java -version" },
    { label: "GPU Info", cmd: "wmic path win32_videocontroller get name,driverversion" },
    { label: "Disk Space", cmd: "wmic logicaldisk get size,freespace,caption" },
    { label: "RAM Info", cmd: "wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /Value" },
  ];

  useEffect(() => {
    api.instances.get().then(setCrashInstances).catch(() => {});
    loadDir("C:\\");
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [terminalHistory]);

  const loadDir = async (path: string) => {
    setFileLoading(true);
    try {
      const result = await api.systemCmd.listDir(path);
      if (result.success && result.entries) {
        const sorted = result.entries.sort((a, b) => {
          if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setDirEntries(sorted);
        setCurrentPath(path);
      }
    } catch {}
    setFileLoading(false);
  };

  const readFile = async (path: string) => {
    setFileLoading(true);
    try {
      const result = await api.systemCmd.readFile(path);
      if (result.success && result.content !== undefined) {
        setFileContent(result.content);
        setEditingFile(path);
      }
    } catch {}
    setFileLoading(false);
  };

  const saveFile = async () => {
    if (!editingFile) return;
    try {
      await api.systemCmd.writeFile(editingFile, fileContent);
    } catch {}
  };

  const deleteFileOrDir = async (path: string) => {
    try {
      await api.systemCmd.deletePath(path);
      loadDir(currentPath);
    } catch {}
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const execTerminal = async (cmd: string) => {
    if (!cmd.trim() || terminalRunning) return;
    const prompt = `${currentPath}> `;
    setTerminalHistory(prev => [...prev, `${prompt}${cmd}`]);
    setCommandHistory(prev => [cmd, ...prev]);
    setHistoryIdx(-1);
    setTerminalInput("");
    setTerminalRunning(true);

    try {
      const result = await api.systemCmd.runCommand(cmd);
      if (result.stdout) {
        result.stdout.split("\n").forEach(line => {
          if (line.trim()) setTerminalHistory(prev => [...prev, line]);
        });
      }
      if (result.stderr) {
        result.stderr.split("\n").forEach(line => {
          if (line.trim()) setTerminalHistory(prev => [...prev, `[ERROR] ${line}`]);
        });
      }
      if (!result.success && result.error) {
        setTerminalHistory(prev => [...prev, `[ERROR] ${result.error}`]);
      }
    } catch (e: any) {
      setTerminalHistory(prev => [...prev, `[ERROR] ${e.message || "Command failed"}`]);
    }

    setTerminalRunning(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || thinking) return;
    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const userContent = input.trim();
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setThinking(true);

    try {
      const lower = userContent.toLowerCase();

      if (lower.startsWith("!") || lower.startsWith(">") || lower.startsWith("$")) {
        const cmd = userContent.slice(1).trim();
        const result = await api.systemCmd.runCommand(cmd);
        let response = `**Command:** \`${cmd}\`\n`;
        response += `**Exit Code:** ${result.exit_code ?? "N/A"}\n`;
        if (result.stdout) response += `\n**Output:**\n\`\`\`\n${result.stdout.slice(0, 4000)}\n\`\`\``;
        if (result.stderr) response += `\n**Errors:**\n\`\`\`\n${result.stderr.slice(0, 2000)}\n\`\`\``;
        if (result.error) response += `\n**Error:** ${result.error}`;
        setMessages(prev => [...prev, { role: "assistant", content: response }]);
      } else if (lower.startsWith("read ")) {
        const path = userContent.slice(5).trim();
        const result = await api.systemCmd.readFile(path);
        if (result.success) {
          setMessages(prev => [...prev, { role: "assistant", content: `**File:** \`${path}\`\n\`\`\`\n${(result.content || "").slice(0, 6000)}\n\`\`\`` }]);
        } else {
          setMessages(prev => [...prev, { role: "assistant", content: `Failed to read file: ${result.error}` }]);
        }
      } else if (lower.startsWith("ls ") || lower.startsWith("dir ")) {
        const path = userContent.slice(3).trim();
        const result = await api.systemCmd.listDir(path);
        if (result.success && result.entries) {
          let listing = `**Directory:** \`${path}\`\n\n`;
          result.entries.forEach(e => {
            const icon = e.is_dir ? "[DIR]" : "[   ]";
            listing += `${icon} ${e.name}  ${e.is_dir ? "" : formatSize(e.size)}\n`;
          });
          setMessages(prev => [...prev, { role: "assistant", content: listing.slice(0, 6000) }]);
        } else {
          setMessages(prev => [...prev, { role: "assistant", content: `Failed: ${result.error || "Directory not found"}` }]);
        }
      } else if (lower.startsWith("fix ")) {
        const issue = userContent.slice(4).trim();
        let response = `**Attempting to fix:** ${issue}\n\n`;
        const fixLower = issue.toLowerCase();

        if (fixLower.includes("crash") || fixLower.includes("java")) {
          const result = await api.systemCmd.runCommand("java -version 2>&1");
          response += `Java version check:\n\`\`\`\n${result.stdout || result.error}\n\`\`\`\n`;

          const taskkill = await api.systemCmd.runCommand("taskkill /F /IM javaw.exe 2>nul & taskkill /F /IM java.exe 2>nul");
          response += `Killed any stuck Java processes.\n`;
          response += `\nTry launching the game again.`;
        } else if (fixLower.includes("performance") || fixLower.includes("lag") || fixLower.includes("fps")) {
          const cmds = [
            "ipconfig /flushdns",
            "powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",
          ];
          for (const c of cmds) {
            await api.systemCmd.runCommand(c);
          }
          response += `Applied optimizations:\n`;
          response += `• Flushed DNS cache\n`;
          response += `• Set power plan to High Performance\n`;
          response += `\nFor more FPS, check Settings > Optimization.`;
        } else if (fixLower.includes("network") || fixLower.includes("connection")) {
          const result = await api.systemCmd.runCommand("ipconfig /flushdns & netsh winsock reset");
          response += `Network fixes applied:\n\`\`\`\n${result.stdout}\n\`\`\`\nRestart may be needed.`;
        } else {
          response += "I'm not sure how to auto-fix that specific issue. You can:\n";
          response += "• Use `!command` prefix to run any terminal command\n";
          response += "• Go to Terminal tab for full command access\n";
          response += "• Describe the issue more specifically";
        }
        setMessages(prev => [...prev, { role: "assistant", content: response }]);
      } else {
        let response = `I can help with that! Here's what I can do:\n\n`;
        response += `**System Commands:** Prefix with \`!\` to run any command\n`;
        response += `Example: \`!tasklist\` or \`!dir C:\\\`\n\n`;
        response += `**Read Files:** \`read C:\\path\\to\\file.txt\`\n`;
        response += `**List Directory:** \`ls C:\\path\\to\\dir\`\n`;
        response += `**Fix Issues:** \`fix crash\`, \`fix lag\`, \`fix network\`\n\n`;
        response += `**Or use the tabs above** for Terminal, File Manager, or Crash Analyzer.`;
        setMessages(prev => [...prev, { role: "assistant", content: response }]);
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${e.message || "Unknown error"}` }]);
    }

    setThinking(false);
  };

  const tabs: { id: TabType; label: string; icon: any; color: string }[] = [
    { id: "chat", label: "AI Chat", icon: Bot, color: themeColors.purple || themeColors.accent },
    { id: "terminal", label: "Terminal", icon: Terminal, color: themeColors.success },
    { id: "files", label: "File Manager", icon: Folder, color: themeColors.blue },
    { id: "crash", label: "Crash Analyzer", icon: AlertTriangle, color: themeColors.warn },
  ];

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <Bot size={20} style={{ color: themeColors.purple || themeColors.accent }} />
        <div>
          <h1 className="tinycaps text-xl font-bold gradient-text" style={{ "--accent": themeColors.purple || themeColors.accent, "--accent2": themeColors.accent } as any}>EcAI System Access</h1>
          <p className="text-xs mt-0.5" style={{ color: themeColors.text_muted }}>Full system access — terminal, files, diagnostics</p>
        </div>
      </div>

      <div className="flex gap-2 mb-3 overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 shrink-0"
              style={{
                background: activeTab === tab.id ? `${tab.color}20` : "transparent",
                color: activeTab === tab.id ? tab.color : themeColors.text_muted,
                border: `1px solid ${activeTab === tab.id ? `${tab.color}30` : themeColors.border}`,
              }}>
              <Icon size={12} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* AI CHAT TAB */}
      {activeTab === "chat" && (
        <GlassCard className="flex-1 flex flex-col overflow-hidden">
          <div className="flex gap-2 p-2 border-b flex-wrap" style={{ borderColor: themeColors.border }}>
            {quickCommands.map(qc => (
              <button key={qc.label} onClick={() => { setInput(`!${qc.cmd}`); }}
                className="px-2 py-1 rounded text-[10px] font-medium transition-all"
                style={{ background: `${themeColors.accent}10`, color: themeColors.accent, border: `1px solid ${themeColors.accent}20` }}>
                {qc.label}
              </button>
            ))}
          </div>

          <div ref={chatRef} className="flex-1 overflow-y-auto space-y-3 p-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`flex gap-2 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: msg.role === "user" ? `${themeColors.accent}20` : `${themeColors.purple || themeColors.accent}20` }}>
                    {msg.role === "user" ? <User size={12} style={{ color: themeColors.accent }} /> : <Sparkles size={12} style={{ color: themeColors.purple || themeColors.accent }} />}
                  </div>
                  <div className="px-3 py-2 rounded-lg text-xs whitespace-pre-wrap font-mono"
                    style={{
                      background: msg.role === "user" ? `${themeColors.accent}15` : themeColors.bg_card2,
                      color: themeColors.text_main,
                      border: `1px solid ${themeColors.border}`,
                    }}>
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex justify-start">
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: `${themeColors.purple || themeColors.accent}20` }}>
                    <Sparkles size={12} style={{ color: themeColors.purple || themeColors.accent }} />
                  </div>
                  <div className="px-3 py-2 rounded-lg text-xs" style={{ background: themeColors.bg_card2, border: `1px solid ${themeColors.border}` }}>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: themeColors.purple || themeColors.accent, animationDelay: "0ms" }} />
                      <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: themeColors.purple || themeColors.accent, animationDelay: "150ms" }} />
                      <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: themeColors.purple || themeColors.accent, animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 p-3" style={{ borderTop: `1px solid ${themeColors.border}` }}>
            <GlassInput value={input} onChange={setInput}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type !cmd, read path, ls dir, fix issue..." />
            <GlowButton onClick={sendMessage} disabled={!input.trim() || thinking} size="sm" className="flex items-center gap-1 shrink-0">
              <Send size={14} /> Send
            </GlowButton>
          </div>
        </GlassCard>
      )}

      {/* TERMINAL TAB */}
      {activeTab === "terminal" && (
        <GlassCard className="flex-1 flex flex-col overflow-hidden">
          <div ref={terminalRef} className="flex-1 overflow-y-auto p-3 font-mono text-xs"
            style={{ background: "#0a0a0f", color: "#e0e0e0", minHeight: 300 }}
            onClick={() => terminalInputRef.current?.focus()}>
            <div style={{ color: themeColors.success, marginBottom: 4 }}>
              EcLauncher Terminal v1.0 — Type commands below
            </div>
            {terminalHistory.map((line, i) => (
              <div key={i} style={{
                color: line.startsWith("[ERROR]") ? themeColors.danger :
                       line.includes("> ") ? themeColors.success :
                       themeColors.text_sub,
                whiteSpace: "pre-wrap", wordBreak: "break-all",
              }}>{line}</div>
            ))}
            {terminalRunning && (
              <div style={{ color: themeColors.warn }}>Running...</div>
            )}
            <div className="flex items-center gap-1" style={{ color: themeColors.success }}>
              <span>{currentPath}&gt;</span>
              <input ref={terminalInputRef}
                value={terminalInput}
                onChange={e => setTerminalInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !terminalRunning) {
                    execTerminal(terminalInput);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    if (historyIdx < commandHistory.length - 1) {
                      const newIdx = historyIdx + 1;
                      setHistoryIdx(newIdx);
                      setTerminalInput(commandHistory[newIdx] || "");
                    }
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    if (historyIdx > 0) {
                      const newIdx = historyIdx - 1;
                      setHistoryIdx(newIdx);
                      setTerminalInput(commandHistory[newIdx] || "");
                    } else {
                      setHistoryIdx(-1);
                      setTerminalInput("");
                    }
                  }
                }}
                style={{ background: "transparent", border: "none", color: "#fff", outline: "none", flex: 1, fontFamily: "monospace", fontSize: 12 }}
                autoFocus
              />
            </div>
          </div>
          <div className="flex gap-2 p-2 flex-wrap" style={{ borderTop: `1px solid ${themeColors.border}` }}>
            {quickCommands.map(qc => (
              <button key={qc.label} onClick={() => execTerminal(qc.cmd)}
                className="px-2 py-1 rounded text-[10px] font-medium transition-all flex items-center gap-1"
                style={{ background: `${themeColors.success}10`, color: themeColors.success, border: `1px solid ${themeColors.success}20` }}>
                <Play size={8} /> {qc.label}
              </button>
            ))}
            <button onClick={() => setTerminalHistory([])}
              className="px-2 py-1 rounded text-[10px] font-medium transition-all flex items-center gap-1"
              style={{ background: `${themeColors.danger}10`, color: themeColors.danger, border: `1px solid ${themeColors.danger}20` }}>
              <Trash2 size={8} /> Clear
            </button>
          </div>
        </GlassCard>
      )}

      {/* FILE MANAGER TAB */}
      {activeTab === "files" && (
        <GlassCard className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 p-2" style={{ borderBottom: `1px solid ${themeColors.border}` }}>
            <button onClick={() => {
              const parent = currentPath.replace(/[\\\/][^\\\/]+[\\\/]?$/, "").replace(/^[^\\\/]+[\\\/]?/, "C:\\");
              if (parent !== currentPath) loadDir(parent || "C:\\");
            }}
              className="p-1 rounded" style={{ color: themeColors.text_muted }}>
              <ArrowUp size={14} />
            </button>
            <div className="flex-1 flex items-center gap-1 px-2 py-1 rounded text-xs font-mono"
              style={{ background: themeColors.bg_card2, color: themeColors.text_main, border: `1px solid ${themeColors.border}` }}>
              <FolderOpen size={12} style={{ color: themeColors.blue }} />
              {currentPath}
            </div>
            <button onClick={() => loadDir(currentPath)} className="p-1 rounded" style={{ color: themeColors.text_muted }}>
              <RefreshCw size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto" style={{ maxHeight: 300 }}>
            {fileLoading ? (
              <div className="p-4 text-center text-xs" style={{ color: themeColors.text_muted }}>Loading...</div>
            ) : (
              <div className="divide-y" style={{ borderColor: themeColors.border }}>
                {dirEntries.map(entry => (
                  <div key={entry.name}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs hover:opacity-80 cursor-pointer transition-all"
                    style={{ color: themeColors.text_main }}
                    onClick={() => {
                      if (entry.is_dir) loadDir(entry.path);
                    }}>
                    {entry.is_dir ? (
                      <Folder size={14} style={{ color: themeColors.blue }} />
                    ) : (
                      <File size={14} style={{ color: themeColors.text_muted }} />
                    )}
                    <span className="flex-1 truncate font-mono">{entry.name}</span>
                    {!entry.is_dir && <span style={{ color: themeColors.text_muted }}>{formatSize(entry.size)}</span>}
                    {!entry.is_dir && (
                      <div className="flex gap-1">
                        <button onClick={(e) => { e.stopPropagation(); readFile(entry.path); }}
                          className="p-1 rounded hover:opacity-70" style={{ color: themeColors.success }}>
                          <FileText size={12} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(entry.path); }}
                          className="p-1 rounded hover:opacity-70" style={{ color: themeColors.text_muted }}>
                          <Copy size={12} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); deleteFileOrDir(entry.path); }}
                          className="p-1 rounded hover:opacity-70" style={{ color: themeColors.danger }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                    {entry.is_dir && (
                      <button onClick={(e) => { e.stopPropagation(); deleteFileOrDir(entry.path); }}
                        className="p-1 rounded hover:opacity-70" style={{ color: themeColors.danger }}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {editingFile && (
            <div style={{ borderTop: `1px solid ${themeColors.border}` }}>
              <div className="flex items-center gap-2 p-2">
                <FileText size={12} style={{ color: themeColors.success }} />
                <span className="text-xs truncate font-mono flex-1" style={{ color: themeColors.text_main }}>{editingFile}</span>
                <GlowButton size="sm" onClick={saveFile} className="text-[10px]">Save</GlowButton>
                <button onClick={() => { setEditingFile(""); setFileContent(""); }}
                  className="text-[10px]" style={{ color: themeColors.danger }}>Close</button>
              </div>
              <textarea value={fileContent} onChange={e => setFileContent(e.target.value)}
                className="w-full p-2 font-mono text-xs outline-none resize-none"
                style={{ background: themeColors.bg_card2, color: themeColors.text_main, minHeight: 120, maxHeight: 200, borderTop: `1px solid ${themeColors.border}` }}
              />
            </div>
          )}

          <div className="p-2" style={{ borderTop: `1px solid ${themeColors.border}` }}>
            <div className="flex gap-2">
              <GlassInput value={currentPath} onChange={setCurrentPath}
                onKeyDown={(e) => e.key === "Enter" && loadDir(currentPath)}
                placeholder="Enter path..." />
              <GlowButton onClick={() => loadDir(currentPath)} size="sm" className="flex items-center gap-1 shrink-0">
                <FolderOpen size={12} /> Go
              </GlowButton>
            </div>
          </div>
        </GlassCard>
      )}

      {/* CRASH ANALYZER TAB */}
      {activeTab === "crash" && (
        <GlassCard>
          <div className="flex items-center gap-2 mb-3">
            <Wrench size={16} style={{ color: themeColors.warn }} />
            <h3 className="tinycaps text-sm font-semibold" style={{ color: themeColors.text_main }}>Crash Log Analyzer</h3>
          </div>
          <p className="text-xs mb-3" style={{ color: themeColors.text_muted }}>
            Analyze crash logs from your Minecraft instances. Select an instance to scan.
          </p>
          <div className="flex gap-2 mb-3">
            <select value={crashInstance} onChange={(e) => setCrashInstance(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg text-xs outline-none"
              style={{ background: themeColors.bg_card2, border: `1px solid ${themeColors.border}`, color: themeColors.text_main }}>
              <option value="" style={{ background: themeColors.bg_card }}>Select instance...</option>
              {crashInstances.filter((i: any) => i.installed).map((i: any) => (
                <option key={i.name} value={i.name} style={{ background: themeColors.bg_card }}>{i.name}</option>
              ))}
            </select>
            <GlowButton size="sm" onClick={async () => {
              if (!crashInstance) return;
              setAnalyzingCrash(true);
              setCrashResult(null);
              try {
                const result = await api.crashLog.analyze(crashInstance);
                setCrashResult(result);
              } catch {}
              setAnalyzingCrash(false);
            }} disabled={!crashInstance || analyzingCrash} className="flex items-center gap-1 shrink-0">
              <Search size={12} /> {analyzingCrash ? "Analyzing..." : "Analyze"}
            </GlowButton>
          </div>
          {crashResult && (
            <div className="space-y-3">
              {(crashResult as any).crash_count > 0 ? (
                <div className="px-3 py-2 rounded-lg" style={{ background: `${themeColors.warn}10`, border: `1px solid ${themeColors.warn}20` }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle size={12} style={{ color: themeColors.warn }} />
                    <span className="text-xs font-semibold" style={{ color: themeColors.warn }}>
                      Found {(crashResult as any).crash_count} crash log(s)
                    </span>
                    {(crashResult as any).crash_file && (
                      <span className="text-[10px]" style={{ color: themeColors.text_muted }}>
                        — {(crashResult as any).crash_file}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="px-3 py-2 rounded-lg" style={{ background: `${themeColors.success}10`, border: `1px solid ${themeColors.success}20` }}>
                  <span className="text-xs" style={{ color: themeColors.success }}>No crash logs found for this instance.</span>
                </div>
              )}
              {(crashResult as any).crash_log && (
                <div>
                  <h4 className="text-xs font-semibold mb-1" style={{ color: themeColors.text_main }}>Crash Log</h4>
                  <pre className="text-[10px] p-3 rounded-lg overflow-auto max-h-64 whitespace-pre-wrap"
                    style={{ background: themeColors.bg_card2, color: themeColors.text_sub, border: `1px solid ${themeColors.border}` }}>
                    {(crashResult as any).crash_log}
                  </pre>
                </div>
              )}
              {(crashResult as any).recent_errors && (crashResult as any).recent_errors.trim() && (
                <div>
                  <h4 className="text-xs font-semibold mb-1" style={{ color: themeColors.text_main }}>Recent Errors</h4>
                  <pre className="text-[10px] p-3 rounded-lg overflow-auto max-h-48 whitespace-pre-wrap"
                    style={{ background: themeColors.bg_card2, color: themeColors.danger, border: `1px solid ${themeColors.border}` }}>
                    {(crashResult as any).recent_errors}
                  </pre>
                </div>
              )}
              {(crashResult as any).crash_log && (
                <GlowButton size="sm" onClick={async () => {
                  setMessages(prev => [...prev, { role: "user", content: "Auto-fix: Kill stuck Java processes and flush DNS" }]);
                  const r1 = await api.systemCmd.runCommand("taskkill /F /IM javaw.exe 2>nul & taskkill /F /IM java.exe 2>nul");
                  const r2 = await api.systemCmd.runCommand("ipconfig /flushdns");
                  let fixResponse = "**Auto-Fix Results:**\n\n";
                  fixResponse += `**Kill Java:** ${r1.success ? "Done" : r1.error || "No processes found"}\n`;
                  fixResponse += `**Flush DNS:** ${r2.stdout || r2.error || "Done"}\n`;
                  fixResponse += `\nTry launching the game again.`;
                  setMessages(prev => [...prev, { role: "assistant", content: fixResponse }]);
                  setActiveTab("chat");
                }} variant="secondary" className="flex items-center gap-1">
                  <Wrench size={12} /> Auto-Fix & Relaunch
                </GlowButton>
              )}
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
}

import { useLauncherStore } from "../../stores";
import { ChevronRight } from "lucide-react";

const PAGE_LABELS: Record<string, string> = {
  home: "Home",
  accounts: "Login",
  ecai: "EcAI",
  instances: "Profiles",
  mods: "Mods",
  packs: "Resource Packs",
  modpacks: "Modpacks",
  tools: "Tools",
  chat: "Chat",
  multiplayer: "Multiplayer",
  templates: "Templates",
  achievements: "Achievements",
  themes: "Themes",
  configeditor: "Config Editor",
  settings: "Settings",
  logs: "Logs",
};

export function Breadcrumb() {
  const { currentPage, themeColors, selectedInstance } = useLauncherStore();

  const items: Array<{ label: string; page?: string }> = [
    { label: "EcLauncher", page: "home" },
  ];

  if (currentPage !== "home") {
    items.push({ label: PAGE_LABELS[currentPage] || currentPage });
  }

  if (selectedInstance && (currentPage === "instances" || currentPage === "configeditor")) {
    items.push({ label: selectedInstance });
  }

  if (items.length < 2) return null;

  return (
    <div
      className="flex items-center gap-1 px-4 py-1.5 shrink-0"
      style={{ borderBottom: `1px solid ${themeColors.border}40` }}
    >
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={10} style={{ color: themeColors.text_muted, opacity: 0.5 }} />}
          <button
            onClick={() => item.page && useLauncherStore.getState().setPage(item.page)}
            className={`text-[10px] tinycaps font-medium transition-colors ${
              item.page ? "cursor-pointer hover:underline" : "cursor-default"
            }`}
            style={{
              color: i === items.length - 1 ? themeColors.text_main : themeColors.text_muted,
            }}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}

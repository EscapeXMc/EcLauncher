/* Based on original types.ts - cleaned up to fix compile errors */

export interface Settings {
  mc_token?: string;
  ms_refresh_token?: string;
  username?: string;
  cracked_username?: string;
  ely_by_username?: string;
  ely_access_token?: string;
  ely_uuid?: string;
  ely_refresh_token?: string;
  ely_token?: string;
  ely_skin_url?: string;
  theme?: string;
  ram_mb?: number;
  java_path?: string;
  global_jvm?: string;
  dl_connections?: number;
  performance_mode?: boolean;
  enable_bg_animation?: boolean;
  enable_particles?: boolean;
  discord_rpc?: boolean;
  auto_update?: boolean;
  perf_game_config?: boolean;
  perf_jvm_aggressive?: boolean;
  perf_auto_mods?: boolean;
  perf_ram_opt?: boolean;
  def_vsync_off?: boolean;
  def_no_music?: boolean;
  def_gamma?: boolean;
  def_full_bright?: boolean;
  custom_skin_path?: string;
  pre_launch_cmd?: string;
  post_launch_cmd?: string;
  close_on_start?: boolean;
  keep_open?: boolean;
  show_dev_builds?: boolean;
  jvm_args?: string;
  min_memory?: number;
  max_memory?: number;
  concurrent_downloads?: number;
  download_speed_limit?: number;
  skip_existing?: boolean;
  use_authlib?: boolean;
  show_elyby?: boolean;
  game_directory?: string;
  java_directory?: string;
  mods_directory?: string;
  auto_check_updates?: boolean;
  launcher_bg_type?: "default" | "image" | "video";
  launcher_bg_image?: string;
  launcher_bg_video?: string;
  launcher_bg_opacity?: number;
  launcher_bg_blur?: number;
  launcher_bg_brightness?: number;
  launcher_bg_dimming?: number;
  launcher_bg_fit?: "cover" | "contain" | "fill" | "stretch";
  sidebar_style?: "default" | "compact" | "wide" | "icons-only";
  sidebar_opacity?: number;
  sidebar_blur?: number;
  accent_color?: string;
  title_bar_style?: "default" | "transparent" | "hidden";
  show_news_home?: boolean;
  default_page?: string;
  compact_mode?: boolean;
  animations_enabled?: boolean;
  launch_close_delay?: number;
  game_resolution_width?: number;
  game_resolution_height?: number;
  game_fullscreen?: boolean;
  force_update?: boolean;
  language?: string;
  show_playtime?: boolean;
  show_system_stats?: boolean;
  [key: string]: any;
}

export interface Instance {
  name: string;
  version: string;
  loader: string;
  loader_version: string;
  created: string;
  last_played: string | null;
  icon: string;
  installed?: boolean;
  version_json_exists?: boolean;
  mods?: Array<{ name: string; slug?: string; version?: string; enabled?: boolean }>;
}

export interface ModrinthHit {
  slug: string;
  title: string;
  description: string;
  downloads: number;
  icon_url?: string;
  categories?: string[];
  versions?: string[];
  project_type?: string;
  author?: string;
  date_created?: string;
  date_modified?: string;
  source_url?: string;
  wiki_url?: string;
}

export interface LoaderVersion {
  version: string;
  stable?: boolean;
}

export interface NewsItem {
  title: string;
  url: string;
  date: string;
  type: string;
  image?: string;
}

export interface SystemInfo {
  cpu: number;
  ram_used: number;
  ram_total: number;
  ram_pct: number;
  disk_used: number;
  disk_total: number;
  disk_pct: number;
}

export interface ThemeColors {
  bg_main: string;
  bg_nav: string;
  bg_card: string;
  bg_card2: string;
  bg_glass: string;
  bg_hover: string;
  accent: string;
  accent2: string;
  accent_hover: string;
  accent_dim: string;
  accent_glow: string;
  accent_text: string;
  text_main: string;
  text_sub: string;
  text_muted: string;
  border: string;
  border_bright: string;
  border_accent: string;
  danger: string;
  warn: string;
  success: string;
  blue: string;
  purple: string;
  green: string;
  tag_fabric: string;
  tag_forge: string;
  tag_vanilla: string;
  tag_quilt: string;
  tag_neo: string;
  nav_active: string;
  nav_inactive: string;
  server1: string;
  server2: string;
  server3: string;
  server4: string;
  server5: string;
  glass_reflect: string;
  particle_color: string;
}

export const THEMES: Record<string, { name: string; display_name: string; accent: string; colors: ThemeColors }> = {
  cartoon: {
    name: "cartoon",
    display_name: "Blue Cartoon",
    accent: "#1e88e5",
    colors: {
      bg_main: "#010408", bg_nav: "#030a14", bg_card: "#060e1e", bg_card2: "#08152e",
      bg_glass: "#0a1a36", bg_hover: "#0e2345", accent: "#1e88e5", accent2: "#00d4ff",
      accent_hover: "#42a5f5", accent_dim: "#041128", accent_glow: "#1e88e5",
      accent_text: "#ffffff",
      text_main: "#e0ecff", text_sub: "#5a9ad0", text_muted: "#2a5580",
      border: "#1e88e5", border_bright: "#2979cc", border_accent: "#00d4ff",
      danger: "#ff4466", warn: "#ffb300", success: "#00e676", blue: "#1e88e5", purple: "#9c7cff", green: "#4ade80",
      tag_fabric: "#1e88e5", tag_forge: "#ffb300", tag_vanilla: "#42a5f5",
      tag_quilt: "#9c7cff", tag_neo: "#ffb300", nav_active: "#1e88e5", nav_inactive: "#2a5580",
      server1: "#041128", server2: "#041828", server3: "#042a10", server4: "#100528", server5: "#1a0410",
      glass_reflect: "#42a5f5", particle_color: "#2196f3",
    },
  },
  godred: {
    name: "godred",
    display_name: "God Red",
    accent: "#ff3366",
    colors: {
      bg_main: "#080105", bg_nav: "#10060a", bg_card: "#1d0a12", bg_card2: "#280e18",
      bg_glass: "#331220", bg_hover: "#401a28", accent: "#ff3366", accent2: "#ff7733",
      accent_hover: "#ff6688", accent_dim: "#3a0712", accent_glow: "#ff3366",
      accent_text: "#fff5f7",
      text_main: "#fff5f7", text_sub: "#ff9dad", text_muted: "#9d5361",
      border: "#3b101a", border_bright: "#6d1a2e", border_accent: "#ff3366",
      danger: "#ff4466", warn: "#ffbb33", success: "#33ff99", blue: "#44ccff", purple: "#cc77ff", green: "#33ff99",
      tag_fabric: "#44ccff", tag_forge: "#ffbb33", tag_vanilla: "#ff3366",
      tag_quilt: "#cc77ff", tag_neo: "#ff7733", nav_active: "#ff3366", nav_inactive: "#9d5361",
      server1: "#3a0712", server2: "#3b1b05", server3: "#063326", server4: "#2b123f", server5: "#351124",
      glass_reflect: "#ff6b8a", particle_color: "#ff5a76",
    },
  },
  fastclient: {
    name: "fastclient",
    display_name: "Fast Client",
    accent: "#ff0022",
    colors: {
      bg_main: "#050308", bg_nav: "#0a0610", bg_card: "#120a18", bg_card2: "#1a0f22",
      bg_glass: "#22142e", bg_hover: "#2c1a3a", accent: "#ff0022", accent2: "#aa0000",
      accent_hover: "#ff5566", accent_dim: "#3a0a12", accent_glow: "#ff0022",
      accent_text: "#ffffff",
      text_main: "#f1f5f9", text_sub: "#94a3b8", text_muted: "#475569",
      border: "#1e1e2e", border_bright: "#2a2a3e", border_accent: "#ff0022",
      danger: "#ef4444", warn: "#f97316", success: "#22c55e", blue: "#3b82f6", purple: "#a855f7", green: "#f97316",
      tag_fabric: "#3b82f6", tag_forge: "#f97316", tag_vanilla: "#ff0022",
      tag_quilt: "#a855f7", tag_neo: "#f97316", nav_active: "#ff0022", nav_inactive: "#475569",
      server1: "#3a0a12", server2: "#1e3a5f", server3: "#14532d", server4: "#3b0764", server5: "#4a1942",
      glass_reflect: "#ff5577", particle_color: "#ff5566",
    },
  },
  purple: {
    name: "purple",
    display_name: "Purple",
    accent: "#b847ff",
    colors: {
      bg_main: "#08040e", bg_nav: "#0c0616", bg_card: "#160e28", bg_card2: "#1d1535",
      bg_glass: "#261d42", bg_hover: "#322652", accent: "#b847ff", accent2: "#7c3aed",
      accent_hover: "#cc66ff", accent_dim: "#2d1a4a", accent_glow: "#b847ff",
      accent_text: "#e9d5ff",
      text_main: "#f0e8ff", text_sub: "#a78bca", text_muted: "#7a6a9a",
      border: "#2d1f4a", border_bright: "#5a3a8a", border_accent: "#b847ff",
      danger: "#ff4466", warn: "#ffaa00", success: "#44ff88", blue: "#60a5fa", purple: "#b847ff", green: "#ffaa00",
      tag_fabric: "#60a5fa", tag_forge: "#ffaa00", tag_vanilla: "#44ff88",
      tag_quilt: "#b847ff", tag_neo: "#ffaa00", nav_active: "#b847ff", nav_inactive: "#7a6a9a",
      server1: "#2d1a4a", server2: "#1a2d4a", server3: "#1a3a2d", server4: "#2d1a4a", server5: "#3a1a2d",
      glass_reflect: "#d499ff", particle_color: "#cc66ff",
    },
  },
  sapphire: {
    name: "sapphire",
    display_name: "Sapphire",
    accent: "#00aaff",
    colors: {
      bg_main: "#030818", bg_nav: "#060d1e", bg_card: "#0c1832", bg_card2: "#0f1f42",
      bg_glass: "#142852", bg_hover: "#1a3464", accent: "#00aaff", accent2: "#0066cc",
      accent_hover: "#33ccff", accent_dim: "#00264d", accent_glow: "#00aaff",
      accent_text: "#bae6fd",
      text_main: "#e8f0ff", text_sub: "#7ba8d4", text_muted: "#4a6a8a",
      border: "#142240", border_bright: "#1a4a8a", border_accent: "#00aaff",
      danger: "#ff4466", warn: "#ffaa00", success: "#44ff88", blue: "#00aaff", purple: "#a855f7", green: "#ffaa00",
      tag_fabric: "#00aaff", tag_forge: "#ffaa00", tag_vanilla: "#44ff88",
      tag_quilt: "#a855f7", tag_neo: "#ffaa00", nav_active: "#00aaff", nav_inactive: "#4a6a8a",
      server1: "#00264d", server2: "#1a3a5f", server3: "#1a3a2d", server4: "#2d1a4a", server5: "#3a1a2d",
      glass_reflect: "#66ccff", particle_color: "#33ccff",
    },
  },
  midnight: {
    name: "midnight",
    display_name: "Midnight",
    accent: "#00c8e8",
    colors: {
      bg_main: "#020812", bg_nav: "#040d1a", bg_card: "#081529", bg_card2: "#0a1d35",
      bg_glass: "#0e2544", bg_hover: "#122f54", accent: "#00c8e8", accent2: "#0077b6",
      accent_hover: "#48d4ee", accent_dim: "#012a3a", accent_glow: "#00c8e8",
      accent_text: "#ffffff",
      text_main: "#e0f4ff", text_sub: "#6cb4d4", text_muted: "#2a5a7a",
      border: "#0d2a3d", border_bright: "#1a4a6a", border_accent: "#00c8e8",
      danger: "#ff4444", warn: "#ffaa00", success: "#00e676", blue: "#00c8e8", purple: "#aa77ff", green: "#ffaa00",
      tag_fabric: "#00c8e8", tag_forge: "#ffaa00", tag_vanilla: "#48d4ee",
      tag_quilt: "#aa77ff", tag_neo: "#ffaa00", nav_active: "#00c8e8", nav_inactive: "#2a5a7a",
      server1: "#071a2e", server2: "#071e2a", server3: "#071a14", server4: "#0d1a2e", server5: "#0a1428",
      glass_reflect: "#66ddf0", particle_color: "#48d4ee",
    },
  },
  lunar: {
    name: "lunar",
    display_name: "Lunar",
    accent: "#00e6a0",
    colors: {
      bg_main: "#040408", bg_nav: "#070810", bg_card: "#0c0e18", bg_card2: "#111420",
      bg_glass: "#161a2a", bg_hover: "#1c2136", accent: "#00e6a0", accent2: "#00b87a",
      accent_hover: "#33ffb8", accent_dim: "#003a28", accent_glow: "#00e6a0",
      accent_text: "#ffffff",
      text_main: "#e8fef5", text_sub: "#7ad4b0", text_muted: "#2a6a52",
      border: "#1a2e26", border_bright: "#244a3a", border_accent: "#00e6a0",
      danger: "#ff4466", warn: "#ffaa00", success: "#00e676", blue: "#00c8ff", purple: "#a855f7", green: "#ffaa00",
      tag_fabric: "#00c8ff", tag_forge: "#ffaa00", tag_vanilla: "#00e6a0",
      tag_quilt: "#a855f7", tag_neo: "#ffaa00", nav_active: "#00e6a0", nav_inactive: "#2a6a52",
      server1: "#003a28", server2: "#002a3a", server3: "#003a1a", server4: "#1a003a", server5: "#2a003a",
      glass_reflect: "#66f0c4", particle_color: "#33ffb8",
    },
  },
  feature: {
    name: "feature",
    display_name: "Feature",
    accent: "#ff4030",
    colors: {
      bg_main: "#080205", bg_nav: "#0e040a", bg_card: "#180810", bg_card2: "#200c18",
      bg_glass: "#2a1020", bg_hover: "#36162a", accent: "#ff4030", accent2: "#ff8a00",
      accent_hover: "#ff7060", accent_dim: "#3a0a10", accent_glow: "#ff4030",
      accent_text: "#ffffff",
      text_main: "#fff5f0", text_sub: "#ffb090", text_muted: "#8a5a4a",
      border: "#3a1818", border_bright: "#5a2828", border_accent: "#ff4030",
      danger: "#ff4466", warn: "#ffb020", success: "#29f59a", blue: "#37c9ff", purple: "#bd5cff", green: "#29f59a",
      tag_fabric: "#37c9ff", tag_forge: "#ffb020", tag_vanilla: "#ff4030",
      tag_quilt: "#bd5cff", tag_neo: "#ff8a00", nav_active: "#ff4030", nav_inactive: "#8a5a4a",
      server1: "#3a0810", server2: "#3a1a05", server3: "#063326", server4: "#2b103f", server5: "#350824",
      glass_reflect: "#ff8878", particle_color: "#ff7060",
    },
  },
  greengradient: {
    name: "greengradient",
    display_name: "Green Gradient",
    accent: "#00e888",
    colors: {
      bg_main: "#030e08", bg_nav: "#0a1a10", bg_card: "#0f2418", bg_card2: "#142e1e",
      bg_glass: "#1a3d2a", bg_hover: "#224d34", accent: "#00e888", accent2: "#00cc77",
      accent_hover: "#33ffaa", accent_dim: "#003d1a", accent_glow: "#00e888",
      accent_text: "#e8fff0",
      text_main: "#e8fff0", text_sub: "#7ad4b0", text_muted: "#3a7a5a",
      border: "#1a3d2a", border_bright: "#2a5a3e", border_accent: "#00e888",
      danger: "#ff5577", warn: "#ffbb33", success: "#00e888", blue: "#44ccff", purple: "#aa66ff", green: "#00e888",
      tag_fabric: "#44ccff", tag_forge: "#ffbb33", tag_vanilla: "#00e888",
      tag_quilt: "#aa66ff", tag_neo: "#ffbb33", nav_active: "#00e888", nav_inactive: "#3a7a5a",
      server1: "#003d1a", server2: "#00352a", server3: "#0a3d00", server4: "#001a3d", server5: "#2a003d",
      glass_reflect: "#66ffb8", particle_color: "#33ffaa",
    },
  },
};
export interface ModProfile {
  name: string;
  created: string;
  instance_source: string;
  mods: Array<{ slug: string; version_id: string; filename: string }>;
}

export interface ModUpdate {
  slug: string;
  filename: string;
  current_version: string;
  latest_version: string;
  download_url: string;
  mod_name: string;
}

export interface ModDependency {
  slug: string;
  name: string;
  installed: boolean;
  filename?: string;
}

export interface ModConflict {
  mod1: string;
  mod2: string;
  reason: string;
  severity: string;
}

export interface CrashLogInfo {
  has_crash: boolean;
  content: string;
  source: string;
  timestamp: string;
}

export interface MrpackExportResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface ServerEntry {
  name: string;
  address: string;
  port: number;
}

export interface ServerPing {
  online: boolean;
  motd?: string;
  players?: { online: number; max: number };
  version?: string;
  error?: string;
}

export {}; // Added to make top-level bindings exportable"
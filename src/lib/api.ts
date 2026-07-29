import { invoke } from "@tauri-apps/api/tauri";
import type { Settings, Instance, ModrinthHit, LoaderVersion, NewsItem, SystemInfo, ModProfile, ModUpdate, ModDependency, ModConflict, CrashLogInfo, MrpackExportResult } from "./types";

export const api = {
  settings: {
    get: () => invoke<Settings>("get_settings"),
    save: (settings: Record<string, any>) => invoke("save_settings", { settings }),
    getOne: (key: string, def?: any) => invoke<any>("get_setting_cmd", { key, default: def }),
    saveOne: (key: string, value: any) => invoke("save_setting_cmd", { key, value }),
  },
  instances: {
    get: () => invoke<Instance[]>("get_instances"),
    create: (name: string, mc_version: string, loader: string, loader_version: string) =>
      invoke("create_instance", { name, mcVersion: mc_version, loader, loaderVersion: loader_version }),
    delete: (name: string) => invoke("delete_instance", { name }),
    install: (instance_name: string, mc_version: string, loader: string, loader_version: string) =>
      invoke("install_instance", { instanceName: instance_name, mcVersion: mc_version, loader, loaderVersion: loader_version }),
    launch: (instance_name: string) =>
      invoke("launch_game", { instanceName: instance_name }),
    openFolder: (name: string) => invoke("open_instance_folder", { instanceName: name }),
    getMods: (name: string) => invoke<any[]>("get_instance_mods", { instanceName: name }),
    toggleMod: (instanceName: string, filename: string) =>
      invoke<{success:boolean;enabled:boolean;filename:string}>("toggle_mod", { instanceName, filename }),
    deleteMod: (instanceName: string, filename: string) =>
      invoke("delete_mod", { instanceName, filename }),
    rename: (oldName: string, newName: string) =>
      invoke("rename_instance", { oldName, newName }),
    setIcon: (instanceName: string, iconData: string) =>
      invoke("set_instance_icon", { instanceName, iconData }),
    getIcon: (instanceName: string) =>
      invoke<{success:boolean;icon:string|null}>("get_instance_icon", { instanceName }),
    getResourcePacks: (name: string) => invoke<any[]>("get_instance_resourcepacks", { instanceName: name }),
    deleteResourcePack: (instanceName: string, filename: string) =>
      invoke("delete_resourcepack", { instanceName, filename }),
    createFromModpack: (name: string, mcVersion: string, loader: string, loaderVersion: string, mrpackUrl: string) =>
      invoke("create_instance_from_modpack", { name, mcVersion, loader, loaderVersion, mrpackUrl }),
  },
  versions: {
    getMinecraft: () => invoke<{
      all_versions: string[];
      release_versions: string[];
      version_types: Record<string, string>;
      groups: Record<string, string[]>;
      latest: { release?: string; snapshot?: string };
    }>("get_minecraft_versions"),
    getLoader: (mc_version: string, loader: string) =>
      invoke<LoaderVersion[]>("get_loader_versions", { mcVersion: mc_version, loader }),
    getFabricSupported: () => invoke<string[]>("get_fabric_versions"),
    getSupportedLoaders: (mc_version: string) => invoke<string[]>("get_supported_loaders", { mcVersion: mc_version }),
  },
  auth: {
    microsoftStart: () => invoke<{ user_code: string; verification_uri: string; device_code: string; interval: number }>("authenticate_microsoft"),
    microsoftPoll: (device_code: string, interval?: number) =>
      invoke<any>("poll_microsoft_token", { deviceCode: device_code, interval: interval || 5 }),
    microsoftComplete: (ms_token: string, refresh_token?: string) =>
      invoke<any>("complete_microsoft_auth_cmd", { msToken: ms_token, refreshToken: refresh_token || "" }),
    elybyStart: () => invoke<{ auth_url: string }>("authenticate_elyby"),
    elybyPoll: () => invoke<any>("poll_elyby_auth"),
    elybyComplete: (code: string) => invoke<any>("complete_elyby_auth_cmd", { code }),
    createOffline: (username: string) => invoke<any>("create_offline_account", { username }),
    ensureAuthlib: () => invoke<any>("ensure_authlib_injector"),
  },
  mods: {
    search: (query: string, project_type?: string, loader?: string, mc_version?: string, limit?: number) =>
      invoke<ModrinthHit[]>("search_modrinth", { query, projectType: project_type || "mod", loader: loader || "", mcVersion: mc_version || "", limit: limit || 20 }),
    getProject: (slug: string) => invoke<any>("get_modrinth_project", { slug }),
    getVersions: (slug: string, loader?: string, mc_version?: string) =>
      invoke<any[]>("get_modrinth_versions", { slug, loader: loader || "", mcVersion: mc_version || "" }),
    install: (instance_name: string, slug: string, version_id?: string) =>
      invoke("install_mod", { instanceName: instance_name, slug, versionId: version_id || "" }),
    installResourcepack: (instance_name: string, slug: string, version_id?: string) =>
      invoke("install_resourcepack", { instanceName: instance_name, slug, versionId: version_id || "" }),
    installModpack: (instance_name: string, slug: string, version_id?: string) =>
      invoke("install_modpack", { instanceName: instance_name, slug, versionId: version_id || "" }),
  },
  news: {
    get: () => invoke<NewsItem[]>("get_minecraft_news"),
  },
  skin: {
    getInfo: () => invoke<{ custom_skin_path: string; has_skin: boolean }>("get_skin_info"),
    set: (file_path: string) => invoke("set_custom_skin", { filePath: file_path }),
  },
  optimizer: {
    getStatus: (instance_name: string) => invoke<any>("get_optimizer_status", { instanceName: instance_name }),
    apply: (instance_name: string, settings: Record<string, any>) =>
      invoke("apply_optimizer", { instanceName: instance_name, settings }),
  },
  updates: {
    check: () => invoke<{ update_available: boolean; latest_version?: string; download_url?: string }>("check_updates"),
  },
  logs: {
    get: () => invoke<string[]>("get_logs"),
    clear: () => invoke("clear_logs"),
    getGameOutput: () => invoke<string[]>("get_game_output"),
    clearGameOutput: () => invoke("clear_game_output"),
  },
  system: {
    getInfo: () => invoke<SystemInfo>("get_system_info"),
  },
  playTimes: {
    get: () => invoke<Record<string, number>>("get_play_times"),
  },
  version: {
    getLatest: () => invoke<{ tag: string; current_version: string; notes: string; published_at: string }>("get_latest_release_tag"),
  },
  background: {
    saveFile: (data: string) => invoke<{success: boolean; path?: string}>("save_background_image", { data }),
    getFilePath: () => invoke<string>("get_background_image_path"),
    deleteFile: () => invoke("delete_background_image"),
    saveVideo: (data: string) => invoke<{success: boolean; path?: string}>("save_background_video", { data }),
    getVideoPath: () => invoke<string>("get_background_video_path"),
    deleteVideo: () => invoke("delete_background_video"),
  },
  discord: {
    init: () => invoke("init_discord_rpc"),
    status: () => invoke<{connected: boolean; enabled: boolean; client_id: string}>("get_discord_status"),
    update: (details: string, state: string, largeImage?: string, largeText?: string, smallImage?: string, smallText?: string) =>
      invoke("update_discord_rpc", {
        details,
        state,
        largeImage: largeImage || "eclauncher_logo",
        largeText: largeText || "EcLauncher",
        smallImage: smallImage || "",
        smallText: smallText || "",
      }),
    stop: () => invoke("stop_discord_rpc"),
    start: (instanceName: string) => invoke("update_discord_rpc", {
      details: `Playing Minecraft`,
      state: instanceName,
      largeImage: "minecraft_logo",
      largeText: "Minecraft",
      smallImage: "eclauncher_logo",
      smallText: "EcLauncher",
    }),
  },
  perfMods: {
    install: (instanceName: string, mcVersion: string, loader: string) =>
      invoke<{success: boolean; installed: number; total: number; errors: number; message: string}>("install_performance_mods", {
        instanceName, mcVersion, loader,
      }),
  },
  gameBoost: {
    run: (instanceName: string) =>
      invoke<{success: boolean; steps_completed: number; steps_total: number; details: string[]}>("game_boost", {
        instanceName,
      }),
  },
  templates: {
    get: () => invoke<{templates: {id: string; name: string; description: string; icon: string; category: string; mods: {slug: string; name: string}[]}[]}>("get_instance_templates"),
    apply: (instanceName: string, templateId: string) =>
      invoke<{success: boolean; installed: number; errors: number; template_name: string}>("apply_instance_template", { instanceName, templateId }),
  },
  configEditor: {
    getFiles: (instanceName: string) =>
      invoke<{files: {name: string; path: string; size: number; type: string}[]}>("get_config_files", { instanceName }),
    readFile: (instanceName: string, filePath: string) =>
      invoke<{success: boolean; content: string; filename: string; type: string}>("read_config_file", { instanceName, filePath }),
    writeFile: (instanceName: string, filePath: string, content: string) =>
      invoke<{success: boolean; error?: string}>("write_config_file", { instanceName, filePath, content }),
  },
  achievements: {
    get: () => invoke<{achievements: {id: string; name: string; description: string; icon: string; unlocked: boolean; unlocked_at?: string}[]}>("get_achievements"),
    unlock: (achievementId: string) =>
      invoke<{success: boolean; achievement: any; newly_unlocked: boolean}>("unlock_achievement", { achievementId }),
    check: () => invoke<{newly_unlocked: any[]}>("check_achievements"),
  },
  openUrl: (url: string) => invoke("open_url", { url }),
  profiles: {
    save: (name: string, instanceName: string) => 
      invoke<{success: boolean}>("save_mod_profile", { name, instanceName }),
    list: () => invoke<ModProfile[]>("load_mod_profiles"),
    delete: (name: string) => invoke<{success: boolean}>("delete_mod_profile", { name }),
    apply: (name: string, instanceName: string) => 
      invoke<{success: boolean; installed: number}>("apply_mod_profile", { name, instanceName }),
  },
  modUpdates: {
    check: (instanceName: string) => invoke<ModUpdate[]>("check_mod_updates", { instanceName }),
  },
  crashLog: {
    analyze: (instanceName: string) => invoke<CrashLogInfo>("analyze_crash_log", { instanceName }),
  },
  dependencies: {
    resolve: (instanceName: string, slug: string) => 
      invoke<{success: boolean; installed: ModDependency[]}>("resolve_mod_dependencies", { instanceName, slug }),
  },
  resourcePack: {
    autoEnable: (instanceName: string, filename: string) => 
      invoke<{success: boolean}>("auto_enable_resourcepack", { instanceName, filename }),
    toggle: (instanceName: string, filename: string) =>
      invoke<{success:boolean;enabled:boolean}>("toggle_resourcepack", { instanceName, filename }),
    enable: (instanceName: string, filename: string) =>
      invoke<{success:boolean}>("enable_resourcepack", { instanceName, filename }),
    disable: (instanceName: string, filename: string) =>
      invoke<{success:boolean}>("disable_resourcepack", { instanceName, filename }),
  },
  export: {
    mrpack: (instanceName: string, name: string, versionId: string, outputPath: string) => 
      invoke<MrpackExportResult>("export_instance_mrpack", { instanceName, name, versionId, outputPath }),
  },
  conflicts: {
    detect: (instanceName: string) => invoke<ModConflict[]>("detect_mod_conflicts", { instanceName }),
  },
  wizard: {
    checkFirstLaunch: () => invoke<{first_launch: boolean}>("check_first_launch"),
    complete: () => invoke<{success: boolean}>("complete_first_launch"),
  },
  java: {
    checkCompatibility: (mcVersion: string) =>
      invoke<{mc_version: string; required_java: number; current_java_version: number | null; current_compatible: boolean; available_javas: any[]; compatible_javas: any[]}>("check_java_compatibility", { mcVersion }),
    download: (majorVersion: number) =>
      invoke<{success?: boolean; path?: string; error?: string}>("download_java", { majorVersion }),
    getInstallations: () =>
      invoke<any[]>("get_java_installations"),
    setForInstance: (javaPath: string) =>
      invoke<{success: boolean}>("set_java_for_instance", { javaPath }),
  },
  systemCmd: {
    runCommand: (command: string) =>
      invoke<{success: boolean; stdout: string; stderr: string; exit_code: number | null; error?: string}>("run_system_command", { command }),
    readFile: (path: string) =>
      invoke<{success: boolean; content?: string; error?: string}>("read_file_content", { path }),
    writeFile: (path: string, content: string) =>
      invoke<{success: boolean; error?: string}>("write_file_content", { path, content }),
    listDir: (path: string) =>
      invoke<{success: boolean; entries?: {name: string; is_dir: boolean; size: number; path: string}[]; error?: string}>("list_directory", { path }),
    deletePath: (path: string) =>
      invoke<{success: boolean; error?: string}>("delete_path", { path }),
  },
  clone: {
    instance: (instanceName: string, newInstanceName: string) =>
      invoke<{success: boolean; error?: string}>("clone_instance", { instanceName, newInstanceName }),
  },
  servers: {
    get: () => invoke<{name: string; address: string; port: number}[]>("get_servers"),
    add: (name: string, address: string, port: number) =>
      invoke<{success: boolean; error?: string}>("add_server", { name, address, port }),
    delete: (name: string) => invoke<{success: boolean}>("delete_server", { name }),
    ping: (address: string, port: number) =>
      invoke<{online: boolean; motd?: string; players?: {online: number; max: number}; version?: string; error?: string}>("ping_server", { address, port }),
  },
  selfhost: {
    getStatus: () => invoke<{exists: boolean; path: string}>("get_selfhost_status"),
    download: () => invoke<{success: boolean; path?: string; error?: string}>("download_selfhost"),
    launch: () => invoke<{success: boolean; error?: string}>("launch_selfhost"),
  },
  serverVersions: {
    getPaper: () => invoke<string[]>("get_server_versions"),
    getBuilds: (version: string) => invoke<{build_number: number; download_url: string; channel: string}[]>("get_server_builds", { version }),
  },
  launchServer: {
    start: (instanceName: string) => invoke<{success: boolean; error?: string}>("launch_server", { instanceName }),
  },
  pin: {
    instance: (instanceName: string) => invoke<{success: boolean}>("pin_instance", { instanceName }),
    unpin: (instanceName: string) => invoke<{success: boolean}>("unpin_instance", { instanceName }),
  },
  screenshots: {
    get: (instanceName: string) => invoke<{screenshots: {name: string; path: string; modified: string}[]}>("get_screenshots", { instanceName }),
  },
  exportConfig: {
    instance: (instanceName: string, outputPath: string) =>
      invoke<{success: boolean; path?: string; error?: string}>("export_instance_config", { instanceName, outputPath }),
  },
  importConfig: {
    instance: (filePath: string) =>
      invoke<{success: boolean; instance?: any; error?: string}>("import_instance_config", { filePath }),
  },
  batch: {
    installMods: (instanceName: string, slugs: string[]) =>
      invoke<{success: boolean; installed: number; errors: string[]}>("batch_install_mods", { instanceName, slugs }),
  },
  update: {
    checkLauncher: () =>
      invoke<{update_available: boolean; current_version: string; latest_version: string; download_url: string}>("check_launcher_update"),
  },
  gameLogs: {
    get: (instanceName: string) => invoke<{logs: string}>("get_game_logs", { instanceName }),
  },
  fileDrop: {
    moveMod: (instanceName: string, sourcePath: string) =>
      invoke<{success: boolean; filename?: string; error?: string}>("move_mod_file", { instanceName, sourcePath }),
    moveResourcepack: (instanceName: string, sourcePath: string) =>
      invoke<{success: boolean; filename?: string; error?: string}>("move_resourcepack_file", { instanceName, sourcePath }),
  },
};

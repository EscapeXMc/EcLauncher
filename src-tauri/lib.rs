#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Read, BufRead, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tauri::{Manager, State};
use base64::Engine as _;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

// ==================== CONSTANTS ====================
const APP_VERSION: &str = "5.9";
const GITHUB_API_URL: &str = "https://api.github.com/repos/EscapeXMc/EcLauncher/releases/latest";
const MOJANG_VERSION_MANIFEST: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const FABRIC_VERSIONS_URL: &str = "https://meta.fabricmc.net/v2/versions/game";
const MODRINTH_API: &str = "https://api.modrinth.com/v2";
const ELYBY_CLIENT_ID: &str = "eclauncher3";
const ELYBY_CLIENT_SECRET: &str = "b7CIXf55V5xKNe7SxDi-mOmx1jSU8oEMhHLEdNsDthVqoUKHk6bJsTgDGip7QkAx";
const ELYBY_REDIRECT_URI: &str = "http://127.0.0.1:8080/callback";
const USER_AGENT: &str = "EcLauncher/5.0";

// ==================== DISCORD RPC HELPERS ====================
use std::io::{Read as IoRead, Write as IoWrite};

fn discord_ipc_frame(opcode: u32, payload: &str) -> Vec<u8> {
    let bytes = payload.as_bytes();
    let len = bytes.len() as u32;
    let mut frame = Vec::with_capacity(8 + bytes.len());
    frame.extend_from_slice(&opcode.to_le_bytes());
    frame.extend_from_slice(&len.to_le_bytes());
    frame.extend_from_slice(bytes);
    frame
}

fn discord_ipc_read(reader: &mut dyn IoRead) -> Result<(u32, String), String> {
    let mut header = [0u8; 8];
    reader.read_exact(&mut header).map_err(|e| e.to_string())?;
    let opcode = u32::from_le_bytes([header[0], header[1], header[2], header[3]]);
    let length = u32::from_le_bytes([header[4], header[5], header[6], header[7]]) as usize;
    let mut payload = vec![0u8; length];
    reader.read_exact(&mut payload).map_err(|e| e.to_string())?;
    String::from_utf8(payload).map_err(|e| e.to_string()).map(|s| (opcode, s))
}

fn discord_set_activity(writer: &mut dyn IoWrite, nonce: &str, details: &str, state: &str, large_image: &str, large_text: &str, small_image: &str, small_text: &str) {
    let start_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let assets = if small_image.is_empty() && small_text.is_empty() {
        json!({
            "large_image": large_image,
            "large_text": large_text,
        })
    } else {
        json!({
            "large_image": large_image,
            "large_text": large_text,
            "small_image": small_image,
            "small_text": small_text,
        })
    };

    let activity = json!({
        "cmd": "SET_ACTIVITY",
        "args": {
            "pid": std::process::id(),
            "activity": {
                "details": details,
                "state": state,
                "assets": assets,
                "timestamps": {
                    "start": start_ts
                }
            }
        },
        "nonce": nonce
    });

    let _ = writer.write_all(&discord_ipc_frame(1, &activity.to_string()));
}

// ==================== DISCORD RPC MESSAGES ====================
enum DiscordMessage {
    Update {
        details: String,
        state: String,
        large_image: String,
        large_text: String,
        small_image: String,
        small_text: String,
    },
    Stop,
}

struct DiscordRpcHandle {
    sender: std::sync::mpsc::Sender<DiscordMessage>,
}

// ==================== APP STATE ====================
struct AppState {
    settings: Mutex<HashMap<String, Value>>,
    instances: Mutex<Vec<Value>>,
    log_entries: Mutex<Vec<String>>,
    game_output: Mutex<Vec<String>>,
    http_cache: Mutex<HashMap<String, (f64, Value)>>,
    elyby_auth_code: Arc<Mutex<Option<String>>>,
    game_session_start: Mutex<Option<f64>>,
    game_session_instance: Mutex<Option<String>>,
    discord_handle: Arc<Mutex<Option<DiscordRpcHandle>>>,
    java_cache: Mutex<Option<(u64, Vec<Value>)>>,
}

impl AppState {
    fn new() -> Self {
        Self {
            settings: Mutex::new(HashMap::new()),
            instances: Mutex::new(Vec::new()),
            log_entries: Mutex::new(Vec::new()),
            game_output: Mutex::new(Vec::new()),
            http_cache: Mutex::new(HashMap::new()),
            elyby_auth_code: Arc::new(Mutex::new(None)),
            game_session_start: Mutex::new(None),
            game_session_instance: Mutex::new(None),
            discord_handle: Arc::new(Mutex::new(None)),
            java_cache: Mutex::new(None),
        }
    }
}

// ==================== PATH HELPERS ====================
fn app_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")).join(".eclauncher")
}

fn instances_dir() -> PathBuf { app_dir().join("instances") }
fn instances_file() -> PathBuf { app_dir().join("instances.json") }
fn settings_file() -> PathBuf { app_dir().join("settings.json") }
fn playtimes_file() -> PathBuf { app_dir().join("playtimes.json") }
fn libraries_dir() -> PathBuf { app_dir().join("libraries") }
fn assets_dir() -> PathBuf { app_dir().join("assets") }
fn custom_skin_path() -> PathBuf { app_dir().join("custom_skin.png") }
fn authlib_injector_path() -> PathBuf { app_dir().join("authlib-injector.jar") }

fn ensure_dirs() {
    for d in [
        app_dir(), instances_dir(), libraries_dir(),
        assets_dir().join("indexes"), assets_dir().join("objects"),
    ] {
        let _ = std::fs::create_dir_all(&d);
    }
}

// ==================== JSON FILE HELPERS ====================
fn load_json(path: &Path) -> Value {
    match std::fs::read_to_string(path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn save_json(path: &Path, data: &Value) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(s) = serde_json::to_string_pretty(data) {
        let _ = std::fs::write(path, s);
    }
}

// ==================== LOGGING ====================
fn log_msg(app: &State<AppState>, msg: &str) {
    let ts = chrono::Local::now().format("%H:%M:%S");
    let entry = format!("[{}] {}", ts, msg);
    if let Ok(mut entries) = app.log_entries.lock() {
        entries.push(entry.clone());
        if entries.len() > 5000 { entries.remove(0); }
    }
    println!("{}", entry);
}

fn append_game_output(app: &State<AppState>, line: &str) {
    if let Ok(mut buf) = app.game_output.lock() {
        buf.push(line.to_string());
        if buf.len() > 500 { buf.remove(0); }
    }
}

// ==================== CMD HELPER (hide console windows) ====================
fn hidden_cmd(program: &str) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    cmd
}

// ==================== HTTP HELPERS ====================
static ONLINE_CACHE: AtomicBool = AtomicBool::new(true);
static ONLINE_CHECK_TIME: AtomicU64 = AtomicU64::new(0);

fn is_connected() -> bool {
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
    let last_check = ONLINE_CHECK_TIME.load(Ordering::Relaxed);
    if now - last_check < 10 {
        return ONLINE_CACHE.load(Ordering::Relaxed);
    }
    ONLINE_CHECK_TIME.store(now, Ordering::Relaxed);
    let result = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .and_then(|c| c.head("https://sessionserver.mojang.com").send().map(|r| r.status().is_success()))
        .unwrap_or(false);
    ONLINE_CACHE.store(result, Ordering::Relaxed);
    result
}

fn http_get(url: &str, headers: Option<&[(&str, &str)]>) -> Result<Value, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.get(url);
    if let Some(hdrs) = headers {
        for (k, v) in hdrs {
            req = req.header(*k, *v);
        }
    }
    let resp = req.send().map_err(|e| e.to_string())?;
    let text = resp.text().map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|_| text)
}

async fn http_get_async(url: &str, headers: Option<Vec<(&str, &str)>>) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.get(url);
    if let Some(hdrs) = &headers {
        for (k, v) in hdrs {
            req = req.header(*k, *v);
        }
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let text = resp.text().await.map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|_| text)
}

fn http_post_json(url: &str, body: &Value, headers: Option<&[(&str, &str)]>) -> Result<Value, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.post(url).json(body);
    if let Some(hdrs) = headers {
        for (k, v) in hdrs {
            req = req.header(*k, *v);
        }
    }
    let resp = req.send().map_err(|e| e.to_string())?;
    let text = resp.text().map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|_| text)
}

fn http_post_form(url: &str, form: &str, auth: Option<(&str, &str)>) -> Result<Value, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.post(url)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(form.to_string());
    if let Some((user, pass)) = auth {
        let cred = base64::engine::general_purpose::STANDARD.encode(format!("{}:{}", user, pass));
        req = req.header("Authorization", format!("Basic {}", cred));
    }
    let resp = req.send().map_err(|e| e.to_string())?;
    let text = resp.text().map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|_| text)
}

fn download_file_blocking(url: &str, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let client = reqwest::blocking::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let mut resp = client.get(url).send().map_err(|e| e.to_string())?;
    let mut file = std::fs::File::create(dest).map_err(|e| e.to_string())?;
    std::io::copy(&mut resp, &mut file).map_err(|e| e.to_string())?;
    Ok(())
}

// ==================== MAVEN HELPERS ====================
fn maven_name_to_path(maven_name: &str) -> Option<String> {
    let parts: Vec<&str> = maven_name.split(':').collect();
    if parts.len() < 3 { return None; }
    let group_path = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let classifier = if parts.len() > 3 { parts[3] } else { "" };
    if classifier.is_empty() {
        Some(format!("{}/{}/{}/{}-{}.jar", group_path, artifact, version, artifact, version))
    } else {
        Some(format!("{}/{}/{}/{}-{}-{}.jar", group_path, artifact, version, artifact, version, classifier))
    }
}

// ==================== VERSION HELPERS ====================
fn parse_version_tuple(ver: &str) -> (i32, i32, i32) {
    let parts: Vec<&str> = ver.split('.').collect();
    let a = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
    let b = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
    let c = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);
    (a, b, c)
}

fn loader_supports(loader: &str, ver: &str) -> bool {
    let vt = parse_version_tuple(ver);
    match loader.to_lowercase().as_str() {
        "vanilla" => true,
        "fabric" | "quilt" => vt >= (1, 14, 0),
        "forge" => vt >= (1, 4, 0),
        "neoforge" => vt >= (1, 20, 2),
        "optifine" => vt >= (1, 7, 0),
        _ => false,
    }
}

fn build_version_groups(all_versions: &[String]) -> HashMap<String, Vec<String>> {
    let mut groups: HashMap<String, Vec<String>> = HashMap::new();
    let re = regex_lite::Regex::new(r"^(\d+\.\d+)").ok();
    for v in all_versions {
        if let Some(ref re) = re {
            if let Some(caps) = re.captures(v) {
                let prefix = caps[1].to_string();
                groups.entry(prefix).or_default().push(v.clone());
            }
        }
    }
    for vals in groups.values_mut() {
        vals.sort_by(|a, b| parse_version_tuple(b).cmp(&parse_version_tuple(a)));
    }
    groups
}

// ==================== SETTINGS ====================
fn load_settings(app: &State<AppState>) -> HashMap<String, Value> {
    let mut settings = app.settings.lock().unwrap();
    if settings.is_empty() {
        let data = load_json(&settings_file());
        if let Some(obj) = data.as_object() {
            for (k, v) in obj {
                settings.insert(k.clone(), v.clone());
            }
        }
    }
    settings.clone()
}

fn get_setting_val(settings: &HashMap<String, Value>, key: &str, default: Value) -> Value {
    settings.get(key).cloned().unwrap_or(default)
}

fn save_setting_val(app: &State<AppState>, key: &str, value: Value) {
    let mut settings = app.settings.lock().unwrap();
    settings.insert(key.to_string(), value);
    let data = Value::Object(settings.clone().into_iter().collect());
    save_json(&settings_file(), &data);
}

// ==================== INSTANCES ====================
fn load_instances_raw(app: &State<AppState>) -> Vec<Value> {
    let data = load_json(&instances_file());
    let mut instances = data.as_array().cloned().unwrap_or_default();
    let inst_dir = instances_dir();
    for inst in instances.iter_mut() {
        if let Some(name) = inst.get("name").and_then(|v| v.as_str()) {
            let dir = inst_dir.join(name);
            inst["installed"] = Value::Bool(dir.exists());
            if let Some(ver) = inst.get("version").and_then(|v| v.as_str()) {
                let vj = dir.join(format!("{}.json", ver));
                inst["version_json_exists"] = Value::Bool(vj.exists());
            }
        }
    }
    instances
}

fn save_instances(instances: &[Value]) {
    save_json(&instances_file(), &Value::Array(instances.to_vec()));
}

// ==================== LIBRARY RULE FILTERING ====================
fn is_lib_allowed(lib: &Value) -> bool {
    let rules = match lib.get("rules").and_then(|r| r.as_array()) {
        Some(r) if !r.is_empty() => r,
        _ => return true,
    };
    let mut allowed: Option<bool> = None;
    let os_name = if cfg!(target_os = "windows") { "windows" }
        else if cfg!(target_os = "macos") { "osx" }
        else { "linux" };
    for rule in rules {
        if rule.get("features").is_some() { continue; }
        if let Some(os_rule) = rule.get("os") {
            if let Some(name) = os_rule.get("name").and_then(|v| v.as_str()) {
                if name == os_name {
                    allowed = Some(rule.get("action").and_then(|v| v.as_str()) == Some("allow"));
                }
            }
        }
    }
    allowed.unwrap_or(true)
}

fn get_natives_classifier(lib: &Value) -> Option<String> {
    let classifiers = lib.get("downloads")?.get("classifiers")?;
    let os_key = if cfg!(target_os = "windows") { "natives-windows" }
        else if cfg!(target_os = "macos") { "natives-macos" }
        else { "natives-linux" };
    if classifiers.get(os_key).is_some() {
        Some(os_key.to_string())
    } else {
        None
    }
}

// ==================== TAURI COMMANDS ====================

// --- Settings ---
#[tauri::command]
fn get_settings(app: State<AppState>) -> Value {
    let settings = load_settings(&app);
    Value::Object(settings.into_iter().collect())
}

#[tauri::command]
fn save_settings(app: State<AppState>, settings: Value) -> Value {
    if let Some(obj) = settings.as_object() {
        let mut current = app.settings.lock().unwrap();
        for (k, v) in obj {
            current.insert(k.clone(), v.clone());
        }
        let data = Value::Object(current.clone().into_iter().collect());
        save_json(&settings_file(), &data);
    }
    json!({"success": true})
}

#[tauri::command]
fn get_setting_cmd(app: State<AppState>, key: String, default: Option<Value>) -> Value {
    let settings = load_settings(&app);
    settings.get(&key).cloned().unwrap_or(default.unwrap_or(Value::Null))
}

#[tauri::command]
fn save_setting_cmd(app: State<AppState>, key: String, value: Value) -> Value {
    save_setting_val(&app, &key, value);
    json!({"success": true})
}

// --- Instances ---
#[tauri::command]
fn get_instances(app: State<AppState>) -> Value {
    Value::Array(load_instances_raw(&app))
}

#[tauri::command]
fn create_instance(app: State<AppState>, name: String, mc_version: String, loader: String, loader_version: String) -> Value {
    log_msg(&app, &format!("[Instance] Creating '{}' ({} {})", name, loader, mc_version));
    let inst_dir = instances_dir().join(&name);
    let _ = std::fs::create_dir_all(&inst_dir);
    for subdir in &["mods", "saves", "resourcepacks", "screenshots", "natives", "assets", "config", "config/CustomSkinLoader"] {
        let _ = std::fs::create_dir_all(inst_dir.join(subdir));
    }
    let instance_data = json!({
        "name": name, "version": mc_version, "loader": loader,
        "loader_version": loader_version,
        "created": chrono::Local::now().to_rfc3339(),
        "last_played": null, "icon": "",
    });
    let mut instances = load_instances_raw(&app);
    instances.push(instance_data.clone());
    save_instances(&instances);
    json!({"success": true, "instance": instance_data})
}

#[tauri::command]
fn delete_instance(app: State<AppState>, name: String) -> Value {
    log_msg(&app, &format!("[Instance] Deleting '{}'", name));
    let inst_dir = instances_dir().join(&name);
    let _ = std::fs::remove_dir_all(&inst_dir);
    let mut instances = load_instances_raw(&app);
    instances.retain(|i| i.get("name").and_then(|v| v.as_str()) != Some(&name));
    save_instances(&instances);
    json!({"success": true})
}

#[tauri::command]
fn install_instance(app: State<AppState>, app_handle: tauri::AppHandle, instance_name: String, mc_version: String, loader: String, loader_version: String) -> Value {
    log_msg(&app, &format!("[Install] Installing '{}' ({} {})", instance_name, loader, mc_version));
    let emit = |step: &str, msg: &str, progress: u32, done: bool, success: bool, warnings: Vec<String>| {
        let _ = app_handle.emit_all("install-progress", json!({
            "step": step, "message": msg, "progress": progress,
            "done": done, "success": success, "warnings": warnings,
        }));
    };

    emit("Preparing", "Fetching version manifest...", 2, false, true, vec![]);

    // 1. Fetch version manifest
    let manifest = match http_get(MOJANG_VERSION_MANIFEST, None) {
        Ok(m) => m,
        Err(e) => {
            emit("Error", &format!("Failed to fetch version manifest: {}", e), 0, true, false, vec![]);
            return json!({"error": format!("Failed to fetch version manifest: {}", e)});
        }
    };

    let version_url = manifest.get("versions")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.iter().find(|v| v.get("id").and_then(|i| i.as_str()) == Some(&mc_version)))
        .and_then(|v| v.get("url").and_then(|u| u.as_str()));

    let version_url = match version_url {
        Some(u) => u.to_string(),
        None => {
            emit("Error", &format!("Version {} not found", mc_version), 0, true, false, vec![]);
            return json!({"error": format!("Version {} not found", mc_version)});
        }
    };

    emit("Version Data", &format!("Fetching version data for {}...", mc_version), 5, false, true, vec![]);
    let version_data = match http_get(&version_url, None) {
        Ok(v) => v,
        Err(e) => {
            emit("Error", &format!("Failed to fetch version data: {}", e), 0, true, false, vec![]);
            return json!({"error": format!("Failed to fetch version data: {}", e)});
        }
    };

    let inst_dir = instances_dir().join(&instance_name);
    let _ = std::fs::create_dir_all(&inst_dir);
    for subdir in &["mods", "saves", "resourcepacks", "screenshots", "natives", "assets", "config"] {
        let _ = std::fs::create_dir_all(inst_dir.join(subdir));
    }

    save_json(&inst_dir.join(format!("{}.json", mc_version)), &version_data);
    log_msg(&app, "[Install] Version JSON saved");

    // 2. Download client jar
    emit("Client JAR", "Downloading Minecraft client jar...", 8, false, true, vec![]);
    if let Some(client_url) = version_data.get("downloads")
        .and_then(|d| d.get("client"))
        .and_then(|c| c.get("url"))
        .and_then(|u| u.as_str())
    {
        let client_jar = inst_dir.join(format!("{}.jar", mc_version));
        let need_client = !client_jar.exists() ||
            client_jar.metadata().map(|m| m.len() == 0).unwrap_or(true);
        if need_client {
            log_msg(&app, "[Install] Downloading client jar...");
            match download_file_blocking(client_url, &client_jar) {
                Ok(()) => {
                    log_msg(&app, "[Install] Client jar downloaded OK");
                    emit("Client JAR", "Minecraft client jar downloaded", 15, false, true, vec![]);
                }
                Err(e) => {
                    log_msg(&app, &format!("[Install/ERROR] Client jar download failed: {}", e));
                    emit("Error", &format!("Client jar download failed: {}", e), 0, true, false, vec![]);
                    return json!({"error": format!("Client jar download failed: {}", e)});
                }
            }
        } else {
            log_msg(&app, "[Install] Client jar already exists, skipping");
            emit("Client JAR", "Client jar already exists, skipping", 15, false, true, vec![]);
        }
    } else {
        emit("Error", "Version JSON has no client download URL", 0, true, false, vec![]);
        return json!({"error": "Version JSON has no client download URL"});
    }

    // 3. Download libraries
    emit("Libraries", "Downloading libraries...", 16, false, true, vec![]);
    let libs_dir = libraries_dir();
    let mut lib_errors: Vec<String> = Vec::new();
    if let Some(libraries) = version_data.get("libraries").and_then(|l| l.as_array()) {
        let total = libraries.len();
        let mut downloaded = 0u32;
        let mut skipped = 0u32;
        for (idx, lib) in libraries.iter().enumerate() {
            if let Some(artifact) = lib.get("downloads").and_then(|d| d.get("artifact")) {
                if let (Some(url), Some(path)) = (
                    artifact.get("url").and_then(|u| u.as_str()),
                    artifact.get("path").and_then(|p| p.as_str()),
                ) {
                    let dest = libs_dir.join(path);
                    if !dest.exists() || dest.metadata().map(|m| m.len() == 0).unwrap_or(true) {
                        match download_file_blocking(url, &dest) {
                            Ok(()) => { downloaded += 1; }
                            Err(e) => {
                                let name = lib.get("name").and_then(|n| n.as_str()).unwrap_or("unknown");
                                log_msg(&app, &format!("[Install/WARN] Library '{}' download failed: {}", name, e));
                                lib_errors.push(format!("{}: {}", name, e));
                            }
                        }
                    } else {
                        skipped += 1;
                    }
                }
            }

            if let Some(nat_key) = get_natives_classifier(lib) {
                if let Some(nat_info) = lib.get("downloads").and_then(|d| d.get("classifiers")).and_then(|c| c.get(&nat_key)) {
                    if let (Some(nat_url), Some(nat_path_str)) = (
                        nat_info.get("url").and_then(|u| u.as_str()),
                        nat_info.get("path").and_then(|p| p.as_str()),
                    ) {
                        let nat_path = libs_dir.join(nat_path_str);
                        if !nat_path.exists() {
                            if let Err(e) = download_file_blocking(nat_url, &nat_path) {
                                log_msg(&app, &format!("[Install/WARN] Native jar download failed: {}", e));
                                lib_errors.push(format!("native {}: {}", nat_key, e));
                                continue;
                            }
                        }
                        let natives_dir = inst_dir.join("natives");
                        let _ = std::fs::create_dir_all(&natives_dir);
                        match std::fs::File::open(&nat_path) {
                            Ok(file) => {
                                match zip::ZipArchive::new(file) {
                                    Ok(mut zip) => {
                                        for i in 0..zip.len() {
                                            if let Ok(mut file) = zip.by_index(i) {
                                                let name = file.name().to_string();
                                                if name.ends_with(".dll") || name.ends_with(".so") || name.ends_with(".dylib") || name.ends_with(".jnilib") {
                                                    let mut buf = Vec::new();
                                                    if file.read_to_end(&mut buf).is_ok() {
                                                        let _ = std::fs::write(natives_dir.join(&name), &buf);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        log_msg(&app, &format!("[Install/WARN] Failed to open native zip: {}", e));
                                    }
                                }
                            }
                            Err(e) => {
                                log_msg(&app, &format!("[Install/WARN] Failed to open native jar file: {}", e));
                            }
                        }
                    }
                }
            }

            let lib_pct = 16 + ((idx as u32 + 1) * 30 / total as u32);
            if (idx + 1) % 10 == 0 || idx + 1 == total {
                let lib_name = lib.get("name").and_then(|n| n.as_str()).unwrap_or("");
                let short_name = lib_name.rsplit(':').next().unwrap_or(lib_name);
                emit("Libraries", &format!("{}/{} libs - {}", idx + 1, total, short_name), lib_pct.min(46), false, true, vec![]);
                log_msg(&app, &format!("[Install] Libraries: {}/{} ({} downloaded, {} skipped)", idx + 1, total, downloaded, skipped));
            }
        }
        log_msg(&app, &format!("[Install] Libraries done: {} downloaded, {} already existed, {} errors", downloaded, skipped, lib_errors.len()));
        emit("Libraries", &format!("Libraries complete: {} downloaded, {} cached", downloaded, skipped), 46, false, true, vec![]);
    }

    // 4. Download asset index + actual assets
    if let Some(asset_index) = version_data.get("assetIndex") {
        if let (Some(url), Some(id)) = (
            asset_index.get("url").and_then(|u| u.as_str()),
            asset_index.get("id").and_then(|i| i.as_str()),
        ) {
            let index_file = assets_dir().join("indexes").join(format!("{}.json", id));
            if !index_file.exists() || index_file.metadata().map(|m| m.len() == 0).unwrap_or(true) {
                emit("Assets", &format!("Downloading asset index '{}'...", id), 47, false, true, vec![]);
                log_msg(&app, &format!("[Install] Downloading asset index '{}'...", id));
                match download_file_blocking(url, &index_file) {
                    Ok(()) => {
                        log_msg(&app, "[Install] Asset index downloaded OK");
                    }
                    Err(e) => {
                        log_msg(&app, &format!("[Install/WARN] Asset index download failed: {} (non-fatal)", e));
                    }
                }
            } else {
                log_msg(&app, "[Install] Asset index already exists, skipping");
            }

            // Download actual asset objects
            emit("Assets", "Downloading asset files...", 50, false, true, vec![]);
            log_msg(&app, "[Install] Downloading asset objects...");
            let objects_dir = assets_dir().join("objects");
            let _ = std::fs::create_dir_all(&objects_dir);
            if let Ok(index_content) = std::fs::read_to_string(&index_file) {
                if let Ok(index_data) = serde_json::from_str::<Value>(&index_content) {
                    if let Some(assets) = index_data.get("objects").and_then(|o| o.as_object()) {
                        let total_assets = assets.len();
                        let mut assets_dl = 0u32;
                        let mut assets_skipped = 0u32;
                        let mut assets_errors = 0u32;
                        for (idx, (asset_name, asset_info)) in assets.iter().enumerate() {
                            if let Some(hash) = asset_info.get("hash").and_then(|h| h.as_str()) {
                                let hash_prefix = &hash[..2.min(hash.len())];
                                let asset_path = objects_dir.join(hash_prefix).join(hash);
                                if asset_path.exists() {
                                    assets_skipped += 1;
                                } else {
                                    let asset_url = format!("https://resources.download.minecraft.net/{}/{}/{}", hash_prefix, hash, asset_name);
                                    match download_file_blocking(&asset_url, &asset_path) {
                                        Ok(()) => { assets_dl += 1; }
                                        Err(_) => { assets_errors += 1; }
                                    }
                                }
                            }
                            let asset_pct = 50 + ((idx as u32 + 1) * 25 / total_assets as u32);
                            if (idx + 1) % 50 == 0 || idx + 1 == total_assets {
                                emit("Assets", &format!("{}/{} assets", idx + 1, total_assets), asset_pct.min(75), false, true, vec![]);
                                log_msg(&app, &format!("[Install] Assets: {}/{} ({} downloaded, {} cached)", idx + 1, total_assets, assets_dl, assets_skipped));
                            }
                        }
                        log_msg(&app, &format!("[Install] Assets done: {} downloaded, {} cached, {} errors", assets_dl, assets_skipped, assets_errors));
                        emit("Assets", &format!("Assets complete: {} downloaded, {} cached", assets_dl, assets_skipped), 75, false, true, vec![]);
                    }
                }
            }
        }
    }

    // 5. Install loader
    if loader.to_lowercase() != "vanilla" {
        emit("Loader", &format!("Installing {} loader...", loader), 76, false, true, vec![]);
        let actual_loader_version = if loader_version.is_empty() {
            match loader.to_lowercase().as_str() {
                "fabric" | "quilt" => {
                    let api_url = if loader.to_lowercase() == "fabric" {
                        format!("https://meta.fabricmc.net/v2/versions/loader/{}", mc_version)
                    } else {
                        format!("https://meta.quiltmc.org/v3/versions/loader/{}", mc_version)
                    };
                    log_msg(&app, &format!("[Install] Auto-fetching latest {} loader version...", loader));
                    match http_get(&api_url, None) {
                        Ok(data) => {
                            if let Some(arr) = data.as_array() {
                                let found = arr.iter().find(|v| {
                                    v.get("loader").and_then(|l| l.get("stable")).and_then(|s| s.as_bool()).unwrap_or(false)
                                }).or_else(|| arr.first());
                                if let Some(entry) = found {
                                    let ver = entry.get("loader").and_then(|l| l.get("version")).and_then(|v| v.as_str()).unwrap_or("");
                                    log_msg(&app, &format!("[Install] Auto-detected {} loader version: {}", loader, ver));
                                    emit("Loader", &format!("{} {} detected", loader, ver), 77, false, true, vec![]);
                                    ver.to_string()
                                } else { String::new() }
                            } else { String::new() }
                        }
                        Err(e) => {
                            log_msg(&app, &format!("[Install/WARN] Failed to fetch loader versions: {}", e));
                            String::new()
                        }
                    }
                }
                "forge" => {
                    log_msg(&app, &format!("[Install] Auto-fetching latest Forge version for {}...", mc_version));
                    emit("Loader", "Detecting Forge version...", 77, false, true, vec![]);
                    match reqwest::blocking::Client::builder().user_agent(USER_AGENT).timeout(std::time::Duration::from_secs(15)).build() {
                        Ok(client) => {
                            match client.get("https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml").send().and_then(|r| r.text()) {
                                Ok(xml) => {
                                    let prefix = format!(">{}-", mc_version);
                                    let mut best: Option<String> = None;
                                    for line in xml.lines() {
                                        if let Some(start) = line.find(&prefix) {
                                            let after = &line[start+1..];
                                            if let Some(end) = after.find('<') {
                                                let ver = &after[..end];
                                                if !ver.is_empty() && best.is_none() {
                                                    best = Some(ver.to_string());
                                                }
                                            }
                                        }
                                    }
                                    if let Some(ver_val) = best {
                                        log_msg(&app, &format!("[Install] Auto-detected Forge version: {}", ver_val));
                                        emit("Loader", &format!("Forge {} detected", ver_val), 77, false, true, vec![]);
                                        ver_val
                                    } else {
                                        log_msg(&app, &format!("[Install/WARN] No Forge version found for {}", mc_version));
                                        String::new()
                                    }
                                }
                                Err(e) => {
                                    log_msg(&app, &format!("[Install/WARN] Failed to fetch Forge version list: {}", e));
                                    String::new()
                                }
                            }
                        }
                        Err(e) => {
                            log_msg(&app, &format!("[Install/WARN] Failed to create HTTP client for Forge: {}", e));
                            String::new()
                        }
                    }
                }
                "neoforge" => {
                    log_msg(&app, &format!("[Install] Auto-fetching latest NeoForge version for {}...", mc_version));
                    emit("Loader", "Detecting NeoForge version...", 77, false, true, vec![]);
                    match reqwest::blocking::Client::builder().user_agent(USER_AGENT).timeout(std::time::Duration::from_secs(15)).build() {
                        Ok(client) => {
                            match client.get("https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml").send().and_then(|r| r.text()) {
                                Ok(xml) => {
                                    let prefix = format!(">{}-", mc_version);
                                    let mut best: Option<String> = None;
                                    for line in xml.lines() {
                                        if let Some(start) = line.find(&prefix) {
                                            let after = &line[start+1..];
                                            if let Some(end) = after.find('<') {
                                                let ver = &after[..end];
                                                if ver.chars().all(|c| c.is_ascii_digit() || c == '.') {
                                                    best = Some(ver.to_string());
                                                }
                                            }
                                        }
                                    }
                                    if let Some(ver) = best {
                                        log_msg(&app, &format!("[Install] Auto-detected NeoForge version: {}", ver));
                                        emit("Loader", &format!("NeoForge {} detected", ver), 77, false, true, vec![]);
                                        ver
                                    } else {
                                        log_msg(&app, &format!("[Install/WARN] No NeoForge version found for {}", mc_version));
                                        String::new()
                                    }
                                }
                                Err(e) => {
                                    log_msg(&app, &format!("[Install/WARN] Failed to fetch NeoForge versions: {}", e));
                                    String::new()
                                }
                            }
                        }
                        Err(e) => {
                            log_msg(&app, &format!("[Install/WARN] HTTP client error: {}", e));
                            String::new()
                        }
                    }
                }
                _ => String::new(),
            }
        } else {
            loader_version.clone()
        };

        if !actual_loader_version.is_empty() {
            log_msg(&app, &format!("[Install] Installing {} loader {}...", loader, actual_loader_version));
            emit("Loader", &format!("Installing {} {}...", loader, actual_loader_version), 78, false, true, vec![]);
            match loader.to_lowercase().as_str() {
                "fabric" => {
                    let profile_url = format!("https://meta.fabricmc.net/v2/versions/loader/{}/{}/profile/json", mc_version, actual_loader_version);
                    match http_get(&profile_url, None) {
                        Ok(profile) => {
                            let mut flib_errors: Vec<String> = Vec::new();
                            if let Some(libs) = profile.get("libraries").and_then(|l| l.as_array()) {
                                for lib in libs {
                                    if let Some(name) = lib.get("name").and_then(|n| n.as_str()) {
                                        if let Some(lib_url) = lib.get("url").and_then(|u| u.as_str()) {
                                            if let Some(path) = maven_name_to_path(name) {
                                                let dest = libs_dir.join(&path);
                                                if !dest.exists() {
                                                    let full_url = format!("{}/{}", lib_url.trim_end_matches('/'), path);
                                                    if let Err(e) = download_file_blocking(&full_url, &dest) {
                                                        log_msg(&app, &format!("[Install/WARN] Fabric lib '{}' failed: {}", name, e));
                                                        flib_errors.push(name.to_string());
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            let loader_jar_name = format!("fabric-loader-{}.jar", actual_loader_version);
                            if let Some(libs) = profile.get("libraries").and_then(|l| l.as_array()) {
                                for lib in libs {
                                    if let Some(name) = lib.get("name").and_then(|n| n.as_str()) {
                                        if name.contains(&loader_jar_name) || name.contains(&format!("fabric-loader-{}", actual_loader_version)) {
                                            if let Some(path) = maven_name_to_path(name) {
                                                let src = libs_dir.join(&path);
                                                let dst = inst_dir.join(&loader_jar_name);
                                                if src.exists() && !dst.exists() {
                                                    let _ = std::fs::copy(&src, &dst);
                                                    log_msg(&app, &format!("[Install] Copied {} to instance", loader_jar_name));
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            save_json(&inst_dir.join(format!("fabric-loader-{}-profile.json", actual_loader_version)), &profile);
                            log_msg(&app, "[Install] Fabric loader installed successfully");
                            emit("Loader", "Fabric loader installed", 85, false, true, vec![]);
                        }
                        Err(e) => {
                            log_msg(&app, &format!("[Install/ERROR] Failed to fetch Fabric profile: {}", e));
                            emit("Error", &format!("Fabric profile fetch failed: {}", e), 0, true, false, vec![]);
                            return json!({"error": format!("Fabric profile fetch failed: {}", e)});
                        }
                    }
                }
                "quilt" => {
                    let profile_url = format!("https://meta.quiltmc.org/v3/versions/loader/{}/{}/profile/json", mc_version, actual_loader_version);
                    match http_get(&profile_url, None) {
                        Ok(profile) => {
                            let mut qlib_errors: Vec<String> = Vec::new();
                            if let Some(libs) = profile.get("libraries").and_then(|l| l.as_array()) {
                                for lib in libs {
                                    if let Some(name) = lib.get("name").and_then(|n| n.as_str()) {
                                        if let Some(lib_url) = lib.get("url").and_then(|u| u.as_str()) {
                                            if let Some(path) = maven_name_to_path(name) {
                                                let dest = libs_dir.join(&path);
                                                if !dest.exists() {
                                                    let full_url = format!("{}/{}", lib_url.trim_end_matches('/'), path);
                                                    if let Err(e) = download_file_blocking(&full_url, &dest) {
                                                        log_msg(&app, &format!("[Install/WARN] Quilt lib '{}' failed: {}", name, e));
                                                        qlib_errors.push(name.to_string());
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            let loader_jar_name = format!("quilt-loader-{}.jar", actual_loader_version);
                            if let Some(libs) = profile.get("libraries").and_then(|l| l.as_array()) {
                                for lib in libs {
                                    if let Some(name) = lib.get("name").and_then(|n| n.as_str()) {
                                        if name.contains(&format!("quilt-loader-{}", actual_loader_version)) {
                                            if let Some(path) = maven_name_to_path(name) {
                                                let src = libs_dir.join(&path);
                                                let dst = inst_dir.join(&loader_jar_name);
                                                if src.exists() && !dst.exists() {
                                                    let _ = std::fs::copy(&src, &dst);
                                                    log_msg(&app, &format!("[Install] Copied {} to instance", loader_jar_name));
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            save_json(&inst_dir.join(format!("quilt-loader-{}-profile.json", actual_loader_version)), &profile);
                            log_msg(&app, "[Install] Quilt loader installed successfully");
                            emit("Loader", "Quilt loader installed", 85, false, true, vec![]);
                        }
                        Err(e) => {
                            log_msg(&app, &format!("[Install/ERROR] Failed to fetch Quilt profile: {}", e));
                            emit("Error", &format!("Quilt profile fetch failed: {}", e), 0, true, false, vec![]);
                            return json!({"error": format!("Quilt profile fetch failed: {}", e)});
                        }
                    }
                }
                "forge" | "neoforge" => {
                    log_msg(&app, &format!("[Install] {} loader installation: downloading installer for {}...", loader, actual_loader_version));
                    let installer_url = match loader.to_lowercase().as_str() {
                        "neoforge" => format!("https://maven.neoforged.net/releases/net/neoforged/neoforge/{}/neoforge-{}-installer.jar", actual_loader_version, actual_loader_version),
                        "forge" => format!("https://maven.minecraftforge.net/net/minecraftforge/forge/{}/forge-{}-installer.jar", actual_loader_version, actual_loader_version),
                        _ => String::new(),
                    };
                    let installer_jar = inst_dir.join(format!("{}-installer.jar", loader.to_lowercase()));
                    match download_file_blocking(&installer_url, &installer_jar) {
                        Ok(()) => {
                            log_msg(&app, &format!("[Install] {} installer downloaded, extracting libraries...", loader));
                            if let Ok(file) = std::fs::File::open(&installer_jar) {
                                if let Ok(mut zip) = zip::ZipArchive::new(file) {
                                    for i in 0..zip.len() {
                                        if let Ok(mut file) = zip.by_index(i) {
                                            let name = file.name().to_string();
                                            if name.starts_with("META-INF/libraries/") && name.ends_with(".jar") {
                                                let rel = name.strip_prefix("META-INF/libraries/").unwrap_or(&name);
                                                let dest = libs_dir.join(rel);
                                                if !dest.exists() {
                                                    if let Some(parent) = dest.parent() { let _ = std::fs::create_dir_all(parent); }
                                                    let mut buf = Vec::new();
                                                    let _ = file.read_to_end(&mut buf);
                                                    let _ = std::fs::write(&dest, &buf);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            let _ = std::fs::remove_file(&installer_jar);
                            log_msg(&app, &format!("[Install] {} libraries extracted from installer", loader));
                            emit("Loader", &format!("{} loader installed", loader), 85, false, true, vec![]);
                        }
                        Err(e) => {
                            log_msg(&app, &format!("[Install/WARN] {} installer download failed: {} (using version JSON libs only)", loader, e));
                        }
                    }
                }
                _ => {}
            }
        } else {
            log_msg(&app, &format!("[Install/WARN] Could not determine {} loader version, skipping loader install", loader));
        }
    }

    // Verify critical files exist
    let vj_path = inst_dir.join(format!("{}.json", mc_version));
    let jar_path = inst_dir.join(format!("{}.jar", mc_version));
    let mut warnings: Vec<String> = Vec::new();
    if !vj_path.exists() { warnings.push("Version JSON missing".to_string()); }
    if !jar_path.exists() || jar_path.metadata().map(|m| m.len() == 0).unwrap_or(true) { warnings.push("Client JAR missing or empty".to_string()); }
    if !lib_errors.is_empty() { warnings.push(format!("{} library downloads failed", lib_errors.len())); }

    if !warnings.is_empty() {
        log_msg(&app, &format!("[Install] '{}' complete with warnings: {}", instance_name, warnings.join(", ")));
        emit("Complete", &format!("Installed with {} warning(s)", warnings.len()), 100, true, true, warnings.clone());
        json!({"success": true, "warnings": warnings})
    } else {
        log_msg(&app, &format!("[Install] '{}' installation complete!", instance_name));
        emit("Complete", "Installation complete!", 100, true, true, vec![]);
        json!({"success": true})
    }
}

// --- Minecraft Versions ---
#[tauri::command]
fn get_minecraft_versions() -> Value {
    match http_get(MOJANG_VERSION_MANIFEST, None) {
        Ok(data) => {
            let all_versions: Vec<String> = data.get("versions")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.get("id").and_then(|i| i.as_str()).map(|s| s.to_string())).collect())
                .unwrap_or_default();
            let release_versions: Vec<String> = data.get("versions")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter(|v| v.get("type").and_then(|t| t.as_str()) == Some("release")).filter_map(|v| v.get("id").and_then(|i| i.as_str()).map(|s| s.to_string())).collect())
                .unwrap_or_default();
            let version_types: HashMap<String, String> = data.get("versions")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| {
                    let id = v.get("id")?.as_str()?.to_string();
                    let t = v.get("type")?.as_str()?.to_string();
                    Some((id, t))
                }).collect())
                .unwrap_or_default();
            let groups = build_version_groups(&all_versions);
            let groups_str: HashMap<String, Vec<String>> = groups.into_iter().collect();
            json!({
                "all_versions": all_versions,
                "release_versions": release_versions,
                "version_types": version_types,
                "groups": groups_str,
                "latest": data.get("latest").cloned().unwrap_or(Value::Null),
            })
        }
        Err(e) => json!({"error": e, "all_versions": [], "release_versions": [], "version_types": {}, "groups": {}, "latest": {}})
    }
}

#[tauri::command]
fn get_loader_versions(mc_version: String, loader: String) -> Value {
    if !loader_supports(&loader, &mc_version) {
        return Value::Array(vec![]);
    }
    match loader.to_lowercase().as_str() {
        "fabric" => {
            let url = format!("https://meta.fabricmc.net/v2/versions/loader/{}", mc_version);
            match http_get(&url, None) {
                Ok(data) => {
                    if let Some(arr) = data.as_array() {
                        let versions: Vec<Value> = arr.iter().filter_map(|v| {
                            v.get("loader").and_then(|l| Some(json!({
                                "version": l.get("version")?.as_str()?,
                                "stable": l.get("stable").and_then(|s| s.as_bool()).unwrap_or(false),
                            })))
                        }).collect();
                        Value::Array(versions)
                    } else {
                        Value::Array(vec![])
                    }
                }
                Err(_) => Value::Array(vec![]),
            }
        }
        "quilt" => {
            let url = format!("https://meta.quiltmc.org/v3/versions/loader/{}", mc_version);
            match http_get(&url, None) {
                Ok(data) => {
                    if let Some(arr) = data.as_array() {
                        let versions: Vec<Value> = arr.iter().filter_map(|v| {
                            v.get("loader").and_then(|l| Some(json!({
                                "version": l.get("version")?.as_str()?,
                                "stable": l.get("stable").and_then(|s| s.as_bool()).unwrap_or(false),
                            })))
                        }).collect();
                        Value::Array(versions)
                    } else {
                        Value::Array(vec![])
                    }
                }
                Err(_) => Value::Array(vec![]),
            }
        }
        "forge" => {
            match reqwest::blocking::Client::builder().user_agent(USER_AGENT).timeout(std::time::Duration::from_secs(15)).build() {
                Ok(client) => {
                    match client.get("https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml").send().and_then(|r| r.text()) {
                        Ok(xml) => {
                            let prefix = format!(">{}-", mc_version);
                            let mut versions: Vec<Value> = Vec::new();
                            for line in xml.lines() {
                                if let Some(start) = line.find(&prefix) {
                                    let after = &line[start+1..];
                                    if let Some(end) = after.find('<') {
                                        let ver = &after[..end];
                                        if !ver.is_empty() {
                                            versions.push(json!({
                                                "version": ver,
                                                "stable": true,
                                            }));
                                        }
                                    }
                                }
                            }
                            Value::Array(versions)
                        }
                        Err(_) => Value::Array(vec![]),
                    }
                }
                Err(_) => Value::Array(vec![]),
            }
        }
        "neoforge" => {
            match reqwest::blocking::Client::builder().user_agent(USER_AGENT).timeout(std::time::Duration::from_secs(15)).build() {
                Ok(client) => {
                    match client.get("https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml").send().and_then(|r| r.text()) {
                        Ok(xml) => {
                            let prefix = format!(">{}-", mc_version);
                            let mut versions: Vec<Value> = Vec::new();
                            for line in xml.lines() {
                                if let Some(start) = line.find(&prefix) {
                                    let after = &line[start+1..];
                                    if let Some(end) = after.find('<') {
                                        let ver = &after[..end];
                                        if ver.chars().all(|c| c.is_ascii_digit() || c == '.') {
                                            versions.push(json!({
                                                "version": ver,
                                                "stable": true,
                                            }));
                                        }
                                    }
                                }
                            }
                            Value::Array(versions)
                        }
                        Err(_) => Value::Array(vec![]),
                    }
                }
                Err(_) => Value::Array(vec![]),
            }
        }
        _ => Value::Array(vec![]),
    }
}

#[tauri::command]
fn get_supported_loaders(mc_version: String) -> Value {
    let all_loaders = vec!["vanilla", "fabric", "forge", "quilt", "neoforge"];
    let supported: Vec<&str> = all_loaders.into_iter()
        .filter(|l| loader_supports(l, &mc_version))
        .collect();
    json!(supported)
}

#[tauri::command]
fn get_fabric_versions() -> Value {
    match http_get(FABRIC_VERSIONS_URL, None) {
        Ok(data) => {
            if let Some(arr) = data.as_array() {
                let versions: Vec<String> = arr.iter()
                    .filter(|v| v.get("stable").and_then(|s| s.as_bool()).unwrap_or(false))
                    .filter_map(|v| v.get("version").and_then(|v| v.as_str()).map(|s| s.to_string()))
                    .collect();
                Value::Array(versions.into_iter().map(|v| Value::String(v)).collect())
            } else {
                Value::Array(vec![])
            }
        }
        Err(_) => Value::Array(vec![]),
    }
}

// --- Microsoft Auth ---
#[tauri::command]
fn authenticate_microsoft(app: State<AppState>) -> Value {
    log_msg(&app, "[Auth/MS] Starting Microsoft device code flow...");
    match http_post_json(
        "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode",
        &json!({"client_id": "00000000402b5328", "scope": "XboxLive.signin XboxLive.offline_access MinecraftWin32.app"}),
        None,
    ) {
        Ok(resp) => {
            if let Some(user_code) = resp.get("user_code").and_then(|u| u.as_str()) {
                let ver_uri = resp.get("verification_uri").and_then(|u| u.as_str()).unwrap_or("https://microsoft.com/link");
                let device_code = resp.get("device_code").and_then(|u| u.as_str()).unwrap_or("");
                let interval = resp.get("interval").and_then(|i| i.as_i64()).unwrap_or(5);
                let _ = webbrowser::open(ver_uri);
                log_msg(&app, &format!("[Auth/MS] Code: {} | Go to {}", user_code, ver_uri));
                json!({"success": true, "user_code": user_code, "verification_uri": ver_uri, "device_code": device_code, "interval": interval})
            } else {
                let err = resp.get("error_description").or(resp.get("error")).and_then(|e| e.as_str()).unwrap_or("Device code request failed");
                json!({"error": err})
            }
        }
        Err(e) => json!({"error": e}),
    }
}

#[tauri::command]
fn poll_microsoft_token(app: State<AppState>, device_code: String, interval: Option<i64>) -> Value {
    let interval_secs = interval.unwrap_or(5);
    log_msg(&app, "[Auth/MS] Polling for token...");
    for i in 0..60 {
        std::thread::sleep(std::time::Duration::from_secs(interval_secs as u64));
        match http_post_form(
            "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
            &format!("client_id=00000000402b5328&grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code&device_code={}", device_code),
            None,
        ) {
            Ok(resp) => {
                if let Some(access_token) = resp.get("access_token").and_then(|t| t.as_str()) {
                    let refresh = resp.get("refresh_token").and_then(|t| t.as_str()).unwrap_or("");
                    return complete_ms_auth(app, access_token.to_string(), refresh.to_string());
                }
                if resp.get("error").and_then(|e| e.as_str()) == Some("authorization_pending") {
                    continue;
                }
                let err = resp.get("error_description").or(resp.get("error")).and_then(|e| e.as_str()).unwrap_or("Auth failed");
                return json!({"error": err});
            }
            Err(e) => return json!({"error": e}),
        }
    }
    json!({"error": "Authentication timed out"})
}

fn complete_ms_auth(app: State<AppState>, ms_token: String, refresh_token: String) -> Value {
    log_msg(&app, "[Auth/MS] Exchanging for Xbox Live token...");
    let xbl_body = json!({"Properties": {"AuthMethod": "RPS", "SiteName": "user.auth.xboxlive.com", "RpsTicket": ms_token}, "RelyingParty": "http://auth.xboxlive.com", "TokenType": "JWT"});
    let xbl = match http_post_json("https://user.auth.xboxlive.com/user/authenticate", &xbl_body, None) {
        Ok(r) => r, Err(e) => return json!({"error": e}),
    };
    let xbl_token = xbl.get("Token").and_then(|t| t.as_str()).unwrap_or("");
    let xbl_uhs = xbl.get("DisplayClaims").and_then(|d| d.get("xui"))
        .and_then(|u| u.as_array()).and_then(|a| a.first())
        .and_then(|c| c.get("uhs")).and_then(|u| u.as_str()).unwrap_or("");

    log_msg(&app, "[Auth/MS] Exchanging for XSTS token...");
    let xsts_body = json!({"Properties": {"SandboxId": "RETAIL", "UserTokens": [xbl_token]}, "RelyingParty": "rp://api.minecraftservices.com/", "TokenType": "JWT"});
    let xsts = match http_post_json("https://xsts.auth.xboxlive.com/xsts/authorize", &xsts_body, None) {
        Ok(r) => r, Err(e) => return json!({"error": e}),
    };
    let xsts_token = xsts.get("Token").and_then(|t| t.as_str()).unwrap_or("");

    log_msg(&app, "[Auth/MS] Exchanging for Minecraft token...");
    let mc_data = match http_post_json("https://api.minecraftservices.com/authentication/login_with_xbox",
        &json!({"identityToken": format!("XBL3.0 x={};{}", xbl_uhs, xsts_token)}), None) {
        Ok(r) => r, Err(e) => return json!({"error": e}),
    };
    let mc_token = mc_data.get("access_token").and_then(|t| t.as_str()).unwrap_or("");

    log_msg(&app, "[Auth/MS] Fetching Minecraft profile...");
    match http_get("https://api.minecraftservices.com/minecraft/profile", Some(&[("Authorization", &format!("Bearer {}", mc_token))])) {
        Ok(profile) => {
            if let Some(username) = profile.get("name").and_then(|n| n.as_str()) {
                let username = username.to_string();
                let uuid = profile.get("id").and_then(|u| u.as_str()).unwrap_or("00000000-0000-0000-0000-000000000000").to_string();
                save_setting_val(&app, "mc_token", Value::String(mc_token.to_string()));
                save_setting_val(&app, "ms_refresh_token", Value::String(refresh_token.to_string()));
                save_setting_val(&app, "username", Value::String(username.clone()));
                save_setting_val(&app, "cracked_username", Value::String(username.clone()));
                log_msg(&app, &format!("[Auth/MS] Success! Logged in as '{}'", username));
                return json!({"success": true, "username": username, "uuid": uuid, "mc_token": mc_token, "refresh_token": refresh_token, "type": "microsoft"});
            }
            json!({"error": "No Minecraft profile found"})
        }
        Err(e) => json!({"error": e}),
    }
}

#[tauri::command]
fn complete_microsoft_auth_cmd(app: State<AppState>, ms_token: String, refresh_token: Option<String>) -> Value {
    complete_ms_auth(app, ms_token, refresh_token.unwrap_or_default())
}

// --- Ely.by Auth ---
#[tauri::command]
fn authenticate_elyby(app: State<AppState>) -> Value {
    log_msg(&app, "[Auth/Ely.by] Starting OAuth2 flow...");

    // Start local HTTP server
    let code_clone = Arc::clone(&app.elyby_auth_code);
    std::thread::spawn(move || {
        use std::net::TcpListener;
        let listener = TcpListener::bind("127.0.0.1:8080");
        if listener.is_err() {
            return;
        }
        let listener = listener.unwrap();
        listener.set_nonblocking(true).ok();
        for _ in 0..120 {
            if let Ok(stream) = listener.accept() {
                let mut stream = stream.0;
                let mut buf = [0u8; 4096];
                if let Ok(n) = stream.read(&mut buf) {
                    let request = String::from_utf8_lossy(&buf[..n]);
                    if let Some(query_start) = request.find("code=") {
                        let query_part = &request[query_start+5..];
                        let code: String = query_part.split_whitespace().next()
                            .and_then(|s| s.split('&').next())
                            .unwrap_or("").to_string();
                        if !code.is_empty() {
                            if let Ok(mut guard) = code_clone.lock() {
                                *guard = Some(code);
                            }
                            let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<h1>Login Successful! You can close this window.</h1>";
                            let _ = stream.write_all(response.as_bytes());
                            return;
                        }
                    }
                }
                let response = "HTTP/1.1 400 Bad Request\r\n\r\nMissing code";
                let _ = stream.write_all(response.as_bytes());
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    });

    let params = format!(
        "client_id={}&redirect_uri={}&response_type=code&scope={}",
        ELYBY_CLIENT_ID, ELYBY_REDIRECT_URI, "account_info%20minecraft_server_session%20offline_access"
    );
    let auth_url = format!("https://account.ely.by/oauth2/authorize?{}", params);
    log_msg(&app, &format!("[Auth/Ely.by] Open browser: {}", auth_url));
    let _ = webbrowser::open(&auth_url);
    json!({"auth_url": auth_url})
}

#[tauri::command]
fn poll_elyby_auth(app: State<AppState>) -> Value {
    log_msg(&app, "[Auth/Ely.by] Polling for auth code...");
    for _ in 0..120 {
        std::thread::sleep(std::time::Duration::from_secs(2));
        let code = {
            let mut guard = app.elyby_auth_code.lock().unwrap();
            guard.take()
        };
        if let Some(code) = code {
            log_msg(&app, &format!("[Auth/Ely.by] Received code: {}...", &code[..8.min(code.len())]));
            return exchange_elyby_code(app, code);
        }
    }
    json!({"error": "Timed out waiting for Ely.by login"})
}

fn exchange_elyby_code(app: State<AppState>, code: String) -> Value {
    log_msg(&app, "[Auth/Ely.by] Exchanging code for token...");
    let form = format!(
        "grant_type=authorization_code&code={}&redirect_uri={}",
        code, ELYBY_REDIRECT_URI
    );
    match http_post_form(
        "https://account.ely.by/api/oauth2/v1/token",
        &form,
        Some((ELYBY_CLIENT_ID, ELYBY_CLIENT_SECRET)),
    ) {
        Ok(resp) => {
            if resp.get("error").is_some() {
                let err = resp.get("error_description").or(resp.get("error")).and_then(|e| e.as_str()).unwrap_or("Token exchange failed");
                return json!({"error": err});
            }
            let access_token = resp.get("access_token").and_then(|t| t.as_str()).unwrap_or("");
            let refresh_token = resp.get("refresh_token").and_then(|t| t.as_str()).unwrap_or("");
            if access_token.is_empty() {
                return json!({"error": "No access token from Ely.by"});
            }
            log_msg(&app, "[Auth/Ely.by] Got access token, fetching user info...");
            match http_get("https://account.ely.by/api/account/v1/info", Some(&[("Authorization", &format!("Bearer {}", access_token))])) {
                Ok(info) => {
                    if let Some(username) = info.get("username").and_then(|u| u.as_str()) {
                        let username = username.to_string();
                        let uuid = info.get("uuid").and_then(|u| u.as_str()).unwrap_or("").to_string();
                        save_setting_val(&app, "mc_token", Value::String(access_token.to_string()));
                        save_setting_val(&app, "ely_refresh_token", Value::String(refresh_token.to_string()));
                        save_setting_val(&app, "ely_access_token", Value::String(access_token.to_string()));
                        save_setting_val(&app, "username", Value::String(username.clone()));
                        save_setting_val(&app, "ely_by_username", Value::String(username.clone()));
                        save_setting_val(&app, "ely_uuid", Value::String(uuid.clone()));
                        save_setting_val(&app, "cracked_username", Value::String(username.clone()));
                        log_msg(&app, &format!("[Auth/Ely.by] Success! Logged in as '{}'", username));
                        // Auto-download authlib-injector in background
                        std::thread::spawn(move || { ensure_authlib_injector_bg(); });
                        return json!({"success": true, "username": username, "uuid": uuid, "mc_token": access_token, "type": "elyby"});
                    }
                    json!({"error": "Failed to get Ely.by user info"})
                }
                Err(e) => json!({"error": e}),
            }
        }
        Err(e) => json!({"error": e}),
    }
}

#[tauri::command]
fn complete_elyby_auth_cmd(app: State<AppState>, code: String) -> Value {
    exchange_elyby_code(app, code)
}

#[tauri::command]
fn create_offline_account(app: State<AppState>, username: String) -> Value {
    log_msg(&app, &format!("[Auth/Offline] Creating offline account: {}", username));
    save_setting_val(&app, "cracked_username", Value::String(username.clone()));
    save_setting_val(&app, "username", Value::String(username.clone()));
    save_setting_val(&app, "mc_token", Value::String("0".to_string()));
    json!({"success": true, "uuid": "00000000-0000-0000-0000-000000000000", "username": username, "mc_token": "0", "type": "offline"})
}

// --- Authlib Injector ---
fn ensure_authlib_injector_bg() {
    let path = authlib_injector_path();
    if path.exists() { return; }
    if let Ok(data) = http_get("https://api.github.com/repos/yushijinhun/authlib-injector/releases/latest", None) {
        if let Some(assets) = data.get("assets").and_then(|a| a.as_array()) {
            if let Some(jar) = assets.iter().find(|a| a.get("name").and_then(|n| n.as_str()).map(|n| n.ends_with(".jar")).unwrap_or(false)) {
                if let Some(url) = jar.get("browser_download_url").and_then(|u| u.as_str()) {
                    let _ = download_file_blocking(url, &path);
                }
            }
        }
    }
}

#[tauri::command]
fn ensure_authlib_injector() -> Value {
    let path = authlib_injector_path();
    if path.exists() {
        return json!({"success": true, "path": path.to_string_lossy()});
    }
    match http_get("https://api.github.com/repos/yushijinhun/authlib-injector/releases/latest", None) {
        Ok(data) => {
            if let Some(assets) = data.get("assets").and_then(|a| a.as_array()) {
                if let Some(jar) = assets.iter().find(|a| a.get("name").and_then(|n| n.as_str()).map(|n| n.ends_with(".jar")).unwrap_or(false)) {
                    if let Some(url) = jar.get("browser_download_url").and_then(|u| u.as_str()) {
                        match download_file_blocking(url, &path) {
                            Ok(()) => json!({"success": true, "path": path.to_string_lossy()}),
                            Err(e) => json!({"error": e}),
                        }
                    } else {
                        json!({"error": "No download URL found"})
                    }
                } else {
                    json!({"error": "No .jar asset found"})
                }
            } else {
                json!({"error": "No assets in release"})
            }
        }
        Err(e) => json!({"error": e}),
    }
}

// --- Game Launch ---
#[tauri::command]
fn launch_game(app: State<AppState>, app_handle: tauri::AppHandle, instance_name: String) -> Value {
    log_msg(&app, &format!("[Launch] Preparing '{}'...", instance_name));

    let instances = load_instances_raw(&app);
    let instance = instances.iter().find(|i| i.get("name").and_then(|n| n.as_str()) == Some(&instance_name));
    let instance = match instance {
        Some(i) => i.clone(),
        None => return json!({"error": format!("Instance {} not found", instance_name)}),
    };

    let mc_version = instance.get("version").and_then(|v| v.as_str()).unwrap_or("");
    let loader = instance.get("loader").and_then(|v| v.as_str()).unwrap_or("Vanilla");
    let loader_version = instance.get("loader_version").and_then(|v| v.as_str()).unwrap_or("");

    let inst_dir = instances_dir().join(&instance_name);
    let vj_path = inst_dir.join(format!("{}.json", mc_version));
    if !vj_path.exists() {
        return json!({"error": "Version JSON missing. Please reinstall."});
    }

    let ver_json = load_json(&vj_path);

    // Find Java - with auto-detection and auto-download
    let settings = load_settings(&app);
    let required_java = get_required_java_for_mc(mc_version);
    let custom_java = settings.get("java_path").and_then(|v| v.as_str()).unwrap_or("");
    let host_arch = get_host_arch();

    // Step 1: Check if custom path works
    let mut java_exec = String::new();
    if !custom_java.is_empty() && Path::new(custom_java).exists() {
        if let Some(major) = get_java_major_version(custom_java) {
            let arch = get_java_arch(custom_java).unwrap_or_else(|| "unknown".to_string());
            if major == required_java && arch == host_arch {
                java_exec = custom_java.to_string();
            }
        }
    }

    // Step 2: Check all installed Javas for compatible version + arch
    if java_exec.is_empty() {
        let all_javas = find_all_java_installations();
        for j in &all_javas {
            let ver_match = j.get("major_version").and_then(|v| v.as_u64()).unwrap_or(0) as u32 == required_java;
            let arch_match = j.get("compatible_arch").and_then(|v| v.as_bool()).unwrap_or(false);
            if ver_match && arch_match {
                if let Some(p) = j.get("path").and_then(|v| v.as_str()) {
                    java_exec = p.to_string();
                    break;
                }
            }
        }
        // If no arch-matched, try any version-matched
        if java_exec.is_empty() {
            for j in &all_javas {
                let ver_match = j.get("major_version").and_then(|v| v.as_u64()).unwrap_or(0) as u32 == required_java;
                if ver_match {
                    if let Some(p) = j.get("path").and_then(|v| v.as_str()) {
                        java_exec = p.to_string();
                        break;
                    }
                }
            }
        }
    }

    // Step 3: Auto-download correct Java if none found
    if java_exec.is_empty() {
        log_msg(&app, &format!("[Launch/Java] No compatible Java found. Auto-downloading Java {} (arch: {})...", required_java, host_arch));
        match auto_download_java(&app, required_java) {
            Ok(path) => {
                java_exec = path.clone();
                save_setting_val(&app, "java_path", Value::String(path));
                log_msg(&app, &format!("[Launch/Java] Auto-downloaded Java {}: {}", required_java, java_exec));
            }
            Err(e) => {
                return json!({"error": format!("Java {} not found and auto-download failed: {}. Please install Java {} for {} manually.", required_java, e, required_java, host_arch)});
            }
        }
    } else {
        // Step 4: Check if detected Java is the wrong version, auto-download correct one
        if let Some(current_major) = get_java_major_version(&java_exec) {
            if current_major != required_java {
                log_msg(&app, &format!("[Launch/Java] Java {} detected but MC {} needs Java {}. Auto-downloading...",
                    current_major, mc_version, required_java));
                match auto_download_java(&app, required_java) {
                    Ok(path) => {
                        java_exec = path.clone();
                        save_setting_val(&app, "java_path", Value::String(path));
                        log_msg(&app, &format!("[Launch/Java] Auto-downloaded Java {}: {}", required_java, java_exec));
                    }
                    Err(e) => {
                        log_msg(&app, &format!("[Launch/Java] Auto-download failed: {}. Falling back to Java {} (may not work)", e, current_major));
                    }
                }
            }
        }
    }

    if java_exec.is_empty() {
        return json!({"error": "No compatible Java found. Please install Java or check Settings -> Java."});
    }
    log_msg(&app, &format!("[Launch/Java] Using: {} (required: Java {} for MC {}, arch: {})", java_exec, required_java, mc_version, host_arch));

    // Prepare natives
    let natives_dir = inst_dir.join("natives");
    let _ = std::fs::create_dir_all(&natives_dir);
    let _ = std::fs::remove_dir_all(&natives_dir);
    let _ = std::fs::create_dir_all(&natives_dir);

    // Build classpath
    let mut classpath: Vec<String> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    let mut add_cp = |path: &Path| {
        let s = path.to_string_lossy().to_string();
        if !seen.contains(&s) {
            seen.insert(s.clone());
            classpath.push(s);
        }
    };

    // MC jar
    let mc_jar = inst_dir.join(format!("{}.jar", mc_version));
    if mc_jar.exists() {
        add_cp(&mc_jar);
    }

    // Libraries
    let libs = libraries_dir();
    if let Some(libraries) = ver_json.get("libraries").and_then(|l| l.as_array()) {
        for lib in libraries {
            if !is_lib_allowed(lib) { continue; }
            if let Some(artifact) = lib.get("downloads").and_then(|d| d.get("artifact")) {
                if let Some(path) = artifact.get("path").and_then(|p| p.as_str()) {
                    let lib_path = libs.join(path);
                    if lib_path.exists() {
                        let basename = lib_path.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
                        if basename.contains("fabric-loader") || basename.contains("quilt-loader") { continue; }
                        add_cp(&lib_path);
                    }
                }
            }
        }
    }

    let mut main_class = ver_json.get("mainClass").and_then(|c| c.as_str()).unwrap_or("net.minecraft.client.main.Main").to_string();

    // Loader JAR + profile libraries
    let loader_lower = loader.to_lowercase();
    if loader_lower == "fabric" || loader_lower == "quilt" {
        let loader_name = if loader_lower == "quilt" { "quilt-loader" } else { "fabric-loader" };
        let loader_jars: Vec<PathBuf> = match std::fs::read_dir(&inst_dir) {
            Ok(rd) => rd.filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| {
                    let name = p.file_name().unwrap_or_default().to_string_lossy();
                    name.starts_with(loader_name) && name.ends_with(".jar") && !name.contains("profile")
                })
                .collect(),
            Err(_) => vec![],
        };
        if loader_jars.is_empty() {
            return json!({"error": format!("{} Loader JAR missing in instance folder!", loader)});
        }
        add_cp(&loader_jars[0]);

        // Profile libraries
        let profile_globs: Vec<PathBuf> = match std::fs::read_dir(&inst_dir) {
            Ok(rd) => rd.filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| {
                    let name = p.file_name().unwrap_or_default().to_string_lossy();
                    name.contains(loader_name) && name.ends_with("profile.json")
                })
                .collect(),
            Err(_) => vec![],
        };
        if let Some(profile_path) = profile_globs.first() {
            if let Ok(profile_data) = std::fs::read_to_string(profile_path) {
                if let Ok(profile) = serde_json::from_str::<Value>(&profile_data) {
                    if let Some(profile_libs) = profile.get("libraries").and_then(|l| l.as_array()) {
                        for lib in profile_libs {
                            if let Some(art_path) = lib.get("downloads").and_then(|d| d.get("artifact")).and_then(|a| a.get("path")).and_then(|p| p.as_str()) {
                                let fp = libs.join(art_path);
                                if fp.exists() {
                                    let basename = fp.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
                                    if !basename.contains(loader_name) {
                                        add_cp(&fp);
                                    }
                                }
                            } else if let Some(name) = lib.get("name").and_then(|n| n.as_str()) {
                                if let Some(maven_path) = maven_name_to_path(name) {
                                    let fp = libs.join(&maven_path);
                                    if fp.exists() {
                                        let basename = fp.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
                                        if !basename.contains(loader_name) {
                                            add_cp(&fp);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if loader_lower == "fabric" {
                        main_class = "net.fabricmc.loader.impl.launch.knot.KnotClient".to_string();
                    } else {
                        main_class = "org.quiltmc.loader.impl.launch.knot.KnotClient".to_string();
                    }
                }
            }
        }
    }

    if classpath.is_empty() {
        return json!({"error": "Classpath is empty! Installation likely failed."});
    }

    // JVM Args
    let ram_mb = settings.get("ram_mb").and_then(|v| v.as_i64()).unwrap_or(2048);
    let min_heap = std::cmp::min(512, ram_mb);
    let mut jvm_args: Vec<String> = vec![
        format!("-Xmx{}M", ram_mb),
        format!("-Xms{}M", min_heap),
        "-XX:+UnlockExperimentalVMOptions".into(),
        "-XX:+UseG1GC".into(),
        "-XX:G1NewSizePercent=20".into(),
        "-XX:G1ReservePercent=20".into(),
        "-XX:MaxGCPauseMillis=50".into(),
        "-XX:G1HeapRegionSize=32M".into(),
        format!("-Djava.library.path={}", natives_dir.to_string_lossy()),
        format!("-Djna.tmpdir={}", natives_dir.to_string_lossy()),
        format!("-Dorg.lwjgl.system.SharedLibraryExtractPath={}", natives_dir.to_string_lossy()),
        "-Dminecraft.launcher.brand=EcLauncher".into(),
        "-Dminecraft.launcher.version=5.0".into(),
    ];

    // Ely.by authlib-injector — only if online
    let ely_access = settings.get("ely_access_token").and_then(|v| v.as_str());
    let ely_uuid = settings.get("ely_uuid").and_then(|v| v.as_str());
    let online = is_connected();
    if !online {
        log_msg(&app, "[Launch] No internet connection detected — skipping authlib-injector, using offline auth");
    }
    if online && ely_access.is_some() && ely_uuid.is_some() && authlib_injector_path().exists() {
        jvm_args.insert(0, format!("-javaagent:{}=ely.by", authlib_injector_path().to_string_lossy()));
        log_msg(&app, "[Launch] Authlib-injector enabled for Ely.by skins");
    }

    // Custom JVM args
    let global_jvm = settings.get("global_jvm").and_then(|v| v.as_str()).unwrap_or("");
    let custom_args: Vec<&str> = global_jvm.split_whitespace().collect();
    jvm_args.extend(custom_args.iter().map(|s| s.to_string()));

    // Auth selection
    let ely_username = settings.get("ely_by_username").and_then(|v| v.as_str());
    let ely_token = settings.get("mc_token").and_then(|v| v.as_str());
    let ms_username = settings.get("username").and_then(|v| v.as_str());

    let (username, access_token, user_uuid, user_type) = if online && ely_username.is_some() && ely_token.is_some() {
        let un = ely_username.unwrap();
        let tk = ely_token.unwrap();
        if !un.is_empty() && tk != "0" {
            log_msg(&app, &format!("[Launch/Auth] Using Ely.by account: {}", un));
            if authlib_injector_path().exists() {
                jvm_args.insert(0, format!("-javaagent:{}=ely.by", authlib_injector_path().to_string_lossy()));
            }
            (un.to_string(), tk.to_string(), ely_uuid.unwrap_or("00000000-0000-0000-0000-000000000000").to_string(), "mojang".to_string())
        } else if let Some(un) = ms_username {
            let tk = settings.get("mc_token").and_then(|v| v.as_str()).unwrap_or("0");
            log_msg(&app, &format!("[Launch/Auth] Using Microsoft account: {}", un));
            (un.to_string(), tk.to_string(), "00000000-0000-0000-0000-000000000000".to_string(), "mojang".to_string())
        } else {
            let un = settings.get("cracked_username").and_then(|v| v.as_str()).unwrap_or("Player");
            log_msg(&app, &format!("[Launch/Auth] Using offline account: {}", un));
            (un.to_string(), "0".to_string(), "00000000-0000-0000-0000-000000000000".to_string(), "legacy".to_string())
        }
    } else if let Some(un) = ms_username {
        let tk = settings.get("mc_token").and_then(|v| v.as_str()).unwrap_or("0");
        log_msg(&app, &format!("[Launch/Auth] Using Microsoft account: {}", un));
        (un.to_string(), tk.to_string(), "00000000-0000-0000-0000-000000000000".to_string(), "mojang".to_string())
    } else {
        let un = settings.get("cracked_username").and_then(|v| v.as_str()).unwrap_or("Player");
        log_msg(&app, &format!("[Launch/Auth] Using offline account: {}", un));
        (un.to_string(), "0".to_string(), "00000000-0000-0000-0000-000000000000".to_string(), "legacy".to_string())
    };

    let asset_index = ver_json.get("assetIndex").and_then(|a| a.get("id")).and_then(|i| i.as_str()).unwrap_or(mc_version);

    let game_args = vec![
        "--version".into(), mc_version.to_string(),
        "--gameDir".into(), inst_dir.to_string_lossy().to_string(),
        "--assetsDir".into(), assets_dir().to_string_lossy().to_string(),
        "--assetIndex".into(), asset_index.to_string(),
        "--accessToken".into(), access_token,
        "--username".into(), username,
        "--uuid".into(), user_uuid,
        "--userType".into(), user_type,
    ];

    let classpath_str = classpath.join(if cfg!(target_os = "windows") { ";" } else { ":" });
    let mut cmd = vec![java_exec];
    cmd.extend(jvm_args);
    cmd.push("-cp".into());
    cmd.push(classpath_str);
    cmd.push(main_class);
    cmd.extend(game_args);

    log_msg(&app, &format!("[Launch] Starting '{}' ({})...", instance_name, loader));

    // Save last launch
    save_setting_val(&app, &format!("last_launch_{}", instance_name), Value::String(chrono::Local::now().to_rfc3339()));

    // Launch process in background thread
    let inst_name_clone = instance_name.clone();
    let settings_clone = settings.clone();
    let loader_clone = loader.to_string();
    let version_clone = mc_version.to_string();
    std::thread::spawn(move || {
        // Setup CustomSkinLoader for offline users
        let is_offline = settings_clone.get("cracked_username").is_some() &&
            settings_clone.get("mc_token").map(|v| v.as_str()) == Some(Some("0"));
        if is_offline {
            setup_custom_skin_loader(&inst_name_clone, &settings_clone);
        }

        // Pre-launch hook
        if let Some(pre_cmd) = settings_clone.get("pre_launch_cmd").and_then(|v| v.as_str()) {
            if !pre_cmd.trim().is_empty() {
                let mut hook = hidden_cmd("cmd");
                hook.args(["/C", pre_cmd]);
                hook.stdout(std::process::Stdio::null());
                hook.stderr(std::process::Stdio::null());
                hook.stdin(std::process::Stdio::null());
                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    const CREATE_NO_WINDOW: u32 = 0x08000000;
                    hook.creation_flags(CREATE_NO_WINDOW);
                }
                let _ = hook.spawn();
            }
        }

        log_msg_state(&app_handle, &format!("[Launch] Process starting..."));

        let mut child = std::process::Command::new(&cmd[0]);
        for arg in &cmd[1..] {
            child.arg(arg);
        }
        child.current_dir(&inst_dir);
        child.stdout(std::process::Stdio::piped());
        child.stderr(std::process::Stdio::piped());
        child.stdin(std::process::Stdio::null());
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            child.creation_flags(CREATE_NO_WINDOW);
        }

        let session_start = std::time::Instant::now();

        match child.spawn() {
            Ok(mut proc) => {
                log_msg_state(&app_handle, &format!("[Launch/OK] Process started, PID: {:?}", proc.id()));
                append_output_state(&app_handle, &format!("[Launch] Minecraft started (PID: {:?})", proc.id()));

                // Update Discord RPC to show playing state
                {
                    let rpc_enabled = settings_clone.get("discord_rpc").and_then(|v| v.as_bool()).unwrap_or(true);
                    if rpc_enabled {
                        let state = app_handle.state::<AppState>();
                        // Ensure RPC is connected
                        {
                            let discord_handle = state.discord_handle.lock().unwrap();
                            if discord_handle.is_none() {
                                drop(discord_handle);
                                let _ = init_discord_rpc(app_handle.clone());
                                // Wait briefly for connection
                                std::thread::sleep(std::time::Duration::from_secs(2));
                            }
                        }
                        let discord_handle = state.discord_handle.lock().unwrap();
                        if let Some(h) = discord_handle.as_ref() {
                            let loader_str = if loader_clone.to_lowercase() == "vanilla" { String::new() } else { format!(" ({})", loader_clone) };
                            let _ = h.sender.send(DiscordMessage::Update {
                                details: format!("Playing Minecraft{}", loader_str),
                                state: format!("{} • {}", inst_name_clone, version_clone),
                                large_image: "minecraft_logo".to_string(),
                                large_text: "Minecraft".to_string(),
                                small_image: "eclauncher_logo".to_string(),
                                small_text: "EcLauncher".to_string(),
                            });
                            eprintln!("[Discord RPC] Updated to Playing state for {}", inst_name_clone);
                        }
                    }
                }

                if let Some(stdout) = proc.stdout.take() {
                    let reader = std::io::BufReader::new(stdout);
                    for line in reader.lines() {
                        if let Ok(line) = line {
                            let trimmed = line.trim().to_string();
                            if !trimmed.is_empty() {
                                append_output_state(&app_handle, &trimmed);
                                if !trimmed.contains("DEBUG") {
                                    log_msg_state(&app_handle, &format!("[MC] {}", trimmed));
                                }
                            }
                        }
                    }
                }

                let exit_code = proc.wait().map(|s| s.code().unwrap_or(1)).unwrap_or(1);
                if exit_code != 0 {
                    log_msg_state(&app_handle, &format!("[MC/ERROR] Game exited with code {}", exit_code));
                    append_output_state(&app_handle, &format!("[ERROR] Game exited with code {}", exit_code));
                } else {
                    log_msg_state(&app_handle, "[MC/INFO] Game closed normally.");
                    append_output_state(&app_handle, "[INFO] Game closed normally.");
                }

                // Update Discord RPC - game closed, back to launcher
                {
                    let state = app_handle.state::<AppState>();
                    let discord_handle = state.discord_handle.lock().unwrap();
                    if let Some(h) = discord_handle.as_ref() {
                        let _ = h.sender.send(DiscordMessage::Update {
                            details: "Browsing EcLauncher".to_string(),
                            state: "In Launcher".to_string(),
                            large_image: "eclauncher_logo".to_string(),
                            large_text: "EcLauncher".to_string(),
                            small_image: "".to_string(),
                            small_text: "".to_string(),
                        });
                    }
                }
            }
            Err(e) => {
                log_msg_state(&app_handle, &format!("[Launch/ERROR] {}", e));
                append_output_state(&app_handle, &format!("[ERROR] {}", e));
            }
        }

        // Post-launch hook
        if let Some(post_cmd) = settings_clone.get("post_launch_cmd").and_then(|v| v.as_str()) {
            if !post_cmd.trim().is_empty() {
                let mut hook = hidden_cmd("cmd");
                hook.args(["/C", post_cmd]);
                hook.stdout(std::process::Stdio::null());
                hook.stderr(std::process::Stdio::null());
                hook.stdin(std::process::Stdio::null());
                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    const CREATE_NO_WINDOW: u32 = 0x08000000;
                    hook.creation_flags(CREATE_NO_WINDOW);
                }
                let _ = hook.spawn();
            }
        }

        // Save playtime
        let elapsed = session_start.elapsed().as_secs_f64();
        let pt_path = playtimes_file();
        let mut playtimes: HashMap<String, f64> = load_json(&pt_path).as_object()
            .map(|obj| obj.iter().filter_map(|(k, v)| v.as_f64().map(|f| (k.clone(), f))).collect())
            .unwrap_or_default();
        *playtimes.entry(inst_name_clone).or_insert(0.0) += elapsed;
        let pt_val: serde_json::Map<String, Value> = playtimes.into_iter().map(|(k, v)| (k, json!(v))).collect();
        save_json(&pt_path, &Value::Object(pt_val));
        log_msg_state(&app_handle, &format!("[Launch] Playtime +{}s saved", elapsed as u64));
    });

    json!({"success": true, "message": "Game process started"})
}

fn which_java() -> String {
    let cmd_name = if cfg!(target_os = "windows") { "java.exe" } else { "java" };
    if cfg!(target_os = "windows") {
        let paths = [
            "java.exe",
            "C:\\Program Files\\Java\\jre*\\bin\\java.exe",
            "C:\\Program Files\\Eclipse Adoptium\\*\\bin\\java.exe",
        ];
        for p in &paths {
            if let Ok(output) = hidden_cmd("where").arg(p.trim_end_matches('*')).output() {
                let out = String::from_utf8_lossy(&output.stdout);
                for line in out.lines() {
                    let trimmed = line.trim().to_string();
                    if trimmed.is_empty() { continue; }
                    if get_java_major_version(&trimmed).is_some() {
                        return trimmed;
                    }
                }
            }
        }
    }
    if let Ok(output) = hidden_cmd(cmd_name).arg("-version").output() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("java version") || stderr.contains("openjdk") {
            return cmd_name.to_string();
        }
    }
    String::new()
}

fn get_host_arch() -> &'static str {
    if cfg!(target_arch = "x86_64") || cfg!(target_arch = "x86") {
        "x64"
    } else if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        "x64"
    }
}

fn get_java_arch(java_path: &str) -> Option<String> {
    // Prefer PE header check (no process execution needed)
    if let Some(arch) = get_exe_arch_from_pe_header(java_path) {
        if !arch.starts_with("unknown_") {
            return Some(arch);
        }
    }
    // Fallback: try running java
    let output = hidden_cmd(java_path)
        .arg("-XshowSettings:properties")
        .arg("-version")
        .output()
        .ok()?;
    let combined = format!("{}{}", 
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout));
    for line in combined.lines() {
        if line.contains("os.arch") {
            if let Some(val) = line.split('=').last() {
                let v = val.trim().to_lowercase();
                if v.contains("amd64") || v.contains("x86_64") { return Some("x64".to_string()); }
                if v.contains("aarch64") || v.contains("arm64") { return Some("aarch64".to_string()); }
                if v.contains("x86") || v.contains("i386") || v.contains("i686") { return Some("x86".to_string()); }
            }
        }
    }
    None
}

fn setup_custom_skin_loader(inst_name: &str, settings: &HashMap<String, Value>) {
    let username = settings.get("cracked_username").and_then(|v| v.as_str()).unwrap_or("Player");
    let mc_token = settings.get("mc_token").and_then(|v| v.as_str());
    if username.is_empty() || (mc_token.is_some() && mc_token.unwrap() != "0") { return; }

    let inst_dir = instances_dir().join(inst_name);
    let mods_dir = inst_dir.join("mods");
    let _ = std::fs::create_dir_all(&mods_dir);

    let csl_filename = "CustomSkinLoader_Fabric-14.19.1.jar";
    let csl_path = mods_dir.join(csl_filename);

    // Always check if file exists AND is a valid ZIP before skipping
    let needs_download = if csl_path.exists() {
        match std::fs::File::open(&csl_path) {
            Ok(f) => {
                let metadata = f.metadata().map(|m| m.len()).unwrap_or(0);
                if metadata < 1000 {
                    // File is too small to be a real JAR
                    let _ = std::fs::remove_file(&csl_path);
                    true
                } else {
                    // Check if it's a valid ZIP by trying to open it
                    match zip::ZipArchive::new(f) {
                        Ok(_) => false, // Valid ZIP, no download needed
                        Err(_) => {
                            let _ = std::fs::remove_file(&csl_path);
                            true // Corrupt file, re-download
                        }
                    }
                }
            }
            Err(_) => true,
        }
    } else {
        true
    };

    if needs_download {
        let urls = [
            "https://cdn.modrinth.com/data/xnKZg9P2/versions/MkQ7y5wL/CustomSkinLoader_Fabric-14.19.1.jar",
            "https://cdn.modrinth.com/data/xnKZg9P2/version/MkQ7y5wL/CustomSkinLoader_Fabric-14.19.1.jar",
        ];
        for url in &urls {
            if download_file_blocking(url, &csl_path).is_ok() {
                // Verify the download is actually a valid JAR/ZIP
                match std::fs::File::open(&csl_path) {
                    Ok(f) => {
                        let size = f.metadata().map(|m| m.len()).unwrap_or(0);
                        if size < 1000 {
                            let _ = std::fs::remove_file(&csl_path);
                            continue;
                        }
                        match zip::ZipArchive::new(f) {
                            Ok(_) => break, // Valid!
                            Err(_) => { let _ = std::fs::remove_file(&csl_path); }
                        }
                    }
                    Err(_) => { let _ = std::fs::remove_file(&csl_path); }
                }
            }
        }
    }

    let config_file = inst_dir.join("config").join("CustomSkinLoader").join("CustomSkinLoader.json");
    if !config_file.exists() {
        let _ = std::fs::create_dir_all(config_file.parent().unwrap());
        let config = json!({
            "enable": true,
            "loadlist": [
                {"name": "LocalFile", "type": "LocalFile"},
                {"name": "Mojang", "type": "MojangAPI"},
            ]
        });
        let _ = save_json(&config_file, &config);
    }

    // Copy skin to instance
    let skin = custom_skin_path();
    if skin.exists() {
        let skin_folder = inst_dir.join("skins");
        let _ = std::fs::create_dir_all(&skin_folder);
        let target = skin_folder.join(format!("{}.png", username));
        let _ = std::fs::copy(&skin, &target);
    }
}

// --- Modrinth ---
#[tauri::command]
fn search_modrinth(query: String, project_type: Option<String>, loader: Option<String>, mc_version: Option<String>, limit: Option<u32>) -> Value {
    let ptype = project_type.unwrap_or_else(|| "mod".to_string());
    let mut facets: Vec<Vec<String>> = vec![vec![format!("project_type:{}", ptype)]];
    if let Some(ref l) = loader {
        if !l.is_empty() {
            facets.push(vec![format!("categories:{}", l.to_lowercase())]);
        }
    }
    if let Some(ref v) = mc_version {
        if !v.is_empty() {
            facets.push(vec![format!("versions:{}", v)]);
        }
    }
    let sort = if query.is_empty() { "downloads" } else { "relevance" };
    let url = format!("{}/search?query={}&facets={}&index={}&limit={}",
        MODRINTH_API, urlencoding::encode(&query),
        urlencoding::encode(&serde_json::to_string(&facets).unwrap_or_default()),
        sort, limit.unwrap_or(20));

    match http_get(&url, None) {
        Ok(data) => {
            data.get("hits").cloned().unwrap_or(Value::Array(vec![]))
        }
        Err(_) => Value::Array(vec![]),
    }
}

#[tauri::command]
fn get_modrinth_project(slug: String) -> Value {
    http_get(&format!("{}/project/{}", MODRINTH_API, slug), None).unwrap_or(Value::Null)
}

#[tauri::command]
fn get_modrinth_versions(slug: String, loader: Option<String>, mc_version: Option<String>) -> Value {
    let mut params = Vec::new();
    if let Some(ref l) = loader {
        if !l.is_empty() {
            params.push(format!("loaders={}", urlencoding::encode(&serde_json::to_string(&vec![l.to_lowercase()]).unwrap_or_default())));
        }
    }
    if let Some(ref v) = mc_version {
        if !v.is_empty() {
            params.push(format!("game_versions={}", urlencoding::encode(&serde_json::to_string(&vec![v.clone()]).unwrap_or_default())));
        }
    }
    let url = if params.is_empty() {
        format!("{}/project/{}/version", MODRINTH_API, slug)
    } else {
        format!("{}/project/{}/version?{}", MODRINTH_API, slug, params.join("&"))
    };
    http_get(&url, None).unwrap_or(Value::Array(vec![]))
}

#[tauri::command]
fn install_mod(app: State<AppState>, instance_name: String, slug: String, version_id: Option<String>) -> Value {
    log_msg(&app, &format!("[Mod] Installing mod '{}' to '{}'...", slug, instance_name));
    let mods_dir = instances_dir().join(&instance_name).join("mods");
    let _ = std::fs::create_dir_all(&mods_dir);

    let versions = get_modrinth_versions(slug.clone(), None, None);
    let versions_arr = versions.as_array().cloned().unwrap_or_default();
    if versions_arr.is_empty() {
        return json!({"error": "No versions found"});
    }

    let target_version = if let Some(ref vid) = version_id {
        if !vid.is_empty() {
            versions_arr.iter().find(|v| v.get("id").and_then(|i| i.as_str()) == Some(vid.as_str())).unwrap_or(&versions_arr[0])
        } else {
            &versions_arr[0]
        }
    } else {
        &versions_arr[0]
    };

    let files = target_version.get("files").and_then(|f| f.as_array()).cloned().unwrap_or_default();
    let primary = files.iter().find(|f| f.get("primary").and_then(|p| p.as_bool()).unwrap_or(false)).unwrap_or(files.first().unwrap_or(&Value::Null));
    let filename = primary.get("filename").and_then(|f| f.as_str()).unwrap_or("mod.jar");
    let download_url = primary.get("url").and_then(|u| u.as_str()).unwrap_or("");

    if download_url.is_empty() {
        return json!({"error": "No download URL"});
    }

    let dest = mods_dir.join(filename);
    match download_file_blocking(download_url, &dest) {
        Ok(()) => {
            log_msg(&app, &format!("[Mod/OK] '{}' installed!", filename));
            json!({"success": true, "filename": filename})
        }
        Err(e) => json!({"error": e}),
    }
}

#[tauri::command]
fn install_resourcepack(app: State<AppState>, instance_name: String, slug: String, version_id: Option<String>) -> Value {
    log_msg(&app, &format!("[ResourcePack] Installing '{}' to '{}'...", slug, instance_name));
    let rp_dir = instances_dir().join(&instance_name).join("resourcepacks");
    let _ = std::fs::create_dir_all(&rp_dir);

    let versions = get_modrinth_versions(slug.clone(), None, None);
    let versions_arr = versions.as_array().cloned().unwrap_or_default();
    if versions_arr.is_empty() { return json!({"error": "No versions found"}); }

    let target_version = if let Some(ref vid) = version_id {
        if !vid.is_empty() {
            versions_arr.iter().find(|v| v.get("id").and_then(|i| i.as_str()) == Some(vid.as_str())).unwrap_or(&versions_arr[0])
        } else { &versions_arr[0] }
    } else { &versions_arr[0] };

    let files = target_version.get("files").and_then(|f| f.as_array()).cloned().unwrap_or_default();
    let primary = files.iter().find(|f| f.get("primary").and_then(|p| p.as_bool()).unwrap_or(false)).unwrap_or(files.first().unwrap_or(&Value::Null));
    let filename = primary.get("filename").and_then(|f| f.as_str()).unwrap_or("pack.zip");
    let download_url = primary.get("url").and_then(|u| u.as_str()).unwrap_or("");

    if download_url.is_empty() { return json!({"error": "No download URL"}); }

    let dest = rp_dir.join(filename);
    match download_file_blocking(download_url, &dest) {
        Ok(()) => {
            log_msg(&app, &format!("[ResourcePack/OK] '{}' installed!", filename));
            json!({"success": true, "filename": filename})
        }
        Err(e) => json!({"error": e}),
    }
}

#[tauri::command]
fn install_modpack(app: State<AppState>, instance_name: String, slug: String, version_id: Option<String>) -> Value {
    log_msg(&app, &format!("[Modpack] Installing '{}' to '{}'...", slug, instance_name));

    let versions = get_modrinth_versions(slug.clone(), None, None);
    let versions_arr = versions.as_array().cloned().unwrap_or_default();
    if versions_arr.is_empty() { return json!({"error": "No versions found"}); }

    let target_version = if let Some(ref vid) = version_id {
        if !vid.is_empty() {
            versions_arr.iter().find(|v| v.get("id").and_then(|i| i.as_str()) == Some(vid.as_str())).unwrap_or(&versions_arr[0])
        } else { &versions_arr[0] }
    } else { &versions_arr[0] };

    let files = target_version.get("files").and_then(|f| f.as_array()).cloned().unwrap_or_default();
    let primary = files.iter().find(|f| f.get("primary").and_then(|p| p.as_bool()).unwrap_or(false)).unwrap_or(files.first().unwrap_or(&Value::Null));
    let download_url = primary.get("url").and_then(|u| u.as_str()).unwrap_or("");
    let filename = primary.get("filename").and_then(|f| f.as_str()).unwrap_or("modpack.mrpack");

    if download_url.is_empty() { return json!({"error": "No download URL"}); }

    let temp_dir = tempfile::tempdir().unwrap();
    let mrpack_file = temp_dir.path().join(filename);

    match download_file_blocking(download_url, &mrpack_file) {
        Ok(()) => {}
        Err(e) => return json!({"error": e}),
    }

    log_msg(&app, &format!("[Modpack] Parsing {}...", filename));
    let inst_dir = instances_dir().join(&instance_name);

    let mut zip = match zip::ZipArchive::new(std::fs::File::open(&mrpack_file).unwrap()) {
        Ok(z) => z,
        Err(e) => return json!({"error": e.to_string()}),
    };

    // Read modrinth.index.json
    if let Ok(mut index_file) = zip.by_name("modrinth.index.json") {
        let mut index_data = String::new();
        let _ = index_file.read_to_string(&mut index_data);
        if let Ok(index) = serde_json::from_str::<Value>(&index_data) {
            if let Some(files_list) = index.get("files").and_then(|f| f.as_array()) {
                log_msg(&app, &format!("[Modpack] {} files to install from index", files_list.len()));
                for entry in files_list {
                    if let Some(path) = entry.get("path").and_then(|p| p.as_str()) {
                        if let Some(downloads) = entry.get("downloads").and_then(|d| d.as_array()) {
                            if let Some(file_url) = downloads.first().and_then(|u| u.as_str()) {
                                let dest = inst_dir.join(path);
                                if dest.exists() { continue; }
                                if let Some(parent) = dest.parent() {
                                    let _ = std::fs::create_dir_all(parent);
                                }
                                let _ = download_file_blocking(file_url, &dest);
                            }
                        }
                    }
                }
            }
        }
    }

    // Extract overrides
    for i in 0..zip.len() {
        if let Ok(mut file) = zip.by_index(i) {
            let name = file.name().to_string();
            if name.starts_with("overrides/") && !name.ends_with('/') {
                let rel = name.strip_prefix("overrides/").unwrap_or(&name);
                let dest = inst_dir.join(rel);
                if let Some(parent) = dest.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                let mut buf = Vec::new();
                let _ = file.read_to_end(&mut buf);
                let _ = std::fs::write(&dest, &buf);
            }
        }
    }

    log_msg(&app, &format!("[Modpack/OK] '{}' installed successfully!", filename));
    json!({"success": true})
}

// --- News ---
#[tauri::command]
fn get_minecraft_news() -> Value {
    match http_get(MOJANG_VERSION_MANIFEST, None) {
        Ok(data) => {
            let mut news = Vec::new();
            if let Some(latest) = data.get("latest") {
                let latest_release = latest.get("release").and_then(|r| r.as_str()).unwrap_or("");
                let latest_snapshot = latest.get("snapshot").and_then(|s| s.as_str()).unwrap_or("");
                if let Some(versions) = data.get("versions").and_then(|v| v.as_array()) {
                    for v in versions.iter().take(10) {
                        if let Some(id) = v.get("id").and_then(|i| i.as_str()) {
                            if id == latest_release || id == latest_snapshot {
                                news.push(json!({
                                    "title": format!("Minecraft {} ({})", id, v.get("type").and_then(|t| t.as_str()).unwrap_or("")),
                                    "url": v.get("url").and_then(|u| u.as_str()).unwrap_or(""),
                                    "date": v.get("releaseTime").and_then(|d| d.as_str()).unwrap_or(""),
                                    "type": v.get("type").and_then(|t| t.as_str()).unwrap_or(""),
                                }));
                            }
                        }
                    }
                }
            }
            Value::Array(news)
        }
        Err(_) => Value::Array(vec![]),
    }
}

// --- Skin Manager ---
#[tauri::command]
fn get_skin_info(app: State<AppState>) -> Value {
    let settings = load_settings(&app);
    let custom_skin = settings.get("custom_skin_path").and_then(|v| v.as_str()).unwrap_or("");
    json!({
        "custom_skin_path": custom_skin,
        "has_skin": !custom_skin.is_empty() && Path::new(custom_skin).exists(),
    })
}

#[tauri::command]
fn set_custom_skin(file_path: String) -> Value {
    let dest = custom_skin_path();
    match std::fs::copy(&file_path, &dest) {
        Ok(_) => json!({"success": true, "path": dest.to_string_lossy()}),
        Err(e) => json!({"error": e.to_string()}),
    }
}

// --- Optimizer ---
#[tauri::command]
fn get_optimizer_status(instance_name: String) -> Value {
    let options_path = instances_dir().join(&instance_name).join("options.txt");
    let mut options: HashMap<String, String> = HashMap::new();
    if let Ok(content) = std::fs::read_to_string(&options_path) {
        for line in content.lines() {
            if let Some((k, v)) = line.split_once(':') {
                options.insert(k.trim().to_string(), v.trim().to_string());
            }
        }
    }
    json!({
        "render_distance": options.get("renderDistance").and_then(|v| v.parse().ok()).unwrap_or(12),
        "simulation_distance": options.get("simulationDistance").and_then(|v| v.parse().ok()).unwrap_or(12),
        "fps_limit": options.get("fpsLimit").cloned().unwrap_or_else(|| "261".to_string()),
        "vsync": options.get("vsync").cloned().unwrap_or_else(|| "true".to_string()),
        "gamma": options.get("gamma").cloned().unwrap_or_else(|| "1.0".to_string()),
    })
}

#[tauri::command]
fn apply_optimizer(app: State<AppState>, instance_name: String, settings: Value) -> Value {
    let options_path = instances_dir().join(&instance_name).join("options.txt");
    let mut existing: HashMap<String, String> = HashMap::new();
    if let Ok(content) = std::fs::read_to_string(&options_path) {
        for line in content.lines() {
            if let Some((k, v)) = line.split_once(':') {
                existing.insert(k.trim().to_string(), v.trim().to_string());
            }
        }
    }
    if let Some(obj) = settings.as_object() {
        for (k, v) in obj {
            existing.insert(k.clone(), v.as_str().unwrap_or(&v.to_string()).to_string());
        }
    }
    let mut content = String::new();
    for (k, v) in &existing {
        content.push_str(&format!(":{}\n", v));
    }
    let _ = std::fs::write(&options_path, content);
    log_msg(&app, &format!("[Optimizer] Applied settings to {}", instance_name));
    json!({"success": true})
}

// --- Updates ---
#[tauri::command]
fn check_updates() -> Value {
    match http_get(GITHUB_API_URL, None) {
        Ok(data) => {
            if let Some(tag) = data.get("tag_name").and_then(|t| t.as_str()) {
                let remote = tag.trim_start_matches('v');
                if remote > APP_VERSION {
                    let exe_asset = data.get("assets").and_then(|a| a.as_array())
                        .and_then(|arr| arr.iter().find(|a| a.get("name").and_then(|n| n.as_str()).map(|n| n.ends_with(".exe")).unwrap_or(false)))
                        .and_then(|a| a.get("browser_download_url").and_then(|u| u.as_str()));
                    return json!({
                        "update_available": true,
                        "current_version": APP_VERSION,
                        "latest_version": remote,
                        "download_url": exe_asset.unwrap_or(""),
                        "release_notes": data.get("body").and_then(|b| b.as_str()).unwrap_or(""),
                    });
                }
            }
            json!({"update_available": false})
        }
        Err(e) => json!({"error": e}),
    }
}

// --- System Info ---
#[tauri::command]
fn get_system_info() -> Value {
    // Basic system info without psutil
    let mut info = json!({
        "cpu": 0, "ram_used": 0, "ram_total": 0, "ram_pct": 0,
        "disk_used": 0, "disk_total": 0, "disk_pct": 0,
    });

    // Try to get memory info on Windows
    if cfg!(target_os = "windows") {
        if let Ok(output) = hidden_cmd("wmic")
            .args(["OS", "get", "TotalVisibleMemorySize,FreePhysicalMemory", "/value"])
            .output() {
            let text = String::from_utf8_lossy(&output.stdout);
            let mut total = 0u64;
            let mut free = 0u64;
            for line in text.lines() {
                if let Some((k, v)) = line.split_once('=') {
                    if let Ok(val) = v.trim().parse::<u64>() {
                        match k.trim() {
                            "TotalVisibleMemorySize" => total = val * 1024,
                            "FreePhysicalMemory" => free = val * 1024,
                            _ => {}
                        }
                    }
                }
            }
            if total > 0 {
                let used = total - free;
                info["ram_total"] = json!(total);
                info["ram_used"] = json!(used);
                info["ram_pct"] = json!((used as f64 / total as f64 * 100.0) as i64);
            }
        }
        // Disk info
        if let Ok(output) = hidden_cmd("wmic")
            .args(["logicaldisk", "where", "DeviceID='C:'", "get", "Size,FreeSpace", "/value"])
            .output() {
            let text = String::from_utf8_lossy(&output.stdout);
            let mut total = 0u64;
            let mut free = 0u64;
            for line in text.lines() {
                if let Some((k, v)) = line.split_once('=') {
                    if let Ok(val) = v.trim().parse::<u64>() {
                        match k.trim() {
                            "Size" => total = val,
                            "FreeSpace" => free = val,
                            _ => {}
                        }
                    }
                }
            }
            if total > 0 {
                let used = total - free;
                info["disk_total"] = json!(total);
                info["disk_used"] = json!(used);
                info["disk_pct"] = json!((used as f64 / total as f64 * 100.0) as i64);
            }
        }
    }

    info
}

// --- Logs ---
#[tauri::command]
fn get_logs(app: State<AppState>) -> Value {
    let entries = app.log_entries.lock().unwrap();
    Value::Array(entries.iter().map(|e| Value::String(e.clone())).collect())
}

#[tauri::command]
fn clear_logs(app: State<AppState>) -> Value {
    app.log_entries.lock().unwrap().clear();
    json!({"success": true})
}

#[tauri::command]
fn get_game_output(app: State<AppState>) -> Value {
    let buf = app.game_output.lock().unwrap();
    Value::Array(buf.iter().map(|l| Value::String(l.clone())).collect())
}

#[tauri::command]
fn clear_game_output(app: State<AppState>) -> Value {
    app.game_output.lock().unwrap().clear();
    json!({"success": true})
}

// --- Play Times ---
#[tauri::command]
fn get_play_times() -> Value {
    load_json(&playtimes_file())
}

// ==================== HELPER FUNCTIONS FOR BACKGROUND THREADS ====================
fn log_msg_state(app_handle: &tauri::AppHandle, msg: &str) {
    if let Some(state) = app_handle.try_state::<AppState>() {
        log_msg(&state, msg);
    }
}

fn append_output_state(app_handle: &tauri::AppHandle, line: &str) {
    if let Some(state) = app_handle.try_state::<AppState>() {
        append_game_output(&state, line);
    }
}

// --- Instance Management Commands ---
#[tauri::command]
fn open_instance_folder(instance_name: String) -> Value {
    let dir = instances_dir().join(&instance_name);
    if dir.exists() {
        let _ = webbrowser::open(&dir.to_string_lossy());
        json!({"success": true})
    } else {
        json!({"error": "Instance folder not found"})
    }
}

#[tauri::command]
fn get_instance_mods(instance_name: String) -> Value {
    let mods_dir = instances_dir().join(&instance_name).join("mods");
    let mut mods = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&mods_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".jar") || name.ends_with(".zip") {
                let metadata = entry.metadata().ok();
                let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
                let enabled = !name.ends_with(".disabled");
                let display_name = name.trim_end_matches(".disabled").trim_end_matches(".jar").trim_end_matches(".zip").to_string();
                mods.push(json!({
                    "filename": name,
                    "name": display_name,
                    "size": size,
                    "enabled": enabled,
                }));
            }
        }
    }
    Value::Array(mods)
}

#[tauri::command]
fn toggle_mod(instance_name: String, filename: String) -> Value {
    let mods_dir = instances_dir().join(&instance_name).join("mods");
    let path = mods_dir.join(&filename);
    if !path.exists() {
        return json!({"error": "Mod file not found"});
    }
    if filename.ends_with(".disabled") {
        let new_name = filename.trim_end_matches(".disabled");
        let new_path = mods_dir.join(new_name);
        let _ = std::fs::rename(&path, &new_path);
        json!({"success": true, "enabled": true, "filename": new_name})
    } else {
        let new_name = format!("{}.disabled", filename);
        let new_path = mods_dir.join(&new_name);
        let _ = std::fs::rename(&path, &new_path);
        json!({"success": true, "enabled": false, "filename": new_name})
    }
}

#[tauri::command]
fn delete_mod(instance_name: String, filename: String) -> Value {
    let mods_dir = instances_dir().join(&instance_name).join("mods");
    let path = mods_dir.join(&filename);
    if path.exists() {
        let _ = std::fs::remove_file(&path);
        json!({"success": true})
    } else {
        json!({"error": "File not found"})
    }
}

#[tauri::command]
fn rename_instance(app: State<AppState>, old_name: String, new_name: String) -> Value {
    if old_name == new_name { return json!({"error": "Same name"}); }
    let old_dir = instances_dir().join(&old_name);
    let new_dir = instances_dir().join(&new_name);
    if new_dir.exists() { return json!({"error": "An instance with that name already exists"}); }
    match std::fs::rename(&old_dir, &new_dir) {
        Ok(()) => {
            let mut instances = load_instances_raw(&app);
            for inst in instances.iter_mut() {
                if inst.get("name").and_then(|v| v.as_str()) == Some(&old_name) {
                    inst["name"] = Value::String(new_name.clone());
                }
            }
            save_instances(&instances);
            json!({"success": true})
        }
        Err(e) => json!({"error": e.to_string()}),
    }
}

#[tauri::command]
fn set_instance_icon(instance_name: String, icon_data: String) -> Value {
    let inst_dir = instances_dir().join(&instance_name);
    let icon_path = inst_dir.join("icon.png");
    if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(icon_data.trim_start_matches("data:image/png;base64,")) {
        let _ = std::fs::write(&icon_path, &bytes);
        json!({"success": true, "path": icon_path.to_string_lossy()})
    } else {
        json!({"error": "Invalid base64 data"})
    }
}

#[tauri::command]
fn get_instance_icon(instance_name: String) -> Value {
    let icon_path = instances_dir().join(&instance_name).join("icon.png");
    if icon_path.exists() {
        if let Ok(bytes) = std::fs::read(&icon_path) {
            let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
            return json!({"success": true, "icon": format!("data:image/png;base64,{}", encoded)});
        }
    }
    json!({"success": false, "icon": null})
}

#[tauri::command]
fn get_instance_resourcepacks(instance_name: String) -> Value {
    let rp_dir = instances_dir().join(&instance_name).join("resourcepacks");
    let mut packs = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&rp_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".zip") || name.ends_with(".jar") {
                let size = entry.metadata().ok().map(|m| m.len()).unwrap_or(0);
                packs.push(json!({
                    "filename": name,
                    "name": name.trim_end_matches(".zip").trim_end_matches(".jar").to_string(),
                    "size": size,
                    "enabled": !name.starts_with("."),
                }));
            }
        }
    }
    Value::Array(packs)
}

#[tauri::command]
fn delete_resourcepack(instance_name: String, filename: String) -> Value {
    let rp_dir = instances_dir().join(&instance_name).join("resourcepacks");
    let path = rp_dir.join(&filename);
    if path.exists() {
        let _ = std::fs::remove_file(&path);
        json!({"success": true})
    } else {
        json!({"error": "File not found"})
    }
}

#[tauri::command]
fn create_instance_from_modpack(app: State<AppState>, name: String, mc_version: String, loader: String, loader_version: String, mrpack_url: String) -> Value {
    log_msg(&app, &format!("[Modpack/Instance] Creating '{}' from modpack...", name));
    let inst_dir = instances_dir().join(&name);
    if inst_dir.exists() {
        return json!({"error": "An instance with that name already exists"});
    }
    let _ = std::fs::create_dir_all(&inst_dir);
    for subdir in &["mods", "saves", "resourcepacks", "screenshots", "natives", "assets", "config"] {
        let _ = std::fs::create_dir_all(inst_dir.join(subdir));
    }
    let instance_data = json!({
        "name": name, "version": mc_version, "loader": loader,
        "loader_version": loader_version,
        "created": chrono::Local::now().to_rfc3339(),
        "last_played": null, "icon": "",
    });
    let mut instances = load_instances_raw(&app);
    instances.push(instance_data.clone());
    save_instances(&instances);

    if !mrpack_url.is_empty() {
        log_msg(&app, &format!("[Modpack/Instance] Downloading modpack {}...", mrpack_url));
        let temp_dir = tempfile::tempdir().unwrap();
        let mrpack_file = temp_dir.path().join("modpack.mrpack");
        if download_file_blocking(&mrpack_url, &mrpack_file).is_ok() {
            if let Ok(mut zip) = zip::ZipArchive::new(std::fs::File::open(&mrpack_file).unwrap()) {
                if let Ok(mut index_file) = zip.by_name("modrinth.index.json") {
                    let mut index_data = String::new();
                    let _ = index_file.read_to_string(&mut index_data);
                    if let Ok(index) = serde_json::from_str::<Value>(&index_data) {
                        if let Some(files_list) = index.get("files").and_then(|f| f.as_array()) {
                            for entry in files_list {
                                if let Some(path) = entry.get("path").and_then(|p| p.as_str()) {
                                    if let Some(downloads) = entry.get("downloads").and_then(|d| d.as_array()) {
                                        if let Some(file_url) = downloads.first().and_then(|u| u.as_str()) {
                                            let dest = inst_dir.join(path);
                                            if let Some(parent) = dest.parent() {
                                                let _ = std::fs::create_dir_all(parent);
                                            }
                                            let _ = download_file_blocking(file_url, &dest);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                for i in 0..zip.len() {
                    if let Ok(mut file) = zip.by_index(i) {
                        let fname = file.name().to_string();
                        if fname.starts_with("overrides/") && !fname.ends_with('/') {
                            let rel = fname.strip_prefix("overrides/").unwrap_or(&fname);
                            let dest = inst_dir.join(rel);
                            if let Some(parent) = dest.parent() {
                                let _ = std::fs::create_dir_all(parent);
                            }
                            let mut buf = Vec::new();
                            let _ = file.read_to_end(&mut buf);
                            let _ = std::fs::write(&dest, &buf);
                        }
                    }
                }
            }
        }
    }

    json!({"success": true, "instance": instance_data})
}

#[tauri::command]
fn get_minecraft_news_enhanced() -> Value {
    match http_get("https://www.minecraft.net/en-us/articles/rss", None) {
        Ok(data) => {
            let mut news = Vec::new();
            if let Some(channel) = data.get("rss").and_then(|r| r.get("channel")).and_then(|c| c.get("item")).and_then(|i| i.as_array()) {
                for item in channel.iter().take(10) {
                    let title = item.get("title").and_then(|t| t.as_str()).unwrap_or("Minecraft News");
                    let url = item.get("link").and_then(|u| u.as_str()).unwrap_or("");
                    let date = item.get("pubDate").and_then(|d| d.as_str()).unwrap_or("");
                    let image = item.get("media:thumbnail").and_then(|t| t.get("@url").and_then(|u| u.as_str()).map(|s| s.to_string()))
                        .or_else(|| item.get("media:content").and_then(|t| t.get("@url").and_then(|u| u.as_str()).map(|s| s.to_string())));
                    news.push(json!({
                        "title": title,
                        "url": url,
                        "date": date,
                        "type": "news",
                        "image": image,
                    }));
                }
            }
            if news.is_empty() {
                match http_get(MOJANG_VERSION_MANIFEST, None) {
                    Ok(data) => {
                        if let Some(latest) = data.get("latest") {
                            let latest_release = latest.get("release").and_then(|r| r.as_str()).unwrap_or("");
                            if let Some(versions) = data.get("versions").and_then(|v| v.as_array()) {
                                for v in versions.iter().take(10) {
                                    if let Some(id) = v.get("id").and_then(|i| i.as_str()) {
                                        if id == latest_release {
                                            news.push(json!({
                                                "title": format!("Minecraft {} Released!", id),
                                                "url": v.get("url").and_then(|u| u.as_str()).unwrap_or(""),
                                                "date": v.get("releaseTime").and_then(|d| d.as_str()).unwrap_or(""),
                                                "type": "release",
                                                "image": null,
                                            }));
                                        }
                                    }
                                }
                            }
                        }
                        Value::Array(news)
                    }
                    Err(_) => Value::Array(news),
                }
            } else {
                Value::Array(news)
            }
        }
        Err(_) => {
            let mut news = Vec::new();
            match http_get(MOJANG_VERSION_MANIFEST, None) {
                Ok(data) => {
                    if let Some(latest) = data.get("latest") {
                        let latest_release = latest.get("release").and_then(|r| r.as_str()).unwrap_or("");
                        if let Some(versions) = data.get("versions").and_then(|v| v.as_array()) {
                            for v in versions.iter().take(10) {
                                if let Some(id) = v.get("id").and_then(|i| i.as_str()) {
                                    if id == latest_release {
                                        news.push(json!({
                                            "title": format!("Minecraft {} Released!", id),
                                            "url": v.get("url").and_then(|u| u.as_str()).unwrap_or(""),
                                            "date": v.get("releaseTime").and_then(|d| d.as_str()).unwrap_or(""),
                                            "type": "release",
                                            "image": null,
                                        }));
                                    }
                                }
                            }
                        }
                    }
                }
                Err(_) => {}
            }
            Value::Array(news)
        }
    }
}

// --- Version ---
#[tauri::command]
fn get_latest_release_tag() -> Value {
    match http_get(GITHUB_API_URL, None) {
        Ok(data) => {
            let tag = data.get("tag_name").and_then(|t| t.as_str()).unwrap_or(APP_VERSION).trim_start_matches('v').to_string();
            let notes = data.get("body").and_then(|b| b.as_str()).unwrap_or("").to_string();
            let published = data.get("published_at").and_then(|p| p.as_str()).unwrap_or("").to_string();
            json!({
                "tag": tag,
                "current_version": APP_VERSION,
                "notes": notes,
                "published_at": published,
            })
        }
        Err(_) => json!({"tag": APP_VERSION, "current_version": APP_VERSION, "notes": "", "published_at": ""}),
    }
}

// ==================== BACKGROUND IMAGE FILE ====================
#[tauri::command]
fn save_background_image(app: State<AppState>, data: String) -> Value {
    let bg_dir = app_dir().join("backgrounds");
    let _ = std::fs::create_dir_all(&bg_dir);
    if data.starts_with("data:") {
        if let Some(idx) = data.find(",") {
            let b64 = &data[idx + 1..];
            let ext = if data.contains("image/png") { "png" } else if data.contains("image/jpeg") || data.contains("image/jpg") { "jpg" } else if data.contains("image/gif") { "gif" } else if data.contains("image/webp") { "webp" } else { "png" };
            let file_path = bg_dir.join(format!("custom.{}", ext));
            if let Ok(bytes) = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64) {
                if std::fs::write(&file_path, &bytes).is_ok() {
                    return json!({"success": true, "path": file_path.to_string_lossy().to_string()});
                }
            }
        }
    }
    json!({"success": false, "error": "Invalid image data"})
}

#[tauri::command]
fn get_background_image_path() -> String {
    let bg_dir = app_dir().join("backgrounds");
    for ext in &["png", "jpg", "jpeg", "gif", "webp"] {
        let p = bg_dir.join(format!("custom.{}", ext));
        if p.exists() { return p.to_string_lossy().to_string(); }
    }
    String::new()
}

#[tauri::command]
fn delete_background_image() -> Value {
    let bg_dir = app_dir().join("backgrounds");
    for ext in &["png", "jpg", "jpeg", "gif", "webp"] {
        let p = bg_dir.join(format!("custom.{}", ext));
        let _ = std::fs::remove_file(&p);
    }
    json!({"success": true})
}

// ==================== BACKGROUND VIDEO FILE ====================
#[tauri::command]
fn save_background_video(data: String) -> Value {
    let bg_dir = app_dir().join("backgrounds");
    let _ = std::fs::create_dir_all(&bg_dir);
    if data.starts_with("data:") {
        if let Some(idx) = data.find(",") {
            let b64 = &data[idx + 1..];
            let ext = if data.contains("video/webm") { "webm" } else if data.contains("video/quicktime") { "mov" } else { "mp4" };
            let file_path = bg_dir.join(format!("custom_video.{}", ext));
            if let Ok(bytes) = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64) {
                if std::fs::write(&file_path, &bytes).is_ok() {
                    return json!({"success": true, "path": file_path.to_string_lossy().to_string()});
                }
            }
        }
    }
    json!({"success": false, "error": "Invalid video data"})
}

#[tauri::command]
fn get_background_video_path() -> String {
    let bg_dir = app_dir().join("backgrounds");
    for ext in &["mp4", "webm", "mov"] {
        let p = bg_dir.join(format!("custom_video.{}", ext));
        if p.exists() { return p.to_string_lossy().to_string(); }
    }
    String::new()
}

#[tauri::command]
fn delete_background_video() -> Value {
    let bg_dir = app_dir().join("backgrounds");
    for ext in &["mp4", "webm", "mov"] {
        let p = bg_dir.join(format!("custom_video.{}", ext));
        let _ = std::fs::remove_file(&p);
    }
    json!({"success": true})
}

// ==================== DISCORD RPC ====================
#[tauri::command]
fn init_discord_rpc(app: tauri::AppHandle) -> Value {
    let state = app.state::<AppState>();

    let discord_rpc_enabled = {
        let disk_settings = load_json(&settings_file());
        disk_settings.get("discord_rpc").and_then(|v| v.as_bool()).unwrap_or(true)
    };
    if !discord_rpc_enabled {
        eprintln!("[Discord RPC] Disabled in settings");
        return json!({"success": true, "message": "Discord RPC disabled in settings"});
    }

    let existing = state.discord_handle.lock().unwrap();
    if existing.is_some() {
        eprintln!("[Discord RPC] Already connected");
        return json!({"success": true, "message": "Discord RPC already connected"});
    }
    drop(existing);

    let client_id = "1506599015826067476";

    std::thread::spawn(move || {
        let mut last_activity: Option<DiscordMessage> = None;
        let reader_running = Arc::new(AtomicBool::new(false));

        // Outer loop: reconnect if Discord/arRPC disconnects
        loop {
            // Check if disabled
            let disabled = {
                let ds = load_json(&settings_file());
                ds.get("discord_rpc").and_then(|v| v.as_bool()).unwrap_or(true) == false
            };
            if disabled {
                eprintln!("[Discord RPC] Disabled, exiting");
                break;
            }

            // Create a FRESH channel each iteration so reconnect works
            let (cmd_tx, cmd_rx) = std::sync::mpsc::channel::<DiscordMessage>();

            let mut connected = false;

            // Try all 10 IPC pipes (works with Discord Desktop AND arRPC)
            for i in 0..10 {
                let pipe_name = format!(r"\\.\pipe\discord-ipc-{}", i);
                match std::fs::OpenOptions::new().read(true).write(true).open(&pipe_name) {
                    Ok(file) => {
                        let mut handshake_reader = std::io::BufReader::new(file.try_clone().unwrap());
                        let keepalive_reader = std::io::BufReader::new(file.try_clone().unwrap());
                        let writer = Arc::new(Mutex::new(file));

                        let handshake = json!({"v": 1, "client_id": client_id}).to_string();
                        {
                            let mut w = writer.lock().unwrap();
                            if let Err(e) = w.write_all(&discord_ipc_frame(0, &handshake)) {
                                eprintln!("[Discord RPC] Handshake write failed: {}", e);
                                continue;
                            }
                            if let Err(e) = w.flush() {
                                eprintln!("[Discord RPC] Handshake flush failed: {}", e);
                                continue;
                            }
                        }

                        let read_result = {
                            let (tx, rx) = std::sync::mpsc::channel();
                            std::thread::spawn(move || {
                                let _ = tx.send(discord_ipc_read(&mut handshake_reader));
                            });
                            rx.recv_timeout(std::time::Duration::from_secs(5))
                        };
                        match read_result {
                            Ok(Ok((_, data))) => {
                                let v: Result<Value, _> = serde_json::from_str(&data);
                                if let Ok(obj) = v {
                                    if obj.get("evt").and_then(|e| e.as_str()) == Some("READY") {
                                        connected = true;
                                        eprintln!("[Discord RPC] Connected to pipe {} (Discord or arRPC)", i);

                                        {
                                            let state = app.state::<AppState>();
                                            let handle = DiscordRpcHandle { sender: cmd_tx.clone() };
                                            *state.discord_handle.lock().unwrap() = Some(handle);
                                        }

                                        // Restore last known activity if any
                                        if let Some(DiscordMessage::Update { details: ref d, state: ref s, large_image: ref li, large_text: ref lt, small_image: ref si, small_text: ref st }) = last_activity {
                                            let mut w = writer.lock().unwrap();
                                            discord_set_activity(&mut *w, "ecl-restore", d, s, li, lt, si, st);
                                            let _ = w.flush();
                                        }
                                        eprintln!("[Discord RPC] Connected, no activity set (waiting for game launch)");

                                        // Keepalive reader
                                        let writer_clone = writer.clone();
                                        reader_running.store(true, Ordering::Relaxed);
                                        let rr_clone = reader_running.clone();
                                        let mut kr = keepalive_reader;
                                        std::thread::spawn(move || {
                                            while rr_clone.load(Ordering::Relaxed) {
                                                match discord_ipc_read(&mut kr) {
                                                    Ok((opcode, data)) => {
                                                        match opcode {
                                                            2 => {
                                                                let pong_payload = serde_json::from_str::<Value>(&data)
                                                                    .ok()
                                                                    .and_then(|v| v.get("d").cloned())
                                                                    .unwrap_or(Value::Null);
                                                                let pong = json!({"d": pong_payload});
                                                                let mut w = writer_clone.lock().unwrap();
                                                                let _ = w.write_all(&discord_ipc_frame(3, &pong.to_string()));
                                                                let _ = w.flush();
                                                            }
                                                            1 => {
                                                                eprintln!("[Discord RPC] CLOSE received");
                                                                break;
                                                            }
                                                            _ => {}
                                                        }
                                                    }
                                                    Err(_) => { break; }
                                                }
                                            }
                                            eprintln!("[Discord RPC] Reader thread exiting");
                                        });

                                        // Command loop
                                        loop {
                                            match cmd_rx.recv() {
                                                Ok(DiscordMessage::Update { details, state, large_image, large_text, small_image, small_text }) => {
                                                    let mut w = writer.lock().unwrap();
                                                    let nonce = format!("ecl-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());
                                                    discord_set_activity(&mut *w, &nonce, &details, &state, &large_image, &large_text, &small_image, &small_text);
                                                    let _ = w.flush();
                                                    last_activity = Some(DiscordMessage::Update {
                                                        details, state, large_image, large_text, small_image, small_text,
                                                    });
                                                    eprintln!("[Discord RPC] Updated activity");
                                                }
                                                Ok(DiscordMessage::Stop) => {
                                                    eprintln!("[Discord RPC] Stop received");
                                                    reader_running.store(false, Ordering::Relaxed);
                                                    let mut w = writer.lock().unwrap();
                                                    let clear = json!({
                                                        "cmd": "SET_ACTIVITY",
                                                        "args": { "pid": std::process::id(), "activity": null },
                                                        "nonce": "ecl-clear"
                                                    });
                                                    let _ = w.write_all(&discord_ipc_frame(1, &clear.to_string()));
                                                    let _ = w.flush();
                                                    let s = app.state::<AppState>();
                                                    *s.discord_handle.lock().unwrap() = None;
                                                    return;
                                                }
                                                Err(e) => {
                                                    eprintln!("[Discord RPC] Channel error: {}", e);
                                                    break;
                                                }
                                            }
                                        }

                                        reader_running.store(false, Ordering::Relaxed);
                                        {
                                            let mut w = writer.lock().unwrap();
                                            let clear = json!({
                                                "cmd": "SET_ACTIVITY",
                                                "args": { "pid": std::process::id(), "activity": null },
                                                "nonce": "ecl-clear"
                                            });
                                            let _ = w.write_all(&discord_ipc_frame(1, &clear.to_string()));
                                            let _ = w.flush();
                                        }
                                        let s = app.state::<AppState>();
                                        *s.discord_handle.lock().unwrap() = None;
                                        eprintln!("[Discord RPC] Disconnected, will reconnect...");
                                    } else {
                                        eprintln!("[Discord RPC] Did not receive READY event");
                                    }
                                } else {
                                    eprintln!("[Discord RPC] Invalid JSON in handshake response");
                                }
                            }
                            Ok(Err(e)) => {
                                eprintln!("[Discord RPC] Handshake read failed on pipe {}: {}", i, e);
                            }
                            Err(_) => {
                                eprintln!("[Discord RPC] Handshake timed out on pipe {}", i);
                            }
                        }
                        break;
                    }
                    Err(_) => continue,
                }
            }

            if !connected {
                eprintln!("[Discord RPC] Could not connect. Retrying in 10s (Discord or arRPC)...");
            }
            std::thread::sleep(std::time::Duration::from_secs(10));
        }
        eprintln!("[Discord RPC] Thread exiting");
    });

    json!({"success": true, "message": "Discord RPC started"})
}

#[tauri::command]
fn update_discord_rpc(
    app: State<AppState>,
    details: String,
    state: String,
    large_image: String,
    large_text: String,
    small_image: String,
    small_text: String,
) -> Value {
    let handle = app.discord_handle.lock().unwrap();
    if let Some(h) = handle.as_ref() {
        let _ = h.sender.send(DiscordMessage::Update {
            details,
            state,
            large_image,
            large_text,
            small_image,
            small_text,
        });
        json!({"success": true})
    } else {
        json!({"success": false, "message": "Discord RPC not initialized"})
    }
}

#[tauri::command]
fn stop_discord_rpc(app: State<AppState>) -> Value {
    let handle = app.discord_handle.lock().unwrap().take();
    if let Some(h) = handle {
        let _ = h.sender.send(DiscordMessage::Stop);
    }
    json!({"success": true})
}

#[tauri::command]
fn get_discord_status(app: State<AppState>) -> Value {
    let connected = app.discord_handle.lock().unwrap().is_some();
    let enabled = {
        let ds = load_json(&settings_file());
        ds.get("discord_rpc").and_then(|v| v.as_bool()).unwrap_or(true)
    };
    json!({"connected": connected, "enabled": enabled, "client_id": "1506599015826067476"})
}

#[tauri::command]
fn open_url(url: String) -> Value {
    let _ = webbrowser::open(&url);
    json!({"success": true})
}

// ==================== PERFORMANCE MODS ====================

/// Attempt to download a single mod from Modrinth by slug.
/// Returns (filename, true) on success, or ("", false) on failure.
fn download_mod_from_modrinth(
    slug: &str,
    display_name: &str,
    loader: &str,
    mc_version: &str,
    mods_dir: &Path,
    app: &State<AppState>,
) -> (String, bool) {
    let versions = get_modrinth_versions(slug.to_string(), Some(loader.to_string()), Some(mc_version.to_string()));
    let versions_arr = versions.as_array().cloned().unwrap_or_default();

    if versions_arr.is_empty() {
        log_msg(app, &format!("[PerfMods/WARN] No compatible version for '{}' ({})", display_name, slug));
        return ("".to_string(), false);
    }

    let target_version = &versions_arr[0];
    let files = target_version.get("files").and_then(|f| f.as_array()).cloned().unwrap_or_default();
    let primary = files.iter().find(|f| f.get("primary").and_then(|p| p.as_bool()).unwrap_or(false))
        .unwrap_or(files.first().unwrap_or(&Value::Null));
    let filename = primary.get("filename").and_then(|f| f.as_str()).unwrap_or("mod.jar").to_string();
    let download_url = primary.get("url").and_then(|u| u.as_str()).unwrap_or("");

    if download_url.is_empty() {
        log_msg(app, &format!("[PerfMods/WARN] No download URL for '{}' ({})", display_name, slug));
        return ("".to_string(), false);
    }

    let dest = mods_dir.join(&filename);
    if dest.exists() {
        log_msg(app, &format!("[PerfMods] '{}' already installed, skipping", display_name));
        return (filename, true);
    }

    match download_file_blocking(download_url, &dest) {
        Ok(()) => {
            log_msg(app, &format!("[PerfMods/OK] '{}' installed!", display_name));
            (filename, true)
        }
        Err(e) => {
            log_msg(app, &format!("[PerfMods/ERROR] '{}' failed: {}", display_name, e));
            ("".to_string(), false)
        }
    }
}

struct PerfMod {
    slug: &'static str,
    name: &'static str,
    desc: &'static str,
    fallback: Option<&'static str>,
    min_mc: Option<&'static str>,
}

const PERF_MODS_FABRIC: &[PerfMod] = &[
    PerfMod { slug: "sodium", name: "Sodium", desc: "Massive FPS boost rendering engine", fallback: Some("embeddium"), min_mc: None },
    PerfMod { slug: "lithium", name: "Lithium", desc: "General-purpose server+client optimization", fallback: None, min_mc: None },
    PerfMod { slug: "starlight", name: "Starlight", desc: "Rewrites the light engine for performance", fallback: None, min_mc: None },
    PerfMod { slug: "ferrite-core", name: "FerriteCore", desc: "Memory usage optimization", fallback: None, min_mc: None },
    PerfMod { slug: "memoryleakfix", name: "MemoryLeakFix", desc: "Fixes memory leaks in Minecraft", fallback: None, min_mc: None },
    PerfMod { slug: "lazydfu", name: "LazyDFU", desc: "Makes DataFixerUpper lazy for faster startup", fallback: None, min_mc: None },
    PerfMod { slug: "krypton", name: "Krypton", desc: "Network stack optimization", fallback: None, min_mc: None },
    PerfMod { slug: "entityculling", name: "EntityCulling", desc: "Skips rendering hidden entities", fallback: None, min_mc: None },
    PerfMod { slug: "immediatelyfast", name: "ImmediatelyFast", desc: "ImmediatelyFast rendering optimizations", fallback: None, min_mc: None },
    PerfMod { slug: "modernfix", name: "ModernFix", desc: "Performance and memory fixes", fallback: None, min_mc: None },
    PerfMod { slug: "nvidium", name: "Nvidium", desc: "NVIDIA GPU optimizations (requires Sodium)", fallback: None, min_mc: Some("1.20") },
    PerfMod { slug: "indium", name: "Indium", desc: "Rendering API for Sodium compatibility", fallback: None, min_mc: None },
    PerfMod { slug: "lambdabettergrass", name: "LambdaBetterGrass", desc: "Better grass/foliage rendering", fallback: None, min_mc: None },
    PerfMod { slug: "moreculling", name: "MoreCulling", desc: "Culls hidden blocks for FPS", fallback: None, min_mc: None },
    PerfMod { slug: "alternative-fps-boost", name: "Alternative FPS Boost", desc: "Alternative fast render settings", fallback: None, min_mc: None },
    PerfMod { slug: "fastchest", name: "FastChest", desc: "Optimized chest rendering", fallback: None, min_mc: None },
    PerfMod { slug: "performant", name: "Performant", desc: "Entity and particle optimizations", fallback: None, min_mc: None },
    PerfMod { slug: "noisium", name: "Noisium", desc: "World generation speed optimization", fallback: None, min_mc: None },
    PerfMod { slug: "enhancedblockentities", name: "Enhanced Block Entities", desc: "Optimized block entity rendering", fallback: None, min_mc: None },
    PerfMod { slug: "c2me-fabric", name: "C2ME", desc: "Concurrent chunk management engine", fallback: None, min_mc: None },
];

const PERF_MODS_FORGE: &[PerfMod] = &[
    PerfMod { slug: "embeddium", name: "Embeddium", desc: "Sodium port for Forge", fallback: Some("optiforge"), min_mc: None },
    PerfMod { slug: "lithium", name: "Lithium", desc: "General-purpose optimization", fallback: None, min_mc: None },
    PerfMod { slug: "starlight", name: "Starlight", desc: "Light engine rewrite", fallback: None, min_mc: None },
    PerfMod { slug: "ferrite-core", name: "FerriteCore", desc: "Memory optimization", fallback: None, min_mc: None },
    PerfMod { slug: "memoryleakfix", name: "MemoryLeakFix", desc: "Memory leak fixes", fallback: None, min_mc: None },
    PerfMod { slug: "entityculling", name: "EntityCulling", desc: "Skip rendering hidden entities", fallback: None, min_mc: None },
    PerfMod { slug: "modernfix", name: "ModernFix", desc: "Performance fixes", fallback: None, min_mc: None },
    PerfMod { slug: "performant", name: "Performant", desc: "Entity/particle optimization", fallback: None, min_mc: None },
    PerfMod { slug: "fastchest", name: "FastChest", desc: "Optimized chest rendering", fallback: None, min_mc: None },
    PerfMod { slug: "noisium", name: "Noisium", desc: "World gen speed boost", fallback: None, min_mc: Some("1.20") },
    PerfMod { slug: "enhancedblockentities", name: "Enhanced Block Entities", desc: "Optimized block entities", fallback: None, min_mc: None },
    PerfMod { slug: "lazydfu", name: "LazyDFU", desc: "Faster startup", fallback: None, min_mc: None },
    PerfMod { slug: "krypton-reforged", name: "Krypton Reforged", desc: "Network optimization", fallback: None, min_mc: None },
    PerfMod { slug: "moreculling", name: "MoreCulling", desc: "Cull hidden blocks", fallback: None, min_mc: None },
    PerfMod { slug: "alternate-current", name: "Alternate Current", desc: "Optimized redstone", fallback: None, min_mc: None },
    PerfMod { slug: "clustered", name: "Clustered", desc: "Chunk batching optimization", fallback: None, min_mc: None },
    PerfMod { slug: "radon", name: "Radon", desc: "Memory optimization", fallback: None, min_mc: None },
    PerfMod { slug: "booptimize", name: "BooOptimize", desc: "Entity rendering optimization", fallback: None, min_mc: None },
    PerfMod { slug: "smooth-boot", name: "Smooth Boot", desc: "Optimized thread scheduling", fallback: None, min_mc: None },
];

fn mc_version_at_least(mc_version: &str, required: &str) -> bool {
    let parts_a: Vec<i32> = mc_version.split('.').filter_map(|s| s.parse().ok()).collect();
    let parts_b: Vec<i32> = required.split('.').filter_map(|s| s.parse().ok()).collect();
    for i in 0..3.max(parts_a.len()).max(parts_b.len()) {
        let a = parts_a.get(i).copied().unwrap_or(0);
        let b = parts_b.get(i).copied().unwrap_or(0);
        if a > b { return true; }
        if a < b { return false; }
    }
    true
}

#[tauri::command]
fn install_performance_mods(app: State<AppState>, instance_name: String, mc_version: String, loader: String) -> Value {
    log_msg(&app, &format!("[PerfMods] Installing performance mods for '{}' ({} {})...", instance_name, loader, mc_version));

    let mods_dir = instances_dir().join(&instance_name).join("mods");
    let _ = std::fs::create_dir_all(&mods_dir);

    let loader_lower = loader.to_lowercase();
    let is_fabric_like = matches!(loader_lower.as_str(), "fabric" | "quilt");
    let is_forge_like = matches!(loader_lower.as_str(), "forge" | "neoforge");

    if !is_fabric_like && !is_forge_like {
        return json!({"success": true, "message": "Performance mods only available for Fabric/Quilt/Forge/NeoForge", "installed": 0, "total": 0});
    }

    // Step 1: Install required API dependency
    let mut installed = 0u32;
    let mut errors = 0u32;

    if is_fabric_like {
        // Install Fabric API (required by many Fabric mods)
        // Quilt mods use QSL instead, but Quilt also loads Fabric API mods
        if loader_lower == "fabric" {
            log_msg(&app, "[PerfMods] Installing Fabric API...");
            let api_modrinth_loader = if loader_lower == "quilt" { "quilt" } else { "fabric" };
            let (_, ok) = download_mod_from_modrinth("fabric-api", "Fabric API", api_modrinth_loader, &mc_version, &mods_dir, &app);
            if ok { installed += 1; } else { errors += 1; }
        } else if loader_lower == "quilt" {
            // QSL (Quilt Standard Libraries) is the base dependency for Quilt
            log_msg(&app, "[PerfMods] Installing QSL (Quilt Standard Libraries)...");
            let (_, ok) = download_mod_from_modrinth("qsl", "QSL", "quilt", &mc_version, &mods_dir, &app);
            if ok { installed += 1; } else { errors += 1; }
            // Also install Fabric API for Quilt (Quilt is compatible with Fabric mods)
            log_msg(&app, "[PerfMods] Installing Fabric API for Quilt compatibility...");
            let (_, ok2) = download_mod_from_modrinth("fabric-api", "Fabric API", "fabric", &mc_version, &mods_dir, &app);
            if ok2 { installed += 1; } else { errors += 1; }
        }
    }

    // Step 2: Install performance mods with fallback support
    let perf_mods = if is_fabric_like {
        PERF_MODS_FABRIC
    } else {
        PERF_MODS_FORGE
    };

    let total = perf_mods.len() as u32;

    for pm in perf_mods.iter() {
        // Version check
        if let Some(min_ver) = pm.min_mc {
            if !mc_version_at_least(&mc_version, min_ver) {
                log_msg(&app, &format!("[PerfMods] Skipping '{}' (requires MC {}+)", pm.name, min_ver));
                // Try fallback if available
                if let Some(fallback_slug) = pm.fallback {
                    log_msg(&app, &format!("[PerfMods] Trying fallback '{}' for '{}'", fallback_slug, pm.name));
                    let (filename, ok) = download_mod_from_modrinth(fallback_slug, &format!("{} (fallback)", pm.name), &loader_lower, &mc_version, &mods_dir, &app);
                    if ok { installed += 1; } else { errors += 1; }
                } else {
                    errors += 1;
                }
                continue;
            }
        }

        // Try primary mod
        log_msg(&app, &format!("[PerfMods] Installing {}...", pm.name));
        let (filename, ok) = download_mod_from_modrinth(pm.slug, pm.name, &loader_lower, &mc_version, &mods_dir, &app);

        if ok {
            installed += 1;
        } else if let Some(fallback_slug) = pm.fallback {
            // Primary failed, try fallback
            log_msg(&app, &format!("[PerfMods] Primary failed, trying fallback '{}' for '{}'", fallback_slug, pm.name));
            let (_, ok2) = download_mod_from_modrinth(fallback_slug, &format!("{} (fallback)", pm.name), &loader_lower, &mc_version, &mods_dir, &app);
            if ok2 { installed += 1; } else { errors += 1; }
        } else {
            errors += 1;
        }
    }

    log_msg(&app, &format!("[PerfMods] Done: {}/{} installed, {} errors", installed, total, errors));
    json!({
        "success": true,
        "installed": installed,
        "total": total + if is_fabric_like { 1 } else { 0 },
        "errors": errors,
        "message": format!("Installed {}/{} performance mods (+API)", installed, total)
    })
}

// ==================== MOD PROFILES ====================
fn mod_profiles_file() -> PathBuf { app_dir().join("mod_profiles.json") }

#[tauri::command]
fn save_mod_profile(app: State<AppState>, name: String, instance_name: String) -> Value {
    log_msg(&app, &format!("[Profiles] Saving mod profile '{}' from '{}'...", name, instance_name));
    let mods_dir = instances_dir().join(&instance_name).join("mods");
    let mut mods = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&mods_dir) {
        for entry in entries.flatten() {
            let fname = entry.file_name().to_string_lossy().to_string();
            let clean_name = fname.trim_end_matches(".disabled");
            if !clean_name.ends_with(".jar") { continue; }

            let display_name = clean_name.trim_end_matches(".jar").to_string();
            let slug = display_name.to_lowercase().replace('_', "-").replace(' ', "-");

            let mut slug_found = String::new();

            let search_url = format!("{}/search?query={}&facets={}&limit=1",
                MODRINTH_API,
                urlencoding::encode(&display_name),
                urlencoding::encode(&serde_json::to_string(&vec![vec!["project_type:mod".to_string()]]).unwrap_or_default()));
            if let Ok(data) = http_get(&search_url, None) {
                if let Some(hits) = data.get("hits").and_then(|h| h.as_array()) {
                    if let Some(hit) = hits.first() {
                        if let Some(s) = hit.get("slug").and_then(|s| s.as_str()) {
                            slug_found = s.to_string();
                        }
                    }
                }
            }

            let final_slug = if slug_found.is_empty() { slug } else { slug_found };

            mods.push(json!({
                "slug": final_slug,
                "version_id": "",
                "filename": clean_name,
            }));
        }
    }

    let profiles_path = mod_profiles_file();
    let mut profiles: Vec<Value> = load_json(&profiles_path).as_array().cloned().unwrap_or_default();
    profiles.retain(|p| p.get("name").and_then(|n| n.as_str()) != Some(&name));
    profiles.push(json!({
        "name": name,
        "created": chrono::Local::now().to_rfc3339(),
        "instance_source": instance_name,
        "mods": mods,
    }));
    save_json(&profiles_path, &Value::Array(profiles.clone()));
    log_msg(&app, &format!("[Profiles/OK] Profile '{}' saved with {} mods", name, mods.len()));
    json!({"success": true, "mods_count": mods.len()})
}

#[tauri::command]
fn load_mod_profiles() -> Value {
    let profiles_path = mod_profiles_file();
    load_json(&profiles_path)
}

#[tauri::command]
fn delete_mod_profile(name: String) -> Value {
    let profiles_path = mod_profiles_file();
    let mut profiles: Vec<Value> = load_json(&profiles_path).as_array().cloned().unwrap_or_default();
    let before = profiles.len();
    profiles.retain(|p| p.get("name").and_then(|n| n.as_str()) != Some(&name));
    save_json(&profiles_path, &Value::Array(profiles.clone()));
    json!({"success": true, "removed": before > profiles.len()})
}

#[tauri::command]
fn apply_mod_profile(app: State<AppState>, name: String, instance_name: String) -> Value {
    log_msg(&app, &format!("[Profiles] Applying profile '{}' to '{}'...", name, instance_name));
    let profiles_path = mod_profiles_file();
    let profiles: Vec<Value> = load_json(&profiles_path).as_array().cloned().unwrap_or_default();
    let profile = match profiles.iter().find(|p| p.get("name").and_then(|n| n.as_str()) == Some(&name)) {
        Some(p) => p.clone(),
        None => return json!({"error": "Profile not found"}),
    };

    let mods_dir = instances_dir().join(&instance_name).join("mods");
    let _ = std::fs::create_dir_all(&mods_dir);

    let profile_mods = profile.get("mods").and_then(|m| m.as_array()).cloned().unwrap_or_default();
    let mut installed = 0u32;
    let mut errors = 0u32;

    for mod_entry in &profile_mods {
        let slug = mod_entry.get("slug").and_then(|s| s.as_str()).unwrap_or("");
        let version_id = mod_entry.get("version_id").and_then(|v| v.as_str()).unwrap_or("");
        if slug.is_empty() { errors += 1; continue; }

        log_msg(&app, &format!("[Profiles] Installing '{}'...", slug));
        let versions_url = if version_id.is_empty() {
            format!("{}/project/{}/version", MODRINTH_API, slug)
        } else {
            format!("{}/project/{}/version?ids=[\"{}\"]", MODRINTH_API, slug, version_id)
        };

        let versions = http_get(&versions_url, None).unwrap_or(Value::Array(vec![]));
        let versions_arr = versions.as_array().cloned().unwrap_or_default();
        if versions_arr.is_empty() {
            log_msg(&app, &format!("[Profiles/WARN] No versions found for '{}'", slug));
            errors += 1;
            continue;
        }

        let target_version = &versions_arr[0];
        let files = target_version.get("files").and_then(|f| f.as_array()).cloned().unwrap_or_default();
        let primary = files.iter().find(|f| f.get("primary").and_then(|p| p.as_bool()).unwrap_or(false))
            .unwrap_or(files.first().unwrap_or(&Value::Null));
        let download_url = primary.get("url").and_then(|u| u.as_str()).unwrap_or("");

        if download_url.is_empty() {
            errors += 1;
            continue;
        }

        let dest = mods_dir.join(primary.get("filename").and_then(|f| f.as_str()).unwrap_or("mod.jar"));
        if dest.exists() { installed += 1; continue; }

        match download_file_blocking(download_url, &dest) {
            Ok(()) => {
                log_msg(&app, &format!("[Profiles/OK] '{}' installed!", slug));
                installed += 1;
            }
            Err(e) => {
                log_msg(&app, &format!("[Profiles/ERROR] '{}' failed: {}", slug, e));
                errors += 1;
            }
        }
    }

    log_msg(&app, &format!("[Profiles] Done: {}/{} installed, {} errors", installed, profile_mods.len(), errors));
    json!({
        "success": true,
        "installed": installed,
        "total": profile_mods.len(),
        "errors": errors,
    })
}

// ==================== MOD UPDATES ====================
#[tauri::command]
fn check_mod_updates(app: State<AppState>, instance_name: String) -> Value {
    log_msg(&app, &format!("[ModUpdates] Checking updates for '{}'...", instance_name));
    let mods_dir = instances_dir().join(&instance_name).join("mods");
    let mut updates = Vec::new();
    let mut checked = 0u32;

    let client = reqwest::blocking::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(8))
        .build();
    let client = match client { Ok(c) => c, Err(_) => return json!({"success": true, "updates": [], "total_checked": 0}) };

    if let Ok(entries) = std::fs::read_dir(&mods_dir) {
        for entry in entries.flatten() {
            let fname = entry.file_name().to_string_lossy().to_string();
            let clean_name = fname.trim_end_matches(".disabled");
            if !clean_name.ends_with(".jar") { continue; }

            let display_name = clean_name.trim_end_matches(".jar").to_string();
            let slug = display_name.to_lowercase().replace('_', "-").replace(' ', "-");

            checked += 1;

            let project_url = format!("{}/project/{}", MODRINTH_API, slug);
            let project_data = match client.get(&project_url).send().and_then(|r| r.text()) {
                Ok(text) => serde_json::from_str::<Value>(&text).ok(),
                Err(_) => {
                    let search_url = format!("{}/search?query={}&facets={}&limit=1",
                        MODRINTH_API,
                        urlencoding::encode(&display_name),
                        urlencoding::encode(&serde_json::to_string(&vec![vec!["project_type:mod".to_string()]]).unwrap_or_default()));
                    match client.get(&search_url).send().and_then(|r| r.text()) {
                        Ok(text) => {
                            let data: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
                            if let Some(hit) = data.get("hits").and_then(|h| h.as_array()).and_then(|hits| hits.first()) {
                                let found_slug = hit.get("slug").and_then(|s| s.as_str()).unwrap_or(&slug);
                                if found_slug != slug {
                                    let url2 = format!("{}/project/{}", MODRINTH_API, found_slug);
                                    client.get(&url2).send().and_then(|r| r.text()).ok()
                                        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
                                } else { None }
                            } else { None }
                        }
                        Err(_) => None,
                    }
                }
            };

            let project_slug = project_data.as_ref()
                .and_then(|p| p.get("slug").and_then(|s| s.as_str()))
                .unwrap_or(&slug)
                .to_string();

            let versions_url = format!("{}/project/{}/version", MODRINTH_API, project_slug);
            let versions = match client.get(&versions_url).send().and_then(|r| r.text()) {
                Ok(text) => serde_json::from_str::<Value>(&text).unwrap_or(Value::Null),
                Err(_) => continue,
            };
            let versions_arr = match versions.as_array() {
                Some(a) => a,
                None => continue,
            };
            if versions_arr.is_empty() { continue; }

            let latest = &versions_arr[0];
            let latest_files = latest.get("files").and_then(|f| f.as_array()).cloned().unwrap_or_default();
            let latest_primary = latest_files.iter().find(|f| f.get("primary").and_then(|p| p.as_bool()).unwrap_or(false))
                .unwrap_or(latest_files.first().unwrap_or(&Value::Null));
            let latest_filename = latest_primary.get("filename").and_then(|f| f.as_str()).unwrap_or("");
            let latest_url = latest_primary.get("url").and_then(|u| u.as_str()).unwrap_or("");
            let latest_version_id = latest.get("version_id").and_then(|v| v.as_str()).unwrap_or("");
            let latest_version_number = latest.get("version_number").and_then(|v| v.as_str()).unwrap_or("");

            if !latest_filename.is_empty() && latest_filename != clean_name {
                updates.push(json!({
                    "slug": project_slug,
                    "filename": clean_name,
                    "current_version": clean_name,
                    "latest_version": latest_version_number,
                    "latest_version_id": latest_version_id,
                    "latest_filename": latest_filename,
                    "download_url": latest_url,
                }));
            }
        }
    }

    log_msg(&app, &format!("[ModUpdates] Checked {} mods, found {} update(s)", checked, updates.len()));
    json!({"success": true, "updates": updates, "total_checked": checked})
}

// ==================== CRASH LOG ANALYZER ====================
#[tauri::command]
fn analyze_crash_log(instance_name: String) -> Value {
    let inst_dir = instances_dir().join(&instance_name);

    let mut crash_logs = Vec::new();
    let crash_dir = inst_dir.join("crash-reports");
    if let Ok(entries) = std::fs::read_dir(&crash_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("crash-") && name.ends_with(".txt") {
                let meta = entry.metadata().ok();
                let modified = meta.as_ref().and_then(|m| m.modified().ok())
                    .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs())
                    .unwrap_or(0);
                crash_logs.push((name, entry.path(), modified));
            }
        }
    }

    let logs_dir = inst_dir.join("logs");
    if let Ok(entries) = std::fs::read_dir(&logs_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("crash-") && (name.ends_with(".txt") || name.ends_with(".log")) {
                let meta = entry.metadata().ok();
                let modified = meta.as_ref().and_then(|m| m.modified().ok())
                    .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs())
                    .unwrap_or(0);
                crash_logs.push((name, entry.path(), modified));
            }
        }
    }

    crash_logs.sort_by(|a, b| b.2.cmp(&a.2));

    let most_recent = crash_logs.first().map(|(_, path, _)| {
        let content = std::fs::read_to_string(path).unwrap_or_default();
        let lines: Vec<&str> = content.lines().collect();
        let start = if lines.len() > 500 { lines.len() - 500 } else { 0 };
        lines[start..].join("\n")
    });

    let latest_log_path = logs_dir.join("latest.log");
    let recent_errors = if latest_log_path.exists() {
        let content = std::fs::read_to_string(&latest_log_path).unwrap_or_default();
        let error_lines: Vec<&str> = content.lines()
            .filter(|line| line.contains("ERROR") || line.contains("Exception") || line.contains("FATAL") || line.contains("CRITICAL"))
            .collect();
        let start = if error_lines.len() > 100 { error_lines.len() - 100 } else { 0 };
        error_lines[start..].join("\n")
    } else {
        String::new()
    };

    json!({
        "success": true,
        "crash_log": most_recent.unwrap_or_default(),
        "crash_file": crash_logs.first().map(|(name, _, _)| name.clone()).unwrap_or_default(),
        "recent_errors": recent_errors,
        "crash_count": crash_logs.len(),
    })
}

// ==================== MOD DEPENDENCY RESOLVER ====================
#[tauri::command]
fn resolve_mod_dependencies(app: State<AppState>, instance_name: String, slug: String) -> Value {
    log_msg(&app, &format!("[Deps] Resolving dependencies for '{}' in '{}'...", slug, instance_name));
    let project_url = format!("{}/project/{}", MODRINTH_API, slug);
    let project = match http_get(&project_url, None) {
        Ok(p) => p,
        Err(e) => return json!({"error": e}),
    };

    let deps = match project.get("dependencies").and_then(|d| d.as_array()) {
        Some(d) => d.clone(),
        None => return json!({"success": true, "installed": 0, "message": "No dependencies found"}),
    };

    let mods_dir = instances_dir().join(&instance_name).join("mods");
    let _ = std::fs::create_dir_all(&mods_dir);

    let mut installed_deps = Vec::new();
    let mut errors = 0u32;

    for dep in &deps {
        let dep_slug = dep.get("project_id").and_then(|s| s.as_str()).unwrap_or("");
        let dep_file_name = dep.get("file_name").and_then(|s| s.as_str());
        let dep_version_id = dep.get("version_id").and_then(|s| s.as_str());
        let dependency_type = dep.get("dependency_type").and_then(|s| s.as_str()).unwrap_or("required");

        if dep_slug.is_empty() || dependency_type == "incompatible" || dependency_type == "optional" {
            continue;
        }

        if dep_file_name.is_some() || dep_version_id.is_some() {
            let versions_url = if let Some(vid) = dep_version_id {
                format!("{}/version/{}", MODRINTH_API, vid)
            } else {
                format!("{}/project/{}/version", MODRINTH_API, dep_slug)
            };

            let version_data = match http_get(&versions_url, None) {
                Ok(v) => v,
                Err(_) => { errors += 1; continue; }
            };

            let files = if let Some(arr) = version_data.as_array() {
                if let Some(first) = arr.first() {
                    first.get("files").and_then(|f| f.as_array()).cloned().unwrap_or_default()
                } else {
                    version_data.get("files").and_then(|f| f.as_array()).cloned().unwrap_or_default()
                }
            } else {
                version_data.get("files").and_then(|f| f.as_array()).cloned().unwrap_or_default()
            };

            let primary = files.iter().find(|f| f.get("primary").and_then(|p| p.as_bool()).unwrap_or(false))
                .unwrap_or(files.first().unwrap_or(&Value::Null));
            let filename = primary.get("filename").and_then(|f| f.as_str()).unwrap_or("mod.jar");
            let download_url = primary.get("url").and_then(|u| u.as_str()).unwrap_or("");

            if download_url.is_empty() { errors += 1; continue; }
            let dest = mods_dir.join(filename);
            if dest.exists() {
                installed_deps.push(json!({"slug": dep_slug, "filename": filename, "status": "already_installed"}));
                continue;
            }

            match download_file_blocking(download_url, &dest) {
                Ok(()) => {
                    log_msg(&app, &format!("[Deps/OK] Dependency '{}' installed!", dep_slug));
                    installed_deps.push(json!({"slug": dep_slug, "filename": filename, "status": "installed"}));
                }
                Err(e) => {
                    log_msg(&app, &format!("[Deps/ERROR] '{}' failed: {}", dep_slug, e));
                    errors += 1;
                }
            }
        } else {
            let (filename, ok) = download_mod_from_modrinth(dep_slug, dep_slug, "", "", &mods_dir, &app);
            if ok {
                installed_deps.push(json!({"slug": dep_slug, "filename": filename, "status": "installed"}));
            } else {
                errors += 1;
            }
        }
    }

    log_msg(&app, &format!("[Deps] Done: {} installed, {} errors", installed_deps.len(), errors));
    json!({
        "success": true,
        "installed": installed_deps,
        "errors": errors,
    })
}

// ==================== RESOURCE PACK AUTO-ENABLE ====================
#[tauri::command]
fn auto_enable_resourcepack(instance_name: String, filename: String) -> Value {
    let inst_dir = instances_dir().join(&instance_name);
    let options_path = inst_dir.join("options.txt");

    let mut options_content = if options_path.exists() {
        std::fs::read_to_string(&options_path).unwrap_or_default()
    } else {
        String::new()
    };

    let enabled_entry = format!(":\"{}\"", filename);

    if options_content.contains(&enabled_entry) {
        return json!({"success": true, "message": "Resource pack already enabled"});
    }

    let rp_key = "resourcePacks";
    if let Some(pos) = options_content.find(rp_key) {
        let after_key = &options_content[pos + rp_key.len()..];
        if let Some(bracket_start) = after_key.find('[') {
            let bracket_rel = pos + rp_key.len() + bracket_start;
            if let Some(bracket_end) = options_content[bracket_rel..].find(']') {
                let bracket_abs = bracket_rel + bracket_end;
                let inner = &options_content[bracket_rel + 1..bracket_abs];
                let existing_packs: Vec<&str> = inner.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
                let mut new_packs: Vec<String> = Vec::new();
                for pack in &existing_packs {
                    new_packs.push(pack.to_string());
                }
                let new_entry = format!(":\"{}\"", filename);
                if !new_packs.iter().any(|p| p.contains(&filename)) {
                    new_packs.push(new_entry);
                }
                let new_inner = new_packs.join(", ");
                let before = &options_content[..bracket_rel + 1];
                let after = &options_content[bracket_abs..];
                options_content = format!("{}{}{}", before, new_inner, after);
            }
        }
    } else {
        let new_rp = format!("\nresourcePacks:[:{}]\n", filename);
        options_content.push_str(&new_rp);
    }

    match std::fs::write(&options_path, &options_content) {
        Ok(()) => json!({"success": true, "message": format!("'{}' enabled in resource packs", filename)}),
        Err(e) => json!({"error": e.to_string()}),
    }
}

// ==================== EXPORT INSTANCE AS MRPACK ====================
#[tauri::command]
fn export_instance_mrpack(app: State<AppState>, instance_name: String, name: String, version_id: String, output_path: String) -> Value {
    log_msg(&app, &format!("[Export] Exporting '{}' as .mrpack...", instance_name));
    let inst_dir = instances_dir().join(&instance_name);

    let mut index_files = Vec::new();
    let mods_dir = inst_dir.join("mods");
    if let Ok(entries) = std::fs::read_dir(&mods_dir) {
        for entry in entries.flatten() {
            let fname = entry.file_name().to_string_lossy().to_string();
            if !fname.ends_with(".jar") || fname.ends_with(".disabled") { continue; }

            let slug = fname.trim_end_matches(".jar").trim_end_matches(".disabled")
                .to_lowercase().replace('_', "-").replace(' ', "-");

            let mut downloads = Vec::new();

            let versions_url = format!("{}/project/{}/version", MODRINTH_API, slug);
            if let Ok(versions) = http_get(&versions_url, None) {
                if let Some(arr) = versions.as_array() {
                    for v in arr.iter().take(5) {
                        if let Some(files) = v.get("files").and_then(|f| f.as_array()) {
                            for file in files {
                                if file.get("filename").and_then(|f| f.as_str()) == Some(&fname) {
                                    if let Some(url) = file.get("url").and_then(|u| u.as_str()) {
                                        downloads.push(url.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }

            index_files.push(json!({
                "path": format!("mods/{}", fname),
                "hashes": {},
                "downloads": downloads,
                "file_size": entry.metadata().ok().map(|m| m.len()).unwrap_or(0),
            }));
        }
    }

    let modrinth_index = json!({
        "formatVersion": 1,
        "game": "minecraft",
        "version_id": if version_id.is_empty() { format!("{}-{}", name, chrono::Local::now().format("%Y%m%d")) } else { version_id },
        "name": name,
        "summary": format!("Exported from EcLauncher"),
        "dependencies": {},
        "files": index_files,
    });

    let file = match std::fs::File::create(&output_path) {
        Ok(f) => f,
        Err(e) => return json!({"error": e.to_string()}),
    };

    let mut zip = zip::ZipWriter::new(file);

    let options = zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    if zip.start_file("modrinth.index.json", options.clone()).is_ok() {
        let _ = zip.write_all(serde_json::to_string_pretty(&modrinth_index).unwrap_or_default().as_bytes());
    }

    fn add_dir_to_zip_recursive(zip: &mut zip::ZipWriter<std::fs::File>, dir: &Path, prefix: &str, options: &zip::write::FileOptions) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();
                if path.is_dir() {
                    add_dir_to_zip_recursive(zip, &path, &format!("{}/{}", prefix, name), options);
                } else if let Ok(mut file) = std::fs::File::open(&path) {
                    let archive_path = format!("{}/{}", prefix, name);
                    if zip.start_file(&archive_path, options.clone()).is_ok() {
                        let mut buf = Vec::new();
                        let _ = file.read_to_end(&mut buf);
                        let _ = zip.write_all(&buf);
                    }
                }
            }
        }
    }

    let config_dir = inst_dir.join("config");
    if config_dir.exists() {
        add_dir_to_zip_recursive(&mut zip, &config_dir, "overrides/config", &options);
    }
    let kubejs_dir = inst_dir.join("kubejs");
    if kubejs_dir.exists() {
        add_dir_to_zip_recursive(&mut zip, &kubejs_dir, "overrides/kubejs", &options);
    }

    let _ = zip.finish();
    log_msg(&app, &format!("[Export/OK] Exported to {}", output_path));
    json!({"success": true, "path": output_path, "mods_count": index_files.len()})
}

// ==================== MOD CONFLICT DETECTION ====================
#[tauri::command]
fn detect_mod_conflicts(instance_name: String) -> Value {
    let mods_dir = instances_dir().join(&instance_name).join("mods");
    let mut installed_slugs: Vec<String> = Vec::new();
    let mut installed_names: Vec<String> = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&mods_dir) {
        for entry in entries.flatten() {
            let fname = entry.file_name().to_string_lossy().to_string();
            let clean = fname.trim_end_matches(".disabled");
            if !clean.ends_with(".jar") { continue; }
            let name = clean.trim_end_matches(".jar").to_string();
            installed_names.push(name.to_lowercase());
        }
    }

    fn slug_from_name(name: &str) -> String {
        name.replace('_', "-").replace(' ', "-").to_lowercase()
    }

    for n in &installed_names {
        installed_slugs.push(slug_from_name(n));
    }

    struct ConflictRule {
        mod1_keywords: &'static [&'static str],
        mod2_keywords: &'static [&'static str],
        reason: &'static str,
        severity: &'static str,
    }

    let rules: Vec<ConflictRule> = vec![
        ConflictRule {
            mod1_keywords: &["optifine", "optifabric", "optiforge"],
            mod2_keywords: &["sodium", "embeddium"],
            reason: "OptiFine and Sodium/Embeddium are incompatible rendering engines",
            severity: "high",
        },
        ConflictRule {
            mod1_keywords: &["optifine", "optifabric", "optiforge"],
            mod2_keywords: &["lithium"],
            reason: "OptiFine and Lithium may conflict on optimization paths",
            severity: "medium",
        },
        ConflictRule {
            mod1_keywords: &["sodium"],
            mod2_keywords: &["embeddium"],
            reason: "Sodium and Embeddium are both rendering engines - only one can run",
            severity: "high",
        },
        ConflictRule {
            mod1_keywords: &["starlight"],
            mod2_keywords: &["phosphor"],
            reason: "Starlight and Phosphor both rewrite the light engine",
            severity: "high",
        },
        ConflictRule {
            mod1_keywords: &["sodium"],
            mod2_keywords: &["optifine"],
            reason: "Sodium conflicts with OptiFine rendering engine",
            severity: "high",
        },
        ConflictRule {
            mod1_keywords: &["lithium"],
            mod2_keywords: &["phosphor"],
            reason: "Lithium and Phosphor may overlap in optimization areas",
            severity: "low",
        },
        ConflictRule {
            mod1_keywords: &["modernfix"],
            mod2_keywords: &["optifine"],
            reason: "ModernFix and OptiFine may have overlapping fixes",
            severity: "low",
        },
    ];

    let mut conflicts = Vec::new();

    for rule in &rules {
        let has_mod1 = installed_slugs.iter().any(|s| rule.mod1_keywords.iter().any(|k| s.contains(k)));
        let has_mod2 = installed_slugs.iter().any(|s| rule.mod2_keywords.iter().any(|k| s.contains(k)));

        if has_mod1 && has_mod2 {
            let name1 = rule.mod1_keywords.iter()
                .find(|k| installed_slugs.iter().any(|s| s.contains(*k)))
                .unwrap_or(&"").to_string();
            let name2 = rule.mod2_keywords.iter()
                .find(|k| installed_slugs.iter().any(|s| s.contains(*k)))
                .unwrap_or(&"").to_string();

            conflicts.push(json!({
                "mod1": name1,
                "mod2": name2,
                "reason": rule.reason,
                "severity": rule.severity,
            }));
        }
    }

    json!({"success": true, "conflicts": conflicts, "total": conflicts.len()})
}

// ==================== FIRST-LAUNCH WIZARD ====================
#[tauri::command]
fn check_first_launch() -> Value {
    let wizard_done = app_dir().join(".wizard_done");
    json!({"first_launch": !wizard_done.exists()})
}

#[tauri::command]
fn complete_first_launch(app: State<AppState>) -> Value {
    let wizard_done = app_dir().join(".wizard_done");
    let _ = std::fs::write(&wizard_done, "done");
    log_msg(&app, "[Wizard] First-launch wizard completed");
    json!({"success": true})
}

// ==================== JAVA VERSION DETECTION & AUTO-DOWNLOAD ====================
fn java_dir() -> PathBuf { app_dir().join("java") }

fn get_java_major_version(java_path: &str) -> Option<u32> {
    // First check PE header to avoid executing wrong-arch binary
    if !java_path.is_empty() {
        if let Some(arch) = get_exe_arch_from_pe_header(java_path) {
            let host = get_host_arch().to_string();
            if arch != host {
                return None;
            }
        }
    }

    let mut cmd = hidden_cmd(java_path);
    cmd.arg("-version");
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    let mut child = cmd.spawn().ok()?;
    let timeout = std::time::Duration::from_secs(5);
    let start = std::time::Instant::now();
    loop {
        if let Ok(Some(_)) = child.try_wait() { break; }
        if start.elapsed() > timeout {
            let _ = child.kill();
            return None;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    let output = child.wait_with_output().ok()?;
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let combined = format!("{}{}", stderr, stdout);
    for line in combined.lines() {
        let lower = line.to_lowercase();
        if lower.contains("version") {
            if let Some(start) = line.find('"') {
                if let Some(end) = line[start+1..].find('"') {
                    let ver_str = &line[start+1..start+1+end];
                    let parts: Vec<&str> = ver_str.split('.').collect();
                    if let Some(first) = parts.first() {
                        if let Ok(major) = first.parse::<u32>() {
                            return Some(major);
                        }
                    }
                }
            }
        }
    }
    None
}

fn get_exe_arch_from_pe_header(exe_path: &str) -> Option<String> {
    let data = std::fs::read(exe_path).ok()?;
    if data.len() < 0x40 { return None; }
    let pe_offset = u32::from_le_bytes([data[0x3C], data[0x3D], data[0x3E], data[0x3F]]) as usize;
    if pe_offset + 6 > data.len() { return None; }
    if &data[pe_offset..pe_offset+4] != b"PE\0\0" { return None; }
    let machine = u16::from_le_bytes([data[pe_offset+4], data[pe_offset+5]]);
    match machine {
        0x8664 => Some("x64".to_string()),
        0xAA64 => Some("aarch64".to_string()),
        0x014c => Some("x86".to_string()),
        _ => Some(format!("unknown_{:#06x}", machine)),
    }
}

fn get_required_java_for_mc(mc_version: &str) -> u32 {
    let vt = parse_version_tuple(mc_version);
    if vt >= (1, 21, 0) { 21 }
    else if vt >= (1, 20, 2) { 17 }
    else if vt >= (1, 17, 0) { 16 }
    else if vt >= (1, 12, 0) { 8 }
    else { 8 }
}

fn find_all_java_installations() -> Vec<Value> {
    let mut javas: Vec<Value> = Vec::new();
    let host_arch = get_host_arch().to_string();

    // Check managed Javas
    let managed = java_dir();
    if let Ok(entries) = std::fs::read_dir(&managed) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                let bin_java = path.join("bin").join("java.exe");
                if bin_java.exists() {
                    let path_str = bin_java.to_string_lossy().to_string();
                    if let Some(major) = get_java_major_version(&path_str) {
                        let arch = get_java_arch(&path_str).unwrap_or_else(|| "unknown".to_string());
                        javas.push(json!({
                            "path": path_str,
                            "major_version": major,
                            "name": name,
                            "managed": true,
                            "arch": arch,
                            "compatible_arch": arch == host_arch,
                        }));
                    }
                }
            }
        }
    }

    // Check system Java
    let system_java = which_java();
    if !system_java.is_empty() {
        if let Some(major) = get_java_major_version(&system_java) {
            let arch = get_java_arch(&system_java).unwrap_or_else(|| "unknown".to_string());
            javas.push(json!({
                "path": system_java,
                "major_version": major,
                "name": "System Java",
                "managed": false,
                "arch": arch,
                "compatible_arch": arch == host_arch,
            }));
        }
    }

    // Check common installation paths on Windows
    if cfg!(target_os = "windows") {
        let search_dirs = [
            r"C:\Program Files\Java",
            r"C:\Program Files\Eclipse Adoptium",
            r"C:\Program Files\Microsoft",
            r"C:\Program Files\AdoptOpenJDK",
            r"C:\Program Files\Zulu",
            r"C:\Program Files\BellSoft",
        ];
        for dir in &search_dirs {
            let base = Path::new(dir);
            if base.exists() {
                if let Ok(entries) = std::fs::read_dir(base) {
                    for entry in entries.flatten() {
                        let java_path = entry.path().join("bin").join("java.exe");
                        if java_path.exists() {
                            let path_str = java_path.to_string_lossy().to_string();
                            let already_found = javas.iter().any(|j| j.get("path").and_then(|p| p.as_str()) == Some(&path_str));
                            if !already_found {
                                if let Some(major) = get_java_major_version(&path_str) {
                                    let arch = get_java_arch(&path_str).unwrap_or_else(|| "unknown".to_string());
                                    javas.push(json!({
                                        "path": path_str,
                                        "major_version": major,
                                        "name": entry.file_name().to_string_lossy(),
                                        "managed": false,
                                        "arch": arch,
                                        "compatible_arch": arch == host_arch,
                                    }));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    javas
}

fn adoptium_download_url(major_version: u32) -> String {
    let arch = get_host_arch();
    let os = if cfg!(target_os = "windows") { "windows" }
        else if cfg!(target_os = "macos") { "mac" }
        else { "linux" };
    format!(
        "https://api.adoptium.net/v3/binary/latest/{}/ga/{}/{}//jdk/hotspot/normal/eclipse",
        major_version, os, arch
    )
}

fn auto_download_java(app: &State<AppState>, major_version: u32) -> Result<String, String> {
    let managed = java_dir();
    let _ = std::fs::create_dir_all(&managed);

    let dest_dir = managed.join(format!("java-{}", major_version));
    if dest_dir.exists() {
        let bin_java = dest_dir.join("bin").join("java.exe");
        if bin_java.exists() {
            let path_str = bin_java.to_string_lossy().to_string();
            if get_java_major_version(&path_str).is_some() {
                return Ok(path_str);
            }
            log_msg(app, &format!("[Java] Existing Java {} is broken, re-downloading...", major_version));
            let _ = std::fs::remove_dir_all(&dest_dir);
        }
    }

    let url = adoptium_download_url(major_version);
    log_msg(app, &format!("[Java] Auto-downloading Java {} from Adoptium...", major_version));
    log_msg(app, &format!("[Java] URL: {}", url));

    let temp_dir = tempfile::tempdir().map_err(|e| e.to_string())?;
    let zip_path = temp_dir.path().join(format!("jdk-{}.zip", major_version));

    // Download the zip
    download_file_blocking(&url, &zip_path).map_err(|e| {
        log_msg(app, &format!("[Java/ERROR] Download failed: {}", e));
        format!("Failed to download Java {}: {}", major_version, e)
    })?;

    log_msg(app, "[Java] Download complete, extracting...");

    // Extract the zip
    let file = std::fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    let extract_dir = temp_dir.path().join(format!("jdk-{}", major_version));
    let _ = std::fs::create_dir_all(&extract_dir);

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = extract_dir.join(file.name());
        if let Some(parent) = outpath.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if !file.name().ends_with('/') {
            let mut buf = Vec::new();
            file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            std::fs::write(&outpath, &buf).map_err(|e| e.to_string())?;
        }
    }

    // Find the actual JDK directory inside extract (Adoptium uses jdk-{version}+build)
    let inner_dir = std::fs::read_dir(&extract_dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .find(|e| e.path().is_dir())
        .ok_or_else(|| "No JDK directory found in archive".to_string())?
        .path();

    // Move to managed dir
    std::fs::rename(&inner_dir, &dest_dir).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_dir_all(&extract_dir);

    let bin_java = dest_dir.join("bin").join("java.exe");
    if bin_java.exists() {
        let path_str = bin_java.to_string_lossy().to_string();
        if get_java_major_version(&path_str).is_some() {
            let host_arch = get_host_arch();
            let java_arch = get_java_arch(&path_str).unwrap_or_else(|| "unknown".to_string());
            log_msg(app, &format!("[Java/OK] Java {} ({}) downloaded and installed at {}", major_version, java_arch, dest_dir.to_string_lossy()));
            if java_arch != host_arch {
                log_msg(app, &format!("[Java/WARN] Downloaded Java arch ({}) does not match host ({})", java_arch, host_arch));
            }
            Ok(path_str)
        } else {
            let _ = std::fs::remove_dir_all(&dest_dir);
            Err(format!("Java {} downloaded but failed to run (wrong architecture?)", major_version))
        }
    } else {
        Err(format!("Java {} downloaded but java.exe not found at {}", major_version, dest_dir.to_string_lossy()))
    }
}

fn get_cached_java_installations(app: &State<AppState>) -> Vec<Value> {
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
    let mut cache = app.java_cache.lock().unwrap();
    if let Some((ts, ref javas)) = *cache {
        if now - ts < 30 {
            return javas.clone();
        }
    }
    let javas = find_all_java_installations();
    *cache = Some((now, javas.clone()));
    javas
}

#[tauri::command]
fn check_java_compatibility(app: State<AppState>, mc_version: String) -> Value {
    let required = get_required_java_for_mc(&mc_version);
    let javas = get_cached_java_installations(&app);

    let settings = load_settings(&app);
    let custom_java = settings.get("java_path").and_then(|v| v.as_str()).unwrap_or("");

    let compatible: Vec<&Value> = javas.iter()
        .filter(|j| j.get("major_version").and_then(|v| v.as_u64()).unwrap_or(0) as u32 == required)
        .filter(|j| j.get("compatible_arch").and_then(|v| v.as_bool()).unwrap_or(false))
        .collect();

    let current_java = if !custom_java.is_empty() && Path::new(custom_java).exists() {
        get_java_major_version(custom_java)
    } else {
        let wj = which_java();
        if !wj.is_empty() { get_java_major_version(&wj) } else { None }
    };

    let current_compatible = current_java.map(|v| v == required).unwrap_or(false);

    json!({
        "mc_version": mc_version,
        "required_java": required,
        "current_java_version": current_java,
        "current_compatible": current_compatible,
        "available_javas": javas,
        "compatible_javas": compatible,
        "managed_java_dir": java_dir().to_string_lossy(),
    })
}

#[tauri::command]
fn download_java(app: State<AppState>, major_version: u32) -> Value {
    match auto_download_java(&app, major_version) {
        Ok(path) => {
            save_setting_val(&app, "java_path", Value::String(path.clone()));
            json!({"success": true, "path": path, "major_version": major_version})
        }
        Err(e) => json!({"error": e}),
    }
}

#[tauri::command]
fn get_java_installations() -> Value {
    Value::Array(find_all_java_installations())
}

#[tauri::command]
fn set_java_for_instance(app: State<AppState>, java_path: String) -> Value {
    save_setting_val(&app, "java_path", Value::String(java_path));
    json!({"success": true})
}

// ==================== SYSTEM TERMINAL ACCESS (EcAI) ====================
#[tauri::command]
fn run_system_command(command: String) -> Value {
    let output = if cfg!(target_os = "windows") {
        std::process::Command::new("cmd")
            .args(["/C", &command])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output()
    } else {
        std::process::Command::new("sh")
            .args(["-c", &command])
            .output()
    };

    match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout).to_string();
            let stderr = String::from_utf8_lossy(&o.stderr).to_string();
            json!({
                "success": o.status.success(),
                "stdout": stdout,
                "stderr": stderr,
                "exit_code": o.status.code(),
            })
        }
        Err(e) => json!({"success": false, "error": e.to_string()}),
    }
}

#[tauri::command]
fn read_file_content(path: String) -> Value {
    match std::fs::read_to_string(&path) {
        Ok(content) => json!({"success": true, "content": content}),
        Err(e) => json!({"success": false, "error": e.to_string()}),
    }
}

#[tauri::command]
fn write_file_content(path: String, content: String) -> Value {
    if let Some(parent) = Path::new(&path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    match std::fs::write(&path, &content) {
        Ok(()) => json!({"success": true}),
        Err(e) => json!({"success": false, "error": e.to_string()}),
    }
}

#[tauri::command]
fn list_directory(path: String) -> Value {
    let dir_path = Path::new(&path);
    if !dir_path.exists() {
        return json!({"success": false, "error": "Directory not found"});
    }
    let mut entries = Vec::new();
    if let Ok(read_dir) = std::fs::read_dir(dir_path) {
        for entry in read_dir.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = entry.path().is_dir();
            let size = entry.metadata().ok().map(|m| m.len()).unwrap_or(0);
            entries.push(json!({
                "name": name,
                "is_dir": is_dir,
                "size": size,
                "path": entry.path().to_string_lossy(),
            }));
        }
    }
    json!({"success": true, "entries": entries})
}

#[tauri::command]
fn delete_path(path: String) -> Value {
    let p = Path::new(&path);
    if !p.exists() {
        return json!({"success": false, "error": "Path not found"});
    }
    if p.is_dir() {
        match std::fs::remove_dir_all(p) {
            Ok(()) => json!({"success": true}),
            Err(e) => json!({"success": false, "error": e.to_string()}),
        }
    } else {
        match std::fs::remove_file(p) {
            Ok(()) => json!({"success": true}),
            Err(e) => json!({"success": false, "error": e.to_string()}),
        }
    }
}

// ==================== PATH HELPERS (EXTENDED) ====================
fn servers_file() -> PathBuf { app_dir().join("servers.json") }
fn selfhost_dir() -> PathBuf { app_dir().join("selfhost") }
fn selfhost_exe() -> PathBuf { selfhost_dir().join("EcSelfHost.exe") }

// ==================== INSTANCE CLONING ====================
#[tauri::command]
fn clone_instance(app: State<AppState>, instance_name: String, new_instance_name: String) -> Value {
    log_msg(&app, &format!("[Instance] Cloning '{}' to '{}'", instance_name, new_instance_name));
    let instances = load_instances_raw(&app);
    let source = match instances.iter().find(|i| i.get("name").and_then(|n| n.as_str()) == Some(&instance_name)) {
        Some(i) => i.clone(),
        None => return json!({"error": format!("Instance '{}' not found", instance_name)}),
    };
    let new_dir = instances_dir().join(&new_instance_name);
    if new_dir.exists() {
        return json!({"error": format!("Instance '{}' already exists", new_instance_name)});
    }
    let source_dir = instances_dir().join(&instance_name);
    let is_installed = source_dir.exists();
    if is_installed {
        match copy_dir_recursive(&source_dir, &new_dir) {
            Ok(()) => {}
            Err(e) => return json!({"error": format!("Failed to copy instance directory: {}", e)}),
        }
    }
    let mut new_data = source.clone();
    new_data["name"] = Value::String(new_instance_name.clone());
    new_data["created"] = Value::String(chrono::Local::now().to_rfc3339());
    new_data["last_played"] = Value::Null;
    let mut all_instances = load_instances_raw(&app);
    all_instances.push(new_data.clone());
    save_instances(&all_instances);
    log_msg(&app, &format!("[Instance] Cloned '{}' to '{}' successfully", instance_name, new_instance_name));
    json!({"success": true, "instance": new_data, "copied_files": is_installed})
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

// ==================== MULTIPLAYER SERVER LIST ====================
#[tauri::command]
fn get_servers() -> Value {
    let data = load_json(&servers_file());
    data.as_array().cloned().map(Value::Array).unwrap_or_else(|| Value::Array(vec![]))
}

#[tauri::command]
fn add_server(name: String, address: String, port: u16) -> Value {
    let mut servers = load_json(&servers_file()).as_array().cloned().unwrap_or_default();
    if servers.iter().any(|s| s.get("name").and_then(|n| n.as_str()) == Some(&name)) {
        return json!({"error": format!("Server '{}' already exists", name)});
    }
    let server = json!({
        "name": name,
        "address": address,
        "port": port,
    });
    servers.push(server);
    save_json(&servers_file(), &Value::Array(servers));
    json!({"success": true})
}

#[tauri::command]
fn delete_server(name: String) -> Value {
    let mut servers = load_json(&servers_file()).as_array().cloned().unwrap_or_default();
    let len_before = servers.len();
    servers.retain(|s| s.get("name").and_then(|n| n.as_str()) != Some(&name));
    if servers.len() == len_before {
        return json!({"error": format!("Server '{}' not found", name)});
    }
    save_json(&servers_file(), &Value::Array(servers));
    json!({"success": true})
}

fn write_var_int(mut value: u32) -> Vec<u8> {
    let mut buf = Vec::new();
    loop {
        let mut byte = (value & 0x7F) as u8;
        value >>= 7;
        if value != 0 {
            byte |= 0x80;
        }
        buf.push(byte);
        if value == 0 {
            break;
        }
    }
    buf
}

fn read_var_int(data: &[u8], offset: &mut usize) -> Result<u32, String> {
    let mut result: u32 = 0;
    let mut shift = 0;
    loop {
        if *offset >= data.len() {
            return Err("Unexpected end of data reading VarInt".into());
        }
        let byte = data[*offset];
        *offset += 1;
        result |= ((byte & 0x7F) as u32) << shift;
        if byte & 0x80 == 0 {
            break;
        }
        shift += 7;
        if shift >= 35 {
            return Err("VarInt too big".into());
        }
    }
    Ok(result)
}

#[tauri::command]
fn ping_server(address: String, port: u16) -> Value {
    use std::net::TcpStream;
    use std::time::Duration;

    let addr_str = format!("{}:{}", address, port);
    let addr: std::net::SocketAddr = match addr_str.parse() {
        Ok(a) => a,
        Err(e) => return json!({"error": format!("Invalid address: {}", e)}),
    };
    let stream = match TcpStream::connect_timeout(&addr, Duration::from_secs(3)) {
        Ok(s) => s,
        Err(e) => return json!({"error": format!("Failed to connect: {}", e)}),
    };
    stream.set_read_timeout(Some(Duration::from_secs(3))).ok();
    stream.set_write_timeout(Some(Duration::from_secs(3))).ok();

    // Handshake packet
    let protocol_version: u32 = 767; // 1.21 version, most servers handle this
    let next_state: u32 = 1;
    let mut handshake_data = Vec::new();
    handshake_data.extend_from_slice(&write_var_int(protocol_version));
    // Server address
    let addr_bytes = address.as_bytes();
    handshake_data.extend_from_slice(&write_var_int(addr_bytes.len() as u32));
    handshake_data.extend_from_slice(addr_bytes);
    // Server port
    handshake_data.extend_from_slice(&port.to_be_bytes());
    // Next state
    handshake_data.extend_from_slice(&write_var_int(next_state));

    let mut handshake_packet = Vec::new();
    handshake_packet.extend_from_slice(&write_var_int(0)); // packet id = 0
    handshake_packet.extend_from_slice(&handshake_data);

    let mut full_handshake = write_var_int(handshake_packet.len() as u32);
    full_handshake.extend_from_slice(&handshake_packet);

    let mut stream_clone = match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return json!({"error": "Failed to clone stream"}),
    };
    if stream_clone.write_all(&full_handshake).is_err() {
        return json!({"error": "Failed to send handshake"});
    }

    // Status request
    let status_req = vec![0x01, 0x00]; // length=1, packet_id=0
    if stream_clone.write_all(&status_req).is_err() {
        return json!({"error": "Failed to send status request"});
    }

    // Read response
    drop(stream_clone);
    let mut reader = stream;
    // Read VarInt length
    let mut length: u32 = 0;
    let mut shift = 0;
    loop {
        let mut byte = [0u8; 1];
        match reader.read_exact(&mut byte) {
            Ok(()) => {}
            Err(e) => return json!({"error": format!("Failed to read response length: {}", e)}),
        }
        length |= ((byte[0] & 0x7F) as u32) << shift;
        if byte[0] & 0x80 == 0 {
            break;
        }
        shift += 7;
    }

    let mut payload = vec![0u8; length as usize];
    if reader.read_exact(&mut payload).is_err() {
        return json!({"error": "Failed to read response payload"});
    }

    // Skip packet id (VarInt)
    let mut offset = 0;
    let _packet_id = read_var_int(&payload, &mut offset).unwrap_or(0);

    // Read JSON string length
    let json_len = read_var_int(&payload, &mut offset).unwrap_or(0) as usize;
    if offset + json_len > payload.len() {
        return json!({"error": "Invalid response: JSON string too long"});
    }
    let json_str = match std::str::from_utf8(&payload[offset..offset + json_len]) {
        Ok(s) => s,
        Err(e) => return json!({"error": format!("Invalid UTF-8 in response: {}", e)}),
    };

    match serde_json::from_str::<Value>(json_str) {
        Ok(data) => {
            let motd = data.get("description")
                .and_then(|d| d.get("text").or(d.get("translate")).or(Some(d)))
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string();
            let online = data.get("players")
                .and_then(|p| p.get("online"))
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let max = data.get("players")
                .and_then(|p| p.get("max"))
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let version = data.get("version")
                .and_then(|v| v.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string();
            json!({
                "success": true,
                "motd": motd,
                "online": online,
                "max": max,
                "version": version,
            })
        }
        Err(e) => json!({"error": format!("Failed to parse server response: {}", e)}),
    }
}

// ==================== SELF-HOST (EcSelfHost) ====================
#[tauri::command]
fn get_selfhost_status() -> Value {
    let exe = selfhost_exe();
    json!({
        "exists": exe.exists(),
        "path": exe.to_string_lossy(),
    })
}

#[tauri::command]
fn download_selfhost(app: State<AppState>) -> Value {
    log_msg(&app, "[SelfHost] Starting download of EcSelfHost.exe...");
    let _ = std::fs::create_dir_all(&selfhost_dir());

    // Fetch the MediaFire page to find the download link
    let page_html = match reqwest::blocking::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .build()
    {
        Ok(client) => {
            match client.get("https://www.mediafire.com/file/lr3tqh08syf8tgu/EcSelfHost.exe/file").send() {
                Ok(resp) => resp.text().unwrap_or_default(),
                Err(e) => return json!({"success": false, "error": format!("Failed to fetch MediaFire page: {}", e)}),
            }
        }
        Err(e) => return json!({"success": false, "error": format!("Failed to build HTTP client: {}", e)}),
    };

    // Try to find the download URL in the HTML
    let download_url = extract_mediafire_download_url(&page_html);
    let download_url = match download_url {
        Some(url) => url,
        None => {
            // Fallback: try the known direct download pattern
            // MediaFire sometimes allows direct download with the file key
            let fallback_url = "https://download1.mediafire.com/lr3tqh08syf8tgu/EcSelfHost.exe";
            log_msg(&app, &format!("[SelfHost] Could not parse download URL from page, trying fallback: {}", fallback_url));
            fallback_url.to_string()
        }
    };

    log_msg(&app, &format!("[SelfHost] Downloading from: {}", download_url));
    match download_file_blocking(&download_url, &selfhost_exe()) {
        Ok(()) => {
            log_msg(&app, "[SelfHost] Download completed successfully");
            json!({"success": true, "path": selfhost_exe().to_string_lossy()})
        }
        Err(e) => {
            log_msg(&app, &format!("[SelfHost] Download failed: {}", e));
            json!({"success": false, "error": format!("Download failed: {}", e)})
        }
    }
}

fn extract_mediafire_download_url(html: &str) -> Option<String> {
    // Look for downloadUrl in JavaScript
    if let Some(idx) = html.find("\"downloadUrl\"") {
        let slice = &html[idx..];
        if let Some(start) = slice.find('\"') {
            let after_quote = &slice[start + 1..];
            if let Some(end) = after_quote.find('"') {
                let url = &after_quote[..end];
                if url.starts_with("http") {
                    return Some(url.to_string());
                }
            }
        }
    }
    // Look for download URL in href
    if let Some(idx) = html.find("download_url") {
        let slice = &html[idx..];
        if let Some(start) = slice.find('\"') {
            let after_quote = &slice[start + 1..];
            if let Some(end) = after_quote.find('"') {
                let url = &after_quote[..end];
                if url.starts_with("http") {
                    return Some(url.to_string());
                }
            }
        }
    }
    // Look for onclick with download link
    for pattern in &["class=\"download_link\"", "id=\"downloadButton\"", "href=\"https://download"] {
        if let Some(idx) = html.find(pattern) {
            let slice = &html[idx..];
            if let Some(start) = slice.find("href=\"") {
                let after = &slice[start + 6..];
                if let Some(end) = after.find('"') {
                    let url = &after[..end];
                    if url.starts_with("http") {
                        return Some(url.to_string());
                    }
                }
            }
        }
    }
    // Regex-like approach: find any URL containing "download" and "mediafire"
    let mut search_start = 0;
    while let Some(idx) = html[search_start..].find("http") {
        let abs_idx = search_start + idx;
        if let Some(end) = html[abs_idx..].find(|c: char| c == '"' || c == '\'' || c == ' ') {
            let candidate = &html[abs_idx..abs_idx + end];
            if candidate.contains("mediafire") && (candidate.contains("download") || candidate.contains("dl/")) {
                return Some(candidate.to_string());
            }
            search_start = abs_idx + end;
        } else {
            break;
        }
    }
    None
}

#[tauri::command]
fn launch_selfhost(app: State<AppState>) -> Value {
    let exe = selfhost_exe();
    if !exe.exists() {
        return json!({"success": false, "error": "EcSelfHost.exe not found. Please download it first."});
    }
    log_msg(&app, "[SelfHost] Launching EcSelfHost.exe...");
    let mut cmd = hidden_cmd(exe.to_string_lossy().to_string().as_str());
    cmd.current_dir(&selfhost_dir());
    cmd.stdout(std::process::Stdio::null());
    cmd.stderr(std::process::Stdio::null());
    cmd.stdin(std::process::Stdio::null());
    match cmd.spawn() {
        Ok(_) => {
            log_msg(&app, "[SelfHost] EcSelfHost.exe launched successfully");
            json!({"success": true})
        }
        Err(e) => {
            log_msg(&app, &format!("[SelfHost] Failed to launch: {}", e));
            json!({"success": false, "error": e.to_string()})
        }
    }
}

// ==================== PAPER SERVER VERSIONS ====================
#[tauri::command]
fn get_server_versions() -> Value {
    match http_get("https://api.papermc.io/v2/projects/paper", None) {
        Ok(data) => {
            let versions = data.get("versions")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            json!({"success": true, "versions": versions})
        }
        Err(e) => json!({"error": format!("Failed to fetch Paper versions: {}", e)}),
    }
}

#[tauri::command]
fn get_server_builds(mc_version: String) -> Value {
    let url = format!("https://api.papermc.io/v2/projects/paper/versions/{}/builds", mc_version);
    match http_get(&url, None) {
        Ok(data) => {
            let builds = data.get("builds")
                .and_then(|b| b.as_array())
                .map(|arr| {
                    arr.iter().map(|b| {
                        let build_number = b.get("build").and_then(|v| v.as_u64()).unwrap_or(0);
                        let download_url = b.get("downloads")
                            .and_then(|d| d.get("application"))
                            .and_then(|a| a.get("name"))
                            .map(|name| format!("https://api.papermc.io/v2/projects/paper/versions/{}/builds/{}/downloads/{}", mc_version, build_number, name.as_str().unwrap_or("")))
                            .unwrap_or_default();
                        let channel = b.get("channel")
                            .and_then(|c| c.get("name"))
                            .and_then(|n| n.as_str())
                            .unwrap_or("default")
                            .to_string();
                        json!({
                            "build_number": build_number,
                            "download_url": download_url,
                            "channel": channel,
                        })
                    }).collect::<Vec<_>>()
                })
                .unwrap_or_default();
            json!({"success": true, "builds": builds})
        }
        Err(e) => json!({"error": format!("Failed to fetch Paper builds for {}: {}", mc_version, e)}),
    }
}

// ==================== SERVER LAUNCH ====================
#[tauri::command]
fn launch_server(app: State<AppState>, app_handle: tauri::AppHandle, instance_name: String) -> Value {
    log_msg(&app, &format!("[ServerLaunch] Preparing to launch server '{}'...", instance_name));

    let instances = load_instances_raw(&app);
    let instance = instances.iter().find(|i| i.get("name").and_then(|n| n.as_str()) == Some(&instance_name));
    let _instance_data = match instance {
        Some(i) => i.clone(),
        None => return json!({"error": format!("Instance '{}' not found", instance_name)}),
    };

    let inst_dir = instances_dir().join(&instance_name);
    if !inst_dir.exists() {
        return json!({"error": format!("Instance directory '{}' not found", instance_name)});
    }

    // Find Paper/Spigot jar
    let server_jar = find_server_jar(&inst_dir);
    let server_jar = match server_jar {
        Some(j) => j,
        None => return json!({"error": "No Paper or Spigot JAR found in instance directory".to_string()}),
    };

    log_msg(&app, &format!("[ServerLaunch] Found server JAR: {}", server_jar.file_name().unwrap_or_default().to_string_lossy()));

    // Find Java
    let settings = load_settings(&app);
    let custom_java = settings.get("java_path").and_then(|v| v.as_str()).unwrap_or("");
    let mut java_exec = String::new();

    if !custom_java.is_empty() && Path::new(custom_java).exists() {
        java_exec = custom_java.to_string();
    }
    if java_exec.is_empty() {
        let all_javas = find_all_java_installations();
        if let Some(j) = all_javas.first() {
            if let Some(p) = j.get("path").and_then(|v| v.as_str()) {
                java_exec = p.to_string();
            }
        }
    }
    if java_exec.is_empty() {
        return json!({"error": "No Java installation found. Please install Java."});
    }

    log_msg(&app, &format!("[ServerLaunch] Using Java: {}", java_exec));

    let jar_path = server_jar.to_string_lossy().to_string();
    let java_clone = java_exec.clone();

    std::thread::spawn(move || {
        log_msg_state(&app_handle, &format!("[ServerLaunch] Starting server process..."));

        let mut child = hidden_cmd(&java_clone);
        child.args(["-jar", &jar_path, "--nogui"]);
        child.current_dir(&inst_dir);
        child.stdout(std::process::Stdio::piped());
        child.stderr(std::process::Stdio::piped());
        child.stdin(std::process::Stdio::null());

        match child.spawn() {
            Ok(mut proc) => {
                log_msg_state(&app_handle, &format!("[ServerLaunch] Server started, PID: {:?}", proc.id()));
                append_output_state(&app_handle, &format!("[Server] Server started (PID: {:?})", proc.id()));

                if let Some(stdout) = proc.stdout.take() {
                    let reader = std::io::BufReader::new(stdout);
                    for line in reader.lines() {
                        if let Ok(line) = line {
                            let trimmed = line.trim().to_string();
                            if !trimmed.is_empty() {
                                append_output_state(&app_handle, &trimmed);
                                log_msg_state(&app_handle, &format!("[Server] {}", trimmed));
                            }
                        }
                    }
                }

                let exit_code = proc.wait().map(|s| s.code().unwrap_or(1)).unwrap_or(1);
                if exit_code != 0 {
                    log_msg_state(&app_handle, &format!("[Server/ERROR] Server exited with code {}", exit_code));
                    append_output_state(&app_handle, &format!("[Server ERROR] Exited with code {}", exit_code));
                } else {
                    log_msg_state(&app_handle, "[Server/INFO] Server stopped normally.");
                    append_output_state(&app_handle, "[Server] Server stopped normally.");
                }
            }
            Err(e) => {
                log_msg_state(&app_handle, &format!("[Server/ERROR] Failed to start: {}", e));
                append_output_state(&app_handle, &format!("[Server ERROR] {}", e));
            }
        }
    });

    json!({"success": true, "message": "Server process started"})
}

fn find_server_jar(inst_dir: &Path) -> Option<PathBuf> {
    if let Ok(entries) = std::fs::read_dir(inst_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if name.ends_with(".jar") && (name.contains("paper") || name.contains("spigot") || name.contains("paperclip")) {
                return Some(entry.path());
            }
        }
    }
    None
}

// ==================== PIN/UNPIN INSTANCE ====================
#[tauri::command]
fn pin_instance(app: State<AppState>, instance_name: String) -> Value {
    let mut instances = load_instances_raw(&app);
    for inst in instances.iter_mut() {
        if inst.get("name").and_then(|v| v.as_str()) == Some(&instance_name) {
            inst["pinned"] = Value::Bool(true);
            save_instances(&instances);
            return json!({"success": true});
        }
    }
    json!({"error": "Instance not found"})
}

#[tauri::command]
fn unpin_instance(app: State<AppState>, instance_name: String) -> Value {
    let mut instances = load_instances_raw(&app);
    for inst in instances.iter_mut() {
        if inst.get("name").and_then(|v| v.as_str()) == Some(&instance_name) {
            inst["pinned"] = Value::Bool(false);
            save_instances(&instances);
            return json!({"success": true});
        }
    }
    json!({"error": "Instance not found"})
}

// ==================== SCREENSHOTS ====================
#[tauri::command]
fn get_screenshots(app: State<AppState>, instance_name: String) -> Value {
    let screenshots_dir = instances_dir().join(&instance_name).join("screenshots");
    let mut screenshots = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&screenshots_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let lower = name.to_lowercase();
            if lower.ends_with(".png") || lower.ends_with(".jpg") || lower.ends_with(".jpeg") || lower.ends_with(".webp") {
                let metadata = entry.metadata().ok();
                let modified = metadata.as_ref()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                screenshots.push(json!({
                    "name": name,
                    "path": entry.path().to_string_lossy().to_string(),
                    "modified": modified,
                }));
            }
        }
    }
    screenshots.sort_by(|a, b|
        b.get("modified").and_then(|v| v.as_u64()).unwrap_or(0)
            .cmp(&a.get("modified").and_then(|v| v.as_u64()).unwrap_or(0))
    );
    json!({"screenshots": screenshots})
}

// ==================== EXPORT/IMPORT INSTANCE CONFIG ====================
#[tauri::command]
fn export_instance_config(app: State<AppState>, instance_name: String, output_path: String) -> Value {
    let instances = load_instances_raw(&app);
    for inst in &instances {
        if inst.get("name").and_then(|v| v.as_str()) == Some(&instance_name) {
            let out = PathBuf::from(&output_path);
            if let Some(parent) = out.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            match std::fs::write(&out, serde_json::to_string_pretty(inst).unwrap_or_default()) {
                Ok(()) => return json!({"success": true, "path": output_path}),
                Err(e) => return json!({"error": e.to_string()}),
            }
        }
    }
    json!({"error": "Instance not found"})
}

#[tauri::command]
fn import_instance_config(app: State<AppState>, file_path: String) -> Value {
    let data = match std::fs::read_to_string(&file_path) {
        Ok(d) => d,
        Err(e) => return json!({"error": e.to_string()}),
    };
    let parsed: Value = match serde_json::from_str(&data) {
        Ok(v) => v,
        Err(e) => return json!({"error": format!("Invalid JSON: {}", e)}),
    };
    if parsed.get("name").is_none() || parsed.get("version").is_none() {
        return json!({"error": "Config must have 'name' and 'version' fields"});
    }
    let now = chrono::Utc::now().to_rfc3339();
    let mut inst = parsed.clone();
    if inst.get("created").is_none() {
        inst["created"] = Value::String(now);
    }
    inst["installed"] = Value::Bool(false);
    let mut instances = load_instances_raw(&app);
    if instances.iter().any(|i| i.get("name").and_then(|v| v.as_str()) == inst.get("name").and_then(|v| v.as_str())) {
        return json!({"error": "Instance with this name already exists"});
    }
    instances.push(inst.clone());
    save_instances(&instances);
    json!({"success": true, "instance": inst})
}

// ==================== BATCH INSTALL MODS ====================
#[tauri::command]
fn batch_install_mods(app: State<AppState>, instance_name: String, slugs: Vec<String>) -> Value {
    let mut installed = 0;
    let mut errors = Vec::new();
    for slug in &slugs {
        match install_mod(app.clone(), instance_name.clone(), slug.clone(), None) {
            Value::Object(ref obj) if obj.contains_key("success") && obj.get("success") == Some(&Value::Bool(true)) => {
                installed += 1;
            }
            other => {
                let err = other.get("error").and_then(|v| v.as_str()).unwrap_or("Unknown error").to_string();
                errors.push(json!({"slug": slug, "error": err}));
            }
        }
    }
    json!({"success": true, "installed": installed, "errors": errors})
}

// ==================== CHECK LAUNCHER UPDATE ====================
#[tauri::command]
fn check_launcher_update(app: State<AppState>) -> Value {
    json!({"update_available": false, "current_version": APP_VERSION, "latest_version": APP_VERSION, "download_url": ""})
}

// ==================== GAME LOGS ====================
#[tauri::command]
fn get_game_logs(app: State<AppState>, instance_name: String) -> Value {
    let log_path = instances_dir().join(&instance_name).join("logs").join("latest.log");
    if log_path.exists() {
        match std::fs::read_to_string(&log_path) {
            Ok(contents) => json!({"logs": contents}),
            Err(_) => json!({"logs": ""}),
        }
    } else {
        json!({"logs": ""})
    }
}

// ==================== MOVE MOD/RESOURCEPACK FILE ====================
#[tauri::command]
fn move_mod_file(app: State<AppState>, instance_name: String, source_path: String) -> Value {
    let mods_dir = instances_dir().join(&instance_name).join("mods");
    let _ = std::fs::create_dir_all(&mods_dir);
    let source = PathBuf::from(&source_path);
    if !source.exists() {
        return json!({"error": "Source file not found"});
    }
    let filename = source.file_name().unwrap_or_default().to_string_lossy().to_string();
    let dest = mods_dir.join(&filename);
    match std::fs::copy(&source, &dest) {
        Ok(_) => json!({"success": true, "filename": filename}),
        Err(e) => json!({"error": e.to_string()}),
    }
}

#[tauri::command]
fn move_resourcepack_file(app: State<AppState>, instance_name: String, source_path: String) -> Value {
    let rp_dir = instances_dir().join(&instance_name).join("resourcepacks");
    let _ = std::fs::create_dir_all(&rp_dir);
    let source = PathBuf::from(&source_path);
    if !source.exists() {
        return json!({"error": "Source file not found"});
    }
    let filename = source.file_name().unwrap_or_default().to_string_lossy().to_string();
    let dest = rp_dir.join(&filename);
    match std::fs::copy(&source, &dest) {
        Ok(_) => json!({"success": true, "filename": filename}),
        Err(e) => json!({"error": e.to_string()}),
    }
}

// ==================== GAME BOOST ====================

#[tauri::command]
fn game_boost(app: State<AppState>, instance_name: String) -> Value {
    log_msg(&app, "[Boost] Starting game boost...");

    let mut steps_completed = 0u32;
    let mut steps_total = 0u32;
    let mut details: Vec<String> = Vec::new();

    let settings = load_json(&settings_file());
    let s = |k: &str| settings.get(k).and_then(|v| v.as_bool()).unwrap_or(false);

    // Load instance info for auto-mod install
    let instances = load_instances_raw(&app);
    let instance = instances.iter().find(|i| i.get("name").and_then(|n| n.as_str()) == Some(&instance_name));
    let (mc_version, loader, inst_dir) = if let Some(inst) = instance {
        let v = inst.get("version").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let l = inst.get("loader").and_then(|v| v.as_str()).unwrap_or("Vanilla").to_string();
        let d = instances_dir().join(&instance_name);
        (v, l, d)
    } else {
        (String::new(), String::new(), PathBuf::new())
    };

    // Step 1: Kill unnecessary background processes
    if s("boost_kill_processes") {
        steps_total += 1;
        log_msg(&app, "[Boost] Killing unnecessary background processes...");
        let bloatware = [
            "OneDrive.exe", "OneDriveSetup.exe",
            "MicrosoftTeams.exe", "Teams.exe", "ms-teams.exe",
            "Cortana.exe", "YourPhone.exe", "PhoneExperienceHost.exe",
            "SkypeApp.exe", "SkypeBackgroundHost.exe",
            "XboxApp.exe", "GameBar.exe", "GameBarFTServer.exe",
            "Widgets.exe", "WidgetService.exe",
            "Clipchamp.exe", "ClipchampApplication.exe",
            "BingWallpaper.exe", "BingWallpaperApp.exe",
            "Spotify.exe", "SpotifyWebHelper.exe",
            "Discord.exe", "DiscordPTB.exe", "DiscordCanary.exe",
            "EpicGamesLauncher.exe", "EpicWebHelper.exe",
            "Steam.exe", "steamwebhelper.exe",
            "BraveCrashHandler.exe",
            "Microsoft.Photos.exe", "Microsoft.Windows.Photos.exe",
            "SecurityHealthSystray.exe",
        ];
        let mut killed = 0u32;
        for proc_name in &bloatware {
            let output = std::process::Command::new("taskkill")
                .args(["/F", "/IM", proc_name])
                .creation_flags(0x08000000)
                .output();
            if let Ok(out) = output {
                if out.status.success() {
                    killed += 1;
                }
            }
        }
        steps_completed += 1;
        details.push(format!("Killed {} unnecessary processes", killed));
    }

    // Step 2: Clear Windows temp folder
    if s("boost_clear_temp") {
        steps_total += 1;
        log_msg(&app, "[Boost] Clearing Windows temp folder...");
        let temp_dir = std::env::temp_dir();
        let mut temp_cleaned = 0u64;
        if let Ok(entries) = std::fs::read_dir(&temp_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Ok(meta) = std::fs::metadata(&path) {
                        temp_cleaned += meta.len();
                    }
                    let _ = std::fs::remove_file(&path);
                } else if path.is_dir() {
                    let _ = std::fs::remove_dir_all(&path);
                }
            }
        }
        steps_completed += 1;
        let temp_mb = temp_cleaned as f64 / (1024.0 * 1024.0);
        details.push(format!("Cleared {:.1} MB from temp folder", temp_mb));
    }

    // Step 3: Clear EcLauncher temp folder
    if s("boost_clear_temp") {
        steps_total += 1;
        log_msg(&app, "[Boost] Clearing launcher temp folder...");
        let ecl_temp = app_dir().join("temp");
        let mut launcher_temp_cleaned = 0u64;
        if let Ok(entries) = std::fs::read_dir(&ecl_temp) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Ok(meta) = std::fs::metadata(&path) {
                    launcher_temp_cleaned += meta.len();
                }
                if path.is_file() {
                    let _ = std::fs::remove_file(&path);
                } else if path.is_dir() {
                    let _ = std::fs::remove_dir_all(&path);
                }
            }
        }
        steps_completed += 1;
        details.push(format!("Cleared {:.1} MB from launcher temp", launcher_temp_cleaned as f64 / (1024.0 * 1024.0)));
    }

    // Step 4: Empty Recycle Bin
    if s("boost_empty_recycle") {
        steps_total += 1;
        log_msg(&app, "[Boost] Emptying Recycle Bin...");
        let _ = std::process::Command::new("cmd")
            .args(["/C", "rd /s /q C:\\$Recycle.Bin"])
            .creation_flags(0x08000000)
            .output();
        let _ = std::process::Command::new("powershell")
            .args(["-Command", "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"])
            .creation_flags(0x08000000)
            .output();
        steps_completed += 1;
        details.push("Recycle bin emptied".to_string());
    }

    // Step 5: Flush DNS cache
    if s("boost_flush_dns") {
        steps_total += 1;
        log_msg(&app, "[Boost] Flushing DNS cache...");
        let _ = std::process::Command::new("ipconfig")
            .args(["/flushdns"])
            .creation_flags(0x08000000)
            .output();
        steps_completed += 1;
        details.push("DNS cache flushed".to_string());
    }

    // Step 6: Clear Windows thumbnail cache
    if s("boost_clear_thumbs") {
        steps_total += 1;
        log_msg(&app, "[Boost] Clearing thumbnail cache...");
        let thumb_dir = dirs::home_dir().unwrap_or_default().join("AppData\\Local\\Microsoft\\Windows\\Explorer");
        let mut thumb_cleaned = 0u32;
        if let Ok(entries) = std::fs::read_dir(&thumb_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let name = path.file_name().unwrap_or_default().to_string_lossy();
                if name.starts_with("thumbcache_") && path.is_file() {
                    let _ = std::fs::remove_file(&path);
                    thumb_cleaned += 1;
                }
            }
        }
        steps_completed += 1;
        details.push(format!("Cleared {} thumbnail cache files", thumb_cleaned));
    }

    // Step 7: Auto-install performance mods (if Fabric/Forge AND setting enabled)
    if s("perf_auto_mods") {
        steps_total += 1;
        let loader_lower = loader.to_lowercase();
        let is_modded = matches!(loader_lower.as_str(), "fabric" | "quilt" | "forge" | "neoforge");
        if is_modded && !mc_version.is_empty() {
        log_msg(&app, &format!("[Boost] Auto-installing FPS boost mods for {} {}...", loader, mc_version));
        let mods_dir = inst_dir.join("mods");
        let _ = std::fs::create_dir_all(&mods_dir);

        let is_fabric_like = matches!(loader_lower.as_str(), "fabric" | "quilt");
        let perf_mods = if is_fabric_like { PERF_MODS_FABRIC } else { PERF_MODS_FORGE };

        let mut mods_installed = 0u32;
        let mut mods_skipped = 0u32;

        // Install API first
        if is_fabric_like {
            if loader_lower == "fabric" {
                let (_, ok) = download_mod_from_modrinth("fabric-api", "Fabric API", "fabric", &mc_version, &mods_dir, &app);
                if ok { mods_installed += 1; }
            } else if loader_lower == "quilt" {
                let (_, ok) = download_mod_from_modrinth("qsl", "QSL", "quilt", &mc_version, &mods_dir, &app);
                if ok { mods_installed += 1; }
                let (_, ok2) = download_mod_from_modrinth("fabric-api", "Fabric API", "fabric", &mc_version, &mods_dir, &app);
                if ok2 { mods_installed += 1; }
            }
        }

        for pm in perf_mods.iter() {
            if let Some(min_ver) = pm.min_mc {
                if !mc_version_at_least(&mc_version, min_ver) {
                    if let Some(fallback_slug) = pm.fallback {
                        let (_, ok) = download_mod_from_modrinth(fallback_slug, &format!("{} (fallback)", pm.name), &loader_lower, &mc_version, &mods_dir, &app);
                        if ok { mods_installed += 1; } else { mods_skipped += 1; }
                    } else {
                        mods_skipped += 1;
                    }
                    continue;
                }
            }
            let (filename, ok) = download_mod_from_modrinth(pm.slug, pm.name, &loader_lower, &mc_version, &mods_dir, &app);
            if ok {
                if !filename.is_empty() {
                    mods_installed += 1;
                } else {
                    mods_skipped += 1; // already exists
                }
            } else if let Some(fallback_slug) = pm.fallback {
                let (_, ok2) = download_mod_from_modrinth(fallback_slug, &format!("{} (fallback)", pm.name), &loader_lower, &mc_version, &mods_dir, &app);
                if ok2 { mods_installed += 1; } else { mods_skipped += 1; }
            } else {
                mods_skipped += 1;
            }
        }
        steps_completed += 1;
        details.push(format!("FPS mods: {} installed, {} skipped/existing", mods_installed, mods_skipped));
        } else {
            steps_completed += 1;
            details.push("Skipped mod install (Vanilla instance)".to_string());
        }
    }

    // Step 8: Optimize system memory
    if s("boost_optimize_memory") {
        steps_total += 1;
        log_msg(&app, "[Boost] Optimizing system memory...");
        let _ = std::process::Command::new("cmd")
            .args(["/C", "reg add \"HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl\" /v Win32PrioritySeparation /t REG_DWORD /d 38 /f"])
            .creation_flags(0x08000000)
            .output();
        let _ = std::process::Command::new("powershell")
            .args(["-Command", "[System.GC]::Collect(); [System.GC]::WaitForPendingFinalizers()"])
            .creation_flags(0x08000000)
            .output();
        steps_completed += 1;
        details.push("System memory optimized".to_string());
    }

    log_msg(&app, &format!("[Boost] Game boost complete: {}/{} steps", steps_completed, steps_total));
    json!({
        "success": true,
        "steps_completed": steps_completed,
        "steps_total": steps_total,
        "details": details,
    })
}

// ==================== MAIN ====================
pub fn run() {
    ensure_dirs();

    tauri::Builder::default()
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            get_settings, save_settings, get_setting_cmd, save_setting_cmd,
            get_instances, create_instance, delete_instance, install_instance,
            launch_game,
            get_minecraft_versions, get_loader_versions, get_fabric_versions, get_supported_loaders,
            authenticate_microsoft, poll_microsoft_token, complete_microsoft_auth_cmd,
            authenticate_elyby, poll_elyby_auth, complete_elyby_auth_cmd, create_offline_account,
            ensure_authlib_injector,
            search_modrinth, get_modrinth_project, get_modrinth_versions,
            install_mod, install_resourcepack, install_modpack,
            get_minecraft_news,
            get_skin_info, set_custom_skin,
            get_optimizer_status, apply_optimizer,
            check_updates, get_system_info,
            get_logs, clear_logs, get_game_output, clear_game_output,
            get_play_times,
            open_instance_folder, get_instance_mods, toggle_mod, delete_mod,
            rename_instance, set_instance_icon, get_instance_icon,
            get_instance_resourcepacks, delete_resourcepack,
            create_instance_from_modpack, get_minecraft_news_enhanced,
            get_latest_release_tag,
            save_background_image, get_background_image_path, delete_background_image,
            save_background_video, get_background_video_path, delete_background_video,
            init_discord_rpc, update_discord_rpc, stop_discord_rpc, get_discord_status, open_url,
            install_performance_mods,
            save_mod_profile, load_mod_profiles, delete_mod_profile, apply_mod_profile,
            check_mod_updates,
            analyze_crash_log,
            resolve_mod_dependencies,
            auto_enable_resourcepack,
            export_instance_mrpack,
            detect_mod_conflicts,
            check_first_launch, complete_first_launch,
            check_java_compatibility, download_java, get_java_installations, set_java_for_instance,
            run_system_command, read_file_content, write_file_content, list_directory, delete_path,
            clone_instance,
            get_servers, add_server, delete_server, ping_server,
            get_selfhost_status, download_selfhost, launch_selfhost,
            get_server_versions, get_server_builds,
            launch_server,
            pin_instance, unpin_instance,
            get_screenshots,
            export_instance_config, import_instance_config,
            batch_install_mods,
            check_launcher_update,
            get_game_logs,
            move_mod_file, move_resourcepack_file,
            game_boost,
        ])
        .setup(|app| {
            let window = app.get_window("main").unwrap();
            window.set_title("EcLauncher").ok();

            // Auto-init Discord RPC on startup
            {
                let discord_enabled = {
                    let ds = load_json(&settings_file());
                    ds.get("discord_rpc").and_then(|v| v.as_bool()).unwrap_or(true)
                };
                if discord_enabled {
                    let handle = app.handle().clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_secs(2));
                        let _ = init_discord_rpc(handle);
                    });
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running EcLauncher");
}

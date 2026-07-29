"""
EcLauncher Python Backend Engine - Full Feature Parity
Matches the original main.py file paths, APIs, and features exactly.
JSON-RPC over stdin/stdout, spawned as Tauri sidecar.
"""
import sys
import json
import os
import re
import io
import uuid
import shutil
import hashlib
import zipfile
import platform
import subprocess
import threading
import time
import urllib.parse
import tempfile
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List, Tuple
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from http.server import HTTPServer, BaseHTTPRequestHandler

APP_VERSION = "5.0"
GITHUB_REPO_OWNER = "EscapeXOG"
GITHUB_REPO_NAME = "EcLauncher"
GITHUB_API_URL = f"https://api.github.com/repos/{GITHUB_REPO_OWNER}/{GITHUB_REPO_NAME}/releases/latest"

APP_DIR = Path.home() / ".eclauncher"
INSTANCES_DIR = APP_DIR / "instances"
INSTANCES_FILE = APP_DIR / "instances.json"
SETTINGS_FILE = APP_DIR / "settings.json"
PLAYTIMES_FILE = APP_DIR / "playtimes.json"
LIBRARIES_DIR = APP_DIR / "libraries"
ASSETS_DIR = APP_DIR / "assets"
CUSTOM_SKIN = APP_DIR / "custom_skin.png"
AUTHLIB_INJECTOR = APP_DIR / "authlib-injector.jar"
MOJANG_VERSION_MANIFEST = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"
FABRIC_VERSIONS_URL = "https://meta.fabricmc.net/v2/versions/game"
MODRINTH_API = "https://api.modrinth.com/v2"

ELYBY_CLIENT_ID = "eclauncher3"
ELYBY_CLIENT_SECRET = "b7CIXf55V5xKNe7SxDi-mOmx1jSU8oEMhHLEdNsDthVqoUKHk6bJsTgDGip7QkAx"
ELYBY_REDIRECT_URI = "http://127.0.0.1:8080/callback"

for d in [APP_DIR, INSTANCES_DIR, LIBRARIES_DIR, ASSETS_DIR / "indexes", ASSETS_DIR / "objects"]:
    d.mkdir(parents=True, exist_ok=True)

_http_cache: Dict[str, Tuple[float, Any]] = {}
_CACHE_TTL = 300

LOADER_SUPPORT = {
    "Vanilla": lambda ver: True,
    "Fabric": lambda ver: _parse_minor(ver) >= (1, 14),
    "Quilt": lambda ver: _parse_minor(ver) >= (1, 14),
    "Forge": lambda ver: _parse_minor(ver) >= (1, 4),
    "NeoForge": lambda ver: _parse_minor(ver) >= (1, 20, 2),
}

EXECUTOR = ThreadPoolExecutor(max_workers=8)

# === GAME OUTPUT STREAMING ===
_game_output_buffer: List[str] = []
_game_output_lock = threading.Lock()
_game_session_start: Optional[float] = None
_game_session_instance: Optional[str] = None

def _parse_minor(v: str) -> Tuple[int, ...]:
    parts = re.split(r"[._-]", v)
    result = []
    for p in parts:
        try:
            result.append(int(p))
        except ValueError:
            break
    return tuple(result)

def _maven_name_to_path(maven_name: str) -> str:
    parts = maven_name.split(":")
    if len(parts) < 3:
        return ""
    group_path = parts[0].replace(".", "/")
    artifact = parts[1]
    version = parts[2]
    classifier = parts[3] if len(parts) > 3 else ""
    if classifier:
        return f"{group_path}/{artifact}/{version}/{artifact}-{version}-{classifier}.jar"
    return f"{group_path}/{artifact}/{version}/{artifact}-{version}.jar"

def http_get(url: str, headers: Optional[Dict] = None, timeout: int = 30, use_cache: bool = False) -> Any:
    now = time.monotonic()
    if use_cache and url in _http_cache:
        ts, data = _http_cache[url]
        if now - ts < _CACHE_TTL:
            return data
    req = Request(url)
    req.add_header("User-Agent", f"EcLauncher/{APP_VERSION}")
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    try:
        with urlopen(req, timeout=timeout) as resp:
            data = resp.read().decode("utf-8")
            try:
                result = json.loads(data)
            except json.JSONDecodeError:
                result = data
            if use_cache:
                _http_cache[url] = (now, result)
            return result
    except HTTPError as e:
        return {"error": str(e), "status": e.code}
    except URLError as e:
        return {"error": str(e.reason)}
    except Exception as e:
        return {"error": str(e)}

def http_post(url: str, data: Any = None, headers: Optional[Dict] = None, timeout: int = 30,
              auth: Optional[Tuple[str, str]] = None) -> Any:
    if isinstance(data, dict):
        body = json.dumps(data).encode("utf-8")
        content_type = "application/json"
    elif isinstance(data, str):
        body = data.encode("utf-8")
        content_type = "application/x-www-form-urlencoded"
    else:
        body = data if data else b""
        content_type = "application/json"
    req = Request(url, data=body, method="POST")
    req.add_header("User-Agent", f"EcLauncher/{APP_VERSION}")
    req.add_header("Content-Type", content_type)
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    if auth:
        import base64
        cred = base64.b64encode(f"{auth[0]}:{auth[1]}".encode()).decode()
        req.add_header("Authorization", f"Basic {cred}")
    try:
        with urlopen(req, timeout=timeout) as resp:
            resp_data = resp.read().decode("utf-8")
            try:
                return json.loads(resp_data)
            except json.JSONDecodeError:
                return resp_data
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            return json.loads(body)
        except:
            return {"error": body, "status": e.code}
    except Exception as e:
        return {"error": str(e)}

def download_file(url: str, dest: Path, progress_cb=None) -> bool:
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        req = Request(url)
        req.add_header("User-Agent", f"EcLauncher/{APP_VERSION}")
        with urlopen(req, timeout=120) as resp:
            total = int(resp.headers.get("Content-Length", 0))
            downloaded = 0
            chunk_size = 131072
            with open(dest, "wb") as f:
                while True:
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if progress_cb and total > 0:
                        pct = int(downloaded / total * 100)
                        progress_cb(downloaded, total, pct)
        return True
    except Exception as e:
        log(f"[Download/ERROR] {url}: {e}")
        return False

def load_json(path: Path, default=None) -> Any:
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return default if default is not None else {}
    return default if default is not None else {}

def save_json(path: Path, data: Any):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

# === LOG SYSTEM ===
_log_entries: List[str] = []

def log(message: str):
    timestamp = datetime.now().strftime("%H:%M:%S")
    entry = f"[{timestamp}] {message}"
    _log_entries.append(entry)
    if len(_log_entries) > 5000:
        _log_entries.pop(0)
    print(entry, flush=True)

def get_logs() -> List[str]:
    return list(_log_entries)

def clear_logs():
    _log_entries.clear()

# === GAME OUTPUT STREAMING ===
def append_game_output(line: str):
    with _game_output_lock:
        _game_output_buffer.append(line)
        if len(_game_output_buffer) > 500:
            _game_output_buffer.pop(0)

def get_game_output() -> List[str]:
    with _game_output_lock:
        return list(_game_output_buffer)

def clear_game_output():
    with _game_output_lock:
        _game_output_buffer.clear()

# === SETTINGS ===
_settings_cache: Dict = {}
_settings_loaded = False

def _ensure_settings():
    global _settings_cache, _settings_loaded
    if not _settings_loaded:
        _settings_cache = load_json(SETTINGS_FILE, {})
        _settings_loaded = True
        log(f"[Settings] Loaded {len(_settings_cache)} settings from {SETTINGS_FILE}")

def load_settings() -> Dict:
    _ensure_settings()
    return dict(_settings_cache)

def get_setting(key: str, default=None) -> Any:
    _ensure_settings()
    return _settings_cache.get(key, default)

def save_setting(key: str, value: Any):
    global _settings_cache
    _ensure_settings()
    _settings_cache[key] = value
    save_json(SETTINGS_FILE, _settings_cache)

def save_settings_batch(settings: Dict):
    global _settings_cache
    _ensure_settings()
    _settings_cache.update(settings)
    save_json(SETTINGS_FILE, _settings_cache)

# === PLAY TIMES ===
def load_playtimes() -> Dict:
    return load_json(PLAYTIMES_FILE, {})

def save_playtimes(data: Dict):
    save_json(PLAYTIMES_FILE, data)

# === INSTANCES ===
def load_instances() -> List[Dict]:
    instances = load_json(INSTANCES_FILE, [])
    for inst in instances:
        inst_dir = INSTANCES_DIR / inst.get("name", "")
        inst["installed"] = inst_dir.exists()
        version_json = inst_dir / f"{inst.get('version', '')}.json"
        inst["version_json_exists"] = version_json.exists()
    return instances

def save_instances(instances: List[Dict]):
    save_json(INSTANCES_FILE, instances)

# === VERSION MANAGEMENT ===
def get_minecraft_versions() -> Dict:
    log("[Versions] Fetching Minecraft version manifest...")
    data = http_get(MOJANG_VERSION_MANIFEST, use_cache=True)
    if isinstance(data, dict) and "error" not in data:
        all_versions = [v["id"] for v in data.get("versions", [])]
        release_versions = [v["id"] for v in data.get("versions", []) if v["type"] == "release"]
        version_types = {v["id"]: v["type"] for v in data.get("versions", [])}
        groups = _build_dynamic_version_groups(all_versions)
        latest = data.get("latest", {})
        log(f"[Versions] Loaded {len(all_versions)} versions, {len(groups)} groups, latest={latest}")
        return {
            "all_versions": all_versions,
            "release_versions": release_versions,
            "version_types": version_types,
            "groups": groups,
            "latest": latest,
        }
    log(f"[Versions/ERROR] Failed to fetch: {data}")
    return {"error": data.get("error", "Failed") if isinstance(data, dict) else "Failed",
            "all_versions": [], "release_versions": [], "version_types": {},
            "groups": {}, "latest": {}}

def _build_dynamic_version_groups(all_versions: List[str]) -> Dict[str, List[str]]:
    groups: Dict[str, List[str]] = {}
    for v in all_versions:
        m = re.match(r"^(\d+\.\d+)", v)
        if m:
            prefix = m.group(1)
            groups.setdefault(prefix, []).append(v)
    for k in groups:
        groups[k].sort(key=lambda x: _parse_minor(x), reverse=True)
    return dict(sorted(groups.items(), key=lambda x: _parse_minor(x[0] + ".0"), reverse=True))

def get_loader_versions(mc_version: str, loader: str) -> List[Dict]:
    vt = _parse_minor(mc_version)
    if not LOADER_SUPPORT.get(loader, lambda v: False)(vt):
        return []
    if loader == "Fabric":
        data = http_get(f"https://meta.fabricmc.net/v2/versions/loader/{mc_version}", use_cache=True)
        if isinstance(data, list):
            return [{"version": v.get("loader", {}).get("version", ""), "stable": v.get("loader", {}).get("stable", False)} for v in data]
    elif loader == "Quilt":
        data = http_get(f"https://meta.quiltmc.org/v3/versions/loader/{mc_version}", use_cache=True)
        if isinstance(data, list):
            return [{"version": v.get("loader", {}).get("version", ""), "stable": True} for v in data]
    return []

def get_fabric_supported_versions() -> List[str]:
    data = http_get(FABRIC_VERSIONS_URL, use_cache=True)
    if isinstance(data, list):
        return [v["version"] for v in data if v.get("stable")]
    return []

# === MICROSOFT AUTH (device code flow) ===
def authenticate_microsoft() -> Dict:
    log("[Auth/MS] Starting Microsoft device code flow...")
    try:
        resp = http_post(
            "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode",
            {
                "client_id": "00000000402b5328",
                "scope": "XboxLive.signin XboxLive.offline_access MinecraftWin32.app",
            },
        )
        if isinstance(resp, dict) and "user_code" in resp:
            log(f"[Auth/MS] Device code: {resp['user_code']}, go to {resp.get('verification_uri')}")
            return {
                "success": True,
                "user_code": resp["user_code"],
                "verification_uri": resp.get("verification_uri", "https://microsoft.com/link"),
                "device_code": resp.get("device_code", ""),
                "interval": resp.get("interval", 5),
                "expires_in": resp.get("expires_in", 900),
            }
        log(f"[Auth/MS/ERROR] {resp}")
        return {"error": resp.get("error_description", resp.get("error", "Device code request failed"))}
    except Exception as e:
        log(f"[Auth/MS/ERROR] {e}")
        return {"error": str(e)}

def poll_microsoft_token(device_code: str, interval: int = 5) -> Dict:
    log("[Auth/MS] Polling for token...")
    try:
        for i in range(60):
            time.sleep(interval)
            resp = http_post(
                "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
                {
                    "client_id": "00000000402b5328",
                    "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                    "device_code": device_code,
                },
                {"Content-Type": "application/x-www-form-urlencoded"},
            )
            if isinstance(resp, dict):
                if "access_token" in resp:
                    log("[Auth/MS] Got access token, completing auth...")
                    return _complete_ms_auth(resp["access_token"], resp.get("refresh_token", ""))
                if resp.get("error") == "authorization_pending":
                    if i % 3 == 0:
                        log(f"[Auth/MS] Waiting for user authorization... ({i*interval}s)")
                    continue
                log(f"[Auth/MS/ERROR] {resp.get('error_description', resp.get('error'))}")
                return {"error": resp.get("error_description", resp.get("error", "Auth failed"))}
        return {"error": "Authentication timed out"}
    except Exception as e:
        log(f"[Auth/MS/ERROR] {e}")
        return {"error": str(e)}

def _complete_ms_auth(ms_token: str, refresh_token: str) -> Dict:
    try:
        log("[Auth/MS] Exchanging for Xbox Live token...")
        xbl_resp = http_post("https://user.auth.xboxlive.com/user/authenticate", {
            "Properties": {"AuthMethod": "RPS", "SiteName": "user.auth.xboxlive.com", "RpsTicket": ms_token},
            "RelyingParty": "http://auth.xboxlive.com", "TokenType": "JWT",
        })
        xbl_token = xbl_resp.get("Token", "")
        xbl_uhs = ""
        for claim in xbl_resp.get("DisplayClaims", {}).get("xui", []):
            if "uhs" in claim:
                xbl_uhs = claim["uhs"]
                break

        log("[Auth/MS] Exchanging for XSTS token...")
        xsts_resp = http_post("https://xsts.auth.xboxlive.com/xsts/authorize", {
            "Properties": {"SandboxId": "RETAIL", "UserTokens": [xbl_token]},
            "RelyingParty": "rp://api.minecraftservices.com/", "TokenType": "JWT",
        })
        xsts_token = xsts_resp.get("Token", "")

        log("[Auth/MS] Exchanging for Minecraft token...")
        mc_resp = http_post("https://api.minecraftservices.com/authentication/login_with_xbox", {
            "identityToken": f"XBL3.0 x={xbl_uhs};{xsts_token}",
        })
        mc_token = mc_resp.get("access_token", "")

        log("[Auth/MS] Fetching Minecraft profile...")
        profile_resp = http_get("https://api.minecraftservices.com/minecraft/profile",
                                {"Authorization": f"Bearer {mc_token}"})
        if isinstance(profile_resp, dict) and "id" in profile_resp:
            username = profile_resp["name"]
            log(f"[Auth/MS] Success! Logged in as '{username}'")

            save_setting("mc_token", mc_token)
            save_setting("ms_refresh_token", refresh_token)
            save_setting("username", username)
            save_setting("cracked_username", username)

            return {
                "success": True, "uuid": profile_resp["id"], "username": username,
                "mc_token": mc_token, "ms_refresh_token": refresh_token, "type": "microsoft",
            }
        log("[Auth/MS/ERROR] No Minecraft profile found")
        return {"error": "No Minecraft profile found"}
    except Exception as e:
        log(f"[Auth/MS/ERROR] {e}")
        return {"error": str(e)}

# === ELY.BY AUTH (matches Python launcher exactly) ===
_elyby_auth_result: Dict = {}
_elyby_server_running = False

class _ElybyOAuthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        query_params = urllib.parse.parse_qs(parsed_url.query)
        if "code" in query_params:
            _elyby_auth_result["code"] = query_params["code"][0]
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h1>Login Successful! You can close this window.</h1>")
        else:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"<h1>Authorization code missing.</h1>")

    def log_message(self, format, *args):
        pass

def authenticate_elyby() -> Dict:
    global _elyby_auth_result, _elyby_server_running
    _elyby_auth_result = {}
    log("[Auth/Ely.by] Starting OAuth2 flow...")

    def run_server():
        global _elyby_server_running
        try:
            httpd = HTTPServer(("127.0.0.1", 8080), _ElybyOAuthHandler)
            _elyby_server_running = True
            log("[Auth/Ely.by] Local server started on port 8080")
            httpd.handle_request()
            httpd.server_close()
            _elyby_server_running = False
            log(f"[Auth/Ely.by] Received code: {_elyby_auth_result.get('code', 'NONE')[:8]}...")
        except Exception as e:
            log(f"[Auth/Ely.by/ERROR] Server failed: {e}")
            _elyby_auth_result["error"] = str(e)
            _elyby_server_running = False

    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    params = {
        "client_id": ELYBY_CLIENT_ID,
        "redirect_uri": ELYBY_REDIRECT_URI,
        "response_type": "code",
        "scope": "account_info minecraft_server_session offline_access",
    }
    auth_url = f"https://account.ely.by/oauth2/authorize?{urllib.parse.urlencode(params)}"
    log(f"[Auth/Ely.by] Open browser: {auth_url}")

    import webbrowser
    threading.Thread(target=lambda: webbrowser.open(auth_url), daemon=True).start()

    return {"auth_url": auth_url}

def poll_elyby_auth() -> Dict:
    global _elyby_auth_result
    log("[Auth/Ely.by] Polling for auth code...")

    for i in range(60):
        time.sleep(2)
        if "code" in _elyby_auth_result:
            code = _elyby_auth_result.pop("code")
            return _exchange_elyby_code(code)
        if "error" in _elyby_auth_result:
            err = _elyby_auth_result.pop("error")
            return {"error": err}

    log("[Auth/Ely.by/ERROR] Timed out waiting for code")
    return {"error": "Timed out waiting for Ely.by login"}

def _exchange_elyby_code(code: str) -> Dict:
    log(f"[Auth/Ely.by] Exchanging code for token...")
    try:
        token_resp = http_post(
            "https://account.ely.by/api/oauth2/v1/token",
            data=urllib.parse.urlencode({
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": ELYBY_REDIRECT_URI,
            }),
            auth=(ELYBY_CLIENT_ID, ELYBY_CLIENT_SECRET),
        )
        if isinstance(token_resp, dict) and "error" in token_resp:
            log(f"[Auth/Ely.by/ERROR] Token exchange: {token_resp}")
            return {"error": token_resp.get("error_description", token_resp.get("error", "Token exchange failed"))}

        access_token = token_resp.get("access_token", "")
        refresh_token = token_resp.get("refresh_token", "")
        if not access_token:
            log(f"[Auth/Ely.by/ERROR] No access token: {token_resp}")
            return {"error": "No access token from Ely.by"}

        log("[Auth/Ely.by] Got access token, fetching user info...")
        info_resp = http_get(
            "https://account.ely.by/api/account/v1/info",
            {"Authorization": f"Bearer {access_token}"},
        )
        if isinstance(info_resp, dict) and "username" in info_resp:
            username = info_resp.get("username", "")
            user_uuid = info_resp.get("uuid", "")

            log(f"[Auth/Ely.by] Success! Logged in as '{username}' | UUID: {user_uuid}")

            save_setting("mc_token", access_token)
            save_setting("ely_refresh_token", refresh_token)
            save_setting("ely_access_token", access_token)
            save_setting("username", username)
            save_setting("ely_by_username", username)
            save_setting("ely_uuid", user_uuid)
            save_setting("cracked_username", username)

            threading.Thread(target=ensure_authlib_injector, daemon=True).start()

            return {
                "success": True, "username": username, "uuid": user_uuid,
                "mc_token": access_token, "type": "elyby",
            }
        log(f"[Auth/Ely.by/ERROR] Unexpected response: {info_resp}")
        return {"error": "Failed to get Ely.by user info"}
    except Exception as e:
        log(f"[Auth/Ely.by/ERROR] {e}")
        return {"error": str(e)}

def create_offline_account(username: str) -> Dict:
    log(f"[Auth/Offline] Creating offline account: {username}")
    save_setting("cracked_username", username)
    save_setting("username", username)
    save_setting("mc_token", "0")
    return {
        "success": True, "uuid": "00000000-0000-0000-0000-000000000000",
        "username": username, "mc_token": "0", "type": "offline",
    }

# === AUTHLIB-INJECTOR ===
def ensure_authlib_injector() -> Dict:
    if AUTHLIB_INJECTOR.exists():
        log("[Ely.by] authlib-injector.jar already present")
        return {"success": True, "path": str(AUTHLIB_INJECTOR)}

    log("[Ely.by] Downloading authlib-injector.jar...")
    try:
        api_url = "https://api.github.com/repos/yushijinhun/authlib-injector/releases/latest"
        data = http_get(api_url)
        if not isinstance(data, dict):
            return {"error": "Failed to fetch release info"}

        jar_asset = None
        for asset in data.get("assets", []):
            if asset["name"].endswith(".jar"):
                jar_asset = asset
                break

        if not jar_asset:
            return {"error": "No .jar asset found in latest release"}

        url = jar_asset["browser_download_url"]
        log(f"[Ely.by] Downloading from {url}")
        if download_file(url, AUTHLIB_INJECTOR):
            log(f"[Ely.by] authlib-injector.jar downloaded -> {AUTHLIB_INJECTOR}")
            return {"success": True, "path": str(AUTHLIB_INJECTOR)}
        return {"error": "Download failed"}
    except Exception as e:
        log(f"[Ely.by/ERROR] authlib-injector download failed: {e}")
        return {"error": str(e)}

# === INSTANCE MANAGEMENT ===
def create_instance(name: str, mc_version: str, loader: str, loader_version: str) -> Dict:
    log(f"[Instance] Creating '{name}' ({loader} {mc_version})")
    try:
        inst_dir = INSTANCES_DIR / name
        inst_dir.mkdir(parents=True, exist_ok=True)
        for subdir in ["mods", "saves", "resourcepacks", "screenshots", "natives", "assets", "config", "config/CustomSkinLoader"]:
            (inst_dir / subdir).mkdir(exist_ok=True)
        instance_data = {
            "name": name, "version": mc_version, "loader": loader,
            "loader_version": loader_version,
            "created": datetime.now().isoformat(), "last_played": None, "icon": "",
        }
        instances = load_instances()
        instances.append(instance_data)
        save_instances(instances)
        log(f"[Instance] Created '{name}' successfully")
        return {"success": True, "instance": instance_data}
    except Exception as e:
        log(f"[Instance/ERROR] {e}")
        return {"error": str(e)}

def delete_instance(name: str) -> Dict:
    log(f"[Instance] Deleting '{name}'...")
    try:
        inst_dir = INSTANCES_DIR / name
        if inst_dir.exists():
            shutil.rmtree(inst_dir, ignore_errors=True)
        instances = load_instances()
        instances = [i for i in instances if i.get("name") != name]
        save_instances(instances)
        log(f"[Instance] Deleted '{name}'")
        return {"success": True}
    except Exception as e:
        log(f"[Instance/ERROR] {e}")
        return {"error": str(e)}

def install_instance(instance_name: str, mc_version: str, loader: str, loader_version: str) -> Dict:
    log(f"[Install] Installing '{instance_name}' ({loader} {mc_version}/{loader_version})")
    try:
        manifest = http_get(MOJANG_VERSION_MANIFEST)
        if "error" in manifest:
            log(f"[Install/ERROR] Failed to fetch version manifest: {manifest}")
            return {"error": "Failed to fetch version manifest"}
        version_url = None
        for v in manifest.get("versions", []):
            if v["id"] == mc_version:
                version_url = v["url"]
                break
        if not version_url:
            return {"error": f"Version {mc_version} not found"}

        log(f"[Install] Fetching version data for {mc_version}...")
        version_data = http_get(version_url)
        if "error" in version_data:
            return {"error": "Failed to fetch version data"}

        inst_dir = INSTANCES_DIR / instance_name
        inst_dir.mkdir(parents=True, exist_ok=True)
        for subdir in ["mods", "saves", "resourcepacks", "screenshots", "natives", "assets", "config"]:
            (inst_dir / subdir).mkdir(exist_ok=True)

        vj_path = inst_dir / f"{mc_version}.json"
        save_json(vj_path, version_data)

        client_url = version_data.get("downloads", {}).get("client", {}).get("url")
        client_jar = inst_dir / f"{mc_version}.jar"
        if client_url and not client_jar.exists():
            log(f"[Install] Downloading client jar...")
            download_file(client_url, client_jar)

        libraries = version_data.get("libraries", [])
        downloaded_libs = 0
        for lib in libraries:
            if "downloads" in lib and "artifact" in lib["downloads"]:
                art = lib["downloads"]["artifact"]
                lib_path = LIBRARIES_DIR / art["path"]
                if not lib_path.exists():
                    download_file(art["url"], lib_path)
                    downloaded_libs += 1
        log(f"[Install] Downloaded {downloaded_libs} new libraries")

        asset_index = version_data.get("assetIndex", {})
        if asset_index and asset_index.get("url"):
            index_id = asset_index.get("id", mc_version)
            index_file = ASSETS_DIR / "indexes" / f"{index_id}.json"
            if not index_file.exists():
                log(f"[Install] Downloading asset index {index_id}...")
                download_file(asset_index["url"], index_file)

        if loader != "Vanilla" and loader_version:
            log(f"[Install] Installing {loader} loader {loader_version}...")
            if loader == "Fabric":
                profile_url = f"https://meta.fabricmc.net/v2/versions/loader/{mc_version}/{loader_version}/profile/json"
                profile = http_get(profile_url)
                if isinstance(profile, dict) and "libraries" in profile:
                    for lib in profile["libraries"]:
                        if "url" in lib:
                            lib_path_str = _maven_name_to_path(lib["name"])
                            full_path = LIBRARIES_DIR / lib_path_str
                            if not full_path.exists():
                                download_file(lib["url"], full_path)
                    loader_jar_name = f"fabric-loader-{loader_version}.jar"
                    loader_jars = [l for l in profile.get("libraries", []) if loader_jar_name in l.get("name", "")]
                    if loader_jars:
                        lpath = _maven_name_to_path(loader_jars[0]["name"])
                        src = LIBRARIES_DIR / lpath
                        dst = inst_dir / loader_jar_name
                        if src.exists() and not dst.exists():
                            shutil.copy2(src, dst)
                    save_json(inst_dir / f"fabric-loader-{loader_version}-profile.json", profile)
                    log(f"[Install] Fabric loader installed")
            elif loader == "Quilt":
                profile_url = f"https://meta.quiltmc.org/v3/versions/loader/{mc_version}/{loader_version}/profile/json"
                profile = http_get(profile_url)
                if isinstance(profile, dict) and "libraries" in profile:
                    for lib in profile["libraries"]:
                        if "url" in lib:
                            lib_path_str = _maven_name_to_path(lib["name"])
                            full_path = LIBRARIES_DIR / lib_path_str
                            if not full_path.exists():
                                download_file(lib["url"], full_path)
                    save_json(inst_dir / f"quilt-loader-{loader_version}-profile.json", profile)
                    log(f"[Install] Quilt loader installed")

        log(f"[Install] '{instance_name}' installation complete!")
        return {"success": True}
    except Exception as e:
        log(f"[Install/ERROR] {e}")
        return {"error": str(e)}

# === GAME LAUNCH (matches _direct_launch_inner exactly) ===
def launch_game(instance_name: str, config: Dict) -> Dict:
    log(f"[Launch] Preparing '{instance_name}'...")
    global _game_session_start, _game_session_instance
    try:
        instances = load_instances()
        instance = None
        for i in instances:
            if i.get("name") == instance_name:
                instance = i
                break
        if not instance:
            return {"error": f"Instance {instance_name} not found"}

        inst_dir = INSTANCES_DIR / instance_name
        mc_version = instance.get("version", "")
        loader = instance.get("loader", "Vanilla")
        loader_version = instance.get("loader_version", "")

        vj_path = inst_dir / f"{mc_version}.json"
        if not vj_path.exists():
            return {"error": "Version JSON missing. Please reinstall."}

        ver_json = load_json(vj_path)

        # Find Java
        java_exec = _ensure_java(ver_json, mc_version)
        if not java_exec:
            return {"error": "Java not found or version too old. Check Settings -> Java."}
        log(f"[Launch/Java] Using: {java_exec}")

        # Prepare natives
        natives_dir = inst_dir / "natives"
        natives_dir.mkdir(parents=True, exist_ok=True)
        for f in natives_dir.iterdir():
            try:
                f.unlink()
            except:
                pass

        # Build classpath
        classpath = []
        seen_paths = set()

        def add_to_cp(path):
            p_str = str(path)
            if p_str not in seen_paths:
                seen_paths.add(p_str)
                classpath.append(p_str)

        mc_jar = inst_dir / f"{mc_version}.jar"
        if mc_jar.exists():
            add_to_cp(mc_jar)
        else:
            mc_jar = inst_dir / "minecraft.jar"
            if mc_jar.exists():
                add_to_cp(mc_jar)

        for lib in ver_json.get("libraries", []):
            if not _is_lib_allowed(lib):
                continue
            downloads = lib.get("downloads", {})
            artifact = downloads.get("artifact", {})
            if artifact.get("path"):
                lib_path = LIBRARIES_DIR / artifact["path"]
                if lib_path.exists():
                    lname = os.path.basename(artifact["path"]).lower()
                    if "fabric-loader" in lname or "quilt-loader" in lname:
                        continue
                    add_to_cp(lib_path)
            nat_key = _get_natives_classifier(lib)
            if nat_key and nat_key in downloads.get("classifiers", {}):
                nat_info = downloads["classifiers"][nat_key]
                nat_path = LIBRARIES_DIR / nat_info["path"]
                if nat_path.exists():
                    try:
                        with zipfile.ZipFile(nat_path, "r") as z:
                            z.extractall(natives_dir)
                    except:
                        pass

        main_class = ver_json.get("mainClass", "net.minecraft.client.main.Main")

        if loader in ["Fabric", "Quilt"]:
            loader_name = "quilt-loader" if loader == "Quilt" else "fabric-loader"
            loader_jars = list(inst_dir.glob(f"{loader_name}-*.jar"))
            if not loader_jars:
                return {"error": f"{loader} Loader JAR missing in instance folder!"}
            add_to_cp(loader_jars[0])

            profile_files = list(inst_dir.glob(f"*{loader_name}*-profile.json"))
            if profile_files:
                try:
                    with open(profile_files[0], encoding="utf-8") as f:
                        profile_data = json.load(f)
                    for lib in profile_data.get("libraries", []):
                        art_path = None
                        if "downloads" in lib and "artifact" in lib["downloads"]:
                            art_path = lib["downloads"]["artifact"].get("path")
                        elif "artifact" in lib:
                            art_path = lib["artifact"].get("path")
                        if art_path:
                            fp = LIBRARIES_DIR / art_path
                            if fp.exists():
                                if loader_name not in os.path.basename(str(fp)).lower():
                                    add_to_cp(fp)
                        elif lib.get("name") and lib.get("url"):
                            maven_path = _maven_name_to_path(lib["name"])
                            if maven_path:
                                fp = LIBRARIES_DIR / maven_path
                                if fp.exists() and loader_name not in os.path.basename(str(fp)).lower():
                                    add_to_cp(fp)
                    if loader == "Fabric":
                        main_class = "net.fabricmc.loader.impl.launch.knot.KnotClient"
                    elif loader == "Quilt":
                        main_class = "org.quiltmc.loader.impl.launch.knot.KnotClient"
                except Exception as e:
                    log(f"[Launch/WARN] Failed to parse {loader} profile: {e}")

        if not classpath:
            return {"error": "Classpath is empty! Installation likely failed."}

        # JVM Args
        ram_mb = get_setting("ram_mb", 2048)
        jvm_args = [
            f"-Xmx{ram_mb}M",
            f"-Xms{min(512, ram_mb)}M",
            "-XX:+UnlockExperimentalVMOptions",
            "-XX:+UseG1GC",
            "-XX:G1NewSizePercent=20",
            "-XX:G1ReservePercent=20",
            "-XX:MaxGCPauseMillis=50",
            "-XX:G1HeapRegionSize=32M",
            f"-Djava.library.path={natives_dir}",
            f"-Djna.tmpdir={natives_dir}",
            f"-Dorg.lwjgl.system.SharedLibraryExtractPath={natives_dir}",
            "-Dminecraft.launcher.brand=EcLauncher",
            "-Dminecraft.launcher.version=5.0",
        ]

        # Authlib-injector for Ely.by
        ely_access_token = get_setting("ely_access_token", None)
        ely_uuid = get_setting("ely_uuid", None)
        if ely_access_token and ely_uuid:
            if AUTHLIB_INJECTOR.exists():
                jvm_args.insert(0, f"-javaagent:{AUTHLIB_INJECTOR}=ely.by")
                log("[Launch] Authlib-injector enabled for Ely.by skins")
            else:
                log("[Launch/WARN] authlib-injector.jar missing, downloading...")
                threading.Thread(target=ensure_authlib_injector, daemon=True).start()

        # Custom JVM args
        global_jvm = get_setting("global_jvm", "")
        inst_jvm = get_setting(f"jvm_{instance_name}", "")
        custom_args = (inst_jvm or global_jvm).split()
        if custom_args:
            jvm_args.extend(custom_args)

        # Auth selection (matches Python launcher exactly)
        ely_username = get_setting("ely_by_username", None)
        ely_token = get_setting("mc_token", None)
        ely_uuid_val = get_setting("ely_uuid", "00000000-0000-0000-0000-000000000000")

        ms_username = get_setting("username", None)
        ms_token = get_setting("mc_token", None)

        if ely_username and ely_token and ely_token != "0":
            username = ely_username
            mc_token = ely_token
            user_uuid = ely_uuid_val
            user_type = "mojang"
            log(f"[Launch/Auth] Using Ely.by account: {username}")
            if AUTHLIB_INJECTOR.exists():
                jvm_args.insert(0, f"-javaagent:{AUTHLIB_INJECTOR}=ely.by")
                log("[Launch/Skin] Injected authlib-injector agent")
        elif ms_username and ms_token and ms_token != "0":
            username = ms_username
            mc_token = ms_token
            user_uuid = "00000000-0000-0000-0000-000000000000"
            user_type = "mojang"
            log(f"[Launch/Auth] Using Microsoft account: {username}")
        else:
            username = get_setting("cracked_username", "Player")
            mc_token = "0"
            user_uuid = "00000000-0000-0000-0000-000000000000"
            user_type = "legacy"
            log(f"[Launch/Auth] Using offline account: {username}")

        asset_index = ver_json.get("assetIndex", {}).get("id", mc_version)

        game_args = [
            "--version", mc_version,
            "--gameDir", str(inst_dir),
            "--assetsDir", str(ASSETS_DIR),
            "--assetIndex", asset_index,
            "--accessToken", mc_token,
            "--username", username,
            "--uuid", user_uuid,
            "--userType", user_type,
        ]

        cmd = [java_exec] + jvm_args + ["-cp", os.pathsep.join(classpath)] + [main_class] + game_args

        cmd_str = " ".join(cmd)
        if len(cmd_str) > 400:
            cmd_str = cmd_str[:400] + "..."
        log(f"[Launch/CMD] {cmd_str}")
        log(f"[Launch] Starting '{instance_name}' ({loader} {mc_version})...")

        save_setting(f"last_launch_{instance_name}", datetime.now().isoformat())

        return {"success": True, "cmd": cmd, "cwd": str(inst_dir), "instance_name": instance_name}
    except Exception as e:
        log(f"[Launch/ERROR] {e}")
        return {"error": str(e)}

def start_game_process(instance_name: str) -> Dict:
    global _game_session_start, _game_session_instance
    clear_game_output()

    instances = load_instances()
    instance = None
    for i in instances:
        if i.get("name") == instance_name:
            instance = i
            break
    if not instance:
        return {"error": f"Instance not found"}

    result = launch_game(instance_name, {})
    if "error" in result:
        return result

    cmd = result["cmd"]
    cwd = result["cwd"]

    def run_thread():
        global _game_session_start, _game_session_instance
        _game_session_start = time.time()
        _game_session_instance = instance_name

        _ensure_custom_skin_loader(instance_name)
        _setup_local_skin_for_csl(instance_name)

        pre_cmd = get_setting("pre_launch_cmd", "").strip()
        if pre_cmd:
            try:
                subprocess.Popen(pre_cmd, shell=True)
                log(f"[Launch] Pre-launch hook executed: {pre_cmd}")
            except:
                pass

        try:
            startupinfo = None
            if platform.system() == "Windows":
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

            creation_flags = 0
            if platform.system() == "Windows":
                creation_flags = subprocess.CREATE_NO_WINDOW

            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True,
                startupinfo=startupinfo,
                creationflags=creation_flags,
                cwd=cwd,
            )

            log(f"[Launch/OK] Process started, PID: {proc.pid}")
            append_game_output(f"[Launch] Minecraft started (PID: {proc.pid})")

            crash_lines = []
            for line in iter(proc.stdout.readline, ""):
                if not line:
                    break
                line = line.strip()
                if line:
                    crash_lines.append(line)
                    if len(crash_lines) > 80:
                        crash_lines.pop(0)
                    append_game_output(line)
                    if "DEBUG" not in line:
                        log(f"[MC] {line}")

            proc.stdout.close()
            exit_code = proc.wait()

            if exit_code != 0:
                log(f"[MC/ERROR] Game exited with code {exit_code}")
                append_game_output(f"[ERROR] Game exited with code {exit_code}")
            else:
                log("[MC/INFO] Game closed normally.")
                append_game_output("[INFO] Game closed normally.")

        except FileNotFoundError:
            log("[Launch/ERROR] Java executable not found! Check Settings.")
            append_game_output("[ERROR] Java executable not found!")
        except Exception as e:
            log(f"[Launch/ERROR] {e}")
            append_game_output(f"[ERROR] {e}")
        finally:
            post_cmd = get_setting("post_launch_cmd", "").strip()
            if post_cmd:
                try:
                    subprocess.Popen(post_cmd, shell=True)
                    log(f"[Launch] Post-launch hook executed: {post_cmd}")
                except:
                    pass

            if _game_session_start and _game_session_instance:
                elapsed = time.time() - _game_session_start
                playtimes = load_playtimes()
                playtimes[_game_session_instance] = playtimes.get(_game_session_instance, 0) + elapsed
                save_playtimes(playtimes)
                log(f"[Launch] Playtime +{int(elapsed)}s for {_game_session_instance}")
                _game_session_start = None
                _game_session_instance = None

            log("[Launch] Session ended.")

    threading.Thread(target=run_thread, daemon=True).start()
    return {"success": True, "message": "Game process started"}

def _ensure_java(ver_json: Dict, mc_version: str) -> Optional[str]:
    custom = get_setting("java_path", "")
    if custom and Path(custom).exists():
        return custom
    system_java = shutil.which("java")
    if system_java:
        return system_java
    return None

def _is_lib_allowed(lib: Dict) -> bool:
    rules = lib.get("rules", [])
    if not rules:
        return True
    allowed = None
    for rule in rules:
        action = rule.get("action", "allow")
        feature = rule.get("features", {})
        os_rule = rule.get("os", {})
        if feature:
            continue
        if os_rule:
            name = os_rule.get("name", "")
            if name == "osx" and platform.system() == "Darwin":
                allowed = action == "allow"
            elif name == "windows" and platform.system() == "Windows":
                allowed = action == "allow"
            elif name == "linux" and platform.system() == "Linux":
                allowed = action == "allow"
    return allowed if allowed is not None else True

def _get_natives_classifier(lib: Dict) -> Optional[str]:
    classifiers = lib.get("downloads", {}).get("classifiers", {})
    os_name = platform.system().lower()
    key = f"natives-{os_name}"
    if key in classifiers:
        return key
    return None

# === CUSTOMSKINLOADER ===
def _ensure_custom_skin_loader(inst_name: str):
    username = get_setting("username", None)
    mc_token = get_setting("mc_token", None)
    if username and mc_token and mc_token != "0":
        return

    inst_dir = INSTANCES_DIR / inst_name
    mods_dir = inst_dir / "mods"
    mods_dir.mkdir(parents=True, exist_ok=True)

    csl_filename = "CustomSkinLoader_Fabric-14.19.1.jar"
    csl_path = mods_dir / csl_filename
    if not csl_path.exists():
        log(f"[Skin] Installing CustomSkinLoader for offline skin support...")
        try:
            url = "https://cdn.modrinth.com/data/xnKZg9P2/versions/MkQ7y5wL/CustomSkinLoader_Fabric-14.19.1.jar"
            if download_file(url, csl_path):
                log("[Skin] CustomSkinLoader installed")
            else:
                log("[Skin/WARN] Failed to download CustomSkinLoader")
        except Exception as e:
            log(f"[Skin/ERROR] CustomSkinLoader install failed: {e}")

    config_dir = inst_dir / "config" / "CustomSkinLoader"
    config_file = config_dir / "CustomSkinLoader.json"
    if not config_file.exists():
        config_dir.mkdir(parents=True, exist_ok=True)
        basic_config = {
            "enable": True,
            "loadlist": [
                {"name": "LocalFile", "type": "LocalFile"},
                {"name": "Mojang", "type": "MojangAPI"},
            ],
        }
        try:
            with open(config_file, "w") as f:
                json.dump(basic_config, f, indent=4)
            log("[Skin] CustomSkinLoader config created")
        except Exception as e:
            log(f"[Skin/WARN] CSL config creation failed: {e}")

def _setup_local_skin_for_csl(inst_name: str):
    username = get_setting("cracked_username", "Player")
    global_skin = CUSTOM_SKIN
    if not global_skin.exists():
        return
    inst_dir = INSTANCES_DIR / inst_name
    skin_folder = inst_dir / "skins"
    skin_folder.mkdir(exist_ok=True)
    target_skin = skin_folder / f"{username}.png"
    try:
        shutil.copy2(global_skin, target_skin)
        log(f"[Skin] Copied local skin to instance for {username}")
    except Exception as e:
        log(f"[Skin/ERROR] Failed to copy skin: {e}")

# === MODS / MODRINTH ===
def search_modrinth(query: str, project_type: str = "mod", loader: str = "", mc_version: str = "", limit: int = 20) -> List[Dict]:
    facets = [[f"project_type:{project_type}"]]
    if loader:
        facets.append([f"categories:{loader.lower()}"])
    if mc_version:
        facets.append([f"versions:{mc_version}"])
    params = {
        "query": query,
        "limit": str(limit),
        "facets": json.dumps(facets),
    }
    url = f"{MODRINTH_API}/search?" + urllib.parse.urlencode(params)
    log(f"[Modrinth] Search: '{query}' type={project_type}")
    data = http_get(url)
    if isinstance(data, dict):
        if "hits" in data:
            log(f"[Modrinth] Found {len(data['hits'])} results")
            return data["hits"]
        if "error" in data:
            log(f"[Modrinth/ERROR] {data['error']}")
    return []

def get_modrinth_project(slug: str) -> Dict:
    return http_get(f"{MODRINTH_API}/project/{slug}")

def get_modrinth_versions(slug: str, loader: str = "", mc_version: str = "") -> List[Dict]:
    params = {}
    if loader:
        params["loaders"] = json.dumps([loader.lower()])
    if mc_version:
        params["game_versions"] = json.dumps([mc_version])
    url = f"{MODRINTH_API}/project/{slug}/version?" + urllib.parse.urlencode(params)
    data = http_get(url)
    return data if isinstance(data, list) else []

def install_mod(instance_name: str, slug: str, version_id: str = "") -> Dict:
    log(f"[Mod] Installing mod '{slug}' to '{instance_name}'...")
    try:
        inst_dir = INSTANCES_DIR / instance_name / "mods"
        inst_dir.mkdir(parents=True, exist_ok=True)
        versions = get_modrinth_versions(slug)
        if not versions:
            return {"error": "No versions found"}
        target_version = versions[0]
        if version_id:
            for v in versions:
                if v["version_id"] == version_id:
                    target_version = v
                    break
        primary = next((f for f in target_version["files"] if f.get("primary")), target_version["files"][0])
        filename = primary["filename"]
        download_url = primary["url"]
        dest = inst_dir / filename
        log(f"[Mod] Downloading {filename}...")

        def progress(downloaded, total, pct):
            if pct % 25 == 0:
                log(f"[Mod] {filename}: {pct}%")

        if download_file(download_url, dest, progress_cb=progress):
            log(f"[Mod/OK] '{filename}' installed!")
            return {"success": True, "filename": filename}
        return {"error": "Download failed"}
    except Exception as e:
        log(f"[Mod/ERROR] {e}")
        return {"error": str(e)}

def install_resourcepack(instance_name: str, slug: str, version_id: str = "") -> Dict:
    log(f"[ResourcePack] Installing '{slug}' to '{instance_name}'...")
    try:
        inst_dir = INSTANCES_DIR / instance_name / "resourcepacks"
        inst_dir.mkdir(parents=True, exist_ok=True)
        versions = get_modrinth_versions(slug)
        if not versions:
            return {"error": "No versions found"}
        target_version = versions[0]
        if version_id:
            for v in versions:
                if v["version_id"] == version_id:
                    target_version = v
                    break
        primary = next((f for f in target_version["files"] if f.get("primary")), target_version["files"][0])
        filename = primary["filename"]
        download_url = primary["url"]
        dest = inst_dir / filename
        log(f"[ResourcePack] Downloading {filename}...")
        if download_file(download_url, dest):
            log(f"[ResourcePack/OK] '{filename}' installed!")
            return {"success": True, "filename": filename}
        return {"error": "Download failed"}
    except Exception as e:
        log(f"[ResourcePack/ERROR] {e}")
        return {"error": str(e)}

def install_modpack(instance_name: str, slug: str, version_id: str = "") -> Dict:
    log(f"[Modpack] Installing modpack '{slug}' to '{instance_name}'...")
    try:
        versions = get_modrinth_versions(slug)
        if not versions:
            return {"error": "No versions found"}
        target_version = versions[0]
        if version_id:
            for v in versions:
                if v["version_id"] == version_id:
                    target_version = v
                    break
        primary = next((f for f in target_version["files"] if f.get("primary")), target_version["files"][0])
        download_url = primary["url"]
        filename = primary["filename"]

        temp_dir = Path(tempfile.mkdtemp(prefix="mrpack_"))
        mrpack_file = temp_dir / filename
        log(f"[Modpack] Downloading {filename}...")
        if not download_file(download_url, mrpack_file):
            return {"error": "Download failed"}

        log(f"[Modpack] Parsing {filename}...")
        inst_dir = INSTANCES_DIR / instance_name

        with zipfile.ZipFile(mrpack_file, "r") as zf:
            if "modrinth.index.json" not in zf.namelist():
                log("[Modpack/ERROR] Invalid .mrpack — missing modrinth.index.json")
                return {"error": "Invalid .mrpack file"}

            index_data = json.loads(zf.read("modrinth.index.json"))
            files_list = index_data.get("files", [])
            log(f"[Modpack] {len(files_list)} files to install from index")

            for i, entry in enumerate(files_list):
                path = entry.get("path", "")
                downloads = entry.get("downloads", [])
                if not downloads:
                    continue
                file_url = downloads[0]
                dest = inst_dir / path
                dest.parent.mkdir(parents=True, exist_ok=True)
                if dest.exists():
                    continue
                try:
                    log(f"[Modpack] ({i+1}/{len(files_list)}) {path}")
                    download_file(file_url, dest)
                except Exception as e:
                    log(f"[Modpack/WARN] Failed {path}: {e}")

            has_overrides = any(n.startswith("overrides/") for n in zf.namelist())
            if has_overrides:
                log("[Modpack] Extracting overrides...")
                for name in zf.namelist():
                    if name.startswith("overrides/") and not name.endswith("/"):
                        rel = name[len("overrides/"):]
                        dest = inst_dir / rel
                        dest.parent.mkdir(parents=True, exist_ok=True)
                        dest.write_bytes(zf.read(name))
                log("[Modpack] Overrides extracted")

        shutil.rmtree(temp_dir, ignore_errors=True)
        log(f"[Modpack/OK] '{filename}' installed successfully!")
        return {"success": True}
    except Exception as e:
        log(f"[Modpack/ERROR] {e}")
        return {"error": str(e)}

# === NEWS ===
def get_minecraft_news() -> List[Dict]:
    try:
        data = http_get(MOJANG_VERSION_MANIFEST, use_cache=True)
        if isinstance(data, dict) and "latest" in data:
            news = []
            latest = data["latest"]
            for v in data.get("versions", [])[:10]:
                if v["id"] in [latest.get("release", ""), latest.get("snapshot", "")]:
                    news.append({
                        "title": f"Minecraft {v['id']} ({v['type']})",
                        "url": v.get("url", ""),
                        "date": v.get("releaseTime", ""),
                        "type": v.get("type", ""),
                    })
            return news
    except:
        pass
    return []

# === SKIN MANAGER ===
def get_skin_info() -> Dict:
    custom_skin_path = get_setting("custom_skin_path", "")
    return {
        "custom_skin_path": custom_skin_path,
        "has_skin": Path(custom_skin_path).exists() if custom_skin_path else False,
    }

def set_custom_skin(file_path: str) -> Dict:
    try:
        dest = CUSTOM_SKIN
        shutil.copy2(file_path, dest)
        save_setting("custom_skin_path", str(dest))
        log(f"[Skin] Custom skin set: {dest}")
        return {"success": True, "path": str(dest)}
    except Exception as e:
        log(f"[Skin/ERROR] {e}")
        return {"error": str(e)}

# === OPTIMIZER ===
def get_optimizer_status(instance_name: str) -> Dict:
    inst_dir = INSTANCES_DIR / instance_name
    options_path = inst_dir / "options.txt"
    options = {}
    if options_path.exists():
        with open(options_path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                if ":" in line:
                    k, v = line.strip().split(":", 1)
                    options[k.strip()] = v.strip()
    return {
        "render_distance": int(options.get("renderDistance", "12")),
        "simulation_distance": int(options.get("simulationDistance", "12")),
        "fps_limit": options.get("fpsLimit", "261"),
        "vsync": options.get("vsync", "true"),
        "gamma": options.get("gamma", "1.0"),
    }

def apply_optimizer(instance_name: str, settings: Dict) -> Dict:
    try:
        inst_dir = INSTANCES_DIR / instance_name
        options_path = inst_dir / "options.txt"
        existing = {}
        if options_path.exists():
            with open(options_path, "r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    if ":" in line:
                        k, v = line.strip().split(":", 1)
                        existing[k.strip()] = v.strip()
        existing.update({k: str(v) for k, v in settings.items()})
        with open(options_path, "w", encoding="utf-8") as f:
            for k, v in existing.items():
                f.write(f"{k}:{v}\n")
        log(f"[Optimizer] Applied settings to {instance_name}")
        return {"success": True}
    except Exception as e:
        log(f"[Optimizer/ERROR] {e}")
        return {"error": str(e)}

# === UPDATES ===
def check_for_updates() -> Dict:
    try:
        data = http_get(GITHUB_API_URL)
        if isinstance(data, dict) and "tag_name" in data:
            remote = data["tag_name"].lstrip("v")
            if remote > APP_VERSION:
                exe_asset = None
                for asset in data.get("assets", []):
                    if asset["name"].endswith(".exe"):
                        exe_asset = asset.get("browser_download_url", "")
                        break
                log(f"[Update] New version available: {remote}")
                return {
                    "update_available": True, "current_version": APP_VERSION,
                    "latest_version": remote, "download_url": exe_asset or data.get("html_url", ""),
                    "release_notes": data.get("body", ""),
                }
        log("[Update] App is up to date")
        return {"update_available": False}
    except Exception as e:
        log(f"[Update/ERROR] {e}")
        return {"error": str(e)}

# === SYSTEM INFO ===
def get_system_info() -> Dict:
    try:
        import psutil
        cpu = psutil.cpu_percent(interval=0.1)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        return {"cpu": cpu, "ram_used": mem.used, "ram_total": mem.total, "ram_pct": mem.percent,
                "disk_used": disk.used, "disk_total": disk.total, "disk_pct": disk.percent}
    except:
        return {"cpu": 0, "ram_used": 0, "ram_total": 0, "ram_pct": 0, "disk_used": 0, "disk_total": 0, "disk_pct": 0}

# === COMMANDS ===
COMMANDS = {
    "get_settings": lambda a: load_settings(),
    "save_settings": lambda a: (save_settings_batch(a["settings"]), {"success": True})[1],
    "get_setting": lambda a: get_setting(a["key"], a.get("default")),
    "save_setting": lambda a: (save_setting(a["key"], a["value"]), {"success": True})[1],
    "get_instances": lambda a: load_instances(),
    "create_instance": lambda a: create_instance(a["name"], a["mc_version"], a.get("loader", "Vanilla"), a.get("loader_version", "")),
    "delete_instance": lambda a: delete_instance(a["name"]),
    "install_instance": lambda a: install_instance(a["instance_name"], a["mc_version"], a.get("loader", "Vanilla"), a.get("loader_version", "")),
    "launch_game": lambda a: start_game_process(a["instance_name"]),
    "get_minecraft_versions": lambda a: get_minecraft_versions(),
    "get_loader_versions": lambda a: get_loader_versions(a["mc_version"], a["loader"]),
    "get_fabric_versions": lambda a: get_fabric_supported_versions(),
    "authenticate_microsoft": lambda a: authenticate_microsoft(),
    "poll_microsoft_token": lambda a: poll_microsoft_token(a["device_code"], a.get("interval", 5)),
    "complete_microsoft_auth": lambda a: _complete_ms_auth(a["ms_token"], a.get("refresh_token", "")),
    "authenticate_elyby": lambda a: authenticate_elyby(),
    "poll_elyby_auth": lambda a: poll_elyby_auth(),
    "complete_elyby_auth": lambda a: _exchange_elyby_code(a["code"]),
    "create_offline_account": lambda a: create_offline_account(a["username"]),
    "search_modrinth": lambda a: search_modrinth(a["query"], a.get("project_type", "mod"), a.get("loader", ""), a.get("mc_version", ""), a.get("limit", 20)),
    "get_modrinth_project": lambda a: get_modrinth_project(a["slug"]),
    "get_modrinth_versions": lambda a: get_modrinth_versions(a["slug"], a.get("loader", ""), a.get("mc_version", "")),
    "install_mod": lambda a: install_mod(a["instance_name"], a["slug"], a.get("version_id", "")),
    "install_resourcepack": lambda a: install_resourcepack(a["instance_name"], a["slug"], a.get("version_id", "")),
    "install_modpack": lambda a: install_modpack(a["instance_name"], a["slug"], a.get("version_id", "")),
    "get_minecraft_news": lambda a: get_minecraft_news(),
    "get_skin_info": lambda a: get_skin_info(),
    "set_custom_skin": lambda a: set_custom_skin(a["file_path"]),
    "get_optimizer_status": lambda a: get_optimizer_status(a["instance_name"]),
    "apply_optimizer": lambda a: apply_optimizer(a["instance_name"], a["settings"]),
    "check_updates": lambda a: check_for_updates(),
    "get_system_info": lambda a: get_system_info(),
    "get_logs": lambda a: get_logs(),
    "clear_logs": lambda a: (clear_logs(), {"success": True})[1],
    "get_game_output": lambda a: get_game_output(),
    "clear_game_output": lambda a: (clear_game_output(), {"success": True})[1],
    "ensure_authlib_injector": lambda a: ensure_authlib_injector(),
}

def read_line():
    try:
        return sys.stdin.readline().strip()
    except EOFError:
        return None

def write_response(response: Any):
    line = json.dumps(response, ensure_ascii=False)
    sys.stdout.write(line + "\n")
    sys.stdout.flush()

def main():
    log("EcLauncher Python Backend v5.0 started")
    while True:
        line = read_line()
        if line is None:
            break
        if not line:
            continue
        try:
            request = json.loads(line)
            command = request.get("command", "")
            args = request.get("args", {})
            request_id = request.get("id", 0)
            if command in COMMANDS:
                try:
                    result = COMMANDS[command](args)
                    log(f"[IPC] {command} -> OK")
                    write_response({"id": request_id, "result": result})
                except Exception as e:
                    log(f"[IPC/ERROR] {command} -> {e}")
                    write_response({"id": request_id, "error": str(e)})
            elif command == "ping":
                write_response({"id": request_id, "result": "pong"})
            elif command == "quit":
                write_response({"id": request_id, "result": "bye"})
                break
            else:
                write_response({"id": request_id, "error": f"Unknown command: {command}"})
        except json.JSONDecodeError as e:
            write_response({"id": 0, "error": f"Invalid JSON: {e}"})
        except Exception as e:
            write_response({"id": 0, "error": str(e)})

if __name__ == "__main__":
    main()

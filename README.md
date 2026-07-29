# ⚡ EcLauncher

<img src="public/logo.png" alt="EcLauncher Logo" width="128" height="128" align="right" />

> A modern, feature-packed **Minecraft launcher** built with Tauri, React, and Python.  
> Created with ❤️ by **EscapeXOG**

---

## ✨ Features

### 🚀 Instance Management
- Create, clone, rename, and delete **Minecraft instances**
- Support for **Vanilla, Fabric, Quilt, Forge, and NeoForge** loaders
- Install any Minecraft version with automatic library and asset downloads
- **Export/Import** instances as `.mrpack` files
- Pin your favorite instances for quick access
- Per-instance **play time tracking**

### 🎮 Mod & Resource Pack Management
- **Browse, search, and install** mods, resource packs, and modpacks directly from **Modrinth**
- Toggle, delete, and batch-install mods
- **Mod profiles** — save/load/apply named mod lists
- **Mod conflict detection** and **update checking**
- Drag-and-drop support for `.jar` and `.zip` files

### 🔐 Triple Authentication
| Method | Features |
|---|---|
| **Microsoft OAuth** | Full device code flow with Xbox Live / Minecraft token exchange |
| **Ely.by OAuth** | Authlib-injector support for custom skins |
| **Offline (Cracked)** | Simple username-based accounts |

### ⚡ Performance & Optimization
- **Game Boost** — kills background processes, clears temp files, empties recycle bin, flushes DNS, optimizes memory
- **Auto FPS Mods** — one-click install of Sodium, Lithium, FerriteCore, Starlight, EntityCulling + 15 more
- **Game Optimizer** — tweak render distance, simulation distance, vsync, gamma, FPS limits
- **Custom JVM arguments** (per-instance or global)
- **Pre/Post launch commands**

### 🤖 EcAI — Built-in AI Assistant
- Interactive **chat interface** with system command execution
- **Terminal emulator** built right into the launcher
- **File manager** — list, read, write, delete files
- **Crash log analyzer** — paste your crash log and get instant insights

### 🌐 Multiplayer
- **Server list** with live ping (motd, players, version)
- Add, edit, and delete servers
- **Self-hosted server** — download and launch a Paper server with one click

### 🎨 Customization
- **9 built-in themes**: Blue Cartoon, God Red, Fast Client, Purple, Sapphire, Midnight, Lunar, Feature, Green Gradient
- **Custom theme editor** with 35+ color tokens
- Custom **background images/videos**
- **Animated backgrounds** and **Minecraft particles**
- **C418-style ambient music** generated via Web Audio API
- Customizable sidebar style and icon layout

### 💬 Social & Community
- **Global chat** powered by Firebase (auth, Firestore, online presence)
- **Friend invites** and user profiles
- **Achievements system** with progress tracking
- **Discord Rich Presence** integration

### 🛠️ Developer Tools
- **Config editor** with syntax highlighting for `.properties`, `.json`, `.toml`, `.yml`, `.cfg`, `.txt`, `.xml`
- **Live game output** and launcher logs viewer
- **Screenshot gallery** with preview
- **Skin manager** — upload and manage skins
- **Launcher update checker** (via GitHub Releases)

### 📦 Instance Templates
- Pre-configured mod lists by category: Fabric, Forge, Vanilla, Server
- One-click apply and launch

---

## 🖥️ Tech Stack

| Layer | Technology |
|---|---|
| **Desktop Shell** | [Tauri](https://tauri.app/) v1 (Rust) |
| **Frontend** | React 18 + TypeScript |
| **State Management** | [Zustand](https://github.com/pmndrs/zustand) |
| **Styling** | Tailwind CSS + Glassmorphism |
| **Animations** | [Framer Motion](https://www.framer.com/motion/) |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **Backend Engine** | Python 3 (JSON-RPC sidecar) |
| **Chat Backend** | Firebase (Auth, Firestore, Storage) |
| **Mod Repository** | [Modrinth API](https://modrinth.com/) |
| **Auth Providers** | Microsoft OAuth 2.0, Ely.by OAuth 2.0 |
| **Build Tool** | [Vite](https://vitejs.dev/) 5 |

---

## 📋 Prerequisites

- **Node.js** >= 18.x
- **Python** >= 3.10
- **Rust** (for Tauri builds)
- **Windows** (primary target — NSIS/MSI installer)

---

## 🛠️ Development

```bash
# Clone the repo
git clone https://github.com/EscapeXMc/EcLauncher.git
cd EcLauncher

# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

---

## 🗺️ Roadmap

- [ ] Linux and macOS support
- [ ] CurseForge integration
- [ ] Built-in skin editor
- [ ] Modpack recommender system
- [ ] Cloud instance sync
- [ ] More theme presets

---

## 📄 License

**All Rights Reserved.** You **must obtain permission** from the owner before using, copying, modifying, or distributing this source code. Unauthorized use may result in **legal action**.

To request permission, contact **EscapeXOG** on Discord: **escapex1**

See the [LICENSE](./LICENSE) file for full details.

---

## 👤 Author

**EscapeXOG**  
[![GitHub](https://img.shields.io/badge/GitHub-EscapeXMc-181717?style=flat&logo=github)](https://github.com/EscapeXMc)

---

> ⚡ *EcLauncher — The launcher that does it all.*

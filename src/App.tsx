import { useEffect, useRef, useMemo, useState, useCallback, ErrorInfo, Component, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLauncherStore } from "./stores";
import { Sidebar } from "./components/ui/Sidebar";
import { TitleBar } from "./components/ui/TitleBar";
import { LoadingOverlay } from "./components/ui/LoadingOverlay";
import { SplashScreen } from "./components/ui/SplashScreen";
import { LaunchOverlay } from "./components/ui/LaunchOverlay";
import { WizardOverlay } from "./components/ui/WizardOverlay";
import { AnimatedBackground, useAnimatedBg } from "./components/ui/AnimatedBackgrounds";
import { LaunchAnimation } from "./components/ui/LaunchAnimation";
import { MinecraftParticles } from "./components/ui/MinecraftParticles";
import { MusicPlayer } from "./components/ui/MusicPlayer";
import { HomePage } from "./components/pages/HomePage";
import { InstancesPage } from "./components/pages/InstancesPage";
import { ModsPage } from "./components/pages/ModsPage";
import { SettingsPage } from "./components/pages/SettingsPage";
import { AccountsPage } from "./components/pages/AccountsPage";
import { EcAIPage } from "./components/pages/EcAIPage";
import { PacksPage } from "./components/pages/PacksPage";
import { ModpacksPage } from "./components/pages/ModpacksPage";
import { ToolsPage } from "./components/pages/ToolsPage";
import { LogsPage } from "./components/pages/LogsPage";
import { MultiplayerPage } from "./components/pages/MultiplayerPage";
import { TemplatesPage } from "./components/pages/TemplateBrowser";
import { ConfigEditorPage } from "./components/pages/ConfigEditorPage";
import { AchievementsPage } from "./components/pages/AchievementsPage";
import { ChatPage } from "./components/pages/ChatPage";
import { ThemesPage } from "./components/pages/ThemesPage";
import { ToastProvider } from "./components/ui/Toast";
import { Breadcrumb } from "./components/ui/Breadcrumb";
import { GameBoostOverlay } from "./components/ui/GameBoostOverlay";
import { api } from "./lib/api";
import { convertFileSrc } from "@tauri-apps/api/tauri";

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page crash:", error, info);
  }
  render() {
    if (this.state.hasError) {
      const { themeColors } = useLauncherStore.getState();
      return (
        <div className="flex items-center justify-center h-full">
          <div className="glass-card text-center p-8 rounded-2xl" style={{ border: `1px solid ${themeColors.danger}40` }}>
            <p className="tinycaps text-lg font-bold mb-2" style={{ color: themeColors.danger }}>Something went wrong</p>
            <p className="text-sm mb-4" style={{ color: themeColors.text_muted }}>{this.state.error}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: "" })}
              className="px-4 py-2 rounded-xl text-sm font-semibold tinycaps"
              style={{ background: themeColors.accent, color: "#fff" }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AnimatedOrbs({ themeColors }: { themeColors: any }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      <div className="absolute" style={{
        top: "10%", left: "15%", width: "400px", height: "400px",
        background: `radial-gradient(circle, ${themeColors.accent}12 0%, transparent 70%)`,
        borderRadius: "50%", filter: "blur(80px)",
        animation: "orbFloat1 20s ease-in-out infinite",
      }} />
      <div className="absolute" style={{
        bottom: "15%", right: "10%", width: "350px", height: "350px",
        background: `radial-gradient(circle, ${themeColors.purple || themeColors.blue}10 0%, transparent 70%)`,
        borderRadius: "50%", filter: "blur(80px)",
        animation: "orbFloat2 25s ease-in-out infinite",
      }} />
      <div className="absolute" style={{
        top: "50%", left: "50%", width: "300px", height: "300px",
        background: `radial-gradient(circle, ${themeColors.accent}08 0%, transparent 70%)`,
        borderRadius: "50%", filter: "blur(60px)",
        animation: "orbFloat3 18s ease-in-out infinite",
      }} />
    </div>
  );
}

function FloatingParticles({ themeColors }: { themeColors: any }) {
  const particles = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: Math.random() * 3 + 1,
      duration: Math.random() * 20 + 15,
      delay: Math.random() * 15,
      opacity: Math.random() * 0.4 + 0.1,
    })), []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {particles.map((p) => (
        <div key={p.id} className="absolute rounded-full" style={{
          left: `${p.left}%`,
          bottom: "-10px",
          width: `${p.size}px`,
          height: `${p.size}px`,
          background: themeColors.accent,
          opacity: p.opacity,
          animation: `particleDrift ${p.duration}s linear ${p.delay}s infinite`,
        }} />
      ))}
    </div>
  );
}

function BackgroundLayer() {
  const { settings, themeColors } = useLauncherStore();
  const bgType = settings.launcher_bg_type || "video";
  const bgImage = settings.launcher_bg_image || "";
  const bgVideo = settings.launcher_bg_video || "https://cdn.pixabay.com/video/2023/06/24/168653-839542456_large.mp4";
  const bgOpacity = settings.launcher_bg_opacity ?? 65;
  const bgBlur = settings.launcher_bg_blur ?? 4;
  const bgFit = settings.launcher_bg_fit || "cover";
  const bgBrightness = settings.launcher_bg_brightness ?? 36;
  const bgDimming = settings.launcher_bg_dimming ?? 3;
  const videoRef = useRef<HTMLVideoElement>(null);
  const fitVal = bgFit === "stretch" ? "fill" : bgFit;
  const [resolvedBgImage, setResolvedBgImage] = useState("");
  const [resolvedBgVideo, setResolvedBgVideo] = useState("");

  useEffect(() => {
    if (bgType === "image" && bgImage) {
      if (bgImage === "file") {
        api.background.getFilePath().then((path) => {
          if (path) setResolvedBgImage(convertFileSrc(path));
        }).catch(() => {});
      } else if (bgImage.startsWith("http")) {
        setResolvedBgImage(bgImage);
      } else if (bgImage.startsWith("data:")) {
        setResolvedBgImage(bgImage);
      } else {
        setResolvedBgImage(convertFileSrc(bgImage));
      }
    } else {
      setResolvedBgImage("");
    }
  }, [bgType, bgImage]);

  useEffect(() => {
    if (bgType === "video" && bgVideo) {
      if (bgVideo === "file") {
        api.background.getVideoPath().then((path) => {
          if (path) setResolvedBgVideo(convertFileSrc(path));
        }).catch(() => {});
      } else if (bgVideo.startsWith("http")) {
        setResolvedBgVideo(bgVideo);
      } else {
        setResolvedBgVideo(convertFileSrc(bgVideo));
      }
    } else {
      setResolvedBgVideo("");
    }
  }, [bgType, bgVideo]);

  const showCustom = (bgType === "image" && resolvedBgImage) || (bgType === "video" && resolvedBgVideo);

  if (!showCustom) {
    return (
      <>
        <AnimatedOrbs themeColors={themeColors} />
        <FloatingParticles themeColors={themeColors} />
      </>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {bgType === "image" && resolvedBgImage && (
        <img src={resolvedBgImage} alt="" className="absolute inset-0 w-full h-full"
          style={{
            objectFit: fitVal,
            opacity: bgOpacity / 100,
            filter: [
              bgBlur > 0 ? `blur(${bgBlur}px)` : "",
              bgBrightness !== 100 ? `brightness(${bgBrightness}%)` : "",
            ].filter(Boolean).join(" ") || undefined,
          }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      )}
      {bgType === "video" && resolvedBgVideo && (
        <video ref={videoRef} src={resolvedBgVideo} autoPlay loop muted playsInline
          className="absolute inset-0 w-full h-full"
          style={{
            objectFit: fitVal,
            opacity: bgOpacity / 100,
            filter: [
              bgBlur > 0 ? `blur(${bgBlur}px)` : "",
              bgBrightness !== 100 ? `brightness(${bgBrightness}%)` : "",
            ].filter(Boolean).join(" ") || undefined,
          }}
          onError={(e) => { (e.target as HTMLVideoElement).style.display = "none"; }} />
      )}
      {/* Dark dimming overlay */}
      {bgDimming > 0 && (
        <div className="absolute inset-0" style={{
          background: `rgba(0,0,0,${bgDimming / 100})`,
        }} />
      )}
      <div className="absolute inset-0" style={{
        background: `linear-gradient(180deg, ${themeColors.bg_main}44 0%, ${themeColors.bg_main}18 40%, ${themeColors.bg_main}18 60%, ${themeColors.bg_main}44 100%)`,
      }} />
      <FloatingParticles themeColors={themeColors} />
    </div>
  );
}

const pageVariants = {
  initial: { opacity: 0, y: 12, scale: 0.99 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.99 },
};

const pageTransition = {
  type: "tween" as const,
  ease: [0.4, 0, 0.2, 1],
  duration: 0.25,
};

function App() {
  const { currentPage, setPage, themeColors, loadSettings, loadInstances, fetchLiveVersion } = useLauncherStore();
  const [splashDone, setSplashDone] = useState(false);
  const [launchInstance, setLaunchInstance] = useState<string | null>(null);
  const [boostInstance, setBoostInstance] = useState<string | null>(null);
  const [launchAnimInstance, setLaunchAnimInstance] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const { bgType } = useAnimatedBg();

  useEffect(() => {
    loadSettings().then(() => {
      loadInstances();
      api.wizard.checkFirstLaunch().then((result) => {
        if (result.first_launch) setShowWizard(true);
      }).catch(() => {});
    });
    fetchLiveVersion();

    // Listen for launch events from InstancesPage
    const handleLaunchEvent = (e: CustomEvent) => {
      const name = e.detail?.instanceName;
      if (name) setBoostInstance(name);
    };
    window.addEventListener("ec-launch-game", handleLaunchEvent as EventListener);
    return () => window.removeEventListener("ec-launch-game", handleLaunchEvent as EventListener);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        if (e.key === "Escape") {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        setPage("instances");
        window.dispatchEvent(new CustomEvent("ec-open-create-instance"));
      } else if (ctrl && (e.key === "m" || e.key === "M")) {
        e.preventDefault();
        setPage("mods");
      } else if (ctrl && (e.key === "," || e.key === ".")) {
        e.preventDefault();
        setPage("settings");
      } else if (ctrl && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        setPage("multiplayer");
      } else if (ctrl && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        setPage("themes");
      } else if (e.key === "F5") {
        e.preventDefault();
        const ev = new CustomEvent("ec-refresh-current");
        window.dispatchEvent(ev);
      } else if (e.key === "Escape") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("ec-escape-pressed"));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setPage]);

  const handleSplashComplete = useCallback(() => {
    setSplashDone(true);
  }, []);
  const handleLaunchComplete = useCallback(() => setLaunchInstance(null), []);
  const handleBoostComplete = useCallback(() => {
    const name = boostInstance;
    setBoostInstance(null);
    if (name) {
      setLaunchAnimInstance(name);
      api.instances.launch(name).catch(console.error);
    }
  }, [boostInstance]);

  const handleLaunchAnimComplete = useCallback(() => setLaunchAnimInstance(null), []);

  const renderPage = () => {
    switch (currentPage) {
      case "home": return <HomePage />;
      case "instances": return <InstancesPage />;
      case "mods": return <ModsPage />;
      case "packs": return <PacksPage />;
      case "modpacks": return <ModpacksPage />;
      case "accounts": return <AccountsPage />;
      case "ecai": return <EcAIPage />;
      case "tools": return <ToolsPage />;
      case "multiplayer": return <MultiplayerPage />;
      case "templates": return <TemplatesPage />;
      case "configeditor": return <ConfigEditorPage />;
      case "achievements": return <AchievementsPage />;
      case "chat": return <ChatPage />;
      case "themes": return <ThemesPage />;
      case "settings": return <SettingsPage />;
      case "logs": return <LogsPage />;
      default: return <HomePage />;
    }
  };

  if (!splashDone) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  return (
    <ToastProvider>
      <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: themeColors.bg_main, color: themeColors.text_main }}>
        <TitleBar />
        <div className="flex flex-1 overflow-hidden relative">
          <BackgroundLayer />
          <AnimatedBackground type={bgType} />
          <MinecraftParticles />
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden relative" style={{ zIndex: 1 }}>
            <Breadcrumb />
            <main className="flex-1 overflow-hidden relative">
              <ErrorBoundary>
                <AnimatePresence mode="wait">
                  <motion.div key={currentPage} variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}
                    className="absolute inset-0 overflow-y-auto overflow-x-hidden p-5" style={{ scrollbarWidth: "thin", scrollBehavior: "smooth" }}>
                    {renderPage()}
                  </motion.div>
                </AnimatePresence>
              </ErrorBoundary>
            </main>
          </div>
        </div>
        {useLauncherStore.getState().isLoading && <LoadingOverlay />}
        {launchInstance && <LaunchOverlay instanceName={launchInstance} onComplete={handleLaunchComplete} />}
        <MusicPlayer />
        <AnimatePresence>
          {boostInstance && <GameBoostOverlay instanceName={boostInstance} onComplete={handleBoostComplete} />}
        </AnimatePresence>
        <AnimatePresence>
          {launchAnimInstance && <LaunchAnimation instanceName={launchAnimInstance} onComplete={handleLaunchAnimComplete} />}
        </AnimatePresence>
        <AnimatePresence>
          {showWizard && <WizardOverlay onComplete={() => setShowWizard(false)} />}
        </AnimatePresence>
      </div>
    </ToastProvider>
  );
}

export default App;

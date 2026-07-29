import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLauncherStore } from "../../stores";
import { api } from "../../lib/api";
import { THEMES } from "../../lib/types";
import { GlassCard } from "./GlassCard";
import { GlowButton } from "./GlowButton";
import { GlassInput, GlassSlider } from "./FormControls";
import {
  Sparkles, Shield, Monitor, Users, Cpu, Palette,
  Check, ChevronRight, ChevronLeft, Zap, Coffee, Globe,
} from "lucide-react";

const STEPS = [
  { id: "welcome", title: "Welcome" },
  { id: "account", title: "Account" },
  { id: "java", title: "Java" },
  { id: "ram", title: "RAM" },
  { id: "theme", title: "Theme" },
  { id: "done", title: "Done" },
];

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0, scale: 0.95 }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -300 : 300, opacity: 0, scale: 0.95 }),
};

interface WizardOverlayProps {
  onComplete: () => void;
}

export function WizardOverlay({ onComplete }: WizardOverlayProps) {
  const { themeColors, saveSettings, setTheme } = useLauncherStore();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [javaPath, setJavaPath] = useState("");
  const [javaDetected, setJavaDetected] = useState(false);
  const [javaVersion, setJavaVersion] = useState("");
  const [ramMB, setRamMB] = useState(2048);
  const [selectedTheme, setSelectedTheme] = useState("cartoon");
  const [offlineUsername, setOfflineUsername] = useState("");
  const [accountType, setAccountType] = useState<"microsoft" | "elyby" | "offline" | null>(null);

  useEffect(() => {
    detectJava();
    const saved = useLauncherStore.getState().settings;
    setRamMB(saved.ram_mb || saved.max_memory || 2048);
    setSelectedTheme(saved.theme || "cartoon");
  }, []);

  const detectJava = async () => {
    try {
      const saved = useLauncherStore.getState().settings;
      const path = saved.java_path || "";
      if (path) {
        setJavaPath(path);
        setJavaDetected(true);
        setJavaVersion("System Java");
      } else {
        setJavaPath("Default (auto-detect)");
        setJavaDetected(true);
        setJavaVersion("System Java");
      }
    } catch {
      setJavaPath("Not found");
      setJavaDetected(false);
    }
  };

  const goNext = async () => {
    if (step === 1) {
      if (accountType === "offline" && offlineUsername.trim()) {
        try {
          const result = await api.auth.createOffline(offlineUsername.trim());
          const accounts = [{ type: "offline" as const, username: result.username, uuid: result.uuid }];
          await saveSettings({ accounts, active_account_uuid: result.uuid });
        } catch {}
      }
    }
    if (step === 3) {
      await saveSettings({ ram_mb: ramMB, max_memory: ramMB, min_memory: Math.min(512, ramMB) });
    }
    if (step === 4) {
      setTheme(selectedTheme);
    }
    if (step === 5) {
      try { await api.wizard.complete(); } catch {}
      onComplete();
      return;
    }
    setDirection(1);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  };

  const progressPct = ((step + 1) / STEPS.length) * 100;

  const renderStep = () => {
    switch (step) {
      case 0: return <WelcomeStep themeColors={themeColors} />;
      case 1: return (
        <AccountStep
          themeColors={themeColors}
          accountType={accountType}
          setAccountType={setAccountType}
          offlineUsername={offlineUsername}
          setOfflineUsername={setOfflineUsername}
        />
      );
      case 2: return <JavaStep themeColors={themeColors} javaPath={javaPath} javaDetected={javaDetected} javaVersion={javaVersion} />;
      case 3: return <RamStep themeColors={themeColors} ramMB={ramMB} setRamMB={setRamMB} />;
      case 4: return <ThemeStep themeColors={themeColors} selectedTheme={selectedTheme} setSelectedTheme={setSelectedTheme} />;
      case 5: return <DoneStep themeColors={themeColors} />;
      default: return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[95] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
    >
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute" style={{
          top: "10%", left: "15%", width: "500px", height: "500px",
          background: `radial-gradient(circle, ${themeColors.accent}10 0%, transparent 70%)`,
          borderRadius: "50%", filter: "blur(100px)",
        }} />
        <div className="absolute" style={{
          bottom: "15%", right: "10%", width: "400px", height: "400px",
          background: `radial-gradient(circle, ${themeColors.purple || themeColors.blue}08 0%, transparent 70%)`,
          borderRadius: "50%", filter: "blur(80px)",
        }} />
      </div>

      <div className="relative w-full max-w-[560px] mx-4">
        <div className="flex items-center justify-between mb-4 px-1">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold tinycaps transition-all duration-300"
                style={{
                  background: i <= step
                    ? `linear-gradient(135deg, ${themeColors.accent}, ${themeColors.accent2 || themeColors.accent})`
                    : `${themeColors.bg_card2}80`,
                  color: i <= step ? "#fff" : themeColors.text_muted,
                  boxShadow: i <= step ? `0 0 12px ${themeColors.accent}40` : "none",
                }}
              >
                {i < step ? <Check size={12} /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className="w-6 h-0.5 rounded-full" style={{
                  background: i < step ? themeColors.accent : `${themeColors.bg_card2}80`,
                }} />
              )}
            </div>
          ))}
        </div>

        <div className="h-1 rounded-full overflow-hidden mb-6" style={{ background: `${themeColors.accent}15` }}>
          <motion.div
            className="h-full rounded-full"
            style={{
              background: `linear-gradient(90deg, ${themeColors.accent}, ${themeColors.purple || themeColors.accent2})`,
              boxShadow: `0 0 12px ${themeColors.accent}60`,
            }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>

        <GlassCard
          className="p-6 min-h-[380px] flex flex-col"
          style={{
            background: `${themeColors.bg_card}cc`,
            border: `1px solid ${themeColors.border}40`,
          }}
        >
          <div className="flex-1 relative overflow-hidden">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: "tween", ease: [0.4, 0, 0.2, 1], duration: 0.3 }}
                className="w-full"
              >
                {renderStep()}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-between mt-6 pt-4" style={{ borderTop: `1px solid ${themeColors.border}30` }}>
            <div>
              {step > 0 && step < 5 && (
                <GlowButton variant="secondary" size="sm" onClick={goBack}>
                  <ChevronLeft size={14} /> Back
                </GlowButton>
              )}
            </div>
            <GlowButton
              variant="primary"
              size="md"
              onClick={goNext}
              className={step === 5 ? "min-w-[180px]" : ""}
            >
              {step === 5 ? (
                <><Sparkles size={14} /> Launch EcLauncher</>
              ) : step === 4 ? (
                <><Check size={14} /> Finish Setup</>
              ) : (
                <>Continue <ChevronRight size={14} /></>
              )}
            </GlowButton>
          </div>
        </GlassCard>
      </div>
    </motion.div>
  );
}

function WelcomeStep({ themeColors }: { themeColors: any }) {
  return (
    <div className="flex flex-col items-center text-center py-4">
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="mb-6"
      >
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center overflow-hidden"
          style={{
            boxShadow: `0 0 50px ${themeColors.accent}40, 0 0 100px ${themeColors.accent}15`,
          }}
        >
          <img src="/logo.png" alt="EcLauncher" className="w-full h-full object-contain" />
        </div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="tinycaps text-2xl font-black tracking-wider mb-2 gradient-text-animated"
        style={{ "--accent": themeColors.accent, "--accent2": themeColors.purple || themeColors.accent2 } as any}
      >
        Welcome to EcLauncher
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="text-sm max-w-sm leading-relaxed"
        style={{ color: themeColors.text_sub }}
      >
        Let's set up your launcher in just a few steps.
        Choose your account, configure Java, and pick a theme.
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="flex items-center gap-4 mt-6"
      >
        {[
          { icon: Shield, label: "Secure", color: themeColors.accent },
          { icon: Zap, label: "Fast", color: themeColors.green },
          { icon: Palette, label: "Customizable", color: themeColors.purple },
        ].map((item, i) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <item.icon size={14} style={{ color: item.color }} />
            <span className="tinycaps text-[11px] font-medium" style={{ color: themeColors.text_muted }}>{item.label}</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

function AccountStep({
  themeColors, accountType, setAccountType, offlineUsername, setOfflineUsername,
}: {
  themeColors: any;
  accountType: "microsoft" | "elyby" | "offline" | null;
  setAccountType: (v: "microsoft" | "elyby" | "offline") => void;
  offlineUsername: string;
  setOfflineUsername: (v: string) => void;
}) {
  const options = [
    {
      type: "microsoft" as const,
      icon: Shield,
      label: "Microsoft",
      desc: "Official servers & realms",
      color: themeColors.accent,
    },
    {
      type: "elyby" as const,
      icon: Globe,
      label: "Ely.by",
      desc: "Custom capes & skins",
      color: themeColors.purple,
    },
    {
      type: "offline" as const,
      icon: Users,
      label: "Offline",
      desc: "Play without authentication",
      color: themeColors.warn,
    },
  ];

  return (
    <div>
      <h2 className="tinycaps text-lg font-bold mb-1" style={{ color: themeColors.text_main }}>Choose Account Type</h2>
      <p className="text-xs mb-5" style={{ color: themeColors.text_muted }}>You can always add more accounts later in Settings.</p>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {options.map((opt) => (
          <motion.button
            key={opt.type}
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setAccountType(opt.type)}
            className="glass-card rounded-xl p-4 text-left transition-all cursor-pointer"
            style={{
              border: `1px solid ${accountType === opt.type ? opt.color : themeColors.border}50`,
              background: accountType === opt.type ? `${opt.color}10` : `${themeColors.bg_card2}60`,
              boxShadow: accountType === opt.type ? `0 0 20px ${opt.color}15` : "none",
            }}
          >
            <opt.icon size={20} style={{ color: opt.color }} className="mb-2" />
            <div className="tinycaps text-sm font-bold" style={{ color: themeColors.text_main }}>{opt.label}</div>
            <div className="text-[10px] mt-0.5" style={{ color: themeColors.text_muted }}>{opt.desc}</div>
            {accountType === opt.type && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-5 h-5 rounded-full flex items-center justify-center mt-2"
                style={{ background: opt.color }}
              >
                <Check size={12} color="#fff" />
              </motion.div>
            )}
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {accountType === "offline" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="pt-2">
              <label className="text-xs mb-1.5 block" style={{ color: themeColors.text_sub }}>Offline Username</label>
              <GlassInput
                value={offlineUsername}
                onChange={setOfflineUsername}
                placeholder="Enter your username"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {accountType === "microsoft" && (
        <p className="text-[11px] mt-3" style={{ color: themeColors.text_muted }}>
          You'll be redirected to Microsoft's sign-in page after setup.
        </p>
      )}
      {accountType === "elyby" && (
        <p className="text-[11px] mt-3" style={{ color: themeColors.text_muted }}>
          You'll be redirected to Ely.by's sign-in page after setup.
        </p>
      )}
    </div>
  );
}

function JavaStep({ themeColors, javaPath, javaDetected, javaVersion }: {
  themeColors: any; javaPath: string; javaDetected: boolean; javaVersion: string;
}) {
  return (
    <div>
      <h2 className="tinycaps text-lg font-bold mb-1" style={{ color: themeColors.text_main }}>Java Detection</h2>
      <p className="text-xs mb-5" style={{ color: themeColors.text_muted }}>EcLauncher needs Java to run Minecraft.</p>

      <GlassCard style={{ background: `${themeColors.bg_card2}60` }}>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: javaDetected ? `${themeColors.success}15` : `${themeColors.danger}15`,
            }}
          >
            <Cpu size={20} style={{ color: javaDetected ? themeColors.success : themeColors.danger }} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="tinycaps text-sm font-bold" style={{ color: themeColors.text_main }}>
                {javaDetected ? "Java Found" : "Java Not Found"}
              </span>
              {javaDetected && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-md tinycaps font-bold"
                  style={{ background: `${themeColors.success}15`, color: themeColors.success }}
                >
                  OK
                </span>
              )}
            </div>
            <p className="text-xs mt-0.5 font-mono" style={{ color: themeColors.text_muted }}>{javaPath}</p>
            {javaVersion && <p className="text-[10px] mt-0.5" style={{ color: themeColors.text_sub }}>{javaVersion}</p>}
          </div>
        </div>
      </GlassCard>

      <p className="text-[11px] mt-4" style={{ color: themeColors.text_muted }}>
        You can change the Java path later in Settings if needed.
      </p>
    </div>
  );
}

function RamStep({ themeColors, ramMB, setRamMB }: { themeColors: any; ramMB: number; setRamMB: (v: number) => void }) {
  const preset = [
    { label: "2 GB", value: 2048 },
    { label: "4 GB", value: 4096 },
    { label: "8 GB", value: 8192 },
  ];

  return (
    <div>
      <h2 className="tinycaps text-lg font-bold mb-1" style={{ color: themeColors.text_main }}>RAM Allocation</h2>
      <p className="text-xs mb-5" style={{ color: themeColors.text_muted }}>How much memory should Minecraft use?</p>

      <div className="flex gap-2 mb-5">
        {preset.map((p) => (
          <motion.button
            key={p.value}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setRamMB(p.value)}
            className="flex-1 py-2 rounded-xl tinycaps text-xs font-bold transition-all cursor-pointer"
            style={{
              background: ramMB === p.value
                ? `linear-gradient(135deg, ${themeColors.accent}, ${themeColors.accent2 || themeColors.accent})`
                : `${themeColors.bg_card2}80`,
              color: ramMB === p.value ? "#fff" : themeColors.text_sub,
              border: `1px solid ${ramMB === p.value ? themeColors.accent : themeColors.border}40`,
              boxShadow: ramMB === p.value ? `0 0 16px ${themeColors.accent}30` : "none",
            }}
          >
            {p.label}
          </motion.button>
        ))}
      </div>

      <GlassSlider
        value={ramMB}
        onChange={setRamMB}
        min={512}
        max={16384}
        label="Memory Allocation"
        suffix="MB"
      />

      <div className="flex items-center gap-2 mt-3 p-2.5 rounded-lg" style={{ background: `${themeColors.bg_card2}40` }}>
        <Coffee size={14} style={{ color: themeColors.text_muted }} />
        <span className="text-[11px]" style={{ color: themeColors.text_muted }}>
          {ramMB < 2048 ? "Minimum recommended is 2 GB for most modpacks." :
           ramMB <= 4096 ? "Good for vanilla and light modded play." :
           ramMB <= 8192 ? "Great for heavy modpacks and shaders." :
           "Maximum allocation — ensure you have enough free RAM."}
        </span>
      </div>
    </div>
  );
}

function ThemeStep({ themeColors, selectedTheme, setSelectedTheme }: {
  themeColors: any; selectedTheme: string; setSelectedTheme: (v: string) => void;
}) {
  return (
    <div>
      <h2 className="tinycaps text-lg font-bold mb-1" style={{ color: themeColors.text_main }}>Pick a Theme</h2>
      <p className="text-xs mb-5" style={{ color: themeColors.text_muted }}>Choose a look for your launcher. You can change this anytime.</p>

      <div className="grid grid-cols-4 gap-2.5">
        {Object.values(THEMES).map((t) => {
          const isActive = selectedTheme === t.name;
          return (
            <motion.button
              key={t.name}
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedTheme(t.name)}
              className="relative rounded-xl p-3 text-center cursor-pointer transition-all"
              style={{
                background: `${t.colors.bg_card}cc`,
                border: `2px solid ${isActive ? t.colors.accent : t.colors.border}50`,
                boxShadow: isActive ? `0 0 20px ${t.colors.accent}25, 0 0 40px ${t.colors.accent}10` : "none",
              }}
            >
              <div
                className="w-8 h-8 rounded-full mx-auto mb-2 relative overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${t.colors.accent}, ${t.colors.accent2 || t.colors.accent})`,
                  boxShadow: `0 0 12px ${t.colors.accent}40`,
                }}
              >
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.3) 50%, transparent 60%)`,
                  }}
                />
              </div>
              <span className="tinycaps text-[10px] font-bold" style={{ color: t.colors.text_main }}>
                {t.display_name}
              </span>
              {isActive && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, ${t.colors.accent}, ${t.colors.accent2 || t.colors.accent})`,
                    boxShadow: `0 0 8px ${t.colors.accent}60`,
                  }}
                >
                  <Check size={10} color="#fff" />
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function DoneStep({ themeColors }: { themeColors: any }) {
  return (
    <div className="flex flex-col items-center text-center py-6">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="mb-5"
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${themeColors.success}, ${themeColors.green})`,
            boxShadow: `0 0 40px ${themeColors.success}40`,
          }}
        >
          <Check size={32} color="#fff" strokeWidth={3} />
        </div>
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="tinycaps text-xl font-black mb-2"
        style={{ color: themeColors.text_main }}
      >
        You're All Set!
      </motion.h2>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="text-sm max-w-xs leading-relaxed"
        style={{ color: themeColors.text_sub }}
      >
        EcLauncher is configured and ready. Click below to start exploring.
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="flex items-center gap-2 mt-4"
      >
        <Sparkles size={14} style={{ color: themeColors.accent }} />
        <span className="tinycaps text-xs font-medium" style={{ color: themeColors.text_muted }}>Happy gaming!</span>
      </motion.div>
    </div>
  );
}

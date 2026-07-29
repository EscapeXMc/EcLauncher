import { useEffect, useRef, useMemo, useState } from "react";
import { useLauncherStore } from "../../stores";

export type AnimatedBgType = "none" | "rain" | "snow" | "fire" | "galaxy" | "matrix";

const ANIMATED_BGS_KEY = "ec-animated-bg";

function getStoredBg(): AnimatedBgType {
  try {
    const v = localStorage.getItem(ANIMATED_BGS_KEY);
    if (v && v !== "none") return v as AnimatedBgType;
  } catch {}
  return "none";
}

export function useAnimatedBg() {
  const [bgType, setBgType] = useState<AnimatedBgType>(getStoredBg);
  const set = (t: AnimatedBgType) => {
    setBgType(t);
    localStorage.setItem(ANIMATED_BGS_KEY, t);
  };
  return { bgType, setAnimatedBg: set };
}

function RainEffect() {
  const drops = useMemo(() =>
    Array.from({ length: 120 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 0.4 + Math.random() * 0.3,
      opacity: 0.15 + Math.random() * 0.25,
      length: 15 + Math.random() * 20,
    })), []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {drops.map((d) => (
        <div
          key={d.id}
          className="absolute"
          style={{
            left: `${d.x}%`,
            top: "-20px",
            width: "1px",
            height: `${d.length}px`,
            background: `linear-gradient(180deg, transparent, rgba(174,194,224,${d.opacity}))`,
            animation: `rainFall ${d.duration}s linear ${d.delay}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes rainFall {
          0% { transform: translateY(-20px); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function SnowEffect() {
  const flakes = useMemo(() =>
    Array.from({ length: 80 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 8,
      duration: 6 + Math.random() * 8,
      size: 2 + Math.random() * 4,
      opacity: 0.3 + Math.random() * 0.5,
      drift: -20 + Math.random() * 40,
    })), []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {flakes.map((f) => (
        <div
          key={f.id}
          className="absolute rounded-full"
          style={{
            left: `${f.x}%`,
            top: "-10px",
            width: `${f.size}px`,
            height: `${f.size}px`,
            background: `rgba(255,255,255,${f.opacity})`,
            animation: `snowFall ${f.duration}s linear ${f.delay}s infinite`,
            filter: `blur(${f.size > 4 ? 1 : 0}px)`,
          }}
        />
      ))}
      <style>{`
        @keyframes snowFall {
          0% { transform: translateY(-10px) translateX(0px) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          50% { transform: translateY(50vh) translateX(${20}px) rotate(180deg); }
          90% { opacity: 1; }
          100% { transform: translateY(100vh) translateX(${-10}px) rotate(360deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function FireEffect() {
  const embers = useMemo(() =>
    Array.from({ length: 60 }, (_, i) => ({
      id: i,
      x: 20 + Math.random() * 60,
      delay: Math.random() * 3,
      duration: 1.5 + Math.random() * 2,
      size: 2 + Math.random() * 4,
      opacity: 0.4 + Math.random() * 0.6,
    })), []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {embers.map((e) => (
        <div
          key={e.id}
          className="absolute rounded-full"
          style={{
            left: `${e.x}%`,
            bottom: "0%",
            width: `${e.size}px`,
            height: `${e.size}px`,
            background: `hsl(${20 + Math.random() * 30}, 100%, ${50 + Math.random() * 30}%)`,
            opacity: e.opacity,
            animation: `fireRise ${e.duration}s ease-out ${e.delay}s infinite`,
          }}
        />
      ))}
      <div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
        style={{ background: "linear-gradient(0deg, rgba(255,100,0,0.08) 0%, transparent 100%)" }}
      />
      <style>{`
        @keyframes fireRise {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          10% { opacity: 1; }
          50% { transform: translateY(-40vh) scale(0.5); opacity: 0.6; }
          100% { transform: translateY(-80vh) scale(0); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function GalaxyEffect() {
  const stars = useMemo(() =>
    Array.from({ length: 100 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 2,
      opacity: 0.2 + Math.random() * 0.8,
      duration: 2 + Math.random() * 4,
    })), []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {/* Nebula clouds */}
      <div className="absolute" style={{
        top: "20%", left: "30%", width: "400px", height: "400px",
        background: "radial-gradient(circle, rgba(100,50,200,0.08) 0%, transparent 70%)",
        borderRadius: "50%", filter: "blur(60px)",
        animation: "galaxySpin 40s linear infinite",
      }} />
      <div className="absolute" style={{
        top: "50%", right: "15%", width: "300px", height: "300px",
        background: "radial-gradient(circle, rgba(50,100,200,0.06) 0%, transparent 70%)",
        borderRadius: "50%", filter: "blur(50px)",
        animation: "galaxySpin 55s linear infinite reverse",
      }} />
      {stars.map((s) => (
        <div
          key={s.id}
          className="absolute rounded-full"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            background: "white",
            opacity: s.opacity,
            animation: `starTwinkle ${s.duration}s ease-in-out infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes galaxySpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes starTwinkle { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }
      `}</style>
    </div>
  );
}

function MatrixEffect() {
  const chars = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 5,
      duration: 3 + Math.random() * 4,
      opacity: 0.15 + Math.random() * 0.3,
      char: String.fromCharCode(0x30A0 + Math.floor(Math.random() * 96)),
    })), []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {chars.map((c) => (
        <div
          key={c.id}
          className="absolute font-mono text-xs"
          style={{
            left: `${c.x}%`,
            top: "-20px",
            color: `rgba(0,255,65,${c.opacity})`,
            animation: `matrixFall ${c.duration}s linear ${c.delay}s infinite`,
            textShadow: "0 0 8px rgba(0,255,65,0.5)",
          }}
        >
          {c.char}
        </div>
      ))}
      <style>{`
        @keyframes matrixFall {
          0% { transform: translateY(-20px); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export function AnimatedBackground({ type }: { type: AnimatedBgType }) {
  switch (type) {
    case "rain": return <RainEffect />;
    case "snow": return <SnowEffect />;
    case "fire": return <FireEffect />;
    case "galaxy": return <GalaxyEffect />;
    case "matrix": return <MatrixEffect />;
    default: return null;
  }
}

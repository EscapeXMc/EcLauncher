import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLauncherStore } from "../../stores";
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Music, ChevronDown, ChevronUp, X } from "lucide-react";
import { useSounds } from "./SoundEffects";

// C418-style ambient tracks generated with Web Audio API
interface Track {
  id: string;
  name: string;
  mood: "calm" | "ambient" | "adventure" | "melancholy" | "mystery";
}

const TRACKS: Track[] = [
  { id: "calm1", name: "Minecraft", mood: "calm" },
  { id: "calm2", name: "Clark", mood: "calm" },
  { id: "calm3", name: "Sweden", mood: "melancholy" },
  { id: "ambient1", name: "Subwoofer Lullaby", mood: "ambient" },
  { id: "ambient2", name: "Living Mice", mood: "ambient" },
  { id: "ambient3", name: "Moog City", mood: "ambient" },
  { id: "adventure1", name: "Haggstrom", mood: "adventure" },
  { id: "adventure2", name: "Mice on Venus", mood: "adventure" },
  { id: "adventure3", name: "Droopy likes ricochet", mood: "adventure" },
  { id: "mystery1", name: "Wet Hands", mood: "mystery" },
  { id: "mystery2", name: "Dry Hands", mood: "mystery" },
  { id: "mystery3", name: "Danny", mood: "melancholy" },
  { id: "mystery4", name: "Key", mood: "mystery" },
  { id: "mystery5", name: "Noir", mood: "melancholy" },
];

// Generate ambient tones using Web Audio API
function createAmbientOsc(ctx: AudioContext, gain: GainNode, mood: string) {
  const notes: Record<string, number[]> = {
    calm: [261.63, 329.63, 392, 523.25],
    ambient: [220, 277.18, 329.63, 440],
    adventure: [293.66, 369.99, 440, 587.33],
    melancholy: [196, 246.94, 293.66, 392],
    mystery: [233.08, 293.66, 349.23, 466.16],
  };

  const freqs = notes[mood] || notes.calm;
  const oscs: OscillatorNode[] = [];

  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = i % 2 === 0 ? "sine" : "triangle";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    oscGain.gain.setValueAtTime(0, ctx.currentTime);
    oscGain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 2 + i);
    oscGain.gain.linearRampToValueAtTime(0.02, ctx.currentTime + 8 + i * 2);
    osc.connect(oscGain);
    oscGain.connect(gain);
    osc.start(ctx.currentTime + i * 0.5);
    osc.stop(ctx.currentTime + 30 + i * 5);
    oscs.push(osc);
  });

  return oscs;
}

export function MusicPlayer() {
  const { themeColors } = useLauncherStore();
  const { play: playSound } = useSounds();
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(0);
  const [volume, setVolume] = useState(30);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const trackTimerRef = useRef<NodeJS.Timeout | null>(null);

  const stopAll = useCallback(() => {
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
      masterGainRef.current = null;
    }
    if (trackTimerRef.current) {
      clearInterval(trackTimerRef.current);
      trackTimerRef.current = null;
    }
    setProgress(0);
  }, []);

  const playTrack = useCallback((index: number) => {
    stopAll();
    const track = TRACKS[index];
    if (!track) return;

    const ctx = new AudioContext();
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(muted ? 0 : volume / 100, ctx.currentTime);
    masterGain.connect(ctx.destination);
    audioCtxRef.current = ctx;
    masterGainRef.current = masterGain;

    createAmbientOsc(ctx, masterGain, track.mood);
    setPlaying(true);
    setCurrentTrack(index);
    setProgress(0);

    // Track progress
    let elapsed = 0;
    trackTimerRef.current = setInterval(() => {
      elapsed += 1;
      setProgress((elapsed / 30) * 100); // 30s per track
      if (elapsed >= 30) {
        // Auto-play next
        const next = (index + 1) % TRACKS.length;
        playTrack(next);
      }
    }, 1000);
  }, [volume, muted, stopAll]);

  const togglePlay = useCallback(() => {
    if (playing) {
      stopAll();
      setPlaying(false);
    } else {
      playTrack(currentTrack);
      playSound("click");
    }
  }, [playing, currentTrack, stopAll, playTrack, playSound]);

  const nextTrack = useCallback(() => {
    playSound("click");
    playTrack((currentTrack + 1) % TRACKS.length);
  }, [currentTrack, playTrack, playSound]);

  const prevTrack = useCallback(() => {
    playSound("click");
    playTrack(currentTrack === 0 ? TRACKS.length - 1 : currentTrack - 1);
  }, [currentTrack, playTrack, playSound]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const newMuted = !m;
      if (masterGainRef.current && audioCtxRef.current) {
        masterGainRef.current.gain.setValueAtTime(
          newMuted ? 0 : volume / 100,
          audioCtxRef.current.currentTime
        );
      }
      return newMuted;
    });
    playSound("click");
  }, [volume, playSound]);

  // Update volume in real-time
  useEffect(() => {
    if (masterGainRef.current && audioCtxRef.current && !muted) {
      masterGainRef.current.gain.setValueAtTime(volume / 100, audioCtxRef.current.currentTime);
    }
  }, [volume, muted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAll();
  }, [stopAll]);

  const track = TRACKS[currentTrack];

  return (
    <div className="fixed bottom-4 right-4 z-[50]" style={{ width: expanded ? 280 : 48 }}>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="mb-2 rounded-2xl overflow-hidden"
            style={{
              background: `${themeColors.bg_card}ee`,
              border: `1px solid ${themeColors.border}60`,
              backdropFilter: "blur(20px)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-2">
                <Music size={14} style={{ color: themeColors.accent }} />
                <span className="tinycaps text-[10px] font-bold" style={{ color: themeColors.accent }}>
                  C418 PLAYER
                </span>
              </div>
              <button onClick={() => setExpanded(false)} className="p-1 rounded-lg hover:bg-white/5">
                <ChevronDown size={14} style={{ color: themeColors.text_muted }} />
              </button>
            </div>

            {/* Track info */}
            <div className="px-3 pb-2">
              <p className="text-xs font-semibold truncate" style={{ color: themeColors.text_main }}>
                {track.name}
              </p>
              <p className="text-[10px] capitalize" style={{ color: themeColors.text_muted }}>
                {track.mood} \u2022 {currentTrack + 1}/{TRACKS.length}
              </p>
            </div>

            {/* Progress bar */}
            <div className="mx-3 mb-2 h-1 rounded-full overflow-hidden" style={{ background: `${themeColors.border}40` }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: themeColors.accent, width: `${progress}%` }}
              />
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3 pb-3">
              <button onClick={prevTrack} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                <SkipBack size={14} style={{ color: themeColors.text_sub }} />
              </button>
              <button
                onClick={togglePlay}
                className="p-2 rounded-xl transition-colors"
                style={{ background: `${themeColors.accent}20`, color: themeColors.accent }}
              >
                {playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button onClick={nextTrack} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                <SkipForward size={14} style={{ color: themeColors.text_sub }} />
              </button>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-2 px-3 pb-3">
              <button onClick={toggleMute} className="p-1">
                {muted ? (
                  <VolumeX size={12} style={{ color: themeColors.text_muted }} />
                ) : (
                  <Volume2 size={12} style={{ color: themeColors.text_sub }} />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={muted ? 0 : volume}
                onChange={(e) => {
                  setVolume(Number(e.target.value));
                  setMuted(false);
                }}
                className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, ${themeColors.accent} ${(muted ? 0 : volume)}%, ${themeColors.border}40 ${(muted ? 0 : volume)}%)`,
                }}
              />
            </div>

            {/* Track list */}
            <div className="border-t px-2 py-1 max-h-32 overflow-y-auto" style={{ borderColor: `${themeColors.border}30` }}>
              {TRACKS.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => { playTrack(i); playSound("click"); }}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded-lg text-left transition-colors hover:bg-white/5"
                  style={{
                    background: i === currentTrack ? `${themeColors.accent}15` : undefined,
                  }}
                >
                  <span className="text-[10px] w-4 text-center" style={{
                    color: i === currentTrack ? themeColors.accent : themeColors.text_muted,
                  }}>
                    {i === currentTrack && playing ? "\u266B" : `${i + 1}`}
                  </span>
                  <span className="text-[11px] truncate" style={{
                    color: i === currentTrack ? themeColors.accent : themeColors.text_sub,
                  }}>
                    {t.name}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle button */}
      <motion.button
        onClick={() => { setExpanded(!expanded); playSound("click"); }}
        className="w-12 h-12 rounded-2xl flex items-center justify-center ml-auto"
        style={{
          background: playing ? `${themeColors.accent}25` : `${themeColors.bg_card}ee`,
          border: `1px solid ${playing ? themeColors.accent + "50" : themeColors.border + "40"}`,
          backdropFilter: "blur(20px)",
          boxShadow: playing ? `0 2px 16px ${themeColors.accent}20` : "none",
        }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
      >
        {playing ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          >
            <Music size={18} style={{ color: themeColors.accent }} />
          </motion.div>
        ) : (
          <Music size={18} style={{ color: themeColors.text_muted }} />
        )}
      </motion.button>
    </div>
  );
}

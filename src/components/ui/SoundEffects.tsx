import { useCallback, useRef } from "react";

// Generate sounds using Web Audio API (no external files needed)
let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function playTone(frequency: number, duration: number, type: OscillatorType = "sine", volume = 0.15) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {}
}

function playClick() {
  playTone(800, 0.06, "sine", 0.12);
  setTimeout(() => playTone(1000, 0.04, "sine", 0.08), 20);
}

function playSuccess() {
  playTone(523, 0.12, "sine", 0.15);
  setTimeout(() => playTone(659, 0.12, "sine", 0.15), 80);
  setTimeout(() => playTone(784, 0.15, "sine", 0.15), 160);
}

function playError() {
  playTone(300, 0.15, "square", 0.1);
  setTimeout(() => playTone(200, 0.2, "square", 0.08), 100);
}

function playNotepad() {
  const notes = [523, 587, 659, 698, 784, 880, 988, 1047];
  const note = notes[Math.floor(Math.random() * notes.length)];
  playTone(note, 0.2, "sine", 0.12);
}

function playWhoosh() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
}

function playPop() {
  playTone(600, 0.05, "sine", 0.2);
}

function playLevelUp() {
  const melody = [523, 659, 784, 1047];
  melody.forEach((f, i) => {
    setTimeout(() => playTone(f, 0.15, "sine", 0.12), i * 100);
  });
}

function playNoteBlock() {
  const notes = [
    262, 294, 330, 349, 392, 440, 494, 523,
    587, 659, 698, 784, 880, 988, 1047,
  ];
  const note = notes[Math.floor(Math.random() * notes.length)];
  playTone(note, 0.3, "triangle", 0.15);
}

export type SoundType = "click" | "success" | "error" | "notepad" | "whoosh" | "pop" | "levelup" | "noteblock";

const sounds: Record<SoundType, () => void> = {
  click: playClick,
  success: playSuccess,
  error: playError,
  notepad: playNotepad,
  whoosh: playWhoosh,
  pop: playPop,
  levelup: playLevelUp,
  noteblock: playNoteBlock,
};

export function useSounds() {
  const enabled = useRef(true);

  const play = useCallback((type: SoundType) => {
    if (!enabled.current) return;
    sounds[type]();
  }, []);

  const toggle = useCallback(() => {
    enabled.current = !enabled.current;
    return enabled.current;
  }, []);

  return { play, toggle, isEnabled: () => enabled.current };
}

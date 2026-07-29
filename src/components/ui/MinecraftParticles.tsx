import { useCallback, useRef, useEffect } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: "heart" | "xp" | "firework" | "note" | "dust" | "crit";
}

const PARTICLE_COLORS = {
  heart: ["#ff4466", "#ff6688", "#ff3355"],
  xp: ["#80ff00", "#99ff33", "#66cc00"],
  firework: ["#ff0000", "#ff8800", "#ffff00", "#00ff00", "#0088ff", "#ff00ff"],
  note: ["#00ff00", "#00cc44", "#33ff66"],
  dust: ["#ffffff", "#cccccc", "#999999"],
  crit: ["#ffff44", "#ffcc00", "#ffaa00"],
};

let particleCanvas: HTMLCanvasElement | null = null;
let particleCtx: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let animFrame = 0;

function ensureCanvas() {
  if (particleCanvas) return;
  particleCanvas = document.createElement("canvas");
  particleCanvas.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:9998;";
  document.body.appendChild(particleCanvas);
  particleCtx = particleCanvas.getContext("2d");
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  animate();
}

function resizeCanvas() {
  if (!particleCanvas) return;
  particleCanvas.width = window.innerWidth;
  particleCanvas.height = window.innerHeight;
}

function animate() {
  if (!particleCtx || !particleCanvas) return;
  particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life--;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.05; // gravity
    p.vx *= 0.99;

    const alpha = Math.max(0, p.life / p.maxLife);
    particleCtx.globalAlpha = alpha;

    if (p.type === "heart") {
      drawHeart(particleCtx, p.x, p.y, p.size, p.color);
    } else if (p.type === "note") {
      drawNote(particleCtx, p.x, p.y, p.size, p.color);
    } else {
      particleCtx.fillStyle = p.color;
      particleCtx.beginPath();
      particleCtx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      particleCtx.fill();
    }

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }

  particleCtx.globalAlpha = 1;
  animFrame = requestAnimationFrame(animate);
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  const s = size * 0.6;
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y - s * 0.3, x - s, y - s * 0.3, x - s, y + s * 0.1);
  ctx.bezierCurveTo(x - s, y + s * 0.6, x, y + s, x, y + s);
  ctx.bezierCurveTo(x, y + s, x + s, y + s * 0.6, x + s, y + s * 0.1);
  ctx.bezierCurveTo(x + s, y - s * 0.3, x, y - s * 0.3, x, y + s * 0.3);
  ctx.fill();
}

function drawNote(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.fillStyle = color;
  ctx.font = `${size * 2}px serif`;
  ctx.fillText("\u266A", x - size * 0.5, y + size * 0.5);
}

function spawnParticles(x: number, y: number, type: Particle["type"], count: number) {
  ensureCanvas();
  const colors = PARTICLE_COLORS[type];
  for (let i = 0; i < count; i++) {
    particles.push({
      x,
      y,
      vx: -2 + Math.random() * 4,
      vy: -3 + Math.random() * -2,
      life: 30 + Math.random() * 30,
      maxLife: 60,
      size: 2 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      type,
    });
  }
}

export function useParticles() {
  const lastClick = useRef(0);

  const burst = useCallback((e: React.MouseEvent, type: Particle["type"] = "dust", count = 8) => {
    spawnParticles(e.clientX, e.clientY, type, count);
  }, []);

  const hoverBurst = useCallback((e: React.MouseEvent, type: Particle["type"] = "dust", count = 3) => {
    const now = Date.now();
    if (now - lastClick.current < 100) return; // throttle
    lastClick.current = now;
    spawnParticles(e.clientX, e.clientY, type, count);
  }, []);

  return { burst, hoverBurst };
}

export function MinecraftParticles() {
  useEffect(() => {
    return () => {
      if (particleCanvas) {
        cancelAnimationFrame(animFrame);
        particleCanvas.remove();
        particleCanvas = null;
        particleCtx = null;
        particles = [];
      }
    };
  }, []);
  return null;
}

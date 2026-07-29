import { useState, forwardRef } from "react";
import { useLauncherStore } from "../../stores";

interface GlassInputProps {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  type?: string;
  className?: string;
  disabled?: boolean;
}

export const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(
  ({ value, onChange, onKeyDown, placeholder, type = "text", className = "", disabled = false }, ref) => {
    const { themeColors } = useLauncherStore();
    return (
      <input
        ref={ref}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={`tinycaps w-full px-3 py-2.5 rounded-xl text-[12px] outline-none transition-all duration-200 ${disabled ? "opacity-40 cursor-not-allowed" : ""} ${className}`}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: `1px solid rgba(255,255,255,0.06)`,
          color: themeColors.text_main,
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = `${themeColors.accent}60`; e.currentTarget.style.boxShadow = `0 0 16px ${themeColors.accent}15`; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.boxShadow = "none"; }}
      />
    );
  }
);
GlassInput.displayName = "GlassInput";

interface GlassSelectProps {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}

export function GlassSelect({ value, onChange, options, className = "" }: GlassSelectProps) {
  const { themeColors } = useLauncherStore();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`tinycaps w-full px-3 py-2.5 rounded-xl text-[12px] outline-none cursor-pointer transition-all duration-200 ${className}`}
      style={{
        background: "rgba(255,255,255,0.04)",
        border: `1px solid rgba(255,255,255,0.06)`,
        color: themeColors.text_main,
        backdropFilter: "blur(12px)",
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} style={{ background: themeColors.bg_card2 }}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

interface GlassToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}

export function GlassToggle({ checked, onChange, label }: GlassToggleProps) {
  const { themeColors } = useLauncherStore();
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative w-10 h-5 rounded-full transition-all duration-300"
        style={{
          background: checked
            ? `linear-gradient(135deg, ${themeColors.accent}, ${themeColors.accent2 || themeColors.accent})`
            : "rgba(255,255,255,0.08)",
          boxShadow: checked ? `0 0 16px ${themeColors.accent_glow}50` : "none",
        }}
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full transition-all duration-300"
          style={{
            background: "#fff",
            transform: checked ? "translateX(22px)" : "translateX(2px)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
          }}
        />
      </button>
      {label && <span className="tinycaps text-[12px] font-medium" style={{ color: themeColors.text_sub }}>{label}</span>}
    </label>
  );
}

interface GlassSliderProps {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  label?: string;
  suffix?: string;
}

export function GlassSlider({ value, onChange, min, max, label, suffix = "MB" }: GlassSliderProps) {
  const { themeColors } = useLauncherStore();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-1.5">
      {(label || suffix) && (
        <div className="flex justify-between text-[11px]">
          <span className="tinycaps font-medium" style={{ color: themeColors.text_muted }}>{label}</span>
          <span className="tinycaps font-bold" style={{ color: themeColors.accent }}>{value} {suffix}</span>
        </div>
      )}
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${themeColors.accent} ${pct}%, rgba(255,255,255,0.06) ${pct}%)`,
          accentColor: themeColors.accent,
        }}
      />
    </div>
  );
}

export function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const { themeColors } = useLauncherStore();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between tinycaps text-[12px] font-bold transition-all duration-200"
        style={{ background: "transparent", color: themeColors.text_main }}>
        <span>{title}</span>
        <span className="transition-transform duration-300" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", color: themeColors.text_muted }}>
          ▼
        </span>
      </button>
      {open && (
        <div className="px-4 py-4 space-y-4" style={{ borderTop: `1px solid rgba(255,255,255,0.04)` }}>
          {children}
        </div>
      )}
    </div>
  );
}

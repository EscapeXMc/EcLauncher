import { useState, useRef, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLauncherStore } from "../../stores";
import { ExternalLink } from "lucide-react";

interface HoverPreviewProps {
  children: ReactNode;
  title: string;
  description?: string;
  version?: string;
  author?: string;
  downloads?: string;
  tags?: string[];
  imageUrl?: string;
  link?: string;
  delay?: number;
}

export function HoverPreview({ children, title, description, version, author, downloads, tags, imageUrl, link, delay = 500 }: HoverPreviewProps) {
  const { themeColors } = useLauncherStore();
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const posRef = useRef<"right" | "left">("right");

  const handleEnter = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    posRef.current = rect.right > window.innerWidth * 0.7 ? "left" : "right";
    timer.current = setTimeout(() => setShow(true), delay);
  };
  const handleLeave = () => {
    if (timer.current) clearTimeout(timer.current);
    setShow(false);
  };

  const posClass = posRef.current === "right" ? "left-full ml-2" : "right-full mr-2";

  return (
    <div className="relative inline-flex" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-50 pointer-events-none ${posClass}`}
            style={{ top: "50%", transform: "translateY(-50%)", width: "260px" }}
          >
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: themeColors.bg_glass,
                border: `1px solid ${themeColors.border}`,
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                boxShadow: `0 12px 48px rgba(0,0,0,0.5)`,
              }}
            >
              {imageUrl && (
                <div className="h-20 w-full overflow-hidden" style={{ background: themeColors.bg_card }}>
                  <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-3">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <p className="text-[11px] tinycaps font-bold leading-tight" style={{ color: themeColors.text_main }}>{title}</p>
                  {link && (
                    <ExternalLink size={10} className="shrink-0 mt-0.5" style={{ color: themeColors.text_muted }} />
                  )}
                </div>
                {author && (
                  <p className="text-[9px] mb-1" style={{ color: themeColors.text_sub }}>by {author}</p>
                )}
                {description && (
                  <p className="text-[9px] leading-relaxed mb-2 line-clamp-2" style={{ color: themeColors.text_muted }}>
                    {description.length > 120 ? description.slice(0, 120) + "..." : description}
                  </p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {version && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded-md font-bold" style={{ background: `${themeColors.accent}20`, color: themeColors.accent }}>
                      v{version}
                    </span>
                  )}
                  {downloads && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded-md font-bold" style={{ background: `${themeColors.green}20`, color: themeColors.green }}>
                      {downloads}
                    </span>
                  )}
                  {tags?.slice(0, 3).map((tag) => (
                    <span key={tag} className="text-[8px] px-1.5 py-0.5 rounded-md font-bold" style={{ background: `${themeColors.purple}15`, color: themeColors.text_muted }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

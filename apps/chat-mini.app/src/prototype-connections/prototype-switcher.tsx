// PROTOTYPE — throwaway floating variant switcher. Hidden in production builds.
import { useEffect } from "react";

export interface VariantDef {
  key: string;
  name: string;
}

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: {
  variants: VariantDef[];
  current: string;
  onChange: (key: string) => void;
}) {
  const idx = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );
  const cur = variants[idx];

  useEffect(() => {
    const go = (d: number) => {
      const next = variants[(idx + d + variants.length) % variants.length];
      if (next) onChange(next.key);
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, variants, onChange]);

  if (import.meta.env.PROD || !cur) return null;

  const go = (d: number) => {
    const next = variants[(idx + d + variants.length) % variants.length];
    if (next) onChange(next.key);
  };

  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-zinc-900 px-2 py-1.5 text-zinc-100 shadow-xl">
      <button
        type="button"
        onClick={() => go(-1)}
        className="flex size-7 items-center justify-center rounded-full hover:bg-white/10"
        aria-label="Previous variant"
      >
        ←
      </button>
      <span className="min-w-[180px] px-2 text-center text-sm font-medium">
        {cur.key} — {cur.name}
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        className="flex size-7 items-center justify-center rounded-full hover:bg-white/10"
        aria-label="Next variant"
      >
        →
      </button>
    </div>
  );
}

import type { ReactNode } from "react";

/** The small uppercase heading a zone panel shows when its tab strip is hidden. */
export function ZoneTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pt-3 pb-1">
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {children}
      </span>
      {action}
    </div>
  );
}

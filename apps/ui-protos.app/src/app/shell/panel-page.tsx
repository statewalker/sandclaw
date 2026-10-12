import type { ReactNode } from "react";

/** A page-shaped prototype (a card of limited width) inside a dock panel: centered, scrolling. */
export function PanelPage({ children }: { children: ReactNode }) {
  return <div className="grid min-h-full content-start justify-items-center p-4">{children}</div>;
}

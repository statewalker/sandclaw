import { type ReactNode, useEffect, useState } from "react";

/**
 * Render `children` only after the island has mounted on the client.
 *
 * The interactive views embed components that call React's `useId`
 * (base-ui's ScrollArea, react-resizable-panels). Under islands SSR the
 * server renders them deep in the document tree while the client hydrates
 * the island in isolation, so the `useId` counters diverge and React warns
 * about a hydration mismatch. Gating the body keeps SSR and the first client
 * render identical (just `fallback`), then mounts the real tree client-side —
 * acceptable here since the whole view is interactive anyway.
 */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{mounted ? children : fallback}</>;
}

import { createClient } from "honox/client";

// honox's client types are hono/jsx-flavored (`Node`); we hydrate with React,
// so the element/root are React's. The casts bridge the two type worlds —
// runtime behaviour is the standard React hydration recommended by HonoX.
createClient({
  hydrate: async (elem, root) => {
    const { hydrateRoot } = await import("react-dom/client");
    // biome-ignore lint/suspicious/noExplicitAny: bridge hono/jsx Node -> React
    hydrateRoot(root, elem as any);
  },
  createElement: async (type, props) => {
    const { createElement } = await import("react");
    // biome-ignore lint/suspicious/noExplicitAny: honox passes opaque island types
    return createElement(type as any, props) as any;
  },
});

/**
 * Where the page finds the local proxy (D4): its address and key, kept in
 * this browser. An old pairing link (`#localUrl=…&t=…`, printed by
 * `local/serve.mjs` and the proxy) fills them in, and is then cleared from
 * the address bar so the key does not stay on screen or in the history.
 */

export interface ProxySettings {
  url: string;
  /** `""`: the proxy was started without `--key`. */
  key: string;
}

export const DEFAULT_PROXY: ProxySettings = { url: "http://127.0.0.1:9090", key: "" };

const KEY = "peershare:proxy";

interface Page {
  localStorage: Pick<Storage, "getItem" | "setItem">;
  location: Pick<Location, "pathname" | "search" | "hash">;
  history: Pick<History, "replaceState">;
}

export function loadProxySettings(win: Page): ProxySettings {
  const fragment = new URLSearchParams(win.location.hash.slice(1));
  const url = fragment.get("localUrl");
  if (url != null) {
    const linked = { url, key: fragment.get("t") ?? "" };
    saveProxySettings(win, linked);
    win.history.replaceState(null, "", win.location.pathname + win.location.search);
    return linked;
  }
  try {
    const stored = JSON.parse(win.localStorage.getItem(KEY) ?? "null");
    if (typeof stored?.url === "string" && typeof stored?.key === "string") {
      return { url: stored.url, key: stored.key };
    }
  } catch {
    // A value this page did not write: the default.
  }
  return DEFAULT_PROXY;
}

export function saveProxySettings(win: Pick<Page, "localStorage">, s: ProxySettings): void {
  win.localStorage.setItem(KEY, JSON.stringify(s));
}

/**
 * Safari blocks a secure page's requests to `http://127.0.0.1` (mixed
 * content, with no exception for loopback), so the proxy cannot be reached
 * from it (D5). Chromium and Firefox allow loopback.
 */
export function proxySupported(userAgent: string): boolean {
  return !/^((?!chrome|chromium|android|crios|fxios|firefox).)*safari/i.test(userAgent);
}

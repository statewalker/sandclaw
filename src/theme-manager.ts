/**
 * Theme manager — light / dark / system, persisted to localStorage and
 * applied as the `.dark` class on `document.documentElement` (the
 * convention the app's Tailwind v4 `@custom-variant dark` expects).
 *
 * `system` mode follows the OS preference via `matchMedia`. The
 * preference is reapplied live when the OS toggles.
 *
 * Implementation: module-level pub-sub. `applyInitialTheme()` runs
 * before React mounts (called from `bootShell`) to avoid the
 * light-then-dark flash on cold loads.
 */
export type ThemeChoice = "light" | "dark" | "system";

const STORAGE_KEY = "app-shell:theme";
const DEFAULT_CHOICE: ThemeChoice = "system";

const listeners = new Set<(choice: ThemeChoice) => void>();
let currentChoice: ThemeChoice = DEFAULT_CHOICE;
let mediaQuery: MediaQueryList | null = null;
let mediaListener: ((e: MediaQueryListEvent) => void) | null = null;

function readStoredChoice(): ThemeChoice {
  if (typeof localStorage === "undefined") return DEFAULT_CHOICE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // Storage may be disabled (private mode, ITP). Fall through.
  }
  return DEFAULT_CHOICE;
}

function writeStoredChoice(choice: ThemeChoice): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Storage may be disabled — non-fatal.
  }
}

function applyClass(effective: "light" | "dark"): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (effective === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

function resolveEffective(choice: ThemeChoice): "light" | "dark" {
  if (choice === "system") {
    if (typeof window === "undefined" || !window.matchMedia) return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return choice;
}

function attachSystemListener(): void {
  if (typeof window === "undefined" || !window.matchMedia) return;
  detachSystemListener();
  mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaListener = () => {
    if (currentChoice === "system") applyClass(resolveEffective("system"));
  };
  mediaQuery.addEventListener("change", mediaListener);
}

function detachSystemListener(): void {
  if (mediaQuery && mediaListener) {
    mediaQuery.removeEventListener("change", mediaListener);
  }
  mediaQuery = null;
  mediaListener = null;
}

/** Read the stored choice and apply it. Called sync from bootShell. */
export function applyInitialTheme(): void {
  currentChoice = readStoredChoice();
  applyClass(resolveEffective(currentChoice));
  if (currentChoice === "system") attachSystemListener();
}

export function getThemeChoice(): ThemeChoice {
  return currentChoice;
}

export function setThemeChoice(choice: ThemeChoice): void {
  if (currentChoice === choice) return;
  currentChoice = choice;
  writeStoredChoice(choice);
  applyClass(resolveEffective(choice));
  if (choice === "system") attachSystemListener();
  else detachSystemListener();
  for (const fn of listeners) fn(choice);
}

export function subscribeTheme(
  listener: (choice: ThemeChoice) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

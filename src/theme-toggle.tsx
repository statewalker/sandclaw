import { Button } from "@statewalker/shadcn-react";
import { Monitor, Moon, Sun } from "lucide-react";
import { type ReactElement, useSyncExternalStore } from "react";
import {
  getThemeChoice,
  setThemeChoice,
  subscribeTheme,
  type ThemeChoice,
} from "./theme-manager.js";

const ORDER: readonly ThemeChoice[] = ["light", "dark", "system"];
const LABELS: Record<ThemeChoice, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};
const ICONS: Record<ThemeChoice, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/**
 * Trailing-header theme toggle. Cycles light → dark → system → light,
 * persisting the choice via `theme-manager`. Icon + tooltip reflect the
 * current choice so the user can tell what they're toggling away from.
 */
export function ThemeToggle(): ReactElement {
  const choice = useSyncExternalStore(
    subscribeTheme,
    getThemeChoice,
    getThemeChoice,
  );
  const Icon = ICONS[choice];
  const label = LABELS[choice];

  function cycle(): void {
    const i = ORDER.indexOf(choice);
    const next = ORDER[(i + 1) % ORDER.length] ?? "system";
    setThemeChoice(next);
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label={`Theme: ${label}. Click to cycle.`}
      title={`Theme: ${label}`}
      onClick={cycle}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from "@statewalker/ui.view.shadcn";
import { useState } from "react";

export type Theme = "light" | "dark" | "system";
export type TextSize = "small" | "default" | "large";
export type Density = "comfortable" | "compact";

export interface AppearanceValue {
  theme: Theme;
  textSize: TextSize;
  density: Density;
}

const textClass: Record<TextSize, string> = {
  small: "text-xs",
  default: "text-sm",
  large: "text-base",
};

function Choice<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <legend className="float-left text-sm">{legend}</legend>
      <div className="bg-secondary flex rounded-md p-0.5">
        {options.map(([v, label]) => (
          <label
            key={v}
            className={cn(
              "cursor-pointer rounded px-2 py-1 text-xs has-[:focus-visible]:ring-2",
              value === v ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            <input
              type="radio"
              name={`appearance-${legend}`}
              className="sr-only"
              checked={value === v}
              onChange={() => onChange(v)}
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Theme, text size and density for this browser, with a sample that follows them. */
export function Appearance({
  value: initial = { theme: "system", textSize: "default", density: "comfortable" },
}: {
  value?: AppearanceValue;
}) {
  const [value, setValue] = useState(initial);
  const set = (patch: Partial<AppearanceValue>) => setValue({ ...value, ...patch });
  const systemDark =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const dark = value.theme === "dark" || (value.theme === "system" && systemDark);
  const gap = value.density === "compact" ? "gap-1 p-2" : "gap-2 p-4";

  return (
    <Card className="w-full max-w-2xl gap-4">
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          How Sandclaw looks in this browser. Your other devices keep their own.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Choice
          legend="Theme"
          value={value.theme}
          options={[
            ["light", "Light"],
            ["dark", "Dark"],
            ["system", "Same as this device"],
          ]}
          onChange={(theme) => set({ theme })}
        />
        <Choice
          legend="Text size"
          value={value.textSize}
          options={[
            ["small", "Small"],
            ["default", "Default"],
            ["large", "Large"],
          ]}
          onChange={(textSize) => set({ textSize })}
        />
        <Choice
          legend="Density"
          value={value.density}
          options={[
            ["comfortable", "Comfortable"],
            ["compact", "Compact"],
          ]}
          onChange={(density) => set({ density })}
        />
        <section
          aria-label="Preview"
          className={cn(
            "bg-background text-foreground grid rounded-md border",
            dark && "dark",
            gap,
            textClass[value.textSize],
          )}
        >
          <p className="font-medium">Offer — Dupont &amp; Fils</p>
          <p className="text-muted-foreground">
            The assistant found 3 invoices from Bois Lyonnais in Finance/2026-Q3.
          </p>
        </section>
      </CardContent>
    </Card>
  );
}

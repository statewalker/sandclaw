import { useBoundProp } from "@statewalker/render.view.react";
import { Button, cn, Input, Label } from "@statewalker/ui.view.shadcn";
import { Eye, EyeOff } from "lucide-react";
import { type ReactElement, useState } from "react";

interface FieldInputProps {
  props: {
    label?: string | null;
    name: string;
    type?: "text" | "password" | null;
    placeholder?: string | null;
    value?: string | null;
  };
  bindings?: {
    value?: string;
  };
}

/**
 * Catalog `FieldInput` primitive. Used instead of stock shadcn `Input` for the
 * connection form fields so each input is isolated from browser autofill
 * cross-pollution and the API-key field can reveal its value on demand.
 *
 * Setting `autoComplete` explicitly is the reliable opt-out: stock `Input` lets
 * the browser cross-populate sibling credential fields; `data-1p-ignore` /
 * `data-lpignore` discourage password managers from treating the Settings form
 * as a capture target.
 */
export function FieldInput({ props, bindings }: FieldInputProps): ReactElement {
  const [showSecret, setShowSecret] = useState(false);
  const [boundValue, setBoundValue] = useBoundProp(props.value ?? "", bindings?.value);
  const isPassword = props.type === "password";
  const inputType = isPassword && !showSecret ? "password" : "text";
  return (
    <div className="space-y-2">
      {props.label ? <Label htmlFor={props.name}>{props.label}</Label> : null}
      <div className="relative">
        <Input
          id={props.name}
          name={props.name}
          type={inputType}
          placeholder={props.placeholder ?? ""}
          value={boundValue ?? ""}
          onChange={(e) => setBoundValue(e.target.value)}
          autoComplete={isPassword ? "new-password" : "off"}
          data-1p-ignore="true"
          data-lpignore="true"
          className={cn(isPassword && "pr-9")}
        />
        {isPassword ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={showSecret ? "Hide value" : "Show value"}
            className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2"
            onClick={() => setShowSecret(!showSecret)}
          >
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

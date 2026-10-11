import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@statewalker/ui.view.shadcn";
import { Eye, EyeOff } from "lucide-react";
import { type ReactNode, useId } from "react";
import { applyPreset, S3_PRESETS, type S3Form, type S3PresetId } from "./mount-config.js";

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children(id: string): ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        className="size-4 accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}

export function S3Fields({
  form,
  errors,
  editing,
  showSecret,
  onShowSecret,
  onChange,
  onKeyEdited,
}: {
  form: S3Form;
  errors: Partial<Record<string, string>>;
  editing: boolean;
  showSecret: boolean;
  onShowSecret(show: boolean): void;
  onChange(patch: Partial<S3Form>): void;
  onKeyEdited(): void;
}) {
  const text = (label: string, field: keyof S3Form, placeholder?: string) => (
    <Field label={label} error={errors[field]}>
      {(id) => (
        <Input
          id={id}
          value={String(form[field])}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => onChange({ [field]: e.target.value })}
        />
      )}
    </Field>
  );
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      {text("Name", "name")}
      <Field label="Key" error={errors.key}>
        {(id) => (
          <Input
            id={id}
            value={form.key}
            spellCheck={false}
            onChange={(e) => {
              onKeyEdited();
              onChange({ key: e.target.value });
            }}
          />
        )}
      </Field>
      <Field label="Provider">
        {(id) => (
          <Select
            value={form.preset}
            onValueChange={(preset) => onChange(applyPreset(form, preset as S3PresetId))}
          >
            <SelectTrigger id={id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {S3_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      {text("Region", "region")}
      <div className="sm:col-span-2">{text("Endpoint", "endpoint", "https://")}</div>
      {text("Bucket", "bucket")}
      {text("Prefix", "prefix", "optional, like team/files/")}
      {text("Access key ID", "accessKeyId")}
      <Field label="Secret access key" error={errors.secretAccessKey}>
        {(id) => (
          <div className="flex gap-1">
            <Input
              id={id}
              type={showSecret ? "text" : "password"}
              value={form.secretAccessKey}
              spellCheck={false}
              onChange={(e) => onChange({ secretAccessKey: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={showSecret ? "Hide the secret" : "Show the secret"}
              onClick={() => onShowSecret(!showSecret)}
            >
              {showSecret ? <EyeOff /> : <Eye />}
            </Button>
          </div>
        )}
      </Field>
      {editing ? (
        <p className="text-muted-foreground text-xs sm:col-span-2">
          Leave both keys empty to keep the saved ones.
        </p>
      ) : null}
      <CheckboxField
        label="Path-style addressing"
        checked={form.pathStyle}
        onChange={(pathStyle) => onChange({ pathStyle })}
      />
      <CheckboxField
        label="Read-only"
        checked={form.readOnly}
        onChange={(readOnly) => onChange({ readOnly })}
      />
    </div>
  );
}

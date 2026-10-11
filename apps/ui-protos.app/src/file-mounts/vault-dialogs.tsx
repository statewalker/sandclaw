import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@statewalker/ui.view.shadcn";
import { type FormEvent, useId, useState } from "react";
import { type MockVault, passwordProblem } from "./mock-vault.js";

export type VaultMode = "create" | "unlock" | "change";

const TEXT: Record<VaultMode, { title: string; description: string; action: string }> = {
  create: {
    title: "Protect your keys with a password",
    description:
      "S3 keys are saved encrypted with this password. It can't be recovered: without it, the keys have to be entered again.",
    action: "Create",
  },
  unlock: {
    title: "Unlock your keys",
    description: "Enter the password to use the S3 storages.",
    action: "Unlock",
  },
  change: {
    title: "Change the password",
    description: "The saved keys stay; only the password that protects them changes.",
    action: "Change",
  },
};

function Field({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
      />
    </div>
  );
}

export function VaultDialog({
  vault,
  mode,
  onDone,
  onCancel,
}: {
  vault: MockVault;
  mode: VaultMode;
  onDone(): void;
  onCancel(): void;
}) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string>();
  const rememberId = useId();
  const text = TEXT[mode];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === "unlock") {
      if (!vault.unlock(password, remember)) return setError("Wrong password.");
      return onDone();
    }
    const problem = passwordProblem(password, repeat);
    if (problem) return setError(problem);
    if (mode === "create") vault.create(password, remember);
    else if (!vault.changePassword(current, password)) return setError("Wrong password.");
    onDone();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{text.title}</DialogTitle>
          <DialogDescription>{text.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid min-w-0 gap-4 text-sm">
          {mode === "change" ? (
            <Field label="Current password" value={current} onChange={setCurrent} autoFocus />
          ) : null}
          <Field
            label={mode === "change" ? "New password" : "Password"}
            value={password}
            onChange={setPassword}
            autoFocus={mode !== "change"}
          />
          {mode !== "unlock" ? (
            <Field
              label={mode === "change" ? "Repeat the new password" : "Repeat the password"}
              value={repeat}
              onChange={setRepeat}
            />
          ) : null}
          {mode !== "change" ? (
            <div className="flex items-center gap-2">
              <input
                id={rememberId}
                type="checkbox"
                className="size-4 accent-primary"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <Label htmlFor={rememberId}>Remember on this browser</Label>
            </div>
          ) : null}
          {error ? <p className="text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">{text.action}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

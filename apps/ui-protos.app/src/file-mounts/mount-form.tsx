import { Button, Card, Input } from "@statewalker/ui.view.shadcn";
import { Cloud, FolderOpen, HardDrive, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Problem } from "../file-panels/problem.js";
import { ConnectionReportView } from "./connection-report.js";
import { type ConnectionReport, runConnectionTest, type S3Probe } from "./connection-test.js";
import type { MockVault } from "./mock-vault.js";
import {
  keyFromName,
  type MountConfig,
  type MountTypeId,
  normalizeEndpoint,
  normalizePrefix,
  type S3Form,
  type S3PresetId,
  validateS3Form,
} from "./mount-config.js";
import { Field, S3Fields } from "./s3-fields.js";
import type { CheckId } from "./s3-problems.js";
import { VaultDialog, type VaultMode } from "./vault-dialogs.js";

export interface MountFormProps {
  /** The storage being edited; absent for a new one. */
  initial?: MountConfig & { form?: S3Form };
  takenKeys: string[];
  probe(form: S3Form): S3Probe;
  origin: string;
  vault: MockVault;
  /** `problem`: the failed test's reason, when saved through Save anyway. */
  onSave(config: MountConfig, form?: S3Form, problem?: Problem): void;
  onCancel(): void;
  /** Whether this browser can open local folders; detected by default. */
  localFoldersAvailable?: boolean;
  /** A new storage of this type: skips the type chooser. */
  type?: MountTypeId;
  /** A new S3 storage's form, already filled in. */
  draft?: S3Form;
  /** Runs Test connection as soon as the form opens. */
  testOnOpen?: boolean;
}

export const TYPE_ICONS: Record<MountTypeId, LucideIcon> = {
  "local-folder": FolderOpen,
  opfs: HardDrive,
  s3: Cloud,
  memory: HardDrive,
};

const NO_LOCAL_FOLDERS = "This browser can't open local folders; use Chrome or Edge.";

/** The S3 form of a saved config. Keys are never shown back: empty fields keep the saved ones. */
export function s3FormOf(config: MountConfig): S3Form {
  const c = config.config;
  return {
    name: config.name,
    key: config.key,
    preset: (c.preset as S3PresetId) ?? "other",
    endpoint: c.endpoint ?? "",
    region: c.region ?? "",
    bucket: c.bucket ?? "",
    prefix: c.prefix ?? "",
    accessKeyId: "",
    secretAccessKey: "",
    pathStyle: c.pathStyle === "true",
    readOnly: Boolean(config.readOnly),
  };
}

const EMPTY_S3: S3Form = {
  ...s3FormOf({ key: "", name: "", type: "s3", config: {} }),
  pathStyle: true,
};

function TypeChooser({
  localFoldersAvailable,
  onChoose,
}: {
  localFoldersAvailable: boolean;
  onChoose(type: MountTypeId): void;
}) {
  const choices: [MountTypeId, string, string][] = [
    [
      "local-folder",
      "Local folder",
      localFoldersAvailable ? "A folder on this computer." : NO_LOCAL_FOLDERS,
    ],
    ["opfs", "Browser storage", "Kept inside this browser, on this device only."],
    ["s3", "S3", "A bucket on Amazon, Cloudflare R2, MinIO, Backblaze B2, Wasabi or similar."],
  ];
  return (
    <div className="grid gap-2">
      {choices.map(([type, title, text]) => {
        const Icon = TYPE_ICONS[type];
        return (
          <Button
            key={type}
            type="button"
            variant="outline"
            className="h-auto justify-start whitespace-normal p-3 text-left"
            disabled={type === "local-folder" && !localFoldersAvailable}
            onClick={() => onChoose(type)}
          >
            <Icon aria-hidden className="size-5 shrink-0" />
            <span className="grid gap-0.5">
              <span className="font-medium">{title}</span>
              <span className="font-normal text-muted-foreground text-xs">{text}</span>
            </span>
          </Button>
        );
      })}
    </div>
  );
}

export function MountForm({
  initial,
  takenKeys,
  probe,
  origin,
  vault,
  onSave,
  onCancel,
  localFoldersAvailable = typeof window !== "undefined" &&
    typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function",
  type: newType,
  draft,
  testOnOpen,
}: MountFormProps) {
  const editing = Boolean(initial);
  const [type, setType] = useState<MountTypeId | undefined>(initial?.type ?? newType);
  const [form, setForm] = useState<S3Form>(
    () => initial?.form ?? (initial?.type === "s3" ? s3FormOf(initial) : (draft ?? EMPTY_S3)),
  );
  const [name, setName] = useState(initial?.name ?? "");
  const [folder, setFolder] = useState(initial?.config.folder ?? "");
  const [keyEdited, setKeyEdited] = useState(editing);
  const [showSecret, setShowSecret] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [running, setRunning] = useState<CheckId>();
  const [report, setReport] = useState<ConnectionReport>();
  /** The reason the last Save's test failed; Save anyway keeps it with the storage. */
  const [failure, setFailure] = useState<Problem>();
  const [vaultFor, setVaultFor] = useState<{ mode: VaultMode; problem?: Problem }>();
  const abort = useRef<AbortController>(undefined);

  const errors: Partial<Record<string, string>> =
    type === "s3" ? validateS3Form(form, takenKeys) : {};
  if (type === "s3" && editing && !form.accessKeyId && !form.secretAccessKey) {
    delete errors.accessKeyId;
    delete errors.secretAccessKey;
  }
  if (type !== "s3" && name.trim() === "") errors.name = "Enter a name.";
  if (type === "local-folder" && !folder) errors.folder = "Choose a folder.";
  const shown = attempted ? errors : {};
  const valid = Object.keys(errors).length === 0;

  const update = (patch: Partial<S3Form>) => {
    setFailure(undefined);
    setForm((f) => {
      const next = { ...f, ...patch };
      if (patch.name !== undefined && !keyEdited) next.key = keyFromName(patch.name, takenKeys);
      return next;
    });
  };

  const test = async (): Promise<ConnectionReport | undefined> => {
    setAttempted(true);
    if (!valid) return undefined;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const base = probe(form);
    const tracked: S3Probe = {
      hostAnswers: () => base.hostAnswers(),
      check: (id) => {
        setRunning(id);
        return base.check(id);
      },
    };
    setReport(undefined);
    const result = await runConnectionTest(
      tracked,
      { ...form, endpoint: normalizeEndpoint(form.endpoint) },
      { origin, signal: controller.signal },
    );
    if (controller.signal.aborted) return undefined;
    setRunning(undefined);
    setReport(result);
    return result;
  };

  // Once, when the form opens.
  useEffect(() => {
    if (testOnOpen) test();
    return () => abort.current?.abort();
  }, []);

  const finish = (problem?: Problem) => {
    const key = type === "s3" ? form.key : (initial?.key ?? keyFromName(name, takenKeys));
    if (type === "s3") {
      const config = {
        preset: form.preset,
        endpoint: normalizeEndpoint(form.endpoint),
        region: form.region,
        bucket: form.bucket,
        prefix: normalizePrefix(form.prefix),
        pathStyle: String(form.pathStyle),
      };
      const saved = { ...form, name: form.name.trim() };
      return onSave(
        { key, name: saved.name, type, config, readOnly: form.readOnly },
        saved,
        problem,
      );
    }
    if (type)
      onSave({ key, name: name.trim(), type, config: type === "local-folder" ? { folder } : {} });
  };

  /** S3 keys go into the vault, so it has to exist and be open first. */
  const store = (problem?: Problem) => {
    if (type === "s3" && vault.state !== "unlocked") {
      setVaultFor({ mode: vault.state === "absent" ? "create" : "unlock", problem });
    } else finish(problem);
  };

  const save = async () => {
    if (type !== "s3") {
      setAttempted(true);
      if (valid) store();
      return;
    }
    const result = await test();
    if (!result) return;
    setFailure(result.problem);
    if (result.ok) store();
  };

  const title = initial ? `Edit ${initial.name}` : "Add storage";

  return (
    <Card className="grid w-full min-w-0 gap-4 p-4">
      <h2 className="font-semibold text-lg">{title}</h2>
      {!type ? (
        <TypeChooser localFoldersAvailable={localFoldersAvailable} onChoose={setType} />
      ) : (
        <form
          className="grid min-w-0 gap-4 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {type === "s3" ? (
            <S3Fields
              form={form}
              errors={shown}
              editing={editing}
              showSecret={showSecret}
              onShowSecret={setShowSecret}
              onChange={update}
              onKeyEdited={() => setKeyEdited(true)}
            />
          ) : (
            <>
              {type === "local-folder" ? (
                <Field label="Folder" error={shown.folder}>
                  {(id) => (
                    <div className="flex items-center gap-2">
                      <Button
                        id={id}
                        type="button"
                        variant="outline"
                        onClick={() => {
                          // The prototype's stand-in for showDirectoryPicker.
                          setFolder("Projects");
                          if (!name) setName("Projects");
                        }}
                      >
                        Choose folder…
                      </Button>
                      <span className="truncate text-muted-foreground">{folder}</span>
                    </div>
                  )}
                </Field>
              ) : null}
              <Field label="Name" error={shown.name}>
                {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}
              </Field>
            </>
          )}
          {type === "s3" && (running || report) ? (
            <ConnectionReportView report={report} running={running} />
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            {type === "s3" ? (
              <Button type="button" variant="outline" disabled={!!running} onClick={() => test()}>
                Test connection
              </Button>
            ) : null}
            {failure ? (
              <Button type="button" variant="outline" onClick={() => store(failure)}>
                Save anyway
              </Button>
            ) : null}
            <Button type="submit" disabled={!!running}>
              Save
            </Button>
          </div>
        </form>
      )}
      {vaultFor ? (
        <VaultDialog
          vault={vault}
          mode={vaultFor.mode}
          onDone={() => {
            setVaultFor(undefined);
            finish(vaultFor.problem);
          }}
          onCancel={() => setVaultFor(undefined)}
        />
      ) : null}
    </Card>
  );
}

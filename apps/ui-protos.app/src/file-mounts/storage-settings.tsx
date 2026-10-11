import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  cn,
} from "@statewalker/ui.view.shadcn";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import type { Problem } from "../file-panels/problem.js";
import { ProblemView } from "./connection-report.js";
import { runConnectionTest, type S3Probe } from "./connection-test.js";
import type { MockVault, VaultState } from "./mock-vault.js";
import type { MountConfig, MountStatus, MountTypeId, S3Form } from "./mount-config.js";
import { MountForm, s3FormOf, TYPE_ICONS } from "./mount-form.js";
import { VaultDialog, type VaultMode } from "./vault-dialogs.js";

export interface StorageItem {
  config: MountConfig;
  status: MountStatus;
  /** Where it points, in words: a folder, "In this browser", an S3 address. */
  where: string;
}

/** What is open when the screen appears (stories). */
export type StorageSettingsOpened =
  | { add: MountTypeId | "choose"; draft?: S3Form; test?: boolean }
  | { edit: string }
  | { vault: VaultMode };

export interface StorageSettingsProps {
  mounts: StorageItem[];
  vault: MockVault;
  probe(form: S3Form): S3Probe;
  origin: string;
  phone?: boolean;
  localFoldersAvailable?: boolean;
  opened?: StorageSettingsOpened;
}

type Page = Exclude<StorageSettingsOpened, { vault: VaultMode }>;

const STATUS_LABELS: Record<MountStatus["state"], string> = {
  mounted: "Mounted",
  "needs-access": "Needs access",
  locked: "Locked",
  failed: "Failed",
  unmounted: "Unmounted",
};

const NO_KEYS: MountStatus = {
  state: "failed",
  problem: {
    cause: "invalid-settings",
    message: "No saved keys: edit the storage to enter them again.",
  },
};

/** An S3 storage's status after the vault changes; other storages don't depend on it. */
function afterVault(item: StorageItem, vault: VaultState): StorageItem {
  if (item.config.type !== "s3") return item;
  const { state } = item.status;
  if (vault === "unlocked" && state === "locked") return { ...item, status: { state: "mounted" } };
  if (vault === "locked" && state === "mounted") return { ...item, status: { state: "locked" } };
  if (vault === "absent" && (state === "mounted" || state === "locked")) {
    return { ...item, status: NO_KEYS };
  }
  return item;
}

function whereOf(config: MountConfig): string {
  if (config.type === "local-folder") return `${config.config.folder} on this computer`;
  if (config.type === "s3") {
    const { endpoint, bucket, prefix } = config.config;
    return `${endpoint?.replace(/^https?:\/\//, "")} · ${bucket}/${prefix ?? ""}`;
  }
  return "In this browser";
}

type Confirm = { remove: StorageItem } | "reset";

export function StorageSettings({
  mounts,
  vault,
  probe,
  origin,
  phone,
  localFoldersAvailable,
  opened,
}: StorageSettingsProps) {
  const [items, setItems] = useState(mounts);
  const [vaultState, setVaultState] = useState(vault.state);
  const [page, setPage] = useState<Page | undefined>(
    opened && !("vault" in opened) ? opened : undefined,
  );
  const [vaultMode, setVaultMode] = useState<VaultMode | undefined>(
    opened && "vault" in opened ? opened.vault : undefined,
  );
  const [confirm, setConfirm] = useState<Confirm>();
  const [retrying, setRetrying] = useState<string>();

  useEffect(
    () =>
      vault.onUpdate(() => {
        setVaultState(vault.state);
        setItems((list) => list.map((item) => afterVault(item, vault.state)));
      }),
    [vault],
  );

  const setStatus = (key: string, status: MountStatus) =>
    setItems((list) => list.map((i) => (i.config.key === key ? { ...i, status } : i)));

  /** Retrying an S3 storage runs the connection test again; its outcome is the new status. */
  const retry = async (item: StorageItem) => {
    if (item.config.type !== "s3") return setStatus(item.config.key, { state: "mounted" });
    setRetrying(item.config.key);
    const form = s3FormOf(item.config);
    const report = await runConnectionTest(probe(form), form, { origin });
    setRetrying(undefined);
    setStatus(
      item.config.key,
      report.problem
        ? { state: "failed", problem: report.problem }
        : vault.state === "unlocked"
          ? { state: "mounted" }
          : { state: "locked" },
    );
  };

  const mount = (item: StorageItem) =>
    setStatus(
      item.config.key,
      item.config.type === "s3" && vault.state !== "unlocked"
        ? { state: "locked" }
        : { state: "mounted" },
    );

  const save = (config: MountConfig, _form?: S3Form, problem?: Problem) => {
    const editKey = page && "edit" in page ? page.edit : undefined;
    const item: StorageItem = {
      config,
      status: problem
        ? { state: "failed", problem }
        : config.type === "s3" && vault.state !== "unlocked"
          ? { state: "locked" }
          : { state: "mounted" },
      where: whereOf(config),
    };
    setItems((list) =>
      editKey ? list.map((i) => (i.config.key === editKey ? item : i)) : [...list, item],
    );
    setPage(undefined);
  };

  const width = phone ? "max-w-[390px]" : "max-w-[720px]";

  if (page) {
    const editing = "edit" in page ? items.find((i) => i.config.key === page.edit) : undefined;
    return (
      <div className={cn("w-full min-w-0", width)}>
        <MountForm
          initial={editing?.config}
          type={"add" in page && page.add !== "choose" ? page.add : undefined}
          draft={"add" in page ? page.draft : undefined}
          testOnOpen={"add" in page && page.test}
          takenKeys={items.map((i) => i.config.key).filter((k) => k !== editing?.config.key)}
          probe={probe}
          origin={origin}
          vault={vault}
          localFoldersAvailable={localFoldersAvailable}
          onSave={save}
          onCancel={() => setPage(undefined)}
        />
      </div>
    );
  }

  return (
    <div className={cn("grid w-full min-w-0 gap-4", width)}>
      <Card className="grid min-w-0 gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-lg">Storage</h2>
          <Button size="sm" onClick={() => setPage({ add: "choose" })}>
            <Plus /> Add storage
          </Button>
        </div>
        <table aria-label="Storages" className="block w-full min-w-0">
          <tbody className="grid min-w-0 divide-y">
            {items.map((item) => (
              <StorageRow
                key={item.config.key}
                item={item}
                retrying={retrying === item.config.key}
                onAction={() => {
                  const { state } = item.status;
                  if (state === "needs-access") setStatus(item.config.key, { state: "mounted" });
                  else if (state === "locked")
                    setVaultMode(vault.state === "absent" ? "create" : "unlock");
                  else if (state === "failed") retry(item);
                  else if (state === "unmounted") mount(item);
                }}
                onEdit={() => setPage({ edit: item.config.key })}
                onUnmount={() => setStatus(item.config.key, { state: "unmounted" })}
                onRemove={() => setConfirm({ remove: item })}
              />
            ))}
          </tbody>
        </table>
      </Card>
      <SecretKeys
        vault={vault}
        state={vaultState}
        onOpen={setVaultMode}
        onReset={() => setConfirm("reset")}
      />
      {vaultMode ? (
        <VaultDialog
          vault={vault}
          mode={vaultMode}
          onDone={() => setVaultMode(undefined)}
          onCancel={() => setVaultMode(undefined)}
        />
      ) : null}
      {confirm ? (
        <ConfirmDialog
          title={
            confirm === "reset" ? "Delete all saved keys?" : `Remove ${confirm.remove.config.name}?`
          }
          description={
            confirm === "reset"
              ? "Storages stay, waiting for their keys again."
              : "Its saved keys are deleted. The files themselves stay where they are."
          }
          action={confirm === "reset" ? "Delete keys" : "Remove"}
          onConfirm={() => {
            if (confirm === "reset") vault.reset();
            else setItems((list) => list.filter((i) => i.config.key !== confirm.remove.config.key));
            setConfirm(undefined);
          }}
          onCancel={() => setConfirm(undefined)}
        />
      ) : null}
    </div>
  );
}

const ACTIONS: Partial<Record<MountStatus["state"], string>> = {
  "needs-access": "Reconnect",
  locked: "Unlock",
  failed: "Retry",
  unmounted: "Mount",
};

function StorageRow({
  item,
  retrying,
  onAction,
  onEdit,
  onUnmount,
  onRemove,
}: {
  item: StorageItem;
  retrying: boolean;
  onAction(): void;
  onEdit(): void;
  onUnmount(): void;
  onRemove(): void;
}) {
  const { config, status } = item;
  const Icon = TYPE_ICONS[config.type];
  // Settings that can't work (keys deleted by a reset): the way out is Edit, not Retry.
  const needsEdit = status.state === "failed" && status.problem.cause === "invalid-settings";
  const action = needsEdit ? "Edit" : ACTIONS[status.state];
  return (
    <tr aria-label={config.name} className="grid min-w-0 gap-2 py-3">
      <td className="flex min-w-0 items-start gap-3">
        <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="truncate font-medium">{config.name}</span>
            <span
              className={cn(
                "text-xs",
                status.state === "mounted" ? "text-green-700" : "text-muted-foreground",
                status.state === "failed" && "text-destructive",
              )}
            >
              {STATUS_LABELS[status.state]}
            </span>
          </div>
          <span className="truncate text-muted-foreground text-xs">{item.where}</span>
          {status.state === "needs-access" ? (
            <p className="text-xs">
              Click Reconnect to give access to {config.config.folder ?? config.name} again.
            </p>
          ) : null}
          {status.state === "failed" ? <ProblemView problem={status.problem} /> : null}
        </div>
      </td>
      <td className="flex flex-wrap gap-1 pl-8">
        {action ? (
          <Button
            size="sm"
            variant="outline"
            disabled={retrying}
            onClick={needsEdit ? onEdit : onAction}
          >
            {retrying ? <Loader2 className="animate-spin" /> : null}
            {action}
          </Button>
        ) : null}
        {needsEdit ? null : (
          <Button size="sm" variant="ghost" onClick={onEdit}>
            Edit
          </Button>
        )}
        {status.state !== "unmounted" ? (
          <Button size="sm" variant="ghost" onClick={onUnmount}>
            Unmount
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" className="text-destructive" onClick={onRemove}>
          Remove
        </Button>
      </td>
    </tr>
  );
}

function SecretKeys({
  vault,
  state,
  onOpen,
  onReset,
}: {
  vault: MockVault;
  state: VaultState;
  onOpen(mode: VaultMode): void;
  onReset(): void;
}) {
  const said = {
    absent: "No password yet. It is asked for when the first S3 storage is saved.",
    locked: "Locked: unlock to use the S3 storages.",
    unlocked: vault.remembered
      ? "Unlocked, and remembered on this browser."
      : "Unlocked until this tab is closed.",
  }[state];
  return (
    <Card className="grid min-w-0 gap-3 p-4">
      <h2 className="font-semibold text-lg">Secret keys</h2>
      <p className="text-muted-foreground text-sm">{said}</p>
      {state !== "absent" ? (
        <div className="flex flex-wrap gap-2">
          {state === "locked" ? (
            <Button size="sm" onClick={() => onOpen("unlock")}>
              Unlock
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => vault.lock()}>
                Lock
              </Button>
              <Button size="sm" variant="outline" onClick={() => onOpen("change")}>
                Change password
              </Button>
              {vault.remembered ? (
                <Button size="sm" variant="outline" onClick={() => vault.forget()}>
                  Forget this browser
                </Button>
              ) : null}
            </>
          )}
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onReset}>
            Reset
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function ConfirmDialog({
  title,
  description,
  action,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  action: string;
  onConfirm(): void;
  onCancel(): void;
}) {
  return (
    <AlertDialog open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={onConfirm}
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

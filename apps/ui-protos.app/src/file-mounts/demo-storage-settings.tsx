import { corsRule, fakeProbe, type ProbeScenario } from "@statewalker/file-mounts.core";
import { useState } from "react";
import { MockVault, type VaultState } from "./mock-vault.js";
import {
  type StorageItem,
  StorageSettings,
  type StorageSettingsProps,
} from "./storage-settings.js";

// The CORS rule names the address this page is served from.
const ORIGIN = window.location.origin;

export const DEMO_MOUNTS: StorageItem[] = [
  {
    config: {
      key: "documents",
      name: "Documents",
      type: "local-folder",
      config: { folder: "Documents" },
    },
    status: { state: "mounted" },
    where: "Documents on this computer",
  },
  {
    config: { key: "browser", name: "Browser storage", type: "opfs", config: {} },
    status: { state: "mounted" },
    where: "In this browser",
  },
  {
    config: {
      key: "archive",
      name: "Archive (S3)",
      type: "s3",
      config: {
        preset: "aws",
        endpoint: "https://s3.eu-central-1.amazonaws.com",
        region: "eu-central-1",
        bucket: "acme-archive",
        prefix: "",
        pathStyle: "false",
      },
    },
    status: { state: "locked" },
    where: "s3.eu-central-1.amazonaws.com · acme-archive/",
  },
  {
    config: {
      key: "photos",
      name: "Photos (S3)",
      type: "s3",
      config: {
        preset: "r2",
        endpoint: "https://4f9a2c.r2.cloudflarestorage.com",
        region: "auto",
        bucket: "acme-photos",
        prefix: "site-visits/",
        pathStyle: "false",
      },
    },
    status: {
      state: "failed",
      problem: {
        cause: "cors",
        message: "The bucket doesn't allow this site. Add this CORS rule to the bucket:",
        detail: "TypeError: Failed to fetch",
        fix: { kind: "cors-rule", json: corsRule(ORIGIN) },
      },
    },
    where: "4f9a2c.r2.cloudflarestorage.com · acme-photos/site-visits/",
  },
  {
    config: {
      key: "old-nas",
      name: "Old NAS (S3)",
      type: "s3",
      config: {
        preset: "minio",
        endpoint: "https://nas.example.com:9000",
        region: "us-east-1",
        bucket: "files",
        prefix: "",
        pathStyle: "true",
      },
    },
    status: { state: "unmounted" },
    where: "nas.example.com:9000 · files/",
  },
];

/** A fresh vault and probe per render, so one story's unlock or reset doesn't leak into another. */
export function DemoStorageSettings({
  vault: vaultState,
  scenario = "ok",
  delayMs = 0,
  ...props
}: Omit<StorageSettingsProps, "vault" | "probe" | "origin" | "mounts"> & {
  vault: VaultState;
  scenario?: ProbeScenario;
  delayMs?: number;
}) {
  const [vault] = useState(
    () =>
      new MockVault({
        state: vaultState,
        password: vaultState === "absent" ? undefined : "correct horse",
      }),
  );
  const mounts = DEMO_MOUNTS.map((m) =>
    vaultState === "unlocked" && m.status.state === "locked"
      ? { ...m, status: { state: "mounted" as const } }
      : m,
  );
  return (
    <StorageSettings
      {...props}
      mounts={mounts}
      vault={vault}
      probe={() => fakeProbe(scenario, delayMs)}
    />
  );
}

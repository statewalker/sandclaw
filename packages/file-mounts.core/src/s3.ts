// S3 storages: the client settings, the mount type, and the probe behind the
// five-step connection test. Called straight from the browser, so the bucket
// needs a CORS rule naming the page's address.
import {
  DeleteObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { S3FilesApi } from "@statewalker/webrun-files-s3";
import { type ConnectionReport, runConnectionTest, type S3Probe } from "./connection-test.js";
import type { MountConfig } from "./mount-config.js";
import type { MountType } from "./mount-type.js";
import { MountUnavailable } from "./problem.js";
import { classifyS3Error } from "./s3-problems.js";

export interface S3Settings {
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  pathStyle: boolean;
}
export interface S3Keys {
  accessKeyId: string;
  secretAccessKey: string;
}

export function s3Settings(config: Record<string, string>): S3Settings {
  return {
    endpoint: config.endpoint ?? "",
    region: config.region ?? "",
    bucket: config.bucket ?? "",
    prefix: config.prefix ?? "",
    pathStyle: config.pathStyle !== "false",
  };
}

// The SDK needs a region to sign; S3-compatible servers expect us-east-1 when
// none is set. AWS itself always has one (the form requires it).
const newClient = (s: S3Settings, keys: S3Keys) =>
  new S3Client({
    endpoint: s.endpoint,
    region: s.region || "us-east-1",
    forcePathStyle: s.pathStyle,
    credentials: keys,
  });

const AUTH_ERRORS = new Set([
  "InvalidAccessKeyId",
  "SignatureDoesNotMatch",
  "RequestTimeTooSkewed",
]);
const statusOf = (e: unknown) =>
  (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
const nameOf = (e: unknown) => (e as { name?: string })?.name ?? "";

/**
 * An error with no HTTP answer behind it is a network failure. The browser
 * reports those as "TypeError: Failed to fetch"; Node reports ECONNREFUSED and
 * the like. Both become the browser's form, so classification treats them alike.
 */
function asNetworkError(error: unknown): unknown {
  if (statusOf(error) !== undefined || AUTH_ERRORS.has(nameOf(error))) return error;
  if (nameOf(error) === "TimeoutError" || nameOf(error) === "AbortError") return error;
  const network = new TypeError("Failed to fetch");
  (network as { cause?: unknown }).cause = error;
  return network;
}

async function hostAnswers(endpoint: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  try {
    await fetchFn(endpoint, { mode: "no-cors" });
    return true;
  } catch {
    return false;
  }
}

export function newS3Probe(
  settings: S3Settings,
  keys: S3Keys,
  opts: { mountKey: string; fetch?: typeof fetch },
): S3Probe {
  const client = newClient(settings, keys);
  const Bucket = settings.bucket;
  const prefix = settings.prefix.replace(/^\/+/, "");
  // One signed, bucket-scoped call answers two checks: does the endpoint answer,
  // are the keys accepted. It is bucket-scoped because a bucket's CORS rule
  // applies to it (a service-level ListBuckets gets no CORS headers). A missing
  // bucket or AccessDenied still means the keys were authenticated.
  let authOutcome: Promise<unknown> | undefined;
  const listBuckets = () =>
    (authOutcome ??= client
      .send(new ListObjectsV2Command({ Bucket, Prefix: prefix, MaxKeys: 0 }))
      .then(
        () => undefined,
        (e: unknown) => e,
      ));
  const send = async (run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (e) {
      throw asNetworkError(e);
    }
  };
  return {
    hostAnswers: () => hostAnswers(settings.endpoint, opts.fetch),
    async check(id) {
      switch (id) {
        case "endpoint": {
          const e = await listBuckets();
          if (e !== undefined && statusOf(e) === undefined && !AUTH_ERRORS.has(nameOf(e))) {
            throw asNetworkError(e);
          }
          return;
        }
        case "keys": {
          const e = await listBuckets();
          if (e !== undefined && AUTH_ERRORS.has(nameOf(e))) throw e;
          return;
        }
        case "bucket":
          try {
            await client.send(new HeadBucketCommand({ Bucket }));
          } catch (e) {
            if (statusOf(e) === 404) {
              const missing = new Error(`${Bucket} does not exist.`);
              missing.name = "NoSuchBucket";
              throw missing;
            }
            if (statusOf(e) === 403) return; // it exists; listing says whether it may be read
            throw asNetworkError(e);
          }
          return;
        case "list":
          await send(() =>
            client.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, MaxKeys: 1 })),
          );
          return;
        case "write": {
          const Key = `${prefix}.${opts.mountKey}-write-test-${crypto.randomUUID()}`;
          await send(() => client.send(new PutObjectCommand({ Bucket, Key, Body: "" })));
          await send(() => client.send(new DeleteObjectCommand({ Bucket, Key })));
          return;
        }
      }
    },
  };
}

/** The five checks against a real bucket; the report the settings form shows. */
export function testConnection(
  mount: MountConfig,
  keys: S3Keys,
  opts: { origin: string; signal?: AbortSignal; timeoutMs?: number; fetch?: typeof fetch },
): Promise<ConnectionReport> {
  const settings = s3Settings(mount.config);
  const probe = newS3Probe(settings, keys, { mountKey: mount.key, fetch: opts.fetch });
  return runConnectionTest(
    probe,
    { endpoint: settings.endpoint, bucket: settings.bucket, readOnly: Boolean(mount.readOnly) },
    opts,
  );
}

export function s3MountType(opts: { origin?: string; fetch?: typeof fetch } = {}): MountType {
  return {
    id: "s3",
    label: "S3 bucket",
    fields: [
      { name: "endpoint", label: "Endpoint", kind: "url", required: true },
      { name: "region", label: "Region", kind: "text" },
      { name: "bucket", label: "Bucket", kind: "text", required: true },
      { name: "prefix", label: "Prefix", kind: "text" },
      { name: "pathStyle", label: "Path-style addressing", kind: "boolean", default: "true" },
      { name: "accessKeyId", label: "Access key ID", kind: "secret", required: true },
      { name: "secretAccessKey", label: "Secret access key", kind: "secret", required: true },
    ],
    isAvailable: () => ({ ok: true }),
    async create(mount, ctx) {
      const accessKeyId = await ctx.secret("accessKeyId");
      const secretAccessKey = await ctx.secret("secretAccessKey");
      if (!accessKeyId || !secretAccessKey) {
        throw new MountUnavailable(mount.key, {
          cause: "invalid-settings",
          message: "Enter the keys for this storage in Settings → Storage.",
        });
      }
      const settings = s3Settings(mount.config);
      const client = newClient(settings, { accessKeyId, secretAccessKey });
      const api = new S3FilesApi({
        client,
        bucket: settings.bucket,
        prefix: settings.prefix || undefined,
      });
      // One listing now, so wrong keys, a missing bucket or CORS show as the
      // mount's status rather than as an empty folder later.
      try {
        for await (const _ of api.list("/")) break;
      } catch (e) {
        const error = asNetworkError(e);
        // A browser reports a missing CORS rule like a dead host; an unsigned
        // no-cors request tells them apart.
        const answers =
          nameOf(error) === "TypeError"
            ? await hostAnswers(settings.endpoint, opts.fetch)
            : undefined;
        throw new MountUnavailable(
          mount.key,
          classifyS3Error(error, {
            check: "list",
            endpoint: settings.endpoint,
            bucket: settings.bucket,
            origin: opts.origin ?? globalThis.location?.origin ?? "",
            hostAnswers: answers,
          }),
        );
      }
      return api;
    },
  };
}

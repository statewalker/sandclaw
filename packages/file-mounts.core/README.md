# @statewalker/file-mounts.core

## What it is

Storages mounted side by side as one `FilesApi`: a folder of the computer, the browser's private
storage, an S3 bucket, or memory. Each storage appears at `/<key>` under a read-only root that lists
them. The package also holds the encrypted vault for the S3 keys, the `mounts.json` settings file, and
a five-step S3 connection test that says what is wrong with a bucket instead of "failed to fetch".
It is React-free; a view layer reads the table's `list()` and `onUpdate`.

## Why it exists

A files app talks to several storages at once and must keep working when one of them does not. Three
things follow from that:

- **A broken mount stays in the table.** An unusable storage (locked vault, folder access to be given
  again, wrong keys, no answer) is mounted anyway, with a status. Every operation on it raises
  `MountUnavailable` carrying the reason. An empty folder would look like data loss and invite
  the person to "fix" it by saving over it.
- **S3 is called straight from the browser.** The bucket needs a CORS rule naming the page's address,
  and the browser reports a missing rule exactly like a dead host. The connection test tells them apart
  and shows the rule to paste.
- **The keys must not sit in plain text.** They live in an AES-GCM encrypted file, unlocked by a password.

## How to use

```ts
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import {
  FilesMountTable, IdbStore, SecretVault, loadMountConfigs, localFolderMountType,
  memoryMountType, opfsMountType, s3MountType, saveMountConfigs,
} from "@statewalker/file-mounts.core";

const settingsFiles = new MemFilesApi(); // where /.files/mounts.json and the vault files live
const vault = new SecretVault({ files: settingsFiles, dir: "/.files", keys: new IdbStore("vault-keys") });
await vault.load(); // "absent" | "locked" | "unlocked"

const table = new FilesMountTable({
  types: [
    opfsMountType(),
    localFolderMountType(new IdbStore("folder-handles")),
    s3MountType({ origin: location.origin }),
    memoryMountType(),
  ],
  secrets: vault,
});
const { configs, problem } = await loadMountConfigs(settingsFiles);
await table.apply(configs); // creates the mounts, in parallel
table.files; // one FilesApi: /<key>/... for every mount
```

After the person unlocks the vault, call `table.apply(configs)` again: mounts that were `locked` are
created, mounts that are already `mounted` are kept. Inside a click, `table.apply(configs, { interactive: true })`
or `table.reconnect(key)` may show a permission prompt.

## What each mount type needs

| Type | Needs | Notes |
|---|---|---|
| `local-folder` | Chromium (Chrome, Edge) | After a page reload the folder needs one click: `table.reconnect(key)` inside the handler. |
| `opfs` | A browser with `navigator.storage.getDirectory` | Lives in the page's private storage, in the folder `mounts/<key>`. |
| `s3` | An unlocked vault, a bucket with a CORS rule | Fields: endpoint, region, bucket, prefix, path-style, access key ID, secret access key (the last two go to the vault). |
| `memory` | nothing | Gone on reload; used by tests and demos. |

A mount saved with `readOnly: true` is wrapped so writes throw; `mounted: false` keeps the settings
without mounting.

## How S3 settings are tested and why the messages are what they are

`testConnection` runs five checks in order and stops at the first failure:

1. **The address answers.** A signed `ListObjectsV2` with `MaxKeys: 0` on the bucket; any HTTP answer,
   even a refusal, counts. It is bucket-scoped because the bucket's CORS rule applies to it; a
   service-level `ListBuckets` gets no CORS headers from AWS or R2 and would always look like CORS.
2. **The keys are accepted.** The same call: `InvalidAccessKeyId`, `SignatureDoesNotMatch` and
   `RequestTimeTooSkewed` fail here. `AccessDenied` and `NoSuchBucket` still mean the keys were
   recognised; the next checks report those.
3. **The bucket exists.** `HeadBucket`; a 403 passes, because listing says whether the bucket may be read.
4. **Listing is allowed.** `ListObjectsV2` under the prefix.
5. **Writing is allowed.** Puts and deletes a small object `<prefix>.<key>-write-test-<uuid>`. Skipped
   for read-only mounts, so a read-only key is not reported as broken.

Each check has a 15 s limit. The time is the point at which a person stops believing the page is
working; a longer wait looks like a hang.

A network failure is followed by an unsigned `no-cors` request to the endpoint. If that answers, the
host is up and the browser blocked the signed call: the problem is `cors`, and the report carries the
rule for the page's origin. If it does not answer, the problem is `unreachable`. Without this second
request the two cases are indistinguishable in a browser.

When the region is left empty, which the "Other" and R2 presets allow, the client signs with
`us-east-1`, which is what S3-compatible servers expect by default. The AWS, MinIO / RustFS, B2 and
Wasabi presets require a region in the form, so those are never signed with a guessed one.

Messages, as the person sees them:

| Situation | Message |
|---|---|
| Wrong keys | `Wrong access key or secret.` |
| Clock off | `This computer's clock is off by more than 15 minutes; S3 refuses the request.` |
| No such bucket | ``Bucket `name` not found at this endpoint.`` |
| Not allowed to list / write | `These keys can't list this bucket.` / `These keys can't write to this bucket.` |
| CORS rule missing | `The bucket doesn't allow this site. Add this CORS rule to the bucket:` (followed by the rule) |
| Host dead | ``No answer from `endpoint`.`` |
| Hang | `No answer in 15 seconds.` |
| Vault locked | `Locked: unlock to use the S3 storages.` |
| S3 keys not entered | `Enter the keys for this storage in Settings → Storage.` |
| Folder access lost | ``Click Reconnect to give access to `folder` again.`` |
| Browser without folders | `This browser can't open local folders; use Chrome or Edge.` |

When an S3 mount is created, one listing runs at once, so wrong keys, a missing bucket or CORS show as
the mount's status and not as an empty folder later.

## Examples

Test settings before saving them:

```ts
import { testConnection } from "@statewalker/file-mounts.core";

const report = await testConnection(
  { key: "archive", name: "Archive", type: "s3", config: { endpoint: "http://127.0.0.1:9000", bucket: "files" } },
  { accessKeyId: "...", secretAccessKey: "..." },
  { origin: location.origin },
);
if (!report.ok) console.log(report.problem?.message, report.problem?.fix?.json);
```

Read a mount that cannot be used:

```ts
import { MountUnavailable } from "@statewalker/file-mounts.core";

try {
  for await (const _ of table.files.list("/archive")) break;
} catch (e) {
  if (e instanceof MountUnavailable) console.log(e.problem.cause, e.problem.message);
}
```

Store a secret and change the password:

```ts
await vault.create("correct horse", true); // remember: silent unlock after a reload
await vault.set("archive/accessKeyId", "AKIA...");
await vault.changePassword("correct horse", "battery staple"); // false when the old one is wrong
```

## Internals

### How the vault protects the keys

A random AES-GCM-256 data key encrypts `secrets.json`. A key derived from the password with
PBKDF2-SHA256 wraps the data key into `vault.key.json`. A password change re-wraps the one data key and
leaves `secrets.json` alone. Accounts are named `<mount key>/<field>`. The vault id is bound into both
ciphertexts as additional data, so a `secrets.json` from another vault does not decrypt.

The default is 600 000 PBKDF2 iterations: the current OWASP guidance for SHA-256, and a fraction of a
second on a laptop. Fewer would make a stolen file cheaper to guess against; more makes every unlock
slow on a phone. Tests pass `iterations: 1000`.

*Remember* stores the derived key, non-extractable, in a `KeyValueStore` (IndexedDB), so the next
load unlocks silently. The data key is never stored. Writes take a Web Lock, and each write re-reads
the file, so two tabs setting different accounts keep both.

A wrong password never changes anything: `unlock` returns `false` and the state stays `locked`.
A lost password cannot be recovered. `reset()` deletes the two vault files and the remembered key;
the stored files in the mounts are never touched, only the ability to open S3 storages until the keys
are entered again.

### How the table keeps working when one storage does not

`apply` and `reconnect` run one after another through a queue; mounts of one `apply` are created in
parallel. `apply` validates every key first and rejects before changing anything. A non-interactive
create that does not settle in 15 s (`createTimeoutMs`) is `failed` with `No answer in 15 seconds.`;
other mounts are unaffected. Interactive creates are not timed out: a browser permission prompt always
settles, so waiting on one does not hang.

### mounts.json is never overwritten by a failed read

`loadMountConfigs` returns the mounts in `/.files/mounts.json`. A file that is not valid JSON or not a
list loads as no mounts, with `problem: "The storage settings file is damaged; it is kept as is until you save."`.
Entries that cannot be read are left out with a problem count. Nothing in the package rewrites the file
except `saveMountConfigs`, so a damaged file survives until the person saves.

### Constraints

- Mount keys are validated (`validateKey`); the key is the first path segment.
- S3 object stores have no real folders: the prefix is part of every key, and a mount sees only below it.
- Dependencies: `@statewalker/webrun-files*` for the `FilesApi` contract and the composite, memory,
  browser and S3 implementations; `@aws-sdk/client-s3` for signing and the checks;
  `@statewalker/shared-baseclass` for `onUpdate`.

## Running the S3 suite against a real server

The unit suite needs no S3 server or Docker:

```
pnpm --filter @statewalker/file-mounts.core test
```

The integration suite starts a RustFS container (`rustfs/rustfs:1.0.0`, a free local port, root keys
`rustfsadmin`), creates a bucket, and checks: all five checks pass, read-only skips the write, wrong
keys, missing bucket, files land under the prefix, a copy from one storage into S3. Docker is required;
without it the tests are skipped. Set `RUSTFS_IMAGE` to use another image.

```
pnpm --filter @statewalker/file-mounts.core test:integration
```

The container is removed when the suite ends. A restricted user (denied write) and CORS are not
produced here: RustFS's root keys can do everything and Node does not enforce CORS. Those outcomes are
covered by the classifier unit tests.

## License

MIT

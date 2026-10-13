# @statewalker/file-mounts.core

## What it is

Storages mounted side by side as one `FilesApi`: a folder of the computer, the browser's private
storage, an S3 bucket, or memory. Each storage appears at `/<key>` under a read-only root that lists
them. The package also holds the profiles, each with an encrypted vault for its S3 keys and mounts
(`/.settings/mounts.json` in a project is only the project's archive copy of the mounts), and a
five-step S3 connection test that says what is wrong with a bucket instead of "failed to fetch".
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
- **The person's keys and storages must not sit in plain text.** Each profile's data lives in one encrypted IndexedDB record, unlocked by a password (or a passkey).

## How to use

```ts
import {
  FilesMountTable, IdbStore, Profiles, firstProfileData, localFolderMountType,
  memoryMountType, opfsMountType, s3MountType,
} from "@statewalker/file-mounts.core";

const records = new IdbStore<unknown>("statewalker-files");
const profiles = new Profiles({ records });
const [first] = await profiles.load();
const vault = first
  ? await profiles.open(first.id) // unlocked when remembered; else vault.unlock(password, remember)
  : await profiles.create("Personal", password, true, firstProfileData(opfsMountType().isAvailable().ok));

const table = new FilesMountTable({
  types: [
    opfsMountType(),
    localFolderMountType(new IdbStore("folder-handles")),
    s3MountType({ origin: location.origin }),
    memoryMountType(),
  ],
  secrets: vault,
});
await table.apply((await vault.read()).mounts); // creates the mounts, in parallel
table.files; // one FilesApi: /<key>/... for every mount
```

After the person unlocks the vault, call `table.apply((await vault.read()).mounts)` again: mounts that were `locked` are
created, mounts that are already `mounted` are kept. `apply` returns the `FileChange[]` of the mount
roots it added, replaced or removed; nothing else announces them, so pass the list to the change hub,
or open panels keep showing "Locked" until they are navigated again:

```ts
import { newFileChanges } from "@statewalker/file-mounts.core";

const changes = newFileChanges(); // the hub panels subscribe to
if (await vault.unlock(password, remember)) changes.emit(await table.apply((await vault.read()).mounts));
```

`table.reconnect(key)` returns only the status: after it, emit an `updated` change for `/<key>`.
Inside a click, `table.apply(mounts, { interactive: true })` or `table.reconnect(key)` may show a
permission prompt.

`vault.lock()` does not unmount S3 storages that are already mounted: their client holds the keys
until the next `apply` that recreates them, or a reload. Likewise, keys changed in the vault for a
config that did not change are not picked up by `apply` (the mount is kept as is); `reconnect(key)`
creates it again with the new keys.

The main mount's project keeps archive copies of the profile. After each `vault.update(...)` that
changes mounts or preferences, write them; *Import from this project* merges them back:

```ts
import { archiveProfile, importProfile, mergeImported } from "@statewalker/file-mounts.core";

await archiveProfile(mainFiles, await vault.read()); // mainFiles: the main mount's FilesApi

const archive = await importProfile(mainFiles); // show archive.problem when set
await vault.update((d) => mergeImported(d, archive));
```

Passkeys unlock a profile beside its password (WebAuthn PRF). A `PasskeyProblem`'s `message` is what to show the person:

```ts
import { webAuthnPasskeys } from "@statewalker/file-mounts.core";

const passkeys = webAuthnPasskeys({ rpName: "Files" });
if (await passkeys.available()) await profiles.addPasskey(vault, password, passkeys);
const unlocked = await profiles.unlockWithPasskey(passkeys, remember); // finds the profile itself
```

## What each mount type needs

| Type | Needs | Notes |
|---|---|---|
| `local-folder` | Chromium (Chrome, Edge) | After a page reload the folder needs one click: `table.reconnect(key)` inside the handler. |
| `opfs` | A browser with `navigator.storage.getDirectory` | Lives in the page's private storage, in the folder `mounts/<key>`. |
| `s3` | An unlocked vault, a bucket with a CORS rule | Fields: endpoint, region, bucket, prefix, path-style, access key ID, secret access key (the last two go to the vault, as accounts `<key>/accessKeyId` and `<key>/secretAccessKey`). |
| `memory` | nothing | Gone on reload; used by tests and demos. |

A mount saved with `readOnly: true` is wrapped so writes throw; `mounted: false` keeps the settings
without mounting.

The mount key is also where a storage keeps what belongs to it: OPFS data at `mounts/<key>`, S3 keys
in the vault under `<key>/<field>`. Changing a mount's key therefore shows an empty OPFS storage, and
an S3 storage that says `Enter the keys for this storage in Settings → Storage.` The old data and keys
are not deleted; they stay under the old key, unreachable until a mount uses that key again.

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
| S3 keys not entered, or no vault created yet | `Enter the keys for this storage in Settings → Storage.` |
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
const vault = await profiles.create("Work", "correct horse", true); // remember: silent unlock after a reload
await vault.set("archive/accessKeyId", "AKIA...");
await vault.changePassword("correct horse", "battery staple"); // false when the old one is wrong
```

## Internals

### How the vault protects the keys

Each profile has one record, `vault:<id>`, in a single `KeyValueStore` (IndexedDB). It holds a sealed
`ProfileData` (secrets, mounts, the main storage, preferences) and the wrapped data key. A random
AES-GCM-256 data key seals the data; a key derived from the password with PBKDF2-SHA256 wraps the data
key. A password change re-wraps the one data key and leaves the sealed data alone. Accounts are named
`<mount key>/<field>`. The profile id is bound into both ciphertexts as additional data, so a record
copied under another profile does not decrypt. Kept in clear are the profile list (`profiles`: ids
and names) and, in each vault record, the passkey credential ids and creation times and the KDF
parameters (salt, iterations). None of these is a secret.

The default is 600 000 PBKDF2 iterations: the current OWASP guidance for SHA-256, and a fraction of a
second on a laptop. Fewer would make a stolen record cheaper to guess against; more makes every unlock
slow on a phone. Tests pass `iterations: 1000`.

*Remember* stores the **data key**, non-extractable, at `remembered:<id>`, so the next open unlocks
silently. It is the data key and not the password-derived key because it survives a password change
and works after any kind of unlock; and whoever can read this browser's IndexedDB could use a
remembered password key just as well. Writes take a Web Lock per profile and each write re-reads the
record, so two tabs changing different things keep both.

A wrong password never changes anything: `unlock` and `changePassword` return `false` and the state
stays as it was. Both check the password against the record as it is now, so after another tab changed
the password, the new one works in this tab too, without a reload.

A lost password cannot be recovered. `profiles.remove(id)` deletes the vault and its remembered key; the
files in the storages are not touched, but the mounts and keys must be entered again. Using a removed
profile's vault fails with `This profile was removed.`

### A passkey unlocks the vault through PRF, and the password stays

The authenticator returns the same 32-byte PRF secret for this site and the fixed input
`statewalker-files vault v1`, after verifying the person. HKDF-SHA256 with a random salt per wrap turns
that secret into the key that wraps the data key, next to the password wrap. The passkey's user handle
is the profile id and its user name the profile's name, so one *Unlock with a passkey* finds the
profile. The password is checked before the passkey prompt, so a wrong one leaves no orphan passkey.

Support differs: Chromium with security keys and phones, Safari 18+ with Apple Passwords, Windows Hello
only on recent builds, Firefox unclear. `available()` asks `getClientCapabilities`. An authenticator
that registers a passkey without PRF leaves that passkey in its own list though it unlocks nothing;
adding then fails with "This browser can't use passkeys to unlock; use the password." Removing a passkey
from the profile does not delete it from the authenticator, which keeps offering it and gets "This
passkey isn't linked to a profile on this browser." There is no server, so the challenge is random and
nothing is verified beyond the PRF secret. Keep the password: a deleted passkey would otherwise lock
the person out.

### How the table keeps working when one storage does not

`apply` and `reconnect` run one after another through a queue; mounts of one `apply` are created in
parallel. `apply` validates every key first and rejects before changing anything. A create that does
not settle in 15 s (`createTimeoutMs`) is `failed` with `No answer in 15 seconds.`; other mounts are
unaffected, and the queue moves on. The message names 15 seconds whatever `createTimeoutMs` is set to.

The one exception is a type that declares `prompts: true` (only `local-folder`), created
interactively (`reconnect`, or `apply` with `interactive: true`): it waits on a browser permission
prompt, which always settles when the person answers, and timing it out would fail a folder while
they are still reading the prompt. Every other type is timed out even inside a click, because an S3
host that never answers would otherwise hold the queue, and every later `apply` and `reconnect`,
forever.

### The main storage is the project, and keeps an archive of the profile

`canBeMain(config)` is true for `opfs`, `local-folder` and `memory`, and false for `s3`. The main
storage is the open project and must open before anything else; an S3 storage is locked until the
vault opens, so it cannot be the one that opens first. `firstProfileData(opfs)` is what a new profile
starts with: one "Browser storage" mount as main, or a memory mount where OPFS is missing.

`archiveProfile` writes `/.settings/mounts.json` and `/.settings/preferences.json` into the project.
Secrets never go there: the mounts file holds configs only, and the keys stay in the vault. The vault
always wins: `importProfile` reads the copies only on an explicit import, and `mergeImported` keeps
the profile's own mounts and preference values, adding only the mounts with unknown keys and the
preferences it lacks. A damaged copy brings in what can be read, and `problem` says what was left
out, for example `1 saved storage could not be read and was left out. The archived preferences are
damaged; they were left out.`

### A save over a damaged mounts.json first keeps a backup of it

`mounts.json` is the project's archive copy of the mounts. `loadMountConfigs` returns the mounts in `/.settings/mounts.json`. A file that is not valid JSON or not a
list loads as no mounts, with `problem: "The storage settings file is damaged; it is kept as is until you save."`.
Entries that cannot be read are left out with a problem count, for example
`2 saved storages could not be read and were left out.` Loading never rewrites the file.

The next `saveMountConfigs` writes only the mounts it is given, so the entries left out would be
gone. Before writing, it reads the file again; if it does not load cleanly (by the same rules), its
exact text is first copied to `mounts.damaged-<timestamp>.json` in the same folder (for example
`/.settings/mounts.damaged-2026-10-11T09-30-00-000Z.json`). Nothing removes these backups; a file there
means a save replaced settings that could not be read, and the lost entries can be recovered from it
by hand.

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

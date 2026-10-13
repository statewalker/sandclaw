// The vault's record layout and its crypto, shared by SecretVault and Profiles.
// Internal: src/index.ts does not export this module.
import type { ProfileData } from "./secret-vault.js";

export interface Wrapped {
  iv: string;
  wrappedKey: string;
}
export interface PasswordWrap extends Wrapped {
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
}
export interface PasskeyWrap extends Wrapped {
  credentialId: string;
  salt: string;
  createdAt: string;
}
export interface VaultRecord {
  version: 2;
  id: string;
  password: PasswordWrap;
  passkeys: PasskeyWrap[];
  data: { iv: string; data: string };
}

export const PROFILES_KEY = "profiles";
export const recordKey = (profile: string) => `vault:${profile}`;
/** The lock every writer of one profile's vault takes, `remove` included. */
export const vaultLockName = (profile: string) => `statewalker-files-vault:${profile}`;
export const rememberedKey = (profile: string) => `remembered:${profile}`;

export const utf8 = (text: string) => new TextEncoder().encode(text);
export const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  let text = "";
  for (const b of bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)) {
    text += String.fromCharCode(b);
  }
  return btoa(text);
}
export const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
export const toBase64Url = (bytes: ArrayBuffer | Uint8Array) =>
  toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const fromBase64Url = (text: string) =>
  fromBase64(
    text
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(text.length / 4) * 4, "="),
  );

export async function passwordKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", utf8(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

/** The key a password wrap was made with, from the password given now. */
export const passwordKeyFor = (wrap: PasswordWrap, password: string) =>
  passwordKey(password, fromBase64(wrap.kdf.salt), wrap.kdf.iterations);

export async function newPasswordWrap(
  dataKey: CryptoKey,
  id: string,
  password: string,
  iterations: number,
): Promise<PasswordWrap> {
  const salt = random(16);
  const key = await passwordKey(password, salt, iterations);
  return {
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt: toBase64(salt) },
    ...(await wrap(dataKey, key, id)),
  };
}

export async function wrap(dataKey: CryptoKey, key: CryptoKey, id: string): Promise<Wrapped> {
  const iv = random(12);
  const wrapped = await crypto.subtle.wrapKey("raw", dataKey, key, {
    name: "AES-GCM",
    iv,
    additionalData: utf8(id),
  });
  return { iv: toBase64(iv), wrappedKey: toBase64(wrapped) };
}

export function unwrap(
  wrapped: Wrapped,
  key: CryptoKey,
  id: string,
  extractable: boolean,
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    fromBase64(wrapped.wrappedKey),
    key,
    { name: "AES-GCM", iv: fromBase64(wrapped.iv), additionalData: utf8(id) },
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"],
  );
}

export const newDataKey = () =>
  crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

export async function seal(
  dataKey: CryptoKey,
  id: string,
  data: ProfileData,
): Promise<VaultRecord["data"]> {
  const iv = random(12);
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf8(id) },
    dataKey,
    utf8(JSON.stringify(data)),
  );
  return { iv: toBase64(iv), data: toBase64(sealed) };
}

export async function unseal(
  dataKey: CryptoKey,
  id: string,
  sealed: VaultRecord["data"],
): Promise<ProfileData> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(sealed.iv), additionalData: utf8(id) },
    dataKey,
    fromBase64(sealed.data),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as ProfileData;
}

const queues = new Map<string, Promise<unknown>>();

/** One writer at a time per name: in this tab through a queue, across tabs through Web Locks. */
export function exclusive<T>(name: string, action: () => Promise<T>): Promise<T> {
  const locks = (globalThis as { navigator?: Navigator }).navigator?.locks;
  const run = () => (locks ? locks.request(name, action) : action());
  const result = (queues.get(name) ?? Promise.resolve()).then(run, run);
  queues.set(
    name,
    result.catch(() => undefined),
  );
  return result;
}

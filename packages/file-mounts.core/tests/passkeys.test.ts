import { describe, expect, it } from "vitest";
import {
  type KeyValueStore,
  MemoryStore,
  memoryAuthenticator,
  PASSKEY_MESSAGES,
  PasskeyProblem,
  Profiles,
  webAuthnPasskeys,
} from "../src/index.js";

const newProfiles = (records: KeyValueStore<unknown> = new MemoryStore<unknown>()) =>
  new Profiles({ records, iterations: 1000 });

describe("passkeys", () => {
  it("a passkey added with the password unlocks its own profile, chosen among several", async () => {
    const records = new MemoryStore<unknown>();
    const profiles = newProfiles(records);
    const auth = memoryAuthenticator();
    const work = await profiles.create("Work", "pw-work", false);
    const home = await profiles.create("Personal", "pw-home", false);
    await home.set("a/k", "home secret");
    expect(await profiles.addPasskey(work, "pw-work", auth)).toBe(true);
    expect(await profiles.addPasskey(home, "pw-home", auth)).toBe(true);
    expect(auth.credentials.map((c) => [c.userId, c.name])).toEqual([
      [work.profile, "Work"],
      [home.profile, "Personal"],
    ]);
    expect(await home.passkeys()).toEqual([
      { credentialId: auth.credentials[1]?.id, createdAt: expect.any(String) },
    ]);

    const later = newProfiles(records);
    await later.load();
    auth.pick = auth.credentials[1]?.id;
    const vault = await later.unlockWithPasskey(auth, false);
    expect(vault.profile).toBe(home.profile);
    expect(vault.state).toBe("unlocked");
    expect(await vault.get("a/k")).toBe("home secret");
  });

  it("a wrong password adds nothing and never asks the authenticator", async () => {
    const profiles = newProfiles();
    const auth = memoryAuthenticator();
    const vault = await profiles.create("Work", "pw", false);
    expect(await profiles.addPasskey(vault, "wrong", auth)).toBe(false);
    expect(auth.credentials).toEqual([]);
    expect(await vault.passkeys()).toEqual([]);
  });

  it("a dismissed prompt changes nothing: no passkey added, a locked profile stays locked", async () => {
    const records = new MemoryStore<unknown>();
    const profiles = newProfiles(records);
    const auth = memoryAuthenticator();
    const vault = await profiles.create("Work", "pw", false);
    auth.dismissNext = true;
    await expect(profiles.addPasskey(vault, "pw", auth)).rejects.toThrow(PASSKEY_MESSAGES.noAnswer);
    expect(await vault.passkeys()).toEqual([]);

    expect(await profiles.addPasskey(vault, "pw", auth)).toBe(true);
    const later = newProfiles(records);
    auth.dismissNext = true;
    await expect(later.unlockWithPasskey(auth, false)).rejects.toThrow(
      "The passkey didn't answer; nothing changed.",
    );
    expect((await later.open(vault.profile)).state).toBe("locked");
  });

  it("a passkey of a removed profile, or a removed passkey, unlocks nothing", async () => {
    const records = new MemoryStore<unknown>();
    const profiles = newProfiles(records);
    const auth = memoryAuthenticator();
    const work = await profiles.create("Work", "pw", false);
    const home = await profiles.create("Personal", "pw", false);
    await profiles.addPasskey(work, "pw", auth);
    await profiles.addPasskey(home, "pw", auth);

    auth.pick = auth.credentials[0]?.id;
    await profiles.remove(work.profile);
    const error = await profiles.unlockWithPasskey(auth, false).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PasskeyProblem);
    expect((error as Error).message).toBe(
      "This passkey isn't linked to a profile on this browser.",
    );

    const [homePasskey] = await home.passkeys();
    await home.removePasskey(homePasskey?.credentialId ?? "");
    auth.pick = auth.credentials[1]?.id;
    await expect(newProfiles(records).unlockWithPasskey(auth, false)).rejects.toThrow(
      PASSKEY_MESSAGES.unknown,
    );
    expect(await (await newProfiles(records).open(home.profile)).unlock("pw", false)).toBe(true);
  });

  it("remember after a passkey unlock opens the profile silently next time", async () => {
    const records = new MemoryStore<unknown>();
    const auth = memoryAuthenticator();
    const profiles = newProfiles(records);
    const vault = await profiles.create("Work", "pw", false);
    await profiles.addPasskey(vault, "pw", auth);
    await newProfiles(records).unlockWithPasskey(auth, true);
    expect((await newProfiles(records).open(vault.profile)).state).toBe("unlocked");
  });

  it("an authenticator without PRF is unavailable, and adding a passkey says why", async () => {
    const profiles = newProfiles();
    const auth = memoryAuthenticator({ prf: false });
    expect(await auth.available()).toBe(false);
    const vault = await profiles.create("Work", "pw", false);
    await expect(profiles.addPasskey(vault, "pw", auth)).rejects.toThrow(
      "This browser can't use passkeys to unlock; use the password.",
    );
    expect(await vault.passkeys()).toEqual([]);
  });

  it("outside a browser, WebAuthn passkeys are unavailable", async () => {
    expect(await webAuthnPasskeys({ rpName: "Files" }).available()).toBe(false);
  });
});

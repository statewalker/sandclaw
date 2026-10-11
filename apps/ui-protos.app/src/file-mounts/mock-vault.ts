export type VaultState = "absent" | "locked" | "unlocked";

/** Why a new password can't be used, or undefined when it can. */
export function passwordProblem(password: string, repeat: string): string | undefined {
  if (password.length < 8) return "Use at least 8 characters.";
  if (password !== repeat) return "The two passwords differ.";
  return undefined;
}

/** The prototype's key vault: the states and password rules of the real one, no encryption. */
export class MockVault {
  state: VaultState;
  /** "Remember on this browser": the real vault unlocks silently at start-up. */
  remembered = false;
  private password?: string;
  private listeners = new Set<() => void>();

  constructor(init: { state: VaultState; password?: string }) {
    this.state = init.state;
    this.password = init.password;
  }

  create(password: string, remember: boolean): void {
    this.password = password;
    this.remembered = remember;
    this.set("unlocked");
  }

  unlock(password: string, remember: boolean): boolean {
    if (password !== this.password) return false;
    this.remembered = remember;
    this.set("unlocked");
    return true;
  }

  lock(): void {
    if (this.state === "unlocked") this.set("locked");
  }

  changePassword(old: string, next: string): boolean {
    if (old !== this.password) return false;
    this.password = next;
    this.notify();
    return true;
  }

  forget(): void {
    this.remembered = false;
    this.notify();
  }

  /** Deletes every key; storages stay, waiting for their keys again. */
  reset(): void {
    this.password = undefined;
    this.remembered = false;
    this.set("absent");
  }

  onUpdate(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(state: VaultState): void {
    this.state = state;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

// The App's buses and the glue features use with them. One runtime per App
// instance: two Apps on one page never see each other's contributions.
import {
  type CommandDeclaration,
  Commands,
  CommandsRegistry,
  type MutableCommandsRegistry,
} from "@statewalker/shared-commands";
import { type KeyedSlotDeclaration, type SlotDeclaration, Slots } from "@statewalker/shared-slots";
import { createContext, useContext, useSyncExternalStore } from "react";
import type { Commander } from "../file-panels/use-commander.js";
import type { Viewer } from "../settings/settings-model.js";
import type { AppTheme } from "./contracts.js";

export interface AppRuntime {
  slots: Slots;
  commands: Commands;
  /** The commands some handler answers: what menu items may name. */
  handled: MutableCommandsRegistry;
}

export function createRuntime(): AppRuntime {
  return { slots: new Slots(), commands: Commands.create(), handled: CommandsRegistry.create() };
}

/** Answers `command` with `fn` and records it as handled; returns the disposer. */
export function handle<P>(
  rt: AppRuntime,
  command: CommandDeclaration<P, void>,
  fn: (payload: P) => void,
): () => void {
  const stop = rt.commands.listen(command, (cmd) => {
    fn(cmd.payload);
  });
  rt.handled.set(command);
  return () => {
    stop();
    rt.handled.remove(command.key);
  };
}

/** What a feature knows about the App it joins. */
export interface FeatureContext {
  viewer: Viewer;
  /** The file panels' commander; the shell sets it each time it renders. */
  commander: { current: Commander | null };
}

/** A unit the App can switch on or off: everything it adds comes back with its disposer. */
export interface Feature {
  id: string;
  label: string;
  contribute(rt: AppRuntime, ctx: FeatureContext): () => void;
}

/** One disposer for many, run in reverse order. */
export function all(...disposers: Array<() => void>): () => void {
  return () => {
    for (const dispose of [...disposers].reverse()) dispose();
  };
}

export function contributeAll(
  rt: AppRuntime,
  features: Feature[],
  ctx: FeatureContext,
): () => void {
  return all(...features.map((f) => f.contribute(rt, ctx)));
}

export function provideAll<T>(slots: Slots, slot: SlotDeclaration<T>, values: T[]): () => void {
  return all(...values.map((value) => slots.provide(slot, value)));
}

export function registerAll<T extends { id: string }>(
  slots: Slots,
  slot: KeyedSlotDeclaration<T>,
  values: T[],
): () => void {
  return all(...values.map((value) => slots.register(slot, value.id, value)));
}

export const AppRuntimeContext = createContext<AppRuntime | null>(null);

export function useAppRuntime(): AppRuntime {
  const rt = useContext(AppRuntimeContext);
  if (!rt) throw new Error("The App's views need <AppRuntimeContext.Provider> around them.");
  return rt;
}

export function useSlotValues<T>(slot: SlotDeclaration<T>): readonly T[] {
  const { slots } = useAppRuntime();
  return useSyncExternalStore(
    (notify) => slots.observe(slot, () => notify()),
    () => slots.getSnapshot(slot),
  );
}

export function useKeyedSlotValues<T>(slot: KeyedSlotDeclaration<T>): ReadonlyMap<string, T> {
  const { slots } = useAppRuntime();
  return useSyncExternalStore(
    (notify) => slots.observe(slot, () => notify()),
    () => slots.getSnapshot(slot),
  );
}

/** A value a feature keeps for its own views (a dialog open, the lock), observable from React. */
export interface Store<T> {
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get);
}

/** The theme the shell applies; Appearance shows it. */
export const ThemeContext = createContext<AppTheme>("system");

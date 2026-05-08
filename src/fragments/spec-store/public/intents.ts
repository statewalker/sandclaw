import { newIntent } from "@statewalker/shared-intents";
import type { Spec, SpecPatch } from "./types.js";

export interface CreateSpecPayload {
  catalogId: string;
  spec: Spec;
  meta?: Record<string, unknown>;
}

export interface CreateSpecResult {
  specId: string;
}

export const [runCreateSpec, handleCreateSpec] = newIntent<
  CreateSpecPayload,
  CreateSpecResult
>("spec:create");

export interface PatchSpecPayload {
  specId: string;
  patch: SpecPatch;
}

export const [runPatchSpec, handlePatchSpec] = newIntent<
  PatchSpecPayload,
  void
>("spec:patch");

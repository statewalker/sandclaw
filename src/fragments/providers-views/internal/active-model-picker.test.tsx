import type {
  LocalModelConfig,
  ModelState,
} from "@statewalker/ai-agent/models";
import { describe, expect, it, vi } from "vitest";
import {
  buildLocalPickerEntries,
  deactivateOnLocalToRemoteSwitch,
  LOCAL_PROVIDER_ID,
} from "./active-model-picker.js";

const localConfig: LocalModelConfig = {
  runtime: "local",
  engine: "webllm",
  modelId: "mlc-ai/Llama-3.2-1B",
  label: "Llama 3.2-1B",
  family: "Llama 3.2",
  dtype: "q4f16_1",
  size: "880 MB",
  sizeBytes: 1,
};

describe("buildLocalPickerEntries", () => {
  it("includes local entries with status `ready`", () => {
    const states = new Map<string, ModelState>([
      ["webllm:llama-3.2-1b", { config: localConfig, status: "ready" }],
    ]);
    expect(buildLocalPickerEntries(states)).toEqual([
      { catalogKey: "webllm:llama-3.2-1b", label: "Llama 3.2-1B" },
    ]);
  });

  it("includes local entries with status `downloaded`", () => {
    const states = new Map<string, ModelState>([
      ["webllm:llama-3.2-1b", { config: localConfig, status: "downloaded" }],
    ]);
    expect(buildLocalPickerEntries(states)).toHaveLength(1);
  });

  it("excludes local entries that are not-downloaded or downloading", () => {
    const states = new Map<string, ModelState>([
      ["a", { config: localConfig, status: "not-downloaded" }],
      ["b", { config: localConfig, status: "downloading" }],
      ["c", { config: localConfig, status: "error" }],
    ]);
    expect(buildLocalPickerEntries(states)).toEqual([]);
  });

  it("excludes remote entries", () => {
    const states = new Map<string, ModelState>([
      [
        "openai/gpt-4o",
        {
          config: {
            runtime: "remote",
            provider: "openai",
            modelId: "gpt-4o",
            label: "GPT-4o",
            kinds: ["reasoning"],
          },
          status: "ready",
        },
      ],
    ]);
    expect(buildLocalPickerEntries(states)).toEqual([]);
  });
});

describe("deactivateOnLocalToRemoteSwitch", () => {
  it("calls manager.deactivate when switching from local to remote", () => {
    const deactivate = vi.fn();
    deactivateOnLocalToRemoteSwitch(
      { deactivate },
      LOCAL_PROVIDER_ID,
      "webllm:llama-3.2-1b",
      "openai",
    );
    expect(deactivate).toHaveBeenCalledWith("webllm:llama-3.2-1b");
  });

  it("does nothing when prev provider was not local", () => {
    const deactivate = vi.fn();
    deactivateOnLocalToRemoteSwitch(
      { deactivate },
      "openai",
      "gpt-4o",
      LOCAL_PROVIDER_ID,
    );
    expect(deactivate).not.toHaveBeenCalled();
  });

  it("does nothing when staying on local", () => {
    const deactivate = vi.fn();
    deactivateOnLocalToRemoteSwitch(
      { deactivate },
      LOCAL_PROVIDER_ID,
      "webllm:llama-3.2-1b",
      LOCAL_PROVIDER_ID,
    );
    expect(deactivate).not.toHaveBeenCalled();
  });

  it("does nothing when prev modelId is missing", () => {
    const deactivate = vi.fn();
    deactivateOnLocalToRemoteSwitch(
      { deactivate },
      LOCAL_PROVIDER_ID,
      undefined,
      "openai",
    );
    expect(deactivate).not.toHaveBeenCalled();
  });
});

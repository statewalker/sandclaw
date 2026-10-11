import type { FilesApi, ListOptions } from "@statewalker/webrun-files";
import { MountUnavailable, type Problem } from "./problem.js";

/** A mount that cannot be used: every operation raises its problem. */
export function unavailableFiles(key: string, problem: Problem): FilesApi {
  const fail = () => {
    throw new MountUnavailable(key, problem);
  };
  return {
    // biome-ignore lint/correctness/useYield: it only throws
    async *read() {
      fail();
    },
    // biome-ignore lint/correctness/useYield: it only throws
    async *list(_path: string, _options?: ListOptions) {
      fail();
    },
    write: async () => fail(),
    mkdir: async () => fail(),
    stats: async () => fail(),
    exists: async () => fail(),
    remove: async () => fail(),
    move: async () => fail(),
    copy: async () => fail(),
  };
}

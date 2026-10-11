// One file panel: a folder of the mounted storages listed into explorer.core's
// FilesListModel (entries, sort, filter, cursor, selection), plus what a
// multi-panel manager needs: the breadcrumb, the reason a folder can't be read,
// and refreshes from the change stream.
import { FilesListModel } from "@statewalker/explorer.core";
import { type FileChanges, type Problem, problemOf } from "@statewalker/file-mounts.core";
import { BaseClass } from "@statewalker/shared-baseclass";
import type { FileInfo, FilesApi } from "@statewalker/webrun-files";
import { basename, dirname, normalizePath } from "@statewalker/webrun-files";
import { breadcrumb, type Crumb, siblings } from "./paths.js";

export interface PanelState {
  id: string;
  path: string;
  sort: { field: FilesListModel["sortField"]; descending: boolean };
}

/** A change at `changed` is visible in `folder`: inside it, the folder itself, or an ancestor. */
const touches = (changed: string, folder: string) =>
  dirname(changed) === folder || changed === folder || folder.startsWith(`${changed}/`);

export class PanelModel extends BaseClass {
  readonly id: string;
  readonly list = new FilesListModel();
  problem?: Problem;
  notice?: string;
  private loads = 0;
  /** The folder most recently asked for; `list.path` only changes when a load completes. */
  private target = "/";
  private readonly files: FilesApi;
  private readonly mountNames: () => Record<string, string>;
  private readonly unsubscribe?: () => void;

  constructor(opts: {
    id: string;
    files: FilesApi;
    changes?: FileChanges;
    mountNames?: () => Record<string, string>;
  }) {
    super();
    this.id = opts.id;
    this.files = opts.files;
    this.mountNames = opts.mountNames ?? (() => ({}));
    this.unsubscribe = opts.changes?.subscribe((changes) => {
      if (changes.some((c) => touches(c.path, this.target))) void this.refresh();
    });
  }

  get state(): PanelState {
    return {
      id: this.id,
      path: this.list.path,
      sort: { field: this.list.sortField, descending: !this.list.sortAscending },
    };
  }

  /** Lists `path`; a newer navigation wins over a slower older one. */
  async navigate(path: string): Promise<void> {
    const load = ++this.loads;
    const wanted = normalizePath(path);
    this.target = wanted;
    let notice: string | undefined;
    let problem: Problem | undefined;
    let at = wanted;
    let entries: FileInfo[] | undefined;
    try {
      // A folder that is gone sends the panel to its nearest existing ancestor.
      while (at !== "/" && (await this.files.stats(at))?.kind !== "directory") at = dirname(at);
      if (at !== wanted) notice = `${basename(wanted)} no longer exists.`;
      const listed: FileInfo[] = [];
      for await (const entry of this.files.list(at)) listed.push(entry);
      entries = listed;
    } catch (error) {
      problem = problemOf(error);
    }
    if (load !== this.loads) return;
    this.target = at; // after a fallback, the folder shown is the one to refresh and go up from
    const done = this.list.startLoading({ path: at });
    done(problem ? { error: problem.message } : { entries });
    this.problem = problem;
    this.notice = notice;
    this.notify();
  }

  up(): Promise<void> {
    return this.navigate(dirname(this.target));
  }

  refresh(): Promise<void> {
    return this.navigate(this.target);
  }

  setSort(field: FilesListModel["sortField"]) {
    this.list.setSort(field);
    this.notify();
  }

  breadcrumb(): Crumb[] {
    return breadcrumb(this.list.path, this.mountNames());
  }

  siblings(crumb: Crumb) {
    return siblings(this.files, crumb);
  }

  dispose() {
    this.loads++; // an in-flight navigation is ignored from now on
    this.unsubscribe?.();
  }
}

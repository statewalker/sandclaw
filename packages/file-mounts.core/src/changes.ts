/** One change to the files: what an operation or a mount change did. */
export interface FileChange {
  type: "added" | "updated" | "deleted";
  path: string;
}

/** The one stream of changes: panels refresh from it, an indexer will follow it. */
export interface FileChanges {
  subscribe(listener: (changes: readonly FileChange[]) => void): () => void;
}

export interface FileChangesHub extends FileChanges {
  emit(changes: readonly FileChange[]): void;
}

export function newFileChanges(): FileChangesHub {
  const listeners = new Set<(changes: readonly FileChange[]) => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(changes) {
      if (!changes.length) return;
      for (const listener of [...listeners]) listener(changes);
    },
  };
}

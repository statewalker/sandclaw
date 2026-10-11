/** A search result: phase 4 fills these from a full-text index over the mounts. */
export interface SearchHit {
  path: string;
  title: string;
  snippet?: string;
  score: number;
}

export interface SearchProvider {
  /** "fulltext", later "semantic"… */
  readonly id: string;
  search(query: string, opts: { scope?: string; signal?: AbortSignal }): AsyncIterable<SearchHit>;
}

#!/usr/bin/env bash
# Run an evaluation set through the wiki in N parallel shards, then score it.
# usage: eval/run-all.sh <workspace-root> <project> <questions.json> <out-dir> [lean-first|full-only] [shards] [rerank-model|off]
# env:   WIKI_PROVIDER + its key
set -euo pipefail
if [ $# -lt 4 ]; then sed -n 3p "$0" >&2; exit 2; fi
root="$(realpath "$1")"; project="$2"; questions="$(realpath "$3")"
mode="${5:-lean-first}"; shards="${6:-4}"; rerank=(); [ -n "${7:-}" ] && rerank=(--rerank "$7")
mkdir -p "$4"; out="$(realpath "$4")"
cd "$(dirname "$0")/.."
for i in $(seq 0 $((shards - 1))); do
  npx tsx eval/run.ts "$root" "$project" "$questions" "$out" --mode "$mode" --shard "$i/$shards" "${rerank[@]}" \
    2>>"$out/run.log" &
done
wait
npx tsx eval/score.ts "$root/$project" "$questions" "$out"

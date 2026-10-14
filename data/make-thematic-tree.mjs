#!/usr/bin/env node
// Recreates the thematic folder tree of the testing dataset from the committed mapping.
//
//   node data/make-thematic-tree.mjs --source <unzipped archive> --target <new tree> [--copy]
//
// Every source file is checked against `testing-dataset.json` (size + SHA-256) before it is
// placed. Files are hard-linked by default (no extra disk space); `--copy` copies them instead.
// Hard links fall back to copies when source and target are on different file systems.

import { createHash } from "node:crypto";
import { copyFile, link, mkdir, readFile, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { copy: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--source") args.source = argv[++i];
    else if (a === "--target") args.target = argv[++i];
    else if (a === "--copy") args.copy = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.source || !args.target) {
    throw new Error(
      "usage: make-thematic-tree.mjs --source <unzipped archive> --target <dir> [--copy]",
    );
  }
  return args;
}

async function sha256(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

async function place(from, to, copy) {
  await mkdir(dirname(to), { recursive: true });
  await unlink(to).catch((e) => {
    if (e.code !== "ENOENT") throw e;
  });
  if (copy) return copyFile(from, to);
  try {
    await link(from, to);
  } catch (e) {
    if (e.code !== "EXDEV") throw e;
    await copyFile(from, to);
  }
}

async function main() {
  const { source, target, copy } = parseArgs(process.argv.slice(2));
  const listing = JSON.parse(await readFile(join(here, "testing-dataset.json"), "utf8"));
  const mapping = JSON.parse(await readFile(join(here, "testing-thematic.json"), "utf8"));
  const expected = new Map(listing.files.map((f) => [f.path, f]));

  const errors = [];
  for (const { path, source: rel } of mapping.files) {
    const from = join(source, rel);
    const want = expected.get(rel);
    if (!want) {
      errors.push(`${rel}: not in testing-dataset.json`);
      continue;
    }
    const st = await stat(from).catch(() => undefined);
    if (!st) {
      errors.push(`${rel}: missing in ${source}`);
      continue;
    }
    if (st.size !== want.size || (await sha256(from)) !== want.sha256) {
      errors.push(`${rel}: size or SHA-256 differs from testing-dataset.json`);
      continue;
    }
    await place(from, join(target, path), copy);
  }
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    console.error(`${errors.length} of ${mapping.files.length} files were not placed`);
    process.exitCode = 1;
    return;
  }
  console.log(`placed ${mapping.files.length} files under ${target}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});

/**
 * WebLLM weight-bridge Service Worker (chat-mini variant).
 *
 * Intercepts WebLLM's HuggingFace fetches for registered models and
 * serves them from the workspace `FileSystemDirectoryHandle` (the same
 * folder the user picked at startup). On the first download the response
 * is teed to disk so subsequent activations read from the local files
 * — that's what makes weight files appear in `.settings/models/`.
 *
 * ── Message protocol (postMessage to the SW) ───────────────────────────
 *
 * - `{ type: "register-mapping", urlPattern, basePath }`
 *     URLs starting with `urlPattern` are served from / written to
 *     `${basePath}${url.slice(urlPattern.length)}` in the workspace
 *     directory handle.
 * - `{ type: "unregister-mapping", urlPattern }`
 * - `{ type: "set-files-handle", handle }`
 *     Pass the workspace `FileSystemDirectoryHandle` (must have
 *     readwrite permission). Required before any mapping is served.
 *
 * Range requests are served from disk when present; they fall through
 * to the network without write-through (resumable shard fetches would
 * need partial reassembly which is out of scope here).
 */

/** @type {{ urlPattern: string; basePath: string }[]} */
const mappings = [];
/** @type {FileSystemDirectoryHandle | null} */
let rootHandle = null;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;
  switch (msg.type) {
    case "register-mapping": {
      const idx = mappings.findIndex((m) => m.urlPattern === msg.urlPattern);
      const entry = { urlPattern: msg.urlPattern, basePath: msg.basePath };
      if (idx >= 0) mappings[idx] = entry;
      else mappings.push(entry);
      break;
    }
    case "unregister-mapping": {
      const idx = mappings.findIndex((m) => m.urlPattern === msg.urlPattern);
      if (idx >= 0) mappings.splice(idx, 1);
      break;
    }
    case "set-files-handle": {
      rootHandle = msg.handle;
      break;
    }
  }
});

function matchMapping(url) {
  for (const mapping of mappings) {
    if (url.startsWith(mapping.urlPattern)) {
      return { mapping, remainder: url.slice(mapping.urlPattern.length) };
    }
  }
  return null;
}

function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!m) return null;
  const start = m[1] ? Number.parseInt(m[1], 10) : 0;
  const end = m[2] ? Number.parseInt(m[2], 10) : size - 1;
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= size) {
    return null;
  }
  return { start, end };
}

function contentTypeFor(name) {
  if (name.endsWith(".json")) return "application/json";
  if (name.endsWith(".wasm")) return "application/wasm";
  return "application/octet-stream";
}

async function resolveFile(relativePath) {
  if (!rootHandle) return null;
  const segments = relativePath.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return null;
  let dir = rootHandle;
  for (let i = 0; i < segments.length - 1; i++) {
    try {
      dir = await dir.getDirectoryHandle(segments[i]);
    } catch {
      return null;
    }
  }
  try {
    return await dir.getFileHandle(segments[segments.length - 1]);
  } catch {
    return null;
  }
}

async function getOrCreateFile(relativePath) {
  if (!rootHandle) return null;
  const segments = relativePath.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return null;
  let dir = rootHandle;
  for (let i = 0; i < segments.length - 1; i++) {
    try {
      dir = await dir.getDirectoryHandle(segments[i], { create: true });
    } catch {
      return null;
    }
  }
  try {
    return await dir.getFileHandle(segments[segments.length - 1], {
      create: true,
    });
  } catch {
    return null;
  }
}

async function fetchAndTee(request, relativePath) {
  const response = await fetch(request);
  if (!response.ok || !response.body || !rootHandle) return response;
  // Range responses are partial — don't write-through, that would
  // produce a corrupt file. Subsequent full requests will populate.
  if (response.status === 206) return response;
  // Use `response.clone()` rather than `response.body.tee()` so the
  // response object returned to the caller carries the original status,
  // headers, *and* `url` field unchanged. Browsers internally tee the
  // stream — both branches can be consumed independently.
  const cloned = response.clone();
  // Background write — don't block the caller. We read the cloned
  // body fully to a Blob then persist it; this avoids long-lived stream
  // pipes that can keep the SW alive past the natural fetch lifetime.
  cloned
    .blob()
    .then((blob) => writeBlobToFile(blob, relativePath))
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.warn("[weight-bridge] write failed:", relativePath, error);
    });
  return response;
}

async function writeBlobToFile(blob, relativePath) {
  const fileHandle = await getOrCreateFile(relativePath);
  if (!fileHandle) return;
  if (typeof fileHandle.createWritable !== "function") return;
  let writable;
  try {
    writable = await fileHandle.createWritable();
  } catch {
    return;
  }
  try {
    await writable.write(blob);
    await writable.close();
  } catch {
    try {
      await writable.abort();
    } catch {
      /* ignore */
    }
  }
}

async function serveFromFiles(request, mapping, remainder) {
  const relativePath = `${mapping.basePath}${remainder}`;
  const fileHandle = await resolveFile(relativePath);
  if (!fileHandle) {
    return fetchAndTee(request, relativePath);
  }
  const file = await fileHandle.getFile();
  const range = parseRange(request.headers.get("range"), file.size);
  const contentType = contentTypeFor(remainder);
  if (!range) {
    return new Response(file.stream(), {
      status: 200,
      headers: {
        "content-length": String(file.size),
        "content-type": contentType,
        "accept-ranges": "bytes",
      },
    });
  }
  const slice = file.slice(range.start, range.end + 1);
  const length = range.end - range.start + 1;
  return new Response(slice.stream(), {
    status: 206,
    headers: {
      "content-length": String(length),
      "content-type": contentType,
      "content-range": `bytes ${range.start}-${range.end}/${file.size}`,
      "accept-ranges": "bytes",
    },
  });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = event.request.url;
  const match = matchMapping(url);
  if (!match) return;
  event.respondWith(
    serveFromFiles(event.request, match.mapping, match.remainder).catch(() =>
      fetch(event.request),
    ),
  );
});

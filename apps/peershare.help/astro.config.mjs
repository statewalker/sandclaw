import { defineConfig } from "astro/config";

/**
 * A static site. Pages are written as `security.html`, not `security/index.html`: httpeers'
 * sites host serves `/security` from `security.html`, so links stay without a trailing slash.
 * Every link is root-relative: the site is served at the root of its own origin, and so is
 * each Guest's isolated copy of it.
 */
export default defineConfig({
  site: "https://peershare-demo.httpeers.net",
  build: { format: "file" },
  trailingSlash: "never",
  // Compression joins a word to a link that starts the next source line ("onlibp2p"): the
  // prose here wraps at 100 columns, so whitespace is kept as written.
  compressHTML: false,
});

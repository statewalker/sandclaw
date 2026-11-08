# @statewalker/peershare.help

## What it is

PeerShare's help site, built with [Astro](https://astro.build) and published at
https://peershare-demo.httpeers.net. It covers what PeerShare is, how to use it, how it works,
why it is safe, the local proxy, and troubleshooting. The security page explains:
- sharing happens between browser tabs, and no server stores anything;
- connections are encrypted end to end with Noise (WebRTC's DTLS on direct links, with the keys
  bound through that Noise channel);
- a peer ID is a public key, and identity comes from the handshake, never from the caller;
- membership is a Biscuit token bound to the guest's key and verified offline;
- invites are single-use, expire after 24 hours, and carry their secrets in the URL fragment;
- each service opens in its own isolated origin;
- the local proxy listens on loopback only and reaches only nearby addresses;
- and what none of this protects against.

It is also **the example service to share**. Share `https://peershare-demo.httpeers.net`: a
remote https site with a domain name, so PeerShare reaches it directly, from the page. For that,
`public/.site/config.json` lists `https://peershare.httpeers.net` (and `http://localhost:8080`
for `local/serve.mjs`) under `cors`. httpeers' sites host then sends
`Access-Control-Allow-Origin` and answers the preflight that PeerShare's `x-peershare-guest`
header causes (statewalker/httpeers#65).

## How to use

```sh
pnpm --filter @statewalker/peershare.help dev     # http://localhost:4321
pnpm --filter @statewalker/peershare.help build   # dist/
pnpm --filter @statewalker/peershare.help test    # builds, then checks dist/
```

Astro 7.4 needs Node 22.23.4 or later (CI runs Node 24).
`.github/workflows/peershare-demo-site.yml` publishes `dist/` when this package changes. The
publishing credentials must be allowed the `peershare-demo.httpeers.net` prefix (see that
workflow's comment).

## Internals

- `build.format: "file"` writes `security.html`, which the sites host serves at `/security`.
  Links have no trailing slash and are root-relative: the site sits at the root of its origin,
  and so does each Guest's isolated copy of it.
- `compressHTML: false`: compression joined a word to a link that started the next source line
  ("onlibp2p").
- The pages are `.astro` files with plain HTML prose; `src/pages/_nav.ts` orders them (the `_`
  keeps it out of the routes). The architecture diagram is inline SVG
  (`src/components/Architecture.astro`).

## License

MIT

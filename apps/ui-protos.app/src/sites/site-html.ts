// The generated site as the iframe gets it: one self-contained HTML document,
// no external URLs. Pages switch with `:target`, so no script is needed for
// navigation; a citation posts the file path to the app, which opens the file.

import type { Site, SitePage } from "./site-model.js";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

/** A page the mock has no text for still reads like one, with one citation. */
function bodyOf(site: Site, page: SitePage): Required<Pick<SitePage, "body" | "sources">> {
  if (page.body && page.sources) return { body: page.body, sources: page.sources };
  const folder = site.source.kind === "folder" ? site.source.path : "Notes";
  return {
    body: [[{ text: `What the files say about ${page.title.toLowerCase()}.`, cites: [1] }]],
    sources: [{ n: 1, path: `${folder}/…`, section: page.title }],
  };
}

function pageHtml(site: Site, page: SitePage): string {
  const { body, sources } = bodyOf(site, page);
  const byN = new Map(sources.map((s) => [s.n, s]));
  const cite = (n: number) => {
    const s = byN.get(n);
    return s
      ? `<button class="cite" data-path="${esc(s.path)}" title="${esc(`${s.path} · ${s.section}`)}">${n}</button>`
      : "";
  };
  const paragraphs = body
    .map((p) => `<p>${p.map((s) => `${esc(s.text)}${s.cites.map(cite).join("")}`).join(" ")}</p>`)
    .join("\n");
  const figure = page.figure
    ? `<figure><div class="img" role="img" aria-label="${esc(page.figure.caption)}">Picture</div><figcaption>${esc(page.figure.caption)} <span class="path">${esc(page.figure.path)}</span></figcaption></figure>`
    : "";
  const list = sources
    .map(
      (s) =>
        `<li><button class="source" data-path="${esc(s.path)}"><span class="n">${s.n}</span> ${esc(s.path)} <span class="path">· ${esc(s.section)}</span></button></li>`,
    )
    .join("");
  return `<section id="${esc(page.id)}"><h1>${esc(page.title)}</h1>\n${paragraphs}\n${figure}<h2>Sources</h2><ol class="sources">${list}</ol></section>`;
}

const css = `
*{box-sizing:border-box}
body{margin:0;font:15px/1.6 system-ui,sans-serif;color:#1c1917;background:#fff;display:flex;min-height:100vh}
nav{width:200px;flex-shrink:0;border-right:1px solid #e7e5e4;padding:16px;background:#fafaf9}
nav .site{font-weight:600;margin-bottom:8px}
nav a{display:block;padding:4px 8px;border-radius:6px;color:inherit;text-decoration:none;font-size:14px}
nav a:hover{background:#e7e5e4}
main{flex:1;min-width:0;padding:24px;max-width:720px}
section{display:none}
section:target,body:not(:has(section:target)) section:first-of-type{display:block}
h1{font-size:24px;margin:0 0 12px}h2{font-size:14px;margin:24px 0 8px;color:#57534e}
button{font:inherit;cursor:pointer;border:0;background:none;padding:0;color:inherit;text-align:left}
.cite{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;margin:0 2px;border-radius:4px;background:#f5f5f4;font-size:10px;font-weight:500;vertical-align:super}
.cite:hover{background:#1c1917;color:#fff}
.sources{list-style:none;padding:0;margin:0;display:grid;gap:4px;font-size:13px}
.source{display:flex;gap:8px;align-items:baseline;overflow-wrap:anywhere}
.source:hover{text-decoration:underline}
.n{display:inline-flex;justify-content:center;min-width:20px;border-radius:4px;background:#f5f5f4;font-size:12px}
.path{color:#78716c}
figure{margin:16px 0}
.img{aspect-ratio:16/9;max-width:480px;border-radius:8px;background:repeating-linear-gradient(45deg,#f5f5f4 0 12px,#e7e5e4 12px 24px);display:grid;place-items:center;color:#78716c;font-size:13px}
figcaption{font-size:13px;margin-top:6px}
@media (max-width:600px){body{flex-direction:column}nav{width:auto;border-right:0;border-bottom:1px solid #e7e5e4}main{padding:16px}}
`;

const script = `document.addEventListener("click",function(e){var b=e.target.closest("[data-path]");if(b)parent.postMessage({type:"sandclaw:open-file",path:b.dataset.path},"*")});`;

/** The whole site; only written pages are in it. */
export function siteHtml(site: Site): string {
  const pages = site.pages.filter((p) => p.state === "done");
  const nav = pages.map((p) => `<a href="#${esc(p.id)}">${esc(p.title)}</a>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(site.name)}</title><style>${css}</style></head><body><nav><div class="site">${esc(site.name)}</div>${nav}</nav><main>${pages.map((p) => pageHtml(site, p)).join("\n")}</main><script>${script}</script></body></html>`;
}

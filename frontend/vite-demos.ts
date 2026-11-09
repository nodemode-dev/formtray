import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

const PAGES = [
  { id: "overview", dir: "demo", script: "demo.js" },
  { id: "switcher", dir: "demos/switcher", script: "switcher.js" },
  { id: "widgets", dir: "demos/widgets", script: "widgets.js" },
];

const LINKS: Record<string, string> = {
  "../demos/switcher/index.html": "switcher",
  "../demos/widgets/index.html": "widgets",
  "../../demo/index.html": "overview",
  "../switcher/index.html": "switcher",
  "../widgets/index.html": "widgets",
};

const TYPES: Record<string, string> = { html: "text/html", js: "text/javascript", css: "text/css", webp: "image/webp" };

function swap(text: string, from: string, to: string, where: string): string {
  if (!text.includes(from)) throw new Error(`in-app demos: ${where} has no ${from}; rebuild the browser demos`);
  return text.split(from).join(to);
}

function page(id: string, dir: string): string {
  let html = readFileSync(resolve(REPO, dir, "index.html"), "utf8");
  html = swap(html, 'href="./assets/style.css"', `href="./assets/${id}.css"`, `${dir}/index.html`);
  html = swap(html, 'src="./apps/', 'src="../apps/', `${dir}/index.html`);
  html = swap(html, 'href="./index.html"', `href="./${id}.html"`, `${dir}/index.html`);
  for (const [from, to] of Object.entries(LINKS)) {
    if (html.includes(`href="${from}"`)) html = html.split(`href="${from}"`).join(`href="./${to}.html"`);
  }
  return html;
}

export function demoFiles(): Map<string, Buffer | string> {
  const files = new Map<string, Buffer | string>();
  for (const { id, dir, script } of PAGES) {
    files.set(`demos/${id}.html`, page(id, dir));
    const js = readFileSync(resolve(REPO, dir, "assets", script), "utf8");
    files.set(`demos/assets/${script}`, swap(js, "`./apps/", "`../apps/", `${dir}/assets/${script}`));
    files.set(`demos/assets/${id}.css`, readFileSync(resolve(REPO, dir, "assets", "style.css")));
    for (const name of readdirSync(resolve(REPO, dir, "assets")).filter((n) => n.endsWith(".webp"))) {
      const bytes = readFileSync(resolve(REPO, dir, "assets", name));
      const seen = files.get(`demos/assets/${name}`);
      if (seen && !Buffer.from(seen).equals(bytes)) throw new Error(`in-app demos: ${dir}/assets/${name} differs from the same file in another demo`);
      files.set(`demos/assets/${name}`, bytes);
    }
  }
  return files;
}

export function demoPages(): Plugin {
  return {
    name: "formtray-demos",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? "/").split(/[?#]/)[0].replace(/^\//, "");
        if (!pathname.startsWith("demos/")) return next();
        const body = demoFiles().get(pathname);
        if (body === undefined) return next();
        res.setHeader("Content-Type", TYPES[pathname.split(".").pop() ?? ""] ?? "application/octet-stream");
        res.setHeader("Cache-Control", "no-store");
        res.end(body);
      });
    },
    generateBundle() {
      for (const [fileName, source] of demoFiles()) this.emitFile({ type: "asset", fileName, source });
    },
  };
}

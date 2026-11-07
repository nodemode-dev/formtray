import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const BASE = "/api/extensions/files";
const SHARED = { "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", "Cross-Origin-Resource-Policy": "cross-origin", "Access-Control-Allow-Origin": "*" };

function cli(): string {
  return process.env.FORMTRAY_CLI || resolve(fileURLToPath(new URL(".", import.meta.url)), "../target/debug/formtray-cli");
}

function run(args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((done) => {
    execFile(cli(), args, { maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      const code = err ? (typeof (err as { code?: unknown }).code === "number" ? ((err as { code: number }).code) : 127) : 0;
      done({ code, out: stdout });
    });
  });
}

export function extensionRoutes(): Plugin {
  return {
    name: "formtray-extensions",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url ?? "/").split(/[?#]/)[0];
        if (pathname === "/api/extensions") {
          const { code, out } = await run(["extensions_list", "--json", "--base", BASE]);
          res.statusCode = code === 0 ? 200 : 503;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(code === 0 ? out : JSON.stringify({ error: "formtray-cli is not built; run cargo build -p formtray-cli" }));
          return;
        }
        if (!pathname.startsWith(`${BASE}/`)) return next();
        const parts = pathname.slice(BASE.length + 1).split("/");
        const [id, version] = parts;
        let rel = "";
        try {
          rel = parts.slice(2).map(decodeURIComponent).join("/");
        } catch {
          rel = "";
        }
        const found = id && version && rel && (req.method === "GET" || req.method === "HEAD") ? await run(["extension_file", id, version, rel]) : { code: 1, out: "" };
        if (found.code !== 0) {
          res.writeHead(404, SHARED);
          res.end();
          return;
        }
        const file = JSON.parse(found.out) as { path: string; type: string; headers: Record<string, string> };
        res.writeHead(200, { "Content-Type": file.type, ...file.headers });
        if (req.method === "HEAD") return res.end();
        createReadStream(file.path).pipe(res);
      });
    },
  };
}

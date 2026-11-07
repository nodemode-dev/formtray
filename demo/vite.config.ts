const DEMO_PORT = 5612;
const here = import.meta.dirname;

const filePlugin = {
  name: "formtray-demo-file-protocol",
  enforce: "pre",
  resolveId(source: string, importer?: string) {
    if (importer && importer.replace(/\\/g, "/").includes("/frontend/src/") && /(^|\/)bridge$/.test(source)) {
      return `${here}/src/bridge.ts`;
    }
    return null;
  },
  transform(code: string, id: string) {
    if (id.replace(/\\/g, "/").endsWith("frontend/src/ui.ts")) {
      return { code: code.split("`/apps/").join("`./apps/"), map: null };
    }
    return null;
  },
  transformIndexHtml: {
    order: "post",
    handler(html: string) {
      return html
        .replace(/<script type="module" crossorigin src=/g, "<script defer src=")
        .replace(/<script type="module" src=/g, "<script defer src=")
        .replace(/ crossorigin(="[^"]*")?/g, "");
    },
  },
};

export default {
  root: `${here}/src`,
  base: "./",
  publicDir: `${here}/../frontend/public`,
  clearScreen: false,
  plugins: [filePlugin],
  server: { port: DEMO_PORT, host: false, strictPort: true },
  preview: { port: DEMO_PORT + 1, host: false, strictPort: true },
  build: {
    outDir: here,
    emptyOutDir: false,
    sourcemap: false,
    target: "es2022",
    assetsInlineLimit: 0,
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: { format: "iife", inlineDynamicImports: true, entryFileNames: "assets/demo.js", assetFileNames: "assets/[name][extname]" },
    },
  },
};

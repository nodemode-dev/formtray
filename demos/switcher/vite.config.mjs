const here = import.meta.dirname;

const filePlugin = {
  name: "formtray-demo-switcher-file-protocol",
  enforce: "pre",
  resolveId(source, importer) {
    if (importer && importer.replace(/\\/g, "/").includes("/frontend/src/") && /(^|\/)bridge$/.test(source)) {
      return `${here}/../../demo/src/bridge.ts`;
    }
    return null;
  },
  transform(code, id) {
    if (id.replace(/\\/g, "/").endsWith("frontend/src/ui.ts")) {
      return { code: code.split("`/apps/").join("`./apps/"), map: null };
    }
    return null;
  },
  transformIndexHtml: {
    order: "post",
    handler(html) {
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
  publicDir: `${here}/../../frontend/public`,
  clearScreen: false,
  plugins: [filePlugin],
  server: { port: 5613, host: false, strictPort: true },
  build: {
    outDir: here,
    emptyOutDir: false,
    sourcemap: false,
    target: "es2022",
    assetsInlineLimit: 0,
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: { format: "iife", inlineDynamicImports: true, entryFileNames: "assets/switcher.js", assetFileNames: "assets/[name][extname]" },
    },
  },
};

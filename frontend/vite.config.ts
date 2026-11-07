import { defineConfig } from "vite";
import { extensionRoutes } from "./vite-ext.ts";

const FRONTEND_PORT = 5610;

export default defineConfig({
  plugins: [extensionRoutes()],
  root: ".",
  publicDir: "public",
  clearScreen: false,
  server: {
    port: FRONTEND_PORT,
    host: false,
    strictPort: true,
    fs: { allow: [".", "../core/data"] },
  },
  preview: {
    port: FRONTEND_PORT + 1,
    host: false,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
    assetsInlineLimit: 0,
  },
});

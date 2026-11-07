import { installPath, productId, registry, type CatalogDoc, type InstalledDoc, type Platform } from "./engine";

const MISSING = ["formencoder", "formskills", "formdam", "formweb", "formtools"];

const UPDATED: Record<string, [string, string]> = {
  formvis: ["1.60.0", "1.66.1"],
  formcut: ["2.6.2", "2.8.8"],
};

export function sampleDocs(platform: Platform, now: number): { installed: InstalledDoc; catalog: CatalogDoc } {
  const apps = registry.apps.filter((a) => !registry.excluded.includes(a.id));
  const installs: NonNullable<InstalledDoc["installs"]> = [];
  const products: NonNullable<CatalogDoc["products"]> = [];
  apps.forEach((a, i) => {
    const pair = UPDATED[a.id];
    const current = pair ? pair[0] : `${1 + (i % 3)}.${(i * 7) % 12}.${i % 5}`;
    const latest = pair ? pair[1] : current;
    if (!MISSING.includes(a.id)) {
      installs.push({ product: productId(a.id), channel: "stable", current: { version: current, path: installPath(platform, a) } });
    }
    const at = Date.parse(a.opens) / 1000;
    if (at <= now) {
      products.push({
        id: productId(a.id),
        name: a.name,
        channels: { stable: { version: latest, artifacts: [{ platform: "macos" }, { platform: "windows" }, { platform: "linux" }] } },
      });
    }
  });
  return { installed: { installs }, catalog: { products } };
}

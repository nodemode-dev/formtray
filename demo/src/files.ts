import { Engine, type CatalogDoc, type InstalledDoc } from "./engine";
import { engine } from "./bridge";

export interface Outcome {
  ok: boolean;
  message: string;
}

export async function readFiles(files: File[]): Promise<Outcome> {
  let installed: InstalledDoc | null = null;
  let catalog: CatalogDoc | null = null;
  let prefs = false;
  const notes: string[] = [];
  for (const file of files) {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      return { ok: false, message: `${file.name} is not valid JSON.` };
    }
    const obj = data as Record<string, unknown>;
    if (obj && Array.isArray(obj.installs)) {
      installed = obj as InstalledDoc;
      notes.push(`${file.name}: ${(obj.installs as unknown[]).length} installs`);
    } else if (obj && Array.isArray(obj.products)) {
      catalog = obj as CatalogDoc;
      notes.push(`${file.name}: ${(obj.products as unknown[]).length} catalogue products`);
    } else if (obj && typeof obj === "object" && ("widgets" in obj || "hotkeys" in obj || "default_view" in obj || "pinned" in obj)) {
      const clean = Engine.cleanPrefs(obj);
      if (!clean) return { ok: false, message: `${file.name} is not a FormTray prefs.json.` };
      engine.setPrefs(clean);
      prefs = true;
      notes.push(`${file.name}: settings`);
    } else {
      return { ok: false, message: `${file.name} is not FormPortal's installed.json, its catalog apps.json or a FormTray prefs.json.` };
    }
  }
  if (installed || catalog) engine.importPortal(installed, catalog);
  else if (!prefs) return { ok: false, message: "No files were read." };
  return { ok: true, message: `Read ${notes.join("; ")}.` };
}

export function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

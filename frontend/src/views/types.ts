import type { Prefs, Snapshot, View } from "../bridge";
import type { ExtApi } from "../ext/host";

export interface Ctx {
  snap: Snapshot;
  ext?: ExtApi;
  open(id: string): void | Promise<boolean>;
  quit(id: string): Promise<void>;
  go(view: View | "prefs"): void;
  dismiss(): void;
  toast(message: string): void;
  savePrefs(prefs: Prefs): Promise<void>;
  updates(): void;
}

export interface ViewModule {
  mount(root: HTMLElement, ctx: Ctx): void;
  update(snap: Snapshot): void;
  shown(reason: string): void;
  key?(e: KeyboardEvent): boolean;
  step?(by: number): void;
  commit?(): void;
}

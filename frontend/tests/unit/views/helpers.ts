import { vi } from 'vitest';
import type { AppState, Snapshot } from '../../../src/bridge';
import type { Ctx } from '../../../src/views/types';

export const NOW = 1_800_000_000;

export function app(id: string, over: Partial<AppState> = {}): AppState {
  return {
    id,
    name: id,
    alt_of: '',
    category: 'make',
    hue: '210',
    icon: '',
    live_icon: '',
    name_source: 'registry',
    installed: true,
    path: null,
    running: false,
    processes: 0,
    since: 0,
    count: 0,
    last: 0,
    hidden: false,
    ...over,
  };
}

export function snap(apps: AppState[]): Snapshot {
  return {
    categories: [
      { id: 'make', name: 'Make' },
      { id: 'write', name: 'Write' },
    ],
    apps,
    prefs: { default_view: 'widgets', open_at_login: false, hidden: [], pinned: [], locations: [], widgets: [], hotkeys: {} },
    hotkeys: {},
    platform: 'macos',
    portal: false,
    updates: [],
    last_view: 'widgets',
  };
}

export function makeCtx(apps: AppState[]) {
  const open = vi.fn<(id: string) => Promise<boolean>>(async () => true);
  const quit = vi.fn<(id: string) => Promise<void>>(async () => undefined);
  const go = vi.fn<(v: string) => void>();
  const toast = vi.fn<(m: string) => void>();
  const ctx: Ctx = {
    snap: snap(apps),
    open,
    quit,
    go,
    dismiss: () => undefined,
    toast,
    savePrefs: async () => undefined,
    updates: () => undefined,
  };
  return { ctx, open, quit, go, toast };
}

export function root(): HTMLElement {
  document.body.innerHTML = '';
  const node = document.createElement('div');
  document.body.append(node);
  return node;
}

export function key(k: string, init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: k, ...init });
}

export function texts(nodes: Iterable<Element>): string[] {
  return [...nodes].map((n) => n.textContent ?? '');
}

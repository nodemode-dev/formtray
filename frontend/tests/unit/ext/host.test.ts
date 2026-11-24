import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createExtensions, type ExtApi, type ExtDeps, type Listing } from '../../../src/ext/host';
import type { ExtensionRecord, Permission } from '../../../src/ext/host-bridge';
import type { AppState, Prefs, Snapshot, Tile, View } from '../../../src/bridge';

type Reply = { id?: number; result?: unknown; error?: { code: number; message: string }; method?: string; params?: unknown };

const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};

function mkApp(id: string, name: string, category: string, installed: boolean, running: boolean): AppState {
  return { id, name, alt_of: '', category, hue: '', icon: '', live_icon: '', name_source: 'registry', installed, path: null, running, processes: 1, since: 0, count: 0, last: 0, hidden: false };
}

function tile(app: string, size: Tile['size']): Tile {
  return { kind: 'app', id: app, app, name: '', apps: [], size };
}

function mkSnap(): Snapshot {
  return {
    categories: [],
    apps: [mkApp('formvis', 'FormVis', 'image', true, true), mkApp('formcut', 'FormCut', 'motion', true, false), mkApp('formwav', 'FormWav', 'sound', true, false), mkApp('formportal', 'FormPortal', 'family', false, false)],
    prefs: {
      default_view: 'widgets',
      open_at_login: false,
      hidden: [],
      pinned: ['formvis'],
      locations: [],
      widgets: [tile('formvis', 'l'), tile('formcut', 'm'), { kind: 'group', id: 'group-a1', app: '', name: 'Sound', apps: ['formwav'], size: 'm' }, { kind: 'extension', id: 'ext:hello:main', app: 'hello', name: 'main', apps: [], size: 'l' }, { kind: 'updates', id: 'updates', app: '', name: '', apps: [], size: 's' }],
      hotkeys: {},
    },
    hotkeys: {},
    platform: 'linux',
    portal: true,
    updates: [{ id: 'formvis', from: '1.60.0', to: '1.66.1' }],
    last_view: 'widgets',
  };
}

function mkExt(id: string, permissions: Permission[], extra: Partial<ExtensionRecord> = {}): ExtensionRecord {
  return { id, name: 'Hello', version: '1.0.0', source: 'development', permissions, base: 'about:', entryUi: 'blank', panels: [{ id: 'main', title: 'Board Notes', location: 'dock' }], commands: [], state: 'ready', ...extra };
}

interface Rig {
  api: ExtApi;
  layer: HTMLElement;
  snap: Snapshot;
  saved: Prefs[];
  toasts: string[];
  opened: string[];
  quits: string[];
  views: View[];
  rescans: number;
  updates: number;
}

function rig(exts: ExtensionRecord[]): Rig {
  const layer = document.createElement('div');
  document.body.append(layer);
  const r: Rig = { api: null as unknown as ExtApi, layer, snap: mkSnap(), saved: [], toasts: [], opened: [], quits: [], views: [], rescans: 0, updates: 0 };
  const deps: ExtDeps = {
    snap: () => r.snap,
    view: () => 'widgets',
    go: (v) => void r.views.push(v),
    open: (id) => void r.opened.push(id),
    quit: async (id) => void r.quits.push(id),
    rescan: () => void r.rescans++,
    updates: () => void r.updates++,
    savePrefs: async (p) => {
      r.saved.push(p);
      r.snap = { ...r.snap, prefs: p };
    },
    toast: (m) => void r.toasts.push(m),
    show: () => undefined,
  };
  const listing: Listing = { product: 'formtray', app: 'FormTray', appVersion: '0.18.0', stamp: [1, 1], extensions: exts };
  r.api = createExtensions(layer, deps, listing);
  return r;
}

interface Wire {
  frame: HTMLIFrameElement;
  title: HTMLElement;
  box: HTMLElement;
  sent: Reply[];
  rpc(method: string, params?: unknown): Promise<Reply>;
}

let seq = 100;

async function connect(r: Rig, id: string, allow = true): Promise<Wire> {
  const box = document.createElement('div');
  const title = document.createElement('h3');
  document.body.append(box);
  r.api.mountPanel(id, 'main', box, title);
  const ask = [...box.querySelectorAll('button')].find((b) => b.textContent === 'Allow...');
  if (ask && allow) {
    ask.click();
    await flush();
    const yes = [...r.layer.querySelectorAll<HTMLButtonElement>('.ext-scrim button')].find((b) => b.textContent === 'Allow');
    yes?.click();
  }
  await flush();
  const frame = box.querySelector('iframe') as HTMLIFrameElement;
  const sent: Reply[] = frame ? childOf(frame).sent : [];
  const rpc = async (method: string, params: unknown = {}): Promise<Reply> => {
    const n = ++seq;
    window.dispatchEvent(new MessageEvent('message', { data: { formext: 1, jsonrpc: '2.0', id: n, method, params }, source: frame.contentWindow as unknown as MessageEventSource }));
    await flush();
    const got = sent.find((m) => m.id === n && m.method === undefined);
    if (!got) throw new Error(`no reply to ${method}`);
    return got;
  };
  return { frame, title, box, sent, rpc };
}

interface Child {
  sent: Reply[];
  postMessage(m: Reply): void;
}

const children = new WeakMap<object, Child>();

function childOf(frame: object): Child {
  let c = children.get(frame);
  if (!c) {
    const sent: Reply[] = [];
    c = { sent, postMessage: (m) => void sent.push(m) };
    children.set(frame, c);
  }
  return c;
}

const ALL: Permission[] = ['document', 'files-read', 'files-write', 'network'];

beforeEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
  vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockImplementation(function (this: HTMLIFrameElement) {
    return childOf(this) as unknown as Window;
  });
});

describe('extension frame and consent', () => {
  it('shows a dock panel titled Name: Panel as the docs say', async () => {
    const r = rig([mkExt('hello', [])]);
    const w = await connect(r, 'hello');
    expect(w.title.textContent).toBe('Hello: Board Notes');
  });

  it('loads an extension with no permissions in a frame sandboxed to scripts only', async () => {
    const r = rig([mkExt('hello', [])]);
    const w = await connect(r, 'hello');
    expect(w.frame.getAttribute('sandbox')).toBe('allow-scripts');
  });

  it('asks for permission before loading an extension that wants the document', async () => {
    const r = rig([mkExt('hello', ['document'])]);
    const w = await connect(r, 'hello', false);
    expect(w.frame).toBeNull();
    expect(w.box.textContent).toContain('Needs your permission');
    expect(r.api.state(r.api.get('hello') as ExtensionRecord)).toBe('needs-permission');
  });

  it('the consent card names the extension, its version and each permission in plain words', async () => {
    const r = rig([mkExt('hello', ['document', 'files-read'])]);
    const box = document.createElement('div');
    r.api.mountPanel('hello', 'main', box, document.createElement('h3'));
    (box.querySelector('button') as HTMLButtonElement).click();
    await flush();
    const card = r.layer.querySelector('.ext-scrim') as HTMLElement;
    expect(card.getAttribute('aria-label')).toBe('Allow Hello');
    expect(card.textContent).toContain('Hello 1.0.0 asks to:');
    expect([...card.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Read and change the open document', 'Open files you choose']);
  });

  it('Not Now leaves the extension unloaded and still needing permission', async () => {
    const r = rig([mkExt('hello', ['document'])]);
    const box = document.createElement('div');
    r.api.mountPanel('hello', 'main', box, document.createElement('h3'));
    (box.querySelector('button') as HTMLButtonElement).click();
    await flush();
    const later = [...r.layer.querySelectorAll<HTMLButtonElement>('.ext-scrim button')].find((b) => b.textContent === 'Not Now') as HTMLButtonElement;
    later.click();
    await flush();
    expect(box.querySelector('iframe')).toBeNull();
    expect(r.layer.querySelector('.ext-scrim')).toBeNull();
    expect(r.api.state(r.api.get('hello') as ExtensionRecord)).toBe('needs-permission');
  });

  it('Allow loads the frame and the extension reads as ready afterwards', async () => {
    const r = rig([mkExt('hello', ['document'])]);
    const w = await connect(r, 'hello');
    expect(w.frame).not.toBeNull();
    expect(r.api.state(r.api.get('hello') as ExtensionRecord)).toBe('ready');
  });

  it('a new version of an allowed extension must be allowed again', async () => {
    const r = rig([mkExt('hello', ['document'])]);
    await connect(r, 'hello');
    const r2 = rig([mkExt('hello', ['document'], { version: '1.1.0' })]);
    expect(r2.api.state(r2.api.get('hello') as ExtensionRecord)).toBe('needs-permission');
  });

  it('a refused extension cannot be mounted and reports refused', () => {
    const r = rig([mkExt('hello', [], { state: 'refused', reason: 'product is formvis' })]);
    expect(r.api.mountPanel('hello', 'main', document.createElement('div'), document.createElement('h3'))).toBeNull();
    expect(r.api.state(r.api.get('hello') as ExtensionRecord)).toBe('refused');
    expect(r.api.dockable('hello', 'main')).toBe(false);
  });

  it('running a command of an extension formtray does not have fails with -32601', async () => {
    const r = rig([]);
    await expect(r.api.run('ghost', 'x')).rejects.toMatchObject({ code: -32601, message: 'formtray has no extension ghost' });
  });
});

describe('messages the host accepts and refuses', () => {
  it('host.hello answers with product formtray and API 1', async () => {
    const r = rig([mkExt('hello', ['document'])]);
    const w = await connect(r, 'hello');
    const res = (await w.rpc('host.hello')).result as Record<string, unknown>;
    expect(res.product).toBe('formtray');
    expect(res.api).toBe('1');
    expect(res.appVersion).toBe('0.18.0');
    expect(res.extension).toEqual({ id: 'hello', version: '1.0.0', source: 'development' });
    expect(res.permissions).toEqual(['document']);
  });

  it('ignores a message that is not marked as the extension contract', async () => {
    const r = rig([mkExt('hello', [])]);
    const w = await connect(r, 'hello');
    window.dispatchEvent(new MessageEvent('message', { data: { jsonrpc: '2.0', id: 7, method: 'host.hello' }, source: w.frame.contentWindow as unknown as MessageEventSource }));
    await flush();
    expect(w.sent).toEqual([]);
  });

  it('ignores a message that comes from another window', async () => {
    const r = rig([mkExt('hello', [])]);
    const w = await connect(r, 'hello');
    window.dispatchEvent(new MessageEvent('message', { data: { formext: 1, jsonrpc: '2.0', id: 8, method: 'host.hello' }, source: window as unknown as MessageEventSource }));
    await flush();
    expect(w.sent).toEqual([]);
  });

  it('refuses a method outside API 1 with -32601', async () => {
    const r = rig([mkExt('hello', ALL)]);
    const w = await connect(r, 'hello');
    expect((await w.rpc('shell.exec')).error?.code).toBe(-32601);
  });

  it('refuses document.read with -32001 when the extension did not ask for document', async () => {
    const r = rig([mkExt('hello', [])]);
    const w = await connect(r, 'hello');
    const rep = await w.rpc('document.read');
    expect(rep.error?.code).toBe(-32001);
    expect(rep.error?.message).toContain('document permission');
  });

  it('files.save is not available (-32003) even with files-write allowed', async () => {
    const r = rig([mkExt('hello', ALL)]);
    const w = await connect(r, 'hello');
    expect((await w.rpc('files.save', { name: 'a.txt', data: 'aGk=' })).error?.code).toBe(-32003);
  });

  it('net.fetch is not available (-32003) even with network allowed', async () => {
    const r = rig([mkExt('hello', ALL)]);
    const w = await connect(r, 'hello');
    expect((await w.rpc('net.fetch', { url: 'https://example.com/' })).error?.code).toBe(-32003);
  });

  it('ui.notify shows a toast that starts with the extension name', async () => {
    const r = rig([mkExt('hello', [])]);
    const w = await connect(r, 'hello');
    expect((await w.rpc('ui.notify', { message: 'Saved' })).result).toBeNull();
    expect(r.toasts).toEqual(['Hello: Saved']);
  });

  it('ui.setTitle retitles the docked tile and an empty title restores Name: Panel', async () => {
    const r = rig([mkExt('hello', [])]);
    const w = await connect(r, 'hello');
    await w.rpc('ui.setTitle', { title: 'Today' });
    expect(w.title.textContent).toBe('Hello: Today');
    await w.rpc('ui.setTitle', { title: '' });
    expect(w.title.textContent).toBe('Hello: Board Notes');
  });

  it('storage.set then storage.get returns the same value', async () => {
    const r = rig([mkExt('hello', [])]);
    const w = await connect(r, 'hello');
    await w.rpc('storage.set', { key: 'k', value: { n: 3, s: ['a'] } });
    expect((await w.rpc('storage.get', { key: 'k' })).result).toEqual({ n: 3, s: ['a'] });
  });
});

describe('document.read', () => {
  it('returns the whole snapshot by default, with tile ids as documented', async () => {
    const r = rig([mkExt('hello', ['document'])]);
    const w = await connect(r, 'hello');
    const res = (await w.rpc('document.read')).result as Record<string, unknown>;
    expect(Object.keys(res).sort()).toEqual(['apps', 'board', 'hidden', 'pinned', 'portal', 'product', 'updates', 'view']);
    expect(res.product).toBe('formtray');
    expect(res.view).toBe('widgets');
    expect(res.board).toEqual([
      { tile: 'formvis', kind: 'app', app: 'formvis', size: 'l' },
      { tile: 'formcut', kind: 'app', app: 'formcut', size: 'm' },
      { tile: 'group-a1', kind: 'group', name: 'Sound', apps: ['formwav'], size: 'm' },
      { tile: 'ext:hello:main', kind: 'extension', extension: 'hello', panel: 'main', size: 'l' },
      { tile: 'updates', kind: 'updates', size: 's' },
    ]);
    expect(res.pinned).toEqual(['formvis']);
    expect(res.hidden).toEqual([]);
    expect(res.portal).toBe(true);
    expect(res.updates).toEqual([{ app: 'formvis', from: '1.60.0', to: '1.66.1' }]);
  });

  it('lists each app with the documented fields', async () => {
    const r = rig([mkExt('hello', ['document'])]);
    const w = await connect(r, 'hello');
    const res = (await w.rpc('document.read', { what: 'apps' })).result as { apps: unknown[] };
    expect(res.apps[0]).toEqual({ id: 'formvis', name: 'FormVis', category: 'image', installed: true, running: true, hidden: false, pinned: true, onBoard: true });
    expect(res.apps[3]).toEqual({ id: 'formportal', name: 'FormPortal', category: 'family', installed: false, running: false, hidden: false, pinned: false, onBoard: false });
  });

  for (const [what, keys] of [['all', 8], ['apps', ['apps']], ['board', ['board']], ['pinned', ['pinned']], ['hidden', ['hidden']], ['updates', ['portal', 'updates']], ['view', ['view']]] as [string, number | string[]][]) {
    it(`what "${what}" returns the keys the table lists`, async () => {
      const r = rig([mkExt('hello', ['document'])]);
      const w = await connect(r, 'hello');
      const res = (await w.rpc('document.read', { what })).result as Record<string, unknown>;
      if (typeof keys === 'number') expect(Object.keys(res)).toHaveLength(keys);
      else expect(Object.keys(res).sort()).toEqual(keys);
    });
  }

  for (const what of ['portal', 'windows', '']) {
    it(`what "${what}" fails with -32602`, async () => {
      const r = rig([mkExt('hello', ['document'])]);
      const w = await connect(r, 'hello');
      expect((await w.rpc('document.read', { what })).error?.code).toBe(-32602);
    });
  }
});

describe('app.commands and app.run', () => {
  const DOCUMENTED = ['board.add', 'board.remove', 'board.resize', 'board.move', 'group.create', 'group.rename', 'group.add', 'group.remove', 'stack.pin', 'stack.unpin', 'app.hide', 'app.unhide', 'app.open', 'app.quit', 'view.show', 'apps.rescan', 'updates.open'];

  async function ready() {
    const r = rig([mkExt('hello', ['document'])]);
    const w = await connect(r, 'hello');
    return { r, w, run: (command: string, args: unknown = {}) => w.rpc('app.run', { command, args }) };
  }

  it('app.commands returns exactly the seventeen commands of the docs table', async () => {
    const { w } = await ready();
    const res = (await w.rpc('app.commands')).result as { id: string }[];
    expect(res.map((c) => c.id)).toEqual(DOCUMENTED);
  });

  it('board.add puts an app tile on the board at size m by default', async () => {
    const { r, run } = await ready();
    expect((await run('board.add', { app: 'formwav' })).result).toEqual({ tile: 'formwav' });
    expect(r.saved).toHaveLength(1);
    const added = r.saved[0].widgets.find((t) => t.app === 'formwav' && t.kind === 'app');
    expect(added?.size).toBe('m');
  });

  it('board.add with an unknown app fails with -32004, says why and changes nothing', async () => {
    const { r, run } = await ready();
    const rep = await run('board.add', { app: 'formnope' });
    expect(rep.error?.code).toBe(-32004);
    expect(rep.error?.message).toContain('formnope');
    expect(r.saved).toEqual([]);
  });

  it('board.resize with an unknown size fails with -32004 and changes nothing', async () => {
    const { r, run } = await ready();
    const rep = await run('board.resize', { tile: 'formvis', size: 'xl' });
    expect(rep.error?.code).toBe(-32004);
    expect(rep.error?.message).toContain('xl');
    expect(r.saved).toEqual([]);
  });

  it('board.resize changes the size of the named tile only', async () => {
    const { r, run } = await ready();
    await run('board.resize', { tile: 'formcut', size: 's' });
    expect(r.saved[0].widgets.map((t) => t.size)).toEqual(['l', 's', 'm', 'l', 's']);
  });

  it('board.move with index 0 makes the tile first', async () => {
    const { r, run } = await ready();
    await run('board.move', { tile: 'group-a1', index: 0 });
    expect(r.saved[0].widgets.map((t) => t.id)).toEqual(['group-a1', 'formvis', 'formcut', 'ext:hello:main', 'updates']);
  });

  it('board.remove takes the tile off and an unknown tile fails with -32004', async () => {
    const { r, run } = await ready();
    await run('board.remove', { tile: 'updates' });
    expect(r.saved[0].widgets.map((t) => t.id)).toEqual(['formvis', 'formcut', 'group-a1', 'ext:hello:main']);
    const rep = await run('board.remove', { tile: 'nothing' });
    expect(rep.error?.code).toBe(-32004);
    expect(r.saved).toHaveLength(1);
  });

  it('group.create returns a group- tile id that document.read then shows', async () => {
    const { w, run } = await ready();
    const made = (await run('group.create', { name: 'Video', apps: ['formcut'] })).result as { tile: string };
    expect(made.tile.startsWith('group-')).toBe(true);
    const board = ((await w.rpc('document.read', { what: 'board' })).result as { board: Record<string, unknown>[] }).board;
    expect(board[board.length - 1]).toEqual({ tile: made.tile, kind: 'group', name: 'Video', apps: ['formcut'], size: 'm' });
  });

  it('group.rename, group.add and group.remove change the named group', async () => {
    const { r, run } = await ready();
    await run('group.rename', { tile: 'group-a1', name: 'Audio' });
    await run('group.add', { tile: 'group-a1', app: 'formcut' });
    await run('group.remove', { tile: 'group-a1', app: 'formwav' });
    const g = r.snap.prefs.widgets.find((t) => t.id === 'group-a1');
    expect(g?.name).toBe('Audio');
    expect(g?.apps).toEqual(['formcut']);
  });

  it('group.rename on an app tile fails with -32004', async () => {
    const { run } = await ready();
    expect((await run('group.rename', { tile: 'formvis', name: 'X' })).error?.code).toBe(-32004);
  });

  it('stack.pin then stack.unpin returns the pins to where they were', async () => {
    const { r, run } = await ready();
    await run('stack.pin', { app: 'formcut' });
    expect(r.snap.prefs.pinned).toEqual(['formvis', 'formcut']);
    await run('stack.unpin', { app: 'formcut' });
    expect(r.snap.prefs.pinned).toEqual(['formvis']);
  });

  it('app.hide then app.unhide returns the hidden list to empty', async () => {
    const { r, run } = await ready();
    await run('app.hide', { app: 'formwav' });
    expect(r.snap.prefs.hidden).toEqual(['formwav']);
    await run('app.unhide', { app: 'formwav' });
    expect(r.snap.prefs.hidden).toEqual([]);
  });

  it('app.open opens the named app without saving the board', async () => {
    const { r, run } = await ready();
    expect((await run('app.open', { app: 'formcut' })).result).toBeNull();
    expect(r.opened).toEqual(['formcut']);
    expect(r.saved).toEqual([]);
  });

  it('app.quit quits a running app', async () => {
    const { r, run } = await ready();
    await run('app.quit', { app: 'formvis' });
    expect(r.quits).toEqual(['formvis']);
  });

  for (const view of ['switcher', 'stack', 'apps', 'windows', 'widgets'] as View[]) {
    it(`view.show shows ${view}`, async () => {
      const { r, run } = await ready();
      await run('view.show', { view });
      expect(r.views).toEqual([view]);
    });
  }

  it('view.show refuses a view that is not in the docs list', async () => {
    const { r, run } = await ready();
    expect((await run('view.show', { view: 'prefs' })).error?.code).toBe(-32004);
    expect(r.views).toEqual([]);
  });

  it('apps.rescan and updates.open each act once', async () => {
    const { r, run } = await ready();
    await run('apps.rescan');
    await run('updates.open');
    expect([r.rescans, r.updates]).toEqual([1, 1]);
  });

  it('an unknown command fails with -32004', async () => {
    const { run } = await ready();
    expect((await run('board.explode')).error?.code).toBe(-32004);
  });
});

describe('document.apply', () => {
  async function ready() {
    const r = rig([mkExt('hello', ['document'])]);
    const w = await connect(r, 'hello');
    return { r, w };
  }

  it('lands every op in one save and shows the label as a toast', async () => {
    const { r, w } = await ready();
    const rep = await w.rpc('document.apply', { label: 'Tidy board', ops: [{ command: 'board.add', args: { app: 'formwav', size: 's' } }, { command: 'stack.pin', args: { app: 'formcut' } }] });
    expect((rep.result as { applied: number }).applied).toBe(2);
    expect(r.saved).toHaveLength(1);
    expect(r.saved[0].pinned).toEqual(['formvis', 'formcut']);
    expect(r.saved[0].widgets.some((t) => t.app === 'formwav' && t.size === 's')).toBe(true);
    expect(r.toasts).toEqual(['Hello: Tidy board']);
  });

  it('lands nothing when one op names an unknown app', async () => {
    const { r, w } = await ready();
    const rep = await w.rpc('document.apply', { label: 'Half', ops: [{ command: 'stack.pin', args: { app: 'formcut' } }, { command: 'board.add', args: { app: 'formnope' } }] });
    expect(rep.error?.code).toBe(-32004);
    expect(r.saved).toEqual([]);
    expect(r.snap.prefs.pinned).toEqual(['formvis']);
    expect(r.toasts).toEqual([]);
  });

  for (const command of ['app.open', 'app.quit', 'view.show', 'apps.rescan', 'updates.open']) {
    it(`refuses the action command ${command}, which runs only through app.run`, async () => {
      const { r, w } = await ready();
      const rep = await w.rpc('document.apply', { label: 'x', ops: [{ command, args: { app: 'formvis', view: 'stack' } }] });
      expect(rep.error?.code).toBe(-32004);
      expect(rep.error?.message).toContain('app.run');
      expect([r.opened, r.quits, r.views, r.rescans, r.updates, r.saved]).toEqual([[], [], [], 0, 0, []]);
    });
  }

  it('fails with -32602 when ops is not a list', async () => {
    const { w } = await ready();
    expect((await w.rpc('document.apply', { label: 'x', ops: 'board.add' })).error?.code).toBe(-32602);
  });
});

describe('events sent to extensions', () => {
  async function ready() {
    const r = rig([mkExt('hello', ['document'])]);
    const w = await connect(r, 'hello');
    const events = () => w.sent.filter((m) => m.method === 'ext.event').map((m) => m.params);
    return { r, w, events };
  }

  it('sends document.changed with only the parts that changed', async () => {
    const { r, events } = await ready();
    const next = mkSnap();
    next.prefs.pinned = ['formvis', 'formcut'];
    r.api.observe(next);
    expect(events()).toEqual([{ name: 'document.changed', data: { what: ['pinned'] } }]);
  });

  it('names board and hidden when both changed', async () => {
    const { r, events } = await ready();
    const next = mkSnap();
    next.prefs.widgets.pop();
    next.prefs.hidden = ['formwav'];
    r.api.observe(next);
    expect(events()).toEqual([{ name: 'document.changed', data: { what: ['board', 'hidden'] } }]);
  });

  it('sends nothing when the snapshot is the same', async () => {
    const { r, events } = await ready();
    r.api.observe(mkSnap());
    expect(events()).toEqual([]);
  });

  it('sends apps.changed with the running ids when an app was opened', async () => {
    const { r, events } = await ready();
    const next = mkSnap();
    next.apps[1].running = true;
    r.api.observe(next);
    expect(events()).toEqual([{ name: 'apps.changed', data: { running: ['formvis', 'formcut'] } }]);
  });

  it('sends apps.changed with an empty list when the last app quit', async () => {
    const { r, events } = await ready();
    const next = mkSnap();
    next.apps[0].running = false;
    r.api.observe(next);
    expect(events()).toEqual([{ name: 'apps.changed', data: { running: [] } }]);
  });

  it('sends selection.changed with the view formtray switched to', async () => {
    const { r, events } = await ready();
    r.api.viewChanged('stack');
    expect(events()).toEqual([{ name: 'selection.changed', data: { view: 'stack' } }]);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSheet, type SheetActions } from '../../../src/ext/sheet';
import type { ExtensionRecord } from '../../../src/ext/host-bridge';
import { call, on, previewEmit, VIEWS, type Prefs, type Snapshot } from '../../../src/bridge';
import { DEMOS, openDemo } from '../../../src/demos';

function ext(id: string, extra: Partial<ExtensionRecord> = {}): ExtensionRecord {
  return { id, name: id, version: '1.2.3', source: 'catalogue', permissions: [], base: 'about:', entryUi: 'blank', panels: [{ id: 'main', title: 'Main' }], commands: [], state: 'ready', ...extra };
}

function setup(state: ReturnType<SheetActions['state']> = 'ready') {
  const layer = document.createElement('div');
  document.body.append(layer);
  const calls: string[] = [];
  const sheet = buildSheet(layer, {
    state: (e) => (e.state === 'refused' ? 'refused' : state),
    open: (id, panel) => void calls.push(`open ${id} ${panel}`),
    allow: (id) => void calls.push(`allow ${id}`),
    reload: () => void calls.push('reload'),
    manage: () => void calls.push('manage'),
  });
  const node = layer.querySelector('.ext-sheet') as HTMLElement;
  const buttons = (root: ParentNode = node) => [...root.querySelectorAll('button')];
  const press = (label: string, root: ParentNode = node) => (buttons(root).find((b) => b.textContent === label) as HTMLButtonElement).click();
  return { layer, sheet, node, calls, buttons, press };
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('extensions panel', () => {
  it('stays hidden until shown and Escape closes it again', () => {
    const s = setup();
    expect(s.node.hidden).toBe(true);
    s.sheet.show();
    expect(s.node.hidden).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(s.node.hidden).toBe(true);
  });

  it('says where to find extensions when there are none', () => {
    const s = setup();
    s.sheet.render([]);
    const empty = s.node.querySelector('.ext-empty') as HTMLElement;
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toContain('FormPortal');
    expect(empty.textContent).toContain('form.ext');
  });

  it('shows one row per extension, in the order given', () => {
    const s = setup();
    s.sheet.render([ext('b'), ext('a'), ext('c')]);
    expect([...s.node.querySelectorAll('.ext-row .ext-name')].map((n) => n.textContent)).toEqual(['b', 'a', 'c']);
    expect((s.node.querySelector('.ext-empty') as HTMLElement).hidden).toBe(true);
  });

  it('a row shows the version and the state', () => {
    const s = setup();
    s.sheet.render([ext('a')]);
    const row = s.node.querySelector('.ext-row') as HTMLElement;
    expect(row.querySelector('.ext-ver')?.textContent).toBe('1.2.3');
    expect(row.querySelector('.ext-state')?.textContent).toBe('Ready');
  });

  for (const [source, word] of [['catalogue', 'Catalogue'], ['sideload', 'File'], ['development', 'Development']] as const) {
    it(`names the source ${source} as ${word}`, () => {
      const s = setup();
      s.sheet.render([ext('a', { source })]);
      expect(s.node.querySelector('.ext-src')?.textContent).toBe(word);
    });
  }

  it('shows the folder of a development extension only', () => {
    const s = setup();
    s.sheet.render([ext('dev', { source: 'development', path: '/home/me/hello' }), ext('cat', { source: 'catalogue', path: '/somewhere/else' })]);
    const paths = [...s.node.querySelectorAll<HTMLElement>('.ext-path')];
    expect(paths[0].textContent).toBe('/home/me/hello');
    expect(paths[0].hidden).toBe(false);
    expect(paths[1].textContent).toBe('');
    expect(paths[1].hidden).toBe(true);
  });

  it('shows one chip per permission', () => {
    const s = setup();
    s.sheet.render([ext('a', { permissions: ['document', 'files-read'] })]);
    expect([...s.node.querySelectorAll('.ext-chip')].map((c) => c.textContent)).toEqual(['document', 'files-read']);
  });

  it('one panel gets an Open button that opens that panel', () => {
    const s = setup();
    s.sheet.render([ext('a')]);
    s.press('Open');
    expect(s.calls).toEqual(['open a main']);
  });

  it('several panels each get their own Open button', () => {
    const s = setup();
    s.sheet.render([ext('a', { panels: [{ id: 'one', title: 'One' }, { id: 'two', title: 'Two' }] })]);
    s.press('Open Two');
    expect(s.calls).toEqual(['open a two']);
  });

  it('an extension that needs permission says so and offers Allow', () => {
    const s = setup('needs-permission');
    s.sheet.render([ext('a', { permissions: ['document'] })]);
    expect(s.node.querySelector('.ext-state')?.textContent).toBe('Needs Permission');
    s.press('Allow...');
    expect(s.calls).toEqual(['allow a']);
  });

  it('a refused extension shows its reason and has no buttons', () => {
    const s = setup();
    s.sheet.render([ext('a', { state: 'refused', reason: 'made for formvis' })]);
    const row = s.node.querySelector('.ext-row') as HTMLElement;
    expect(row.querySelector('.ext-state')?.textContent).toBe('Refused');
    expect(row.querySelector('.ext-reason')?.textContent).toBe('Refused: made for formvis');
    expect(row.querySelectorAll('button')).toHaveLength(0);
  });

  it('drops the row of an extension that went away', () => {
    const s = setup();
    s.sheet.render([ext('a'), ext('b')]);
    s.sheet.render([ext('b')]);
    expect([...s.node.querySelectorAll('.ext-row .ext-name')].map((n) => n.textContent)).toEqual(['b']);
  });

  it('Reload and Manage in FormPortal call their actions', () => {
    const s = setup();
    s.sheet.render([ext('a')]);
    const head = s.node.querySelector('.ext-head') as HTMLElement;
    s.press('Reload', head);
    s.press('Manage in FormPortal', head);
    expect(s.calls).toEqual(['reload', 'manage']);
  });
});

describe('bridge to the shell in the browser preview', () => {
  it('the preview snapshot matches the example in the docs', async () => {
    const snap = await call<Snapshot>('snapshot');
    expect(snap.last_view).toBe('widgets');
    expect(snap.portal).toBe(true);
    expect(snap.prefs.pinned.slice(0, 2)).toEqual(['formvis', 'formcut']);
    expect(snap.prefs.widgets.slice(0, 2).map((t) => [t.app, t.kind, t.size])).toEqual([['formvis', 'app', 'l'], ['formcut', 'app', 'l']]);
    expect(snap.updates[0]).toEqual({ id: 'formvis', from: '1.60.0', to: '1.66.1' });
    expect(snap.apps.find((a) => a.id === 'formvis')?.running).toBe(true);
  });

  it('formtray does not list itself among the apps', async () => {
    const snap = await call<Snapshot>('snapshot');
    expect(snap.apps.some((a) => a.id === 'formtray')).toBe(false);
  });

  it('prefs saved with set_prefs are what the next snapshot holds', async () => {
    const before = await call<Snapshot>('snapshot');
    const keep = before.prefs;
    const next: Prefs = { ...structuredClone(keep), hidden: ['formwav'], pinned: ['formcut'] };
    await call<Snapshot>('set_prefs', { prefs: next });
    const after = await call<Snapshot>('snapshot');
    expect(after.prefs.hidden).toEqual(['formwav']);
    expect(after.prefs.pinned).toEqual(['formcut']);
    await call<Snapshot>('set_prefs', { prefs: keep });
  });

  it('opening an app that is not installed is refused with its name', async () => {
    const snap = await call<Snapshot>('snapshot');
    const missing = snap.apps.find((a) => !a.installed);
    expect(missing).toBeDefined();
    await expect(call('open_app', { id: missing?.id })).rejects.toBe(`${missing?.name} is not installed on this computer`);
  });

  it('opening an installed app is accepted', async () => {
    await expect(call('open_app', { id: 'formvis' })).resolves.toBeUndefined();
  });

  it('a listener receives exactly what was emitted under its name', async () => {
    const got: unknown[] = [];
    await on<unknown>('ext-lane:ping', (p) => void got.push(p));
    previewEmit('ext-lane:ping', { n: 1 });
    previewEmit('ext-lane:other', { n: 2 });
    expect(got).toEqual([{ n: 1 }]);
  });

  it('the five views an extension can show are the ones the docs list', () => {
    expect(VIEWS).toEqual(['switcher', 'stack', 'apps', 'windows', 'widgets']);
  });
});

describe('demos', () => {
  it('each demo has a distinct id, a title and a line of text', () => {
    expect(new Set(DEMOS.map((d) => d.id)).size).toBe(DEMOS.length);
    for (const d of DEMOS) {
      expect(d.title.trim().length).toBeGreaterThan(0);
      expect(d.line.trim().endsWith('.')).toBe(true);
    }
  });

  it('demo art is a decorative picture hidden from screen readers', () => {
    for (const d of DEMOS) {
      const box = document.createElement('div');
      box.innerHTML = d.art;
      const svg = box.querySelector('svg');
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      expect(svg?.children.length).toBeGreaterThan(0);
    }
  });

  for (const id of ['overview', 'switcher', 'widgets'] as const) {
    it(`opening the ${id} demo opens its page in a new tab`, async () => {
      const open = vi.fn();
      vi.stubGlobal('open', open);
      await openDemo(id);
      expect(open).toHaveBeenCalledWith(`/demos/${id}.html`, '_blank', 'noopener');
      vi.unstubAllGlobals();
    });
  }
});

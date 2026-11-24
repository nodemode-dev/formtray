import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Prefs, Tile } from '../../../src/bridge';
import { widgets } from '../../../src/views/widgets';
import { NOW, app, makeCtx, root, texts } from './helpers';

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const tile = (id: string, size: Tile['size']): Tile => ({ kind: 'app', id, app: id, name: '', apps: [], size });

function mount(board: Tile[]) {
  vi.useFakeTimers();
  vi.setSystemTime(NOW * 1000);
  const c = makeCtx([
    app('formvis', { name: 'FormVis', running: true, last: NOW - 30 }),
    app('formcut', { name: 'FormCut', last: NOW - 2 * 3600 - 10, alt_of: 'Premiere' }),
    app('formwav', { name: 'FormWav', installed: false }),
    app('formmd', { name: 'form.md' }),
  ]);
  c.ctx.snap.prefs.widgets = board;
  const saved: Prefs[] = [];
  c.ctx.savePrefs = async (p) => {
    saved.push(p);
  };
  const r = root();
  const view = widgets();
  view.mount(r, c.ctx);
  return { ...c, r, view, saved };
}

const names = (r: HTMLElement) => texts(r.querySelectorAll('.wg-tile .wg-name'));

describe('Widgets board', () => {
  it('shows the saved tiles in the saved order with their sizes', () => {
    const { r } = mount([tile('formcut', 'l'), tile('formvis', 's'), tile('formmd', 'm')]);
    expect(names(r)).toEqual(['FormCut', 'FormVis', 'form.md']);
    expect([...r.querySelectorAll<HTMLElement>('.wg-tile')].map((n) => n.dataset.size)).toEqual(['l', 's', 'm']);
  });

  it('shows running state and last opened time on each tile, as the README describes', () => {
    const { r } = mount([tile('formvis', 'm'), tile('formcut', 'm'), tile('formwav', 'm'), tile('formmd', 'm')]);
    expect(texts(r.querySelectorAll('.wg-tile .wg-meta'))).toEqual(['Open now', 'Opened 2 h ago', 'Not installed', 'Not opened yet']);
  });

  it('opens the app when its tile is clicked', () => {
    const { r, open } = mount([tile('formvis', 'm'), tile('formcut', 'm')]);
    r.querySelector<HTMLButtonElement>('[aria-label="Open FormCut"]')?.click();
    expect(open.mock.calls).toEqual([['formcut']]);
  });

  it('removes a tile from the board and saves the board without it', () => {
    const { r, saved } = mount([tile('formvis', 'm'), tile('formcut', 'l'), tile('formmd', 's')]);
    r.querySelector<HTMLButtonElement>('[data-id="formcut"] [aria-label="Remove from board"]')?.click();
    expect(names(r)).toEqual(['FormVis', 'form.md']);
    expect(saved).toHaveLength(1);
    expect(saved[0].widgets.map((t) => [t.app, t.size])).toEqual([['formvis', 'm'], ['formmd', 's']]);
  });

  it('cycles a tile through the three sizes and is back at the start after three changes', () => {
    const { r, saved } = mount([tile('formvis', 's')]);
    const resize = r.querySelector<HTMLButtonElement>('[data-id="formvis"] [aria-label="Change size"]');
    resize?.click();
    resize?.click();
    resize?.click();
    const sizes = saved.map((p) => p.widgets[0].size);
    expect(new Set(sizes)).toEqual(new Set(['s', 'm', 'l']));
    expect(sizes[2]).toBe('s');
    expect(r.querySelector<HTMLElement>('[data-id="formvis"]')?.dataset.size).toBe('s');
  });

  it('says the board is empty only when it has no tiles', () => {
    const empty = mount([]);
    const line = [...empty.r.querySelectorAll<HTMLElement>('.pn-empty')].find((n) => n.textContent?.includes('The board is empty'));
    expect(line?.hidden).toBe(false);
    const full = mount([tile('formvis', 'm')]);
    const other = [...full.r.querySelectorAll<HTMLElement>('.pn-empty')].find((n) => n.textContent?.includes('The board is empty'));
    expect(other?.hidden).toBe(true);
  });

  it('does not open an app from its tile while the board is being edited', () => {
    const { r, open } = mount([tile('formvis', 'm')]);
    r.querySelector<HTMLButtonElement>('[title="Edit board"]')?.click();
    r.querySelector<HTMLButtonElement>('[aria-label="Open FormVis"]')?.click();
    expect(open).not.toHaveBeenCalled();
    r.querySelector<HTMLButtonElement>('[title="Finish editing"]')?.click();
    r.querySelector<HTMLButtonElement>('[aria-label="Open FormVis"]')?.click();
    expect(open.mock.calls).toEqual([['formvis']]);
  });

  it('marks a tile as open once its app starts running', () => {
    const { r, view, ctx } = mount([tile('formcut', 'm')]);
    view.update({ ...ctx.snap, apps: ctx.snap.apps.map((a) => (a.id === 'formcut' ? { ...a, running: true } : a)) });
    expect(r.querySelector('[data-id="formcut"] .wg-meta')?.textContent).toBe('Open now');
    expect(r.querySelector('[data-id="formcut"]')?.classList.contains('is-running')).toBe(true);
  });
});

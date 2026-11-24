import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Prefs, Snapshot } from '../../../src/bridge';
import { prefsView } from '../../../src/views/prefs';
import { app, makeCtx, root, texts } from './helpers';

afterEach(() => {
  document.body.innerHTML = '';
});

function mount(change: (s: Snapshot) => void = () => undefined) {
  const c = makeCtx([
    app('formvis', { name: 'FormVis', running: true }),
    app('formcut', { name: 'FormCut', path: '/Applications/FormCut.app' }),
    app('formwav', { name: 'FormWav', installed: false, hidden: true }),
    app('formtray', { name: 'FormTray' }),
  ]);
  c.ctx.snap.prefs.pinned = ['formcut'];
  c.ctx.snap.hotkeys = { switcher: 'Alt+Tab', 'view-apps': 'Control+Alt+Super+Digit3' };
  change(c.ctx.snap);
  const saved: Prefs[] = [];
  c.ctx.savePrefs = async (p) => {
    saved.push(p);
  };
  const r = root();
  const view = prefsView();
  view.mount(r, c.ctx);
  return { ...c, r, view, saved };
}

function toggle(box: HTMLInputElement | null, on: boolean) {
  if (!box) throw new Error('switch not found');
  box.checked = on;
  box.dispatchEvent(new Event('change'));
}

describe('Settings view', () => {
  it('offers the five views as the opening view with Widgets, the default, first', () => {
    const { r } = mount();
    const select = r.querySelector('select') as HTMLSelectElement;
    expect(texts(select.querySelectorAll('option'))).toEqual(['Widgets', 'Switcher', 'Stack', 'Apps', 'Windows']);
    expect(select.value).toBe('widgets');
  });

  it('saves the chosen opening view and keeps the other settings', () => {
    const { r, saved } = mount();
    const select = r.querySelector('select') as HTMLSelectElement;
    select.value = 'stack';
    select.dispatchEvent(new Event('change'));
    expect(saved).toHaveLength(1);
    expect(saved[0].default_view).toBe('stack');
    expect(saved[0].pinned).toEqual(['formcut']);
    expect(saved[0].hidden).toEqual(['formwav']);
  });

  it('does not list FormTray itself among the apps', () => {
    const { r } = mount();
    expect(texts(r.querySelectorAll('.pf-app-name strong'))).toEqual(['FormVis', 'FormCut', 'FormWav']);
  });

  it('says where each app is: open now, its path, or not found', () => {
    const { r } = mount();
    expect(texts(r.querySelectorAll('.pf-where'))).toEqual(['Open now', '/Applications/FormCut.app', 'Not found on this computer']);
  });

  it('hides an app when its Show switch is turned off and shows it again when turned on', () => {
    const { r, saved } = mount();
    toggle(r.querySelector('[aria-label="Show FormVis"]'), false);
    expect(saved[0].hidden.sort()).toEqual(['formvis', 'formwav']);
    toggle(r.querySelector('[aria-label="Show FormVis"]'), true);
    toggle(r.querySelector('[aria-label="Show FormWav"]'), true);
    expect(saved[2].hidden).toEqual([]);
  });

  it('adds a newly pinned app after the ones already in the menu bar', () => {
    const { r, saved } = mount();
    expect(r.querySelector<HTMLInputElement>('[aria-label="FormCut in menu bar"]')?.checked).toBe(true);
    toggle(r.querySelector('[aria-label="FormVis in menu bar"]'), true);
    expect(saved[0].pinned).toEqual(['formcut', 'formvis']);
    toggle(r.querySelector('[aria-label="FormCut in menu bar"]'), false);
    expect(saved[1].pinned).toEqual(['formvis']);
  });

  it('saves one folder per line, trimmed, without blank lines', () => {
    const { r, saved } = mount();
    const area = r.querySelector('textarea') as HTMLTextAreaElement;
    area.value = '  /opt/form  \n\n/home/me/Apps\n   \n';
    area.dispatchEvent(new Event('change'));
    expect(saved[0].locations).toEqual(['/opt/form', '/home/me/Apps']);
  });

  it('shows saved folders back one per line', () => {
    const { r } = mount((s) => {
      s.prefs.locations = ['/a', '/b c'];
    });
    expect((r.querySelector('textarea') as HTMLTextAreaElement).value.split('\n')).toEqual(['/a', '/b c']);
  });

  it('saves Open at login when the switch is turned on', () => {
    const { r, saved } = mount();
    const login = [...r.querySelectorAll<HTMLElement>('.pf-field')].find((f) => f.textContent?.includes('Open at login'))?.querySelector('input');
    toggle(login ?? null, true);
    expect(saved[0].open_at_login).toBe(true);
  });

  it('lists each hotkey in the words of the platform keyboard', async () => {
    const { r } = mount();
    await vi.waitFor(() => expect(r.querySelectorAll('.pf-key')).toHaveLength(2));
    expect(texts(r.querySelectorAll('.pf-kbd-btn'))).toEqual(['Option + Tab', 'Control + Option + Command + 3']);
  });

  it('offers Default only for a hotkey the user has rebound', async () => {
    const { r } = mount((s) => {
      s.prefs.hotkeys = { 'view-apps': 'Control+Alt+Super+Digit3' };
    });
    await vi.waitFor(() => expect(r.querySelectorAll('.pf-key')).toHaveLength(2));
    const rows = [...r.querySelectorAll('.pf-key')];
    expect(rows.map((row) => row.querySelectorAll('.pf-reset').length)).toEqual([0, 1]);
  });

  it('asks for a modifier when a bare key is pressed while rebinding', async () => {
    const { r, toast } = mount();
    await vi.waitFor(() => expect(r.querySelectorAll('.pf-kbd-btn')).toHaveLength(2));
    r.querySelector<HTMLButtonElement>('.pf-kbd-btn')?.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', cancelable: true }));
    expect(toast.mock.calls).toEqual([['Hold Control, Option or Command with the key.']]);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', cancelable: true }));
  });

  it('keeps the old hotkey when rebinding is cancelled with Esc', async () => {
    const { r, toast } = mount();
    await vi.waitFor(() => expect(r.querySelectorAll('.pf-kbd-btn')).toHaveLength(2));
    r.querySelector<HTMLButtonElement>('.pf-kbd-btn')?.click();
    expect(r.querySelector('.is-capturing')?.textContent).toBe('Press the new keys, or Esc');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', cancelable: true }));
    await vi.waitFor(() => expect(texts(r.querySelectorAll('.pf-kbd-btn'))).toEqual(['Option + Tab', 'Control + Option + Command + 3']));
    expect(r.querySelectorAll('.is-capturing')).toHaveLength(0);
    expect(toast).not.toHaveBeenCalled();
  });

  it('refuses a chord the system reserves and says why, as the README promises', async () => {
    const { r, toast } = mount();
    await vi.waitFor(() => expect(r.querySelectorAll('.pf-kbd-btn')).toHaveLength(2));
    r.querySelector<HTMLButtonElement>('.pf-kbd-btn')?.click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', metaKey: true, cancelable: true }));
    await vi.waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(String(toast.mock.calls[0][0])).toContain('Super+Space');
    await vi.waitFor(() => expect(texts(r.querySelectorAll('.pf-kbd-btn'))[0]).toBe('Option + Tab'));
  });

  it('closes from the Close button', () => {
    const c = mount();
    const dismiss = vi.fn<() => void>();
    c.ctx.dismiss = dismiss;
    c.r.querySelector<HTMLButtonElement>('[aria-label="Close"]')?.click();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('drops the row of an app that is no longer in the family list', () => {
    const { r, view, ctx } = mount();
    view.update({ ...ctx.snap, apps: ctx.snap.apps.filter((a) => a.id !== 'formcut') });
    expect(texts(r.querySelectorAll('.pf-app-name strong'))).toEqual(['FormVis', 'FormWav']);
  });
});

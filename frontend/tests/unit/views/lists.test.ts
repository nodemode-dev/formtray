import { afterEach, describe, expect, it, vi } from 'vitest';
import { stack } from '../../../src/views/stack';
import { switcher } from '../../../src/views/switcher';
import { windowsView } from '../../../src/views/windows';
import { apps as appsView } from '../../../src/views/apps';
import { NOW, app, key, makeCtx, root, snap, texts } from './helpers';

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const flush = () => Promise.resolve().then(() => Promise.resolve());

describe('Stack view', () => {
  const set = () => [
    app('c', { name: 'FormCut', running: true, since: 300 }),
    app('a', { name: 'FormVis', running: true, since: 100 }),
    app('x', { name: 'FormOff' }),
    app('h', { name: 'FormHid', running: true, since: 50, hidden: true }),
    app('b', { name: 'FormWav', running: true, since: 200 }),
    app('d', { name: 'FormDeck', running: true, since: 400 }),
  ];

  it('shows only the open apps, in launch order, as the README states', () => {
    const r = root();
    stack().mount(r, makeCtx(set()).ctx);
    expect(texts(r.querySelectorAll('.st-open .st-name'))).toEqual(['FormVis', 'FormWav', 'FormCut', 'FormDeck']);
  });

  it('has a Quit button on each open app that quits that app', () => {
    const r = root();
    const c = makeCtx(set());
    stack().mount(r, c.ctx);
    r.querySelector<HTMLButtonElement>('[aria-label="Quit FormWav"]')?.click();
    expect(c.quit.mock.calls).toEqual([['b']]);
    expect(r.querySelectorAll('.st-quit')).toHaveLength(4);
  });

  it('opens the app whose icon is clicked', () => {
    const r = root();
    const c = makeCtx(set());
    stack().mount(r, c.ctx);
    r.querySelector<HTMLButtonElement>('button[aria-label="FormCut"]')?.click();
    expect(c.open.mock.calls).toEqual([['c']]);
  });

  it('has an All Apps button that goes to the Apps view', () => {
    const r = root();
    const c = makeCtx(set());
    stack().mount(r, c.ctx);
    const more = [...r.querySelectorAll('button')].find((b) => b.textContent === 'All Apps');
    more?.click();
    expect(c.go.mock.calls).toEqual([['apps']]);
  });

  it('says no Form apps are open when none is, and drops the line once one opens', () => {
    const r = root();
    const view = stack();
    view.mount(r, makeCtx([app('a', { name: 'FormVis' })]).ctx);
    const line = r.querySelector('.st-empty');
    expect(line?.textContent).toContain('No Form apps are open');
    expect(line?.classList.contains('is-off')).toBe(false);
    view.update(snap([app('a', { name: 'FormVis', running: true, since: 5 })]));
    expect(line?.classList.contains('is-off')).toBe(true);
    expect(texts(r.querySelectorAll('.st-open .st-name'))).toEqual(['FormVis']);
  });

  it('removes an app from the Stack when it quits and keeps the others in place', () => {
    const r = root();
    const view = stack();
    view.mount(r, makeCtx(set()).ctx);
    const kept = r.querySelector('button[aria-label="FormCut"]');
    view.update(snap(set().filter((a) => a.id !== 'b')));
    expect(texts(r.querySelectorAll('.st-open .st-name'))).toEqual(['FormVis', 'FormCut', 'FormDeck']);
    expect(r.querySelector('button[aria-label="FormCut"]')).toBe(kept);
  });

  it('moves down one row of the three-column grid with the down arrow and opens with Enter', () => {
    const r = root();
    const c = makeCtx(set());
    const view = stack();
    view.mount(r, c.ctx);
    view.shown('stack');
    expect(r.querySelectorAll('.is-selected')).toHaveLength(0);
    expect(view.key?.(key('ArrowRight'))).toBe(true);
    expect(view.key?.(key('ArrowDown'))).toBe(true);
    expect(r.querySelector('.is-selected .st-name')?.textContent).toBe('FormDeck');
    view.key?.(key('Enter'));
    expect(c.open.mock.calls).toEqual([['d']]);
  });

  it('wraps from the first cell to the last with the left arrow', () => {
    const r = root();
    const c = makeCtx(set());
    const view = stack();
    view.mount(r, c.ctx);
    view.shown('stack');
    view.key?.(key('ArrowRight'));
    view.key?.(key('ArrowLeft'));
    expect(r.querySelector('.is-selected .st-name')?.textContent).toBe('All Apps');
  });
});

describe('Switcher view', () => {
  const set = () => [
    app('a', { name: 'FormVis', last: 100 }),
    app('b', { name: 'FormCut', last: 300, running: true }),
    app('c', { name: 'FormWav', last: 200 }),
    app('h', { name: 'FormHid', last: 900, hidden: true }),
    app('m', { name: 'FormGone', last: 800, installed: false }),
  ];
  const order = (r: HTMLElement) => [...r.querySelectorAll<HTMLElement>('.sw-cell')].map((n) => n.dataset.app);

  it('lists installed, unhidden apps with the most recently used first', () => {
    const r = root();
    switcher().mount(r, makeCtx(set()).ctx);
    expect(order(r)).toEqual(['b', 'c', 'a']);
  });

  it('names the selected app below the strip', () => {
    const r = root();
    const view = switcher();
    view.mount(r, makeCtx(set()).ctx);
    expect(r.querySelector('.sw-label')?.textContent).toBe('FormCut');
    view.step?.(1);
    expect(r.querySelector('.sw-label')?.textContent).toBe('FormWav');
    expect(r.querySelector('.is-selected')?.getAttribute('aria-label')).toBe('FormWav');
  });

  it('starts on the previous app when summoned by the switcher hotkey', () => {
    const r = root();
    const view = switcher();
    view.mount(r, makeCtx(set()).ctx);
    view.shown('switcher');
    expect(r.querySelector('.sw-label')?.textContent).toBe('FormWav');
    view.shown('dock');
    expect(r.querySelector('.sw-label')?.textContent).toBe('FormCut');
  });

  it('moves along the strip with Tab, back with Shift+Tab, and wraps at the ends', () => {
    const r = root();
    const view = switcher();
    view.mount(r, makeCtx(set()).ctx);
    const label = r.querySelector('.sw-label');
    view.key?.(key('Tab', { shiftKey: true }));
    expect(label?.textContent).toBe('FormVis');
    view.key?.(key('Tab'));
    expect(label?.textContent).toBe('FormCut');
    view.key?.(key('ArrowRight'));
    view.key?.(key('ArrowRight'));
    view.key?.(key('ArrowRight'));
    expect(label?.textContent).toBe('FormCut');
  });

  it('returns to the start after stepping forward and back the same amount', () => {
    const r = root();
    const view = switcher();
    view.mount(r, makeCtx(set()).ctx);
    view.step?.(7);
    view.step?.(-7);
    expect(r.querySelector('.sw-label')?.textContent).toBe('FormCut');
  });

  it('opens the selected app on Enter, and only once however often it is pressed', async () => {
    const r = root();
    const c = makeCtx(set());
    const view = switcher();
    view.mount(r, c.ctx);
    view.step?.(2);
    view.key?.(key('Enter'));
    view.key?.(key('Enter'));
    view.commit?.();
    await flush();
    expect(c.open.mock.calls).toEqual([['a']]);
  });

  it('lets the user try again after an open that was refused', async () => {
    const r = root();
    const c = makeCtx(set());
    c.open.mockResolvedValueOnce(false);
    const view = switcher();
    view.mount(r, c.ctx);
    view.commit?.();
    await flush();
    view.commit?.();
    await flush();
    expect(c.open.mock.calls).toEqual([['b'], ['b']]);
  });

  it('opens the app whose icon is clicked', () => {
    const r = root();
    const c = makeCtx(set());
    switcher().mount(r, c.ctx);
    r.querySelector<HTMLButtonElement>('[data-app="c"]')?.click();
    expect(c.open.mock.calls).toEqual([['c']]);
  });

  it('keeps the same app selected when the list reorders under it', () => {
    const r = root();
    const view = switcher();
    view.mount(r, makeCtx(set()).ctx);
    view.step?.(1);
    view.update(snap(set().map((a) => (a.id === 'a' ? { ...a, last: 999 } : a))));
    expect(order(r)).toEqual(['a', 'b', 'c']);
    expect(r.querySelector('.sw-label')?.textContent).toBe('FormWav');
  });

  it('shows an empty label and opens nothing when there are no apps', () => {
    const r = root();
    const c = makeCtx([]);
    const view = switcher();
    view.mount(r, c.ctx);
    view.key?.(key('Enter'));
    expect(r.querySelector('.sw-label')?.textContent).toBe('');
    expect(c.open).not.toHaveBeenCalled();
  });
});

describe('Windows view', () => {
  const set = () => [
    app('a', { name: 'FormVis', running: true, since: NOW - 5 * 60, last: 100 }),
    app('b', { name: 'FormCut', running: true, since: NOW - (3600 + 120), last: 300 }),
    app('x', { name: 'FormOff', last: 900 }),
    app('h', { name: 'FormHid', running: true, hidden: true, last: 950 }),
  ];
  const freeze = () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW * 1000);
  };

  it('shows one card per open app with how long it has run', () => {
    freeze();
    const r = root();
    windowsView().mount(r, makeCtx(set()).ctx);
    const cards = [...r.querySelectorAll('.wc-card')];
    expect(cards.map((c) => c.querySelector('.wc-name')?.textContent)).toEqual(['FormCut', 'FormVis']);
    expect(cards.map((c) => c.querySelector('.wc-meta')?.textContent)).toEqual(['Running for 1 h 2 min', 'Running for 5 min']);
  });

  it('brings an app forward from its card', () => {
    freeze();
    const r = root();
    const c = makeCtx(set());
    windowsView().mount(r, c.ctx);
    r.querySelectorAll<HTMLButtonElement>('[aria-label="Bring FormVis forward"]').forEach((b) => b.click());
    expect(c.open.mock.calls).toEqual([['a'], ['a']]);
  });

  it('quits only on the second click of the quit button', () => {
    freeze();
    const r = root();
    const c = makeCtx(set());
    windowsView().mount(r, c.ctx);
    const quit = r.querySelector<HTMLButtonElement>('[aria-label="Quit FormCut"]');
    quit?.click();
    expect(c.quit).not.toHaveBeenCalled();
    expect(quit?.title).toBe('Click again to quit FormCut');
    quit?.click();
    expect(c.quit.mock.calls).toEqual([['b']]);
  });

  it('does not quit when the first click was on a different app', () => {
    freeze();
    const r = root();
    const c = makeCtx(set());
    windowsView().mount(r, c.ctx);
    r.querySelector<HTMLButtonElement>('[aria-label="Quit FormCut"]')?.click();
    r.querySelector<HTMLButtonElement>('[aria-label="Quit FormVis"]')?.click();
    expect(c.quit).not.toHaveBeenCalled();
    expect(r.querySelectorAll('.is-armed')).toHaveLength(1);
  });

  it('forgets a first quit click when the view is shown again', () => {
    freeze();
    const r = root();
    const c = makeCtx(set());
    const view = windowsView();
    view.mount(r, c.ctx);
    const quit = r.querySelector<HTMLButtonElement>('[aria-label="Quit FormCut"]');
    quit?.click();
    view.shown('windows');
    quit?.click();
    expect(c.quit).not.toHaveBeenCalled();
  });

  it('says no Form apps are open only when none is', () => {
    freeze();
    const r = root();
    const view = windowsView();
    view.mount(r, makeCtx([app('x', { name: 'FormOff' })]).ctx);
    const line = r.querySelector<HTMLElement>('.pn-empty');
    expect(line?.textContent).toContain('No Form apps are open');
    expect(line?.hidden).toBe(false);
    view.update(snap(set()));
    expect(line?.hidden).toBe(true);
    expect(r.querySelectorAll('.wc-card')).toHaveLength(2);
  });

  it('opens the card chosen with the arrow keys on Enter', () => {
    freeze();
    const r = root();
    const c = makeCtx(set());
    const view = windowsView();
    view.mount(r, c.ctx);
    view.key?.(key('ArrowRight'));
    view.key?.(key('Enter'));
    expect(c.open.mock.calls).toEqual([['a']]);
  });

  it('updates the run time as the clock moves on', () => {
    freeze();
    const r = root();
    const view = windowsView();
    view.mount(r, makeCtx(set()).ctx);
    vi.setSystemTime((NOW + 10 * 60) * 1000);
    view.update(snap(set()));
    expect(texts(r.querySelectorAll('.wc-meta'))).toEqual(['Running for 1 h 12 min', 'Running for 15 min']);
  });
});

describe('Apps view', () => {
  const set = () => [
    app('formwav', { name: 'FormWav', category: 'make', last: 50 }),
    app('formvis', { name: 'FormVis', category: 'make', last: 70, running: true }),
    app('formmd', { name: 'form.md', category: 'write', alt_of: 'Typora' }),
    app('formhid', { name: 'FormHid', category: 'write', hidden: true, last: 99 }),
    app('formcut', { name: 'FormCut', category: 'make', installed: false }),
  ];
  const shown = (r: HTMLElement) => texts([...r.querySelectorAll<HTMLElement>('.ap-grid .ap-cell')].filter((b) => !b.hidden).map((b) => b.querySelector('.ap-name') as Element));
  const type = (r: HTMLElement, q: string) => {
    const box = r.querySelector<HTMLInputElement>('input[type="search"]') as HTMLInputElement;
    box.value = q;
    box.dispatchEvent(new Event('input'));
  };

  it('lists every unhidden app in alphabetical order', () => {
    const r = root();
    appsView().mount(r, makeCtx(set()).ctx);
    expect(shown(r)).toEqual(['form.md', 'FormCut', 'FormVis', 'FormWav']);
  });

  it('narrows the grid to apps whose name matches the search, whatever the letter case', () => {
    const r = root();
    appsView().mount(r, makeCtx(set()).ctx);
    type(r, '  VIS ');
    expect(shown(r)).toEqual(['FormVis']);
    type(r, '');
    expect(shown(r)).toEqual(['form.md', 'FormCut', 'FormVis', 'FormWav']);
  });

  it('finds an app by the name of the program it stands in for', () => {
    const r = root();
    appsView().mount(r, makeCtx(set()).ctx);
    type(r, 'typora');
    expect(shown(r)).toEqual(['form.md']);
  });

  it('says no Form app matches when the search finds nothing, and never a hidden app', () => {
    const r = root();
    appsView().mount(r, makeCtx(set()).ctx);
    const line = r.querySelector<HTMLElement>('.ap-empty');
    expect(line?.hidden).toBe(true);
    type(r, 'formhid');
    expect(shown(r)).toEqual([]);
    expect(line?.hidden).toBe(false);
    expect(line?.textContent).toBe('No Form app matches that.');
  });

  it('filters by the category chip that is clicked and marks it selected', () => {
    const r = root();
    appsView().mount(r, makeCtx(set()).ctx);
    const chips = [...r.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(texts(chips)).toEqual(['All', 'Make', 'Write']);
    chips[2].click();
    expect(shown(r)).toEqual(['form.md']);
    expect(chips.map((c) => c.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true']);
    chips[0].click();
    expect(shown(r)).toHaveLength(4);
  });

  it('shows a Recent row of opened apps, newest first, without hidden ones', () => {
    const r = root();
    appsView().mount(r, makeCtx(set()).ctx);
    expect(texts(r.querySelectorAll('.ap-recent .ap-name'))).toEqual(['FormVis', 'FormWav']);
    expect(r.querySelector<HTMLElement>('.ap-recent')?.hidden).toBe(false);
  });

  it('hides the Recent row while searching', () => {
    const r = root();
    appsView().mount(r, makeCtx(set()).ctx);
    type(r, 'form');
    expect(r.querySelector<HTMLElement>('.ap-recent')?.hidden).toBe(true);
  });

  it('opens the clicked app, and Enter opens the first match of a search', () => {
    const r = root();
    const c = makeCtx(set());
    const view = appsView();
    view.mount(r, c.ctx);
    r.querySelector<HTMLButtonElement>('.ap-grid [data-app="formwav"]')?.click();
    type(r, 'cut');
    view.key?.(key('Enter'));
    expect(c.open.mock.calls).toEqual([['formwav'], ['formcut']]);
  });

  it('marks running apps and apps that are not installed', () => {
    const r = root();
    const view = appsView();
    view.mount(r, makeCtx(set()).ctx);
    const cell = (id: string) => r.querySelector<HTMLElement>(`.ap-grid [data-app="${id}"]`);
    expect(cell('formvis')?.classList.contains('is-running')).toBe(true);
    expect(cell('formwav')?.classList.contains('is-running')).toBe(false);
    expect(cell('formcut')?.classList.contains('is-missing')).toBe(true);
    view.update(snap(set().map((a) => ({ ...a, running: a.id === 'formwav' }))));
    expect(cell('formvis')?.classList.contains('is-running')).toBe(false);
    expect(cell('formwav')?.classList.contains('is-running')).toBe(true);
  });

  it('clears the search when the view is shown again', () => {
    const r = root();
    const view = appsView();
    view.mount(r, makeCtx(set()).ctx);
    type(r, 'vis');
    view.shown('apps');
    expect(r.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe('');
    expect(shown(r)).toHaveLength(4);
  });
});

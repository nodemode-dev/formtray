import { afterEach, describe, expect, it, vi } from 'vitest';
import { ago, appIcon, appName, iconButton, iconLightSrc, iconSrc, prettyChord, runningFor, sortRecent, syncIdentity, viewBar, visible } from '../../../src/ui';
import { icons } from '../../../src/icons';
import { NOW, app, snap } from './helpers';

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

function freeze() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW * 1000);
}

describe('hotkey chords in words', () => {
  it('shows the default Switcher chord as Option + Tab on macOS, as the README states', () => {
    expect(prettyChord('Alt+Tab', 'macos')).toBe('Option + Tab');
  });

  it('shows the default Switcher chord as Alt + ` on Windows and Linux, as the README states', () => {
    expect(prettyChord('Alt+Backquote', 'windows')).toBe('Alt + `');
    expect(prettyChord('Alt+Backquote', 'linux')).toBe('Alt + `');
  });

  it('names the super key Command on macOS, Win on Windows and Super on Linux', () => {
    expect(prettyChord('Super+Space', 'macos')).toBe('Command + Space');
    expect(prettyChord('Super+Space', 'windows')).toBe('Win + Space');
    expect(prettyChord('Super+Space', 'linux')).toBe('Super + Space');
  });

  it('shows digit and letter keys as the character printed on the key', () => {
    expect(prettyChord('Control+Alt+Super+Digit3', 'macos')).toBe('Control + Option + Command + 3');
    expect(prettyChord('Control+Shift+KeyK', 'linux')).toBe('Ctrl + Shift + K');
  });

  it('keeps one part per key so the chord has as many parts as keys pressed', () => {
    expect(prettyChord('Control+Alt+Super+Digit5', 'windows').split(' + ')).toHaveLength(4);
  });
});

describe('elapsed time wording', () => {
  it('says nothing for an app that was never opened', () => {
    freeze();
    expect(ago(0)).toBe('');
  });

  it('counts whole minutes, hours and days since the app was last opened', () => {
    freeze();
    expect(ago(NOW - 30)).toBe('just now');
    expect(ago(NOW - 150)).toBe('2 min ago');
    expect(ago(NOW - 3 * 3600 - 59)).toBe('3 h ago');
    expect(ago(NOW - 2 * 86400 - 5)).toBe('2 d ago');
  });

  it('does not report a negative age for a time in the future', () => {
    freeze();
    expect(ago(NOW + 500)).toBe('just now');
  });

  it('splits a run time into hours and remaining minutes', () => {
    freeze();
    expect(runningFor(NOW - (2 * 3600 + 17 * 60 + 4))).toBe('Running for 2 h 17 min');
    expect(runningFor(NOW - 5 * 60)).toBe('Running for 5 min');
  });

  it('says only Running when the start time is unknown', () => {
    freeze();
    expect(runningFor(0)).toBe('Running');
  });
});

describe('app lists', () => {
  it('orders most recently opened first', () => {
    const list = [app('a', { last: 10 }), app('b', { last: 30 }), app('c', { last: 20 })];
    expect(sortRecent(list).map((a) => a.id)).toEqual(['b', 'c', 'a']);
  });

  it('puts a running app ahead of a stopped one opened at the same time, then goes by name', () => {
    const list = [app('z', { name: 'Zeta' }), app('y', { name: 'Alpha' }), app('r', { name: 'Rho', running: true })];
    expect(sortRecent(list).map((a) => a.id)).toEqual(['r', 'y', 'z']);
  });

  it('gives the same order whatever order the apps arrive in', () => {
    const list = [app('a', { last: 5 }), app('b', { last: 9 }), app('c', { running: true }), app('d', { name: 'Dd' })];
    const forward = sortRecent(list).map((a) => a.id);
    const backward = sortRecent([...list].reverse()).map((a) => a.id);
    expect(backward).toEqual(forward);
    expect(list.map((a) => a.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('leaves out apps hidden in Settings', () => {
    const list = [app('a'), app('b', { hidden: true }), app('c')];
    expect(visible(list).map((a) => a.id)).toEqual(['a', 'c']);
  });
});

describe('app icon', () => {
  it('uses the dark icon and a light twin with the -light suffix', () => {
    const a = app('formvis', { icon: 'formvis.webp' });
    expect(iconSrc(a)).toBe('/apps/formvis.webp');
    expect(iconLightSrc(a)).toBe('/apps/formvis-light.webp');
  });

  it('draws a dark and a light image for an app that has a family icon', () => {
    const box = appIcon(app('formvis', { icon: 'formvis.webp' }), 'm');
    const imgs = [...box.querySelectorAll('img')];
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['/apps/formvis.webp', '/apps/formvis-light.webp']);
    expect(imgs.map((i) => i.alt)).toEqual(['', '']);
  });

  it('shows two letters of the name without the Form prefix when there is no icon', () => {
    expect(appIcon(app('formvis', { name: 'FormVis' }), 's').textContent).toBe('Vi');
    expect(appIcon(app('formmd', { name: 'form.md' }), 's').textContent).toBe('md');
  });

  it('falls back to the letters when every image fails to load', () => {
    const box = appIcon(app('formcut', { name: 'FormCut', icon: 'formcut.webp' }), 'l');
    for (let round = 0; round < 6; round++) {
      box.querySelectorAll('img').forEach((img) => img.dispatchEvent(new Event('error')));
    }
    expect(box.querySelectorAll('img')).toHaveLength(0);
    expect(box.textContent).toBe('Cu');
  });

  it('carries the app hue for tinting', () => {
    const box = appIcon(app('formwav', { hue: '142' }), 'm');
    expect(box.style.getPropertyValue('--hue')).toBe('142');
  });
});

describe('app name', () => {
  it('renames every label on screen when the app name changes', () => {
    const first = app('formsync1', { name: 'FormOld' });
    syncIdentity(snap([first]));
    const a = appName('span', 'x', first);
    const b = appName('h3', 'y', first);
    const other = appName('span', 'x', app('formsync2', { name: 'Other' }));
    document.body.append(a, b, other);
    syncIdentity(snap([{ ...first, name: 'FormNew' }]));
    expect(a.textContent).toBe('FormNew');
    expect(b.textContent).toBe('FormNew');
    expect(other.textContent).toBe('Other');
  });
});

describe('view bar', () => {
  it('lists the five views in the README order, numbered 1 to 5', () => {
    const bar = viewBar('apps', () => undefined);
    const buttons = [...bar.querySelectorAll('button')];
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Switcher', 'Stack', 'Apps', 'Windows', 'Widgets']);
    expect(buttons.map((b) => b.title)).toEqual(['Switcher (1)', 'Stack (2)', 'Apps (3)', 'Windows (4)', 'Widgets (5)']);
  });

  it('marks only the current view as current', () => {
    const bar = viewBar('windows', () => undefined);
    const current = [...bar.querySelectorAll('[aria-current="true"]')];
    expect(current.map((b) => b.getAttribute('aria-label'))).toEqual(['Windows']);
  });

  it('goes to the view whose button is clicked', () => {
    const go = vi.fn<(v: string) => void>();
    const bar = viewBar('apps', go);
    bar.querySelector<HTMLButtonElement>('[aria-label="Stack"]')?.click();
    bar.querySelector<HTMLButtonElement>('[aria-label="Widgets"]')?.click();
    expect(go.mock.calls.map((c) => c[0])).toEqual(['stack', 'widgets']);
  });
});

describe('icon button', () => {
  it('is a labelled button that runs its action once per click', () => {
    const hit = vi.fn<() => void>();
    const b = iconButton(icons.close, 'Close', hit, 'extra');
    b.click();
    expect(hit).toHaveBeenCalledTimes(1);
    expect(b.getAttribute('aria-label')).toBe('Close');
    expect(b.type).toBe('button');
    expect(b.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('every glyph is one svg that inherits the text colour and is hidden from screen readers', () => {
    for (const glyph of Object.values(icons)) {
      const doc = new DOMParser().parseFromString(glyph, 'text/html');
      const svgs = doc.querySelectorAll('svg');
      expect(svgs).toHaveLength(1);
      expect(svgs[0].getAttribute('stroke')).toBe('currentColor');
      expect(svgs[0].getAttribute('aria-hidden')).toBe('true');
    }
  });
});

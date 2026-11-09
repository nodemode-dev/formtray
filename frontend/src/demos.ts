import { call } from "./bridge";

export interface Demo {
  id: "overview" | "switcher" | "widgets";
  title: string;
  line: string;
  art: string;
}

const art = (body: string) =>
  `<svg class="pf-demo-art" viewBox="0 0 120 72" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const DEMOS: Demo[] = [
  {
    id: "overview",
    title: "Overview",
    line: "Every view over a sample desktop, with the command line and sample FormPortal files.",
    art: art('<rect x="4" y="4" width="112" height="64" rx="6" opacity="0.45"/><path d="M4 12h112" opacity="0.45"/><rect x="30" y="20" width="60" height="38" rx="5"/><rect x="36" y="28" width="12" height="12" rx="3"/><rect x="54" y="28" width="12" height="12" rx="3"/><rect x="72" y="28" width="12" height="12" rx="3"/><path d="M38 50h44" opacity="0.6"/><path d="M44 64h32" opacity="0.45"/>'),
  },
  {
    id: "switcher",
    title: "Switcher and hotkeys",
    line: "Hotkeys for each system, rebinding, and keyboard flows played on the real views.",
    art: art('<rect x="14" y="10" width="92" height="26" rx="8"/><rect x="22" y="16" width="14" height="14" rx="4"/><rect x="42" y="16" width="14" height="14" rx="4" opacity="0.6"/><rect x="62" y="16" width="14" height="14" rx="4" opacity="0.6"/><rect x="82" y="16" width="14" height="14" rx="4" opacity="0.6"/><rect x="26" y="46" width="30" height="16" rx="4"/><path d="M36 54h10"/><rect x="62" y="46" width="32" height="16" rx="4"/><path d="M72 54h12"/>'),
  },
  {
    id: "widgets",
    title: "Widgets and layout",
    line: "A workday timeline that reshapes the board, with Stack and Windows following along.",
    art: art('<rect x="8" y="8" width="44" height="34" rx="5"/><rect x="58" y="8" width="24" height="16" rx="4"/><rect x="88" y="8" width="24" height="16" rx="4"/><rect x="58" y="28" width="54" height="14" rx="4"/><rect x="8" y="48" width="24" height="16" rx="4" opacity="0.6"/><rect x="38" y="48" width="24" height="16" rx="4" opacity="0.6"/><path d="M70 56h42" opacity="0.6"/><circle cx="84" cy="56" r="3"/>'),
  },
];

export function openDemo(id: Demo["id"]): Promise<void> {
  return call<void>("open_demo", { id });
}

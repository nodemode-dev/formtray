const svg = (body: string, extra = "") =>
  `<svg class="glyph" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${body}</svg>`;

export const icons = {
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2 1.2M17.8 15.3l2 1.2M4.2 16.5l2-1.2M17.8 8.7l2-1.2"/><circle cx="12" cy="12" r="7"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  power: svg('<path d="M12 3v8"/><path d="M6.3 6.6a8 8 0 1 0 11.4 0"/>'),
  enter: svg('<path d="M14 5h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4"/><path d="M10 16l4-4-4-4M14 12H4"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  resize: svg('<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>'),
  grid: svg('<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>'),
  viewSwitcher: svg('<rect x="3" y="8" width="18" height="8" rx="3"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>'),
  viewStack: svg('<rect x="5" y="4" width="14" height="12" rx="3"/><path d="M10 16l2 3 2-3"/>'),
  viewApps: svg('<rect x="3.5" y="4" width="17" height="16" rx="3"/><path d="M3.5 9h17"/>'),
  viewWindows: svg('<rect x="3" y="5" width="8" height="6" rx="1.5"/><rect x="13" y="5" width="8" height="6" rx="1.5"/><rect x="3" y="13" width="8" height="6" rx="1.5"/><rect x="13" y="13" width="8" height="6" rx="1.5"/>'),
  viewWidgets: svg('<rect x="3" y="3" width="10" height="10" rx="2"/><rect x="15" y="3" width="6" height="4" rx="1.5"/><rect x="15" y="9" width="6" height="12" rx="1.5"/><rect x="3" y="15" width="10" height="6" rx="1.5"/>'),
};

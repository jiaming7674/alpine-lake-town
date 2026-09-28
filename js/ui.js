// Small DOM helpers for the control panel.
export const $ = id => document.getElementById(id);

export function bindRange(id, format, fn, init = true) {
  const el = $(id), out = $('o-' + id);
  const run = () => { const v = parseFloat(el.value); if (out) out.textContent = format(v); fn(v); };
  el.addEventListener('input', run);
  if (init) run();
  return {
    el,
    set(v) { el.value = v; if (out) out.textContent = format(v); },
  };
}

/** Segmented control: buttons carry data-v; returns a setter that only updates the pressed state. */
export function segmented(id, fn) {
  const group = $(id), buttons = [...group.querySelectorAll('button')];
  const mark = v => buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(v))));
  buttons.forEach(b => b.addEventListener('click', () => { mark(b.dataset.v); fn(b.dataset.v); }));
  return { mark, buttons };
}

export function setupPanel(collapsed) {
  const toggle = $('panel-toggle'), body = $('panel-body');
  const set = open => { body.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); };
  toggle.addEventListener('click', () => set(body.hidden));
  if (collapsed) set(false);
}

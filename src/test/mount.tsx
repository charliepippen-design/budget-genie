import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: { root: Root; el: HTMLElement }[] = [];

/** Minimal render helper (no @testing-library in this repo). Call cleanup() in afterEach. */
export async function mount(ui: ReactElement) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push({ root, el });
  await act(async () => root.render(ui));
  return el;
}

export async function cleanup() {
  for (const { root, el } of roots.splice(0)) {
    await act(async () => root.unmount());
    el.remove();
  }
}

export const click = (el: Element | null) =>
  act(async () => {
    (el as HTMLElement).click();
  });

export const byText = (root: ParentNode, selector: string, text: string | RegExp) =>
  [...root.querySelectorAll(selector)].find((n) =>
    typeof text === 'string' ? n.textContent?.trim() === text : text.test(n.textContent ?? '')
  ) ?? null;

export const tick = (ms = 0) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

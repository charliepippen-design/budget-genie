// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// RT-11: calling a zustand store hook with no selector subscribes to the whole store, so every
// unrelated change (drag state, ghost values, chat panel...) re-renders these heavy pages.
const PAGES = ['src/pages/Report.tsx', 'src/pages/Output.tsx'];
const WHOLE_STORE = /use(MediaPlan|MultiMonth)Store\(\s*\)/;

describe('report pages subscribe through selectors (RT-11)', () => {
  it.each(PAGES)('%s never subscribes to a whole store', (file) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');
    expect(source).not.toMatch(WHOLE_STORE);
  });
});

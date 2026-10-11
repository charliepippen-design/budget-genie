import { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SectionErrorBoundary } from '@/components/common/SectionErrorBoundary';
import { byText, cleanup, mount, tick } from '@/test/mount';
import { lazyWithReload, reloadOncePerKey } from './lazy-with-reload';

const reload = vi.fn();

beforeEach(() => {
  sessionStorage.clear();
  reload.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  });
});
afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});

describe('reloadOncePerKey', () => {
  it('reloads once per key within the window', () => {
    expect(reloadOncePerKey('a')).toBe(true);
    expect(reloadOncePerKey('a')).toBe(false);
    expect(reloadOncePerKey('b')).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('reloads again after the window has passed', () => {
    sessionStorage.setItem('chunk-reload:a', String(Date.now() - 120_000));
    expect(reloadOncePerKey('a')).toBe(true);
  });
});

describe('lazyWithReload', () => {
  const Broken = () =>
    lazyWithReload(() => Promise.reject(new Error('Failed to fetch dynamically imported module')), 'broken');

  it('reloads on the first failure and keeps showing the fallback', async () => {
    const Lazy = Broken();
    const el = await mount(
      <SectionErrorBoundary name="t">
        <Suspense fallback={<p>loading</p>}>
          <Lazy />
        </Suspense>
      </SectionErrorBoundary>
    );
    await tick(20);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[role=alert]')).toBeNull();
    expect(el.textContent).toContain('loading');
  });

  it('rethrows once a reload was already done, so the boundary shows', async () => {
    reloadOncePerKey('broken');
    reload.mockClear();
    const Lazy = Broken();
    const el = await mount(
      <SectionErrorBoundary name="t">
        <Suspense fallback={<p>loading</p>}>
          <Lazy />
        </Suspense>
      </SectionErrorBoundary>
    );
    await tick(20);
    expect(el.querySelector('[role=alert]')).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
  });

  it('renders the component when the import works', async () => {
    const Lazy = lazyWithReload(async () => ({ default: () => <p>ok</p> }), 'fine');
    const el = await mount(
      <Suspense fallback={null}>
        <Lazy />
      </Suspense>
    );
    await tick(20);
    expect(byText(el, 'p', 'ok')).toBeTruthy();
  });
});

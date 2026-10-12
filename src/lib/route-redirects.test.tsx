import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { ROUTE_REDIRECTS } from './route-redirects';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = '';
});

function Where() {
  return <span data-path={useLocation().pathname} />;
}

async function landed(from: string): Promise<string> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[from]}>
        <Routes>
          {ROUTE_REDIRECTS.map((r) => (
            <Route key={r.from} path={r.from} element={<Navigate to={r.to} replace />} />
          ))}
          <Route path="*" element={<div />} />
        </Routes>
        <Where />
      </MemoryRouter>,
    );
  });
  const out = container.querySelector('[data-path]')?.getAttribute('data-path') ?? '';
  await act(async () => root.unmount());
  return out;
}

describe('route redirects', () => {
  it.each([
    ['/dashboard', '/app'],
    ['/planner', '/app'],
    ['/demo', '/app'],
    ['/refund', '/refund-policy'],
  ])('%s redirects to %s', async (from, to) => {
    expect(await landed(from)).toBe(to);
  });

  it('only redirects to paths that are not themselves redirects', () => {
    const sources = new Set(ROUTE_REDIRECTS.map((r) => r.from));
    expect(ROUTE_REDIRECTS.filter((r) => sources.has(r.to))).toEqual([]);
  });
});

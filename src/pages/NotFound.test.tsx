import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import NotFound from './NotFound';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('NotFound', () => {
  it('renders the branded 404 with safe path text and navigation links', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const path = '/<b>x</b>';
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <NotFound />
        </MemoryRouter>,
      );
    });

    expect(container.querySelector('h1')?.textContent).toBe('Page not found');
    expect(container.textContent).toContain('MediaPlanner Pro');
    expect(container.textContent).toContain(path);
    expect(container.querySelector('b')).toBeNull();

    const hrefs = Object.fromEntries(
      Array.from(container.querySelectorAll('a')).map((a) => [a.textContent, a.getAttribute('href')]),
    );
    expect(hrefs['Go to homepage']).toBe('/');
    expect(hrefs['Open my plan']).toBe('/app');
    expect(hrefs['View pricing']).toBe('/pricing');

    expect(warn).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildErrorPayload, reportClientError, resetReportedErrors } from './error-report';

const sent = () => (navigator.sendBeacon as unknown as ReturnType<typeof vi.fn>).mock.calls;

const readBlob = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsText(blob);
  });

beforeEach(() => {
  resetReportedErrors();
  Object.defineProperty(navigator, 'sendBeacon', { value: vi.fn(() => true), configurable: true, writable: true });
  window.history.replaceState({}, '', '/report?token=secret#frag');
});

afterEach(() => vi.restoreAllMocks());

describe('reportClientError', () => {
  it('sends the expected payload with the path only', async () => {
    reportClientError({ section: 'report', error: new Error('n is not a function'), componentStack: '\n at Foo' });
    expect(sent()).toHaveLength(1);
    expect(sent()[0][0]).toBe('/api/client-error');
    const body = JSON.parse(await readBlob(sent()[0][1]));
    expect(Object.keys(body).sort()).toEqual(
      ['buildId', 'componentStack', 'message', 'section', 'stack', 'ts', 'url', 'userAgent'].sort()
    );
    expect(body.url).toBe('/report');
    expect(body.message).toBe('n is not a function');
    expect(body.section).toBe('report');
    expect(typeof body.buildId).toBe('string');
    expect(body.componentStack).toContain('Foo');
  });

  it('truncates long fields', () => {
    const error = new Error('x'.repeat(5000));
    error.stack = 's'.repeat(20000);
    const payload = buildErrorPayload({ section: 'a', error, componentStack: 'c'.repeat(20000) });
    expect(payload.stack.length).toBe(8192);
    expect(payload.componentStack.length).toBe(8192);
    expect(payload.message.length).toBeLessThanOrEqual(1024);
  });

  it('dedupes identical reports in a page session', () => {
    const error = new Error('boom');
    reportClientError({ section: 'a', error });
    reportClientError({ section: 'a', error });
    expect(sent()).toHaveLength(1);
    reportClientError({ section: 'b', error });
    expect(sent()).toHaveLength(2);
  });

  it('falls back to fetch keepalive when sendBeacon refuses', () => {
    (navigator.sendBeacon as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal('fetch', fetchMock);
    reportClientError({ section: 'a', error: new Error('z') });
    expect(fetchMock).toHaveBeenCalledWith('/api/client-error', expect.objectContaining({ keepalive: true, method: 'POST' }));
    vi.unstubAllGlobals();
  });

  it('never throws', () => {
    Object.defineProperty(navigator, 'sendBeacon', {
      value: () => {
        throw new Error('nope');
      },
      configurable: true,
      writable: true,
    });
    expect(() => reportClientError({ section: 'a', error: new Error('q') })).not.toThrow();
    expect(() => reportClientError({ section: 'a', error: { weird: true }, componentStack: null })).not.toThrow();
    expect(() => reportClientError(undefined as never)).not.toThrow();
  });
});

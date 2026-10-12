// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const root = resolve(__dirname, '../..');
const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'));

// Vercel path-to-regexp sources are anchored; the lookahead syntax is the same as JS.
const matches = (source: string, path: string) => new RegExp(`^${source}$`).test(path);

describe('vercel.json', () => {
  const rewrite = vercel.rewrites[0];

  it('rewrites app routes to index.html', () => {
    expect(rewrite.destination).toBe('/index.html');
    for (const p of ['/report', '/output', '/app', '/pricing', '/']) {
      expect(matches(rewrite.source, p)).toBe(true);
    }
  });

  it('does not rewrite missing assets or the API', () => {
    expect(matches(rewrite.source, '/assets/x.js')).toBe(false);
    expect(matches(rewrite.source, '/assets/Report-abc123.js')).toBe(false);
    expect(matches(rewrite.source, '/api/ai-gateway')).toBe(false);
  });

  it('sets cache headers', () => {
    const header = (source: string) =>
      vercel.headers.find((h: { source: string }) => h.source === source)?.headers[0];
    expect(header('/assets/(.*)')).toEqual({
      key: 'Cache-Control',
      value: 'public, max-age=31536000, immutable',
    });
    expect(header('/sw.js').value).toBe('no-cache, no-store, must-revalidate');
    expect(header('/((?!api/|assets/).*)').value).toBe('no-cache, must-revalidate');
  });

  it('keeps the build command and function config', () => {
    expect(vercel.buildCommand).toBe('npm run build');
    expect(vercel.functions['api/ai-gateway.ts'].maxDuration).toBe(60);
  });
});

describe('public/sw.js kill-switch', () => {
  const code = readFileSync(resolve(root, 'public/sw.js'), 'utf8');

  it('deletes all caches, claims clients and unregisters, with no fetch handler', async () => {
    const listeners: Record<string, (event: { waitUntil: (p: Promise<unknown>) => void }) => void> = {};
    const deleted: string[] = [];
    const self = {
      addEventListener: (type: string, fn: (typeof listeners)[string]) => {
        listeners[type] = fn;
      },
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn().mockResolvedValue(undefined) },
      registration: { unregister: vi.fn().mockResolvedValue(true) },
    };
    const caches = {
      keys: async () => ['budget-genie-v3', 'other'],
      delete: async (key: string) => {
        deleted.push(key);
        return true;
      },
    };
    new Function('self', 'caches', code)(self, caches);

    expect(Object.keys(listeners).sort()).toEqual(['activate', 'install']);
    expect(listeners.fetch).toBeUndefined();

    listeners.install({ waitUntil: () => undefined });
    expect(self.skipWaiting).toHaveBeenCalled();

    let pending: Promise<unknown> = Promise.resolve();
    listeners.activate({ waitUntil: (p) => (pending = p) });
    await pending;
    expect(deleted).toEqual(['budget-genie-v3', 'other']);
    expect(self.clients.claim).toHaveBeenCalled();
    expect(self.registration.unregister).toHaveBeenCalled();
  });
});

describe('vite.config.ts Clerk mock', () => {
  const original = process.env.MOCK_CLERK;
  afterEach(() => {
    if (original === undefined) delete process.env.MOCK_CLERK;
    else process.env.MOCK_CLERK = original;
  });

  const resolveConfig = async (command: 'build' | 'serve', mode: string) => {
    const { default: factory } = await import('../../vite.config');
    const cfg = await (factory as unknown as (env: object) => Promise<{ resolve: { alias: Record<string, string> }; define: object }> | { resolve: { alias: Record<string, string> }; define: object })({ command, mode });
    return cfg;
  };

  it('never aliases the mock in a normal production build, even with MOCK_CLERK=1', async () => {
    process.env.MOCK_CLERK = '1';
    const cfg = await resolveConfig('build', 'production');
    expect(cfg.resolve.alias['@clerk/clerk-react']).toBeUndefined();
    expect(JSON.stringify(cfg.define)).not.toContain('pk_test_qa_mock');
  });

  it('does not alias the mock for a qa build without MOCK_CLERK', async () => {
    delete process.env.MOCK_CLERK;
    const cfg = await resolveConfig('build', 'qa');
    expect(cfg.resolve.alias['@clerk/clerk-react']).toBeUndefined();
  });

  it('aliases the mock for a qa build with MOCK_CLERK=1', async () => {
    process.env.MOCK_CLERK = '1';
    const cfg = await resolveConfig('build', 'qa');
    expect(cfg.resolve.alias['@clerk/clerk-react']).toContain('clerk-mock');
  });
});

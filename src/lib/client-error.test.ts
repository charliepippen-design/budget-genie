// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourceMapGenerator } from 'source-map-js';
import { decodeStack } from '../../api/_decode-stack';
import { handleClientError } from '../../api/client-error';

const report = {
  buildId: 'abc123',
  section: 'report',
  message: 'n is not a function',
  stack: 'TypeError: n is not a function\n    at https://x.test/assets/Report-1.js:1:10',
  componentStack: '\n at Report',
  url: '/report',
  userAgent: 'UA',
  ts: '2026-10-11T00:00:00.000Z',
};

const post = (body: string, method = 'POST') =>
  new Request('http://localhost/api/client-error', { method, body: method === 'POST' ? body : undefined });

function mapDirWithFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'maps-'));
  const gen = new SourceMapGenerator({ file: 'Report-1.js' });
  gen.addMapping({
    generated: { line: 1, column: 9 },
    original: { line: 42, column: 4 },
    source: 'src/pages/Report.tsx',
    name: 'narrate',
  });
  writeFileSync(path.join(dir, 'Report-1.js.map'), gen.toString());
  return dir;
}

afterEach(() => vi.restoreAllMocks());

describe('decodeStack', () => {
  it('maps minified frames to original positions', () => {
    const out = decodeStack(report.stack, mapDirWithFixture());
    expect(out).toContain('src/pages/Report.tsx:42:5 (narrate)');
    expect(out).toContain('TypeError: n is not a function');
  });

  it('returns the raw stack when the map is missing or the input is odd', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'empty-'));
    expect(decodeStack(report.stack, dir)).toBe(report.stack);
    expect(decodeStack('no frames here', dir)).toBe('no frames here');
    expect(decodeStack(report.stack, '/does/not/exist')).toBe(report.stack);
  });

  it('survives a corrupt map', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bad-'));
    writeFileSync(path.join(dir, 'Report-1.js.map'), '{not json');
    expect(decodeStack(report.stack, dir)).toBe(report.stack);
  });
});

describe('client-error handler', () => {
  it('rejects non-POST', async () => {
    expect((await handleClientError(post('', 'GET'))).status).toBe(405);
  });

  it('rejects bodies over 32 KB', async () => {
    const big = JSON.stringify({ ...report, stack: 'x'.repeat(40 * 1024) });
    expect((await handleClientError(post(big))).status).toBe(413);
  });

  it('rejects bad JSON and bad shapes', async () => {
    expect((await handleClientError(post('{nope'))).status).toBe(400);
    expect((await handleClientError(post('[]'))).status).toBe(400);
    expect((await handleClientError(post(JSON.stringify({ ...report, stack: 5 })))).status).toBe(400);
    const { buildId: _omit, ...missing } = report;
    expect((await handleClientError(post(JSON.stringify(missing)))).status).toBe(400);
  });

  it('logs one JSON line with the decoded stack when maps exist', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await handleClientError(post(JSON.stringify(report)), mapDirWithFixture());
    expect(res.status).toBe(204);
    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line.type).toBe('client-error');
    expect(line.buildId).toBe('abc123');
    expect(line.decodedStack).toContain('src/pages/Report.tsx:42:5');
  });

  it('logs the raw stack only when there are no maps', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await handleClientError(post(JSON.stringify({ ...report, extra: 'ignored' })), '/does/not/exist');
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line.decodedStack).toBeUndefined();
    expect(line.stack).toBe(report.stack);
    expect(line.extra).toBeUndefined();
  });
});

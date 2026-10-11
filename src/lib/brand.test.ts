// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BRAND_DOMAIN, BRAND_NAME } from './brand';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('brand', () => {
  it('exports the product name and domain', () => {
    expect(BRAND_NAME).toBe('MediaPlanner Pro');
    expect(BRAND_DOMAIN).toBe('mediaplannerpro.com');
  });

  it('has no inconsistent product names in src/ or index.html', () => {
    const root = process.cwd();
    const files = [
      ...walk(join(root, 'src')).filter((f) => /\.(ts|tsx|css|html)$/.test(f)),
      join(root, 'index.html'),
    ].filter((f) => !f.endsWith('brand.test.ts'));
    const banned = [/MediaPlan Pro/, /MediaPlannerPro /, /Budget Genie/, /Media Planner Pro/];
    const hits = files.flatMap((f) => {
      const text = readFileSync(f, 'utf8');
      return banned.filter((re) => re.test(text)).map((re) => `${f}: ${re}`);
    });
    expect(hits).toEqual([]);
  });
});

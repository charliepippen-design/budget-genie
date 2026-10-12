import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe('one plan currency', () => {
  it('only CurrencyContext uses Intl style: currency', () => {
    const offenders = sourceFiles(SRC).filter(
      (f) => /style:\s*['"]currency['"]/.test(readFileSync(f, 'utf8')) && !f.endsWith('CurrencyContext.tsx')
    );
    expect(offenders).toEqual([]);
  });

  it('has no EUR-hardcoded formatCurrency helper beside formatMoney', () => {
    expect(readFileSync(join(SRC, 'lib/mediaplan-data.ts'), 'utf8')).not.toMatch(/export function formatCurrency/);
  });

  it('StrategicInsightsPanel formats through the plan currency, not a USD default', () => {
    const src = readFileSync(join(SRC, 'components/dashboard/StrategicInsightsPanel.tsx'), 'utf8');
    expect(src).toContain('useCurrency()');
    expect(src).not.toMatch(/'USD'/);
  });

  it('ESLint restricts style: currency outside the helper file', () => {
    const cfg = readFileSync(join(SRC, '..', 'eslint.config.js'), 'utf8');
    expect(cfg).toContain('no-restricted-syntax');
    expect(cfg).toContain('value.value=\'currency\'');
    expect(cfg).toContain('src/contexts/CurrencyContext.tsx');
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

const lint = async (code: string) => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(code, { filePath: 'src/components/Example.tsx' });
  return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax');
};

describe('effect cleanup lint rule', () => {
  it('flags an expression-bodied useEffect', async () => {
    const messages = await lint(`useEffect(() => foo(), []);`);
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain('Chrome 150');
  });

  it('flags useLayoutEffect and the React.useEffect member form', async () => {
    expect(await lint(`useLayoutEffect(() => foo(), []);`)).toHaveLength(1);
    expect(await lint(`React.useEffect(() => foo(), []);`)).toHaveLength(1);
  });

  it('allows block bodies', async () => {
    expect(await lint(`useEffect(() => { foo(); }, []);`)).toHaveLength(0);
    expect(await lint(`React.useEffect(() => { foo(); return () => bar(); }, []);`)).toHaveLength(0);
  });
});

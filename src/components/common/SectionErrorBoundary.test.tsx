import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byText, cleanup, click, mount } from '@/test/mount';
import { CRASH_BACKUP_KEY, SectionErrorBoundary } from './SectionErrorBoundary';

const Boom = ({ fail = true }: { fail?: boolean }) => {
  if (fail) throw new Error('n is not a function');
  return <p>recovered</p>;
};

afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('SectionErrorBoundary', () => {
  it('shows the fallback, saves a backup and leaves siblings alone', async () => {
    localStorage.setItem('mediaplan-store-v2', '{"state":{"totalBudget":123}}');
    localStorage.setItem('multi-month-plan-store', '{"m":1}');
    const el = await mount(
      <div>
        <p>sibling</p>
        <SectionErrorBoundary name="chat">
          <Boom />
        </SectionErrorBoundary>
      </div>
    );
    expect(el.querySelector('[role=alert]')?.textContent).toContain('This section hit an error');
    expect(byText(el, 'p', 'sibling')).toBeTruthy();
    expect(byText(el, 'a', 'Back to dashboard')?.getAttribute('href')).toBe('/app');
    expect(byText(el, 'button', 'Reload')).toBeTruthy();

    const backup = JSON.parse(localStorage.getItem(CRASH_BACKUP_KEY)!);
    expect(backup.plan).toBe('{"state":{"totalBudget":123}}');
    expect(backup.multiMonth).toBe('{"m":1}');
    expect(backup.error).toBe('n is not a function');
    expect(backup.section).toBe('chat');
    expect(typeof backup.savedAt).toBe('string');
  });

  it('does not throw when storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const el = await mount(
      <SectionErrorBoundary name="x">
        <Boom />
      </SectionErrorBoundary>
    );
    expect(el.querySelector('[role=alert]')).toBeTruthy();
  });

  it('Try again resets and calls onReset', async () => {
    const onReset = vi.fn();
    let fail = true;
    const Flaky = () => <Boom fail={fail} />;
    const el = await mount(
      <SectionErrorBoundary name="x" onReset={onReset}>
        <Flaky />
      </SectionErrorBoundary>
    );
    fail = false;
    await click(byText(el, 'button', 'Try again'));
    expect(onReset).toHaveBeenCalled();
    expect(byText(el, 'p', 'recovered')).toBeTruthy();
  });

  it('resets when resetKeys change', async () => {
    const Harness = () => {
      const [key, setKey] = useState('a');
      return (
        <>
          <button onClick={() => setKey('b')}>go</button>
          <SectionErrorBoundary name="x" resetKeys={[key]}>
            <Boom fail={key === 'a'} />
          </SectionErrorBoundary>
        </>
      );
    };
    const el = await mount(<Harness />);
    expect(el.querySelector('[role=alert]')).toBeTruthy();
    await click(byText(el, 'button', 'go'));
    expect(byText(el, 'p', 'recovered')).toBeTruthy();
  });
});

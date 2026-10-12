import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byText, cleanup, click, mount } from '@/test/mount';
import { CrashFallback } from './CrashFallback';
import {
  CRASH_BACKUP_KEY,
  DEBUG_EXPORT_KEYS,
  PLAN_KEY,
  PRE_APPLY_BACKUP_KEY,
  buildDebugState,
  buildDiagnostics,
} from '@/lib/crash-recovery';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { generatePlan } from '@/lib/plan-generator';

const err = Object.assign(new Error('n is not a function'), { stack: 'stack-here' });
const info = { message: err.message, stack: 'stack-here', componentStack: 'comp-here' };

beforeEach(() => {
  localStorage.clear();
});
afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});

describe('debug export', () => {
  it('contains only whitelisted storage keys', () => {
    localStorage.setItem(PLAN_KEY, '{"state":{"totalBudget":1}}');
    localStorage.setItem('mediaplan-planner-chat-v1', '[]');
    localStorage.setItem('__clerk_db_jwt', 'secret');
    localStorage.setItem('sb-abc-auth-token', 'secret');
    localStorage.setItem('other', 'x');
    const state = buildDebugState(info);
    expect(Object.keys(state.storage).sort()).toEqual(['mediaplan-planner-chat-v1', PLAN_KEY].sort());
    for (const key of Object.keys(state.storage)) expect(DEBUG_EXPORT_KEYS as readonly string[]).toContain(key);
    expect(JSON.stringify(state)).not.toContain('secret');
    expect(state.buildId).toBeTruthy();
    expect(state.error).toBe('n is not a function');
  });

  it('diagnostics contain no plan data', () => {
    localStorage.setItem(PLAN_KEY, '{"state":{"totalBudget":424242}}');
    expect(JSON.stringify(buildDiagnostics(info))).not.toContain('424242');
  });
});

describe('CrashFallback actions', () => {
  it('shows the exits and the message once, with no debug banner', async () => {
    const el = await mount(<CrashFallback title="T" error={err} componentStack="c" onRetry={() => undefined} />);
    for (const label of ['Try again', 'Reload', 'Export debug state', 'Copy diagnostics', 'Reset plan data']) {
      expect(byText(el, 'button', label)).toBeTruthy();
    }
    expect(byText(el, 'a', 'Back to dashboard')?.getAttribute('href')).toBe('/app');
    expect(byText(el, 'button', 'Undo last AI plan change')).toBeNull();
    expect(el.textContent).not.toContain('CRASH DETECTED');
    expect(el.textContent?.split('n is not a function').length).toBe(2);
  });

  it('Reset backs up first, removes the plan and asks for confirmation', async () => {
    localStorage.setItem(PLAN_KEY, '{"state":{"totalBudget":5}}');
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign, pathname: '/x' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const el = await mount(<CrashFallback title="T" error={err} componentStack="c" onRetry={() => undefined} />);

    await click(byText(el, 'button', 'Reset plan data'));
    expect(localStorage.getItem(PLAN_KEY)).not.toBeNull();
    expect(assign).not.toHaveBeenCalled();

    await click(byText(el, 'button', 'Reset plan data'));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(JSON.parse(localStorage.getItem(CRASH_BACKUP_KEY)!).plan).toBe('{"state":{"totalBudget":5}}');
    expect(localStorage.getItem(PLAN_KEY)).toBeNull();
    expect(assign).toHaveBeenCalledWith('/app');
    vi.unstubAllGlobals();
  });

  it('Undo restores the pre-apply backup', async () => {
    localStorage.setItem(PLAN_KEY, 'new-plan');
    localStorage.setItem(PRE_APPLY_BACKUP_KEY, JSON.stringify({ savedAt: 'now', plan: 'old-plan' }));
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign, pathname: '/x' });
    const el = await mount(<CrashFallback title="T" error={err} componentStack="c" onRetry={() => undefined} />);
    await click(byText(el, 'button', 'Undo last AI plan change'));
    expect(localStorage.getItem(PLAN_KEY)).toBe('old-plan');
    expect(assign).toHaveBeenCalledWith('/app');
    vi.unstubAllGlobals();
  });
});

describe('pre-apply snapshot', () => {
  it('is written before applyGeneratedPlan replaces the plan', () => {
    localStorage.setItem(PLAN_KEY, 'previous-persisted-plan');
    useMediaPlanStore.getState().applyGeneratedPlan(generatePlan({ industry: 'igaming', monthlyBudget: 50000 }));
    const backup = JSON.parse(localStorage.getItem(PRE_APPLY_BACKUP_KEY)!);
    expect(backup.plan).toBe('previous-persisted-plan');
    expect(typeof backup.savedAt).toBe('string');
  });
});

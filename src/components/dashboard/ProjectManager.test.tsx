import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { useMultiMonthStore } from '@/hooks/use-multi-month-store';
import { hasUnsavedWork, loadSavedProjects } from '@/lib/saved-projects';
import { byText, cleanup, click, mount } from '@/test/mount';
import { ProjectManager } from './ProjectManager';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const budget = () => useMediaPlanStore.getState().totalBudget;
const setBudget = (value: number) => act(async () => useMediaPlanStore.getState().setTotalBudget(value));
const dialog = () => document.querySelector('[role="alertdialog"]');
const projectRow = (name: string) => byText(document.body, 'span', name)!.closest('.cursor-pointer');

function typeInto(input: HTMLInputElement, value: string) {
  return act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Opens My Projects and saves the current plan under `name` through the UI. */
async function openAndSave(name: string) {
  const el = await mount(<ProjectManager />);
  await click(byText(el, 'button', 'My Projects'));
  await typeInto(document.querySelector<HTMLInputElement>('input[placeholder^="Project Name"]')!, name);
  await click(byText(document.body, 'button', 'Save'));
}

describe('ProjectManager', () => {
  beforeEach(async () => {
    localStorage.clear();
    await setBudget(40000);
  });
  afterEach(cleanup);

  it('loads straight away when the current plan is already saved', async () => {
    const nativeConfirm = vi.spyOn(window, 'confirm');
    await openAndSave('Plan A');
    expect(
      hasUnsavedWork(useMediaPlanStore.getState(), useMultiMonthStore.getState(), loadSavedProjects().projects)
    ).toBe(false);

    await click(projectRow('Plan A'));
    expect(dialog()).toBeNull();
    expect(budget()).toBe(40000);
    expect(nativeConfirm).not.toHaveBeenCalled();
    nativeConfirm.mockRestore();
  });

  it('asks before a load overwrites unsaved changes; Cancel keeps them, confirm loads', async () => {
    await openAndSave('Plan A');
    await setBudget(55000); // an edit that is not saved in any project

    await click(projectRow('Plan A'));
    expect(dialog()?.textContent).toContain('Load "Plan A"?');
    expect(dialog()?.textContent).toContain('not saved in a project');
    expect(budget()).toBe(55000);

    await click(byText(dialog()!, 'button', 'Cancel'));
    expect(dialog()).toBeNull();
    expect(budget()).toBe(55000);

    await click(projectRow('Plan A'));
    await click(byText(dialog()!, 'button', 'Load and replace'));
    expect(budget()).toBe(40000);
  });

  it('confirms a delete in the app dialog', async () => {
    await openAndSave('Plan A');
    await click(document.querySelector('button[title="Delete Project"]'));
    expect(dialog()?.textContent).toContain('Delete "Plan A"?');
    expect(loadSavedProjects().projects).toHaveLength(1);

    await click(byText(dialog()!, 'button', 'Delete project'));
    expect(loadSavedProjects().projects).toHaveLength(0);
  });
});

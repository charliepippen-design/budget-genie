import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { success, error } = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success, error } }));

import { runExport, useExportRunner } from './use-export-runner';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  success.mockClear();
  error.mockClear();
});

describe('runExport', () => {
  it('toasts success after the task resolves', async () => {
    await expect(runExport('Excel', async () => {})).resolves.toBe(true);
    expect(success).toHaveBeenCalledWith('Excel export complete');
    expect(error).not.toHaveBeenCalled();
  });

  it('surfaces a rejected export as an error toast', async () => {
    const task = vi.fn().mockRejectedValue(new Error('Excel export failed: boom'));
    await expect(runExport('Excel', task)).resolves.toBe(false);
    expect(error).toHaveBeenCalledWith('Excel export failed: boom');
    expect(success).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for non-Error rejections', async () => {
    await expect(runExport('PDF', () => Promise.reject('nope'))).resolves.toBe(false);
    expect(error).toHaveBeenCalledWith('PDF export failed');
  });
});

describe('useExportRunner', () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: ReturnType<typeof useExportRunner>;

  const Harness = () => {
    api = useExportRunner();
    return <span>{api.exporting ?? 'idle'}</span>;
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows a loading label while running and clears it after a failure', async () => {
    let reject!: (e: Error) => void;
    const pending = new Promise<void>((_, r) => {
      reject = r;
    });

    let done!: Promise<boolean>;
    act(() => {
      done = api.run('Excel', () => pending);
    });
    expect(container.textContent).toBe('Excel');

    // A second export is ignored while one is in flight.
    const second = vi.fn();
    await act(async () => {
      await api.run('PDF', second);
    });
    expect(second).not.toHaveBeenCalled();

    await act(async () => {
      reject(new Error('boom'));
      await done;
    });
    expect(container.textContent).toBe('idle');
    expect(error).toHaveBeenCalledWith('boom');
  });
});

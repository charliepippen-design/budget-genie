import { BUILD_ID } from './build-info';

export const PLAN_KEY = 'mediaplan-store-v2';
export const MULTI_MONTH_KEY = 'multi-month-plan-store';
export const CHAT_KEY = 'mediaplan-planner-chat-v1';
export const CRASH_BACKUP_KEY = 'mediaplan-crash-backup';
export const PRE_APPLY_BACKUP_KEY = 'mediaplan-pre-apply-backup';

/** The only localStorage keys a debug export may contain. Never add auth, Clerk or Supabase keys. */
export const DEBUG_EXPORT_KEYS = [PLAN_KEY, MULTI_MONTH_KEY, CHAT_KEY, CRASH_BACKUP_KEY, PRE_APPLY_BACKUP_KEY] as const;

export interface CrashInfo {
  message: string;
  stack: string;
  componentStack: string;
}

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** Copies the saved plan into a separate key so a crash can never cost the user their work. Never throws. */
export function saveCrashBackup(name: string, error: unknown) {
  try {
    const backup = {
      savedAt: new Date().toISOString(),
      section: name,
      error: error instanceof Error ? error.message : String(error),
      plan: read(PLAN_KEY),
      multiMonth: read(MULTI_MONTH_KEY),
    };
    localStorage.setItem(CRASH_BACKUP_KEY, JSON.stringify(backup));
  } catch {
    // storage unavailable or full: nothing more we can do
  }
}

/** Fingerprint of the number-bearing plan fields, to tell whether an undo would change anything. */
export function planFingerprint(state: { totalBudget: number; channels: unknown; activeGeos: string[]; activeTiers: unknown }): string {
  return JSON.stringify([state.totalBudget, state.channels, state.activeGeos, state.activeTiers]);
}

/**
 * Snapshots the persisted plan before an AI tool call changes it, so it can be undone.
 * Only AI tool applies call this (not the wizard or onboarding). `fingerprint` is the
 * plan fingerprint at snapshot time. Never throws.
 */
export function snapshotPlanBeforeApply(fingerprint?: string) {
  try {
    const plan = read(PLAN_KEY);
    if (plan === null) {
      localStorage.removeItem(PRE_APPLY_BACKUP_KEY);
      return;
    }
    localStorage.setItem(
      PRE_APPLY_BACKUP_KEY,
      JSON.stringify({ source: 'ai', savedAt: new Date().toISOString(), plan, fingerprint })
    );
  } catch {
    // storage unavailable or full
  }
}

/**
 * True when an AI-tagged snapshot exists and, if the current plan fingerprint is given,
 * the snapshot differs from it. Untagged (legacy, wizard) snapshots never count.
 */
export function hasPreApplyBackup(currentFingerprint?: string): boolean {
  try {
    const raw = read(PRE_APPLY_BACKUP_KEY);
    const backup = raw ? JSON.parse(raw) : null;
    if (!backup || backup.source !== 'ai' || typeof backup.plan !== 'string') return false;
    if (currentFingerprint !== undefined && backup.fingerprint === currentFingerprint) return false;
    return true;
  } catch {
    return false;
  }
}

/** Restores the plan saved before the last AI plan change. Returns false if there is nothing to restore. */
export function restorePreApplyBackup(): boolean {
  try {
    const raw = read(PRE_APPLY_BACKUP_KEY);
    const plan = raw ? JSON.parse(raw)?.plan : null;
    if (typeof plan !== 'string') return false;
    localStorage.setItem(PLAN_KEY, plan);
    localStorage.removeItem(PRE_APPLY_BACKUP_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Backs the plan up, then removes it. The caller reloads afterwards. */
export function resetPlanData(): void {
  saveCrashBackup('reset', 'Plan data reset by the user');
  try {
    localStorage.removeItem(PLAN_KEY);
  } catch {
    // storage unavailable
  }
}

const parseMaybe = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export function buildDiagnostics(info: CrashInfo) {
  return {
    buildId: BUILD_ID,
    error: info.message,
    stack: info.stack,
    componentStack: info.componentStack,
    url: window.location.pathname,
    ts: new Date().toISOString(),
  };
}

/** Diagnostics plus the whitelisted plan keys. Everything else in storage is left out. */
export function buildDebugState(info: CrashInfo) {
  const storage: Record<string, unknown> = {};
  for (const key of DEBUG_EXPORT_KEYS) {
    const value = read(key);
    if (value !== null) storage[key] = parseMaybe(value);
  }
  return { ...buildDiagnostics(info), storage };
}

export function debugFileName(now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `mediaplanner-debug-${BUILD_ID.replace(/[^\w.-]/g, '-')}-${stamp}.json`;
}

export function downloadDebugState(info: CrashInfo) {
  const blob = new Blob([JSON.stringify(buildDebugState(info), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = debugFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

import { toast } from 'sonner';
import { CURRENCIES, type CurrencyCode } from '@/contexts/CurrencyContext';
import type { EngineSource } from '@/engine/input';
import { getAuthToken } from '@/lib/ai-client';
import type { MediaPlanData } from '@/lib/media-plan/state';

// Browser side of api/share.ts: a share link is a read-only snapshot of the plan as it is now.

export interface SharedPlan {
  version: 1;
  id: string;
  createdAt: string;
  name: string;
  mediaPlanState: EngineSource;
  currency: CurrencyCode;
  vertical: string | null;
}

export const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;

/** Only what the engine needs to recompute the plan, plus its name. Nothing about the account. */
export function buildSharePayload(state: MediaPlanData, currency: CurrencyCode) {
  const mediaPlanState: EngineSource = {
    totalBudget: state.totalBudget,
    channels: state.channels,
    globalMultipliers: state.globalMultipliers,
    activeTiers: state.activeTiers,
    activeGeos: state.activeGeos,
    geoOverrides: state.geoOverrides,
    onboardingVertical: state.onboardingVertical,
    observedLtv: state.observedLtv,
  };
  return {
    name: state.projectName?.trim() || 'Media plan',
    currency,
    vertical: state.onboardingVertical,
    mediaPlanState,
  };
}

export const shareUrl = (id: string, origin = window.location.origin) => `${origin}/p/${id}`;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Stores the snapshot and returns its id. Throws with a message fit to show the user. */
export async function createShare(payload: ReturnType<typeof buildSharePayload>): Promise<string> {
  const token = await getAuthToken();
  if (!token) throw new Error('Sign in to share a plan.');
  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const data: unknown = await res.json().catch(() => null);
  const id = isRecord(data) && typeof data.id === 'string' ? data.id : '';
  if (!res.ok || !SHARE_ID_PATTERN.test(id)) {
    const message = isRecord(data) && typeof data.error === 'string' ? data.error : '';
    // A 5xx body is for logs, not for people.
    throw new Error(res.status < 500 && message ? message : 'Share links are unavailable right now.');
  }
  return id;
}

/** The public snapshot behind a link; null when it does not exist or was removed. Throws on any other failure. */
export async function fetchSharedPlan(id: string): Promise<SharedPlan | null> {
  if (!SHARE_ID_PATTERN.test(id)) return null;
  const res = await fetch(`/api/share?id=${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok || !isRecord(data)) throw new Error('This shared plan could not be loaded.');
  const plan = data.mediaPlanState;
  if (
    data.version !== 1 ||
    typeof data.name !== 'string' ||
    typeof data.createdAt !== 'string' ||
    !isRecord(plan) ||
    typeof plan.totalBudget !== 'number' ||
    !Array.isArray(plan.channels) ||
    !isRecord(plan.globalMultipliers)
  ) {
    throw new Error('This shared plan could not be loaded.');
  }
  const currency = typeof data.currency === 'string' && data.currency in CURRENCIES ? data.currency : 'EUR';
  return {
    version: 1,
    id,
    createdAt: data.createdAt,
    name: data.name,
    mediaPlanState: plan as unknown as EngineSource,
    currency: currency as CurrencyCode,
    vertical: typeof data.vertical === 'string' ? data.vertical : null,
  };
}

const VIEW_NOTE = 'Anyone with the link can view this version of the plan. Later edits are not included.';

/** Share button action: create the link, copy it, and say exactly what happened. */
export async function shareCurrentPlan(state: MediaPlanData, currency: CurrencyCode): Promise<string | null> {
  let url: string;
  try {
    url = shareUrl(await createShare(buildSharePayload(state, currency)));
  } catch (e) {
    toast.error('Could not create the share link', {
      description: e instanceof Error && e.message ? e.message : 'Share links are unavailable right now.',
    });
    return null;
  }
  const copy = () => navigator.clipboard.writeText(url);
  try {
    await copy();
    toast.success('Share link copied', { description: `${url}\n${VIEW_NOTE}`, duration: 10000 });
  } catch {
    // The link exists even when the browser refuses clipboard access: show it with a copy button.
    toast.success('Share link created', {
      description: `${url}\n${VIEW_NOTE}`,
      duration: 20000,
      action: { label: 'Copy', onClick: () => void copy().catch(() => undefined) },
    });
  }
  return url;
}

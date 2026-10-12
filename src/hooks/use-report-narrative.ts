import { useCallback, useEffect, useRef, useState } from 'react';
import { isFreeTierLimit } from '@/lib/ai-client';
import { getCachedNarrative, hashNarratorInput, setCachedNarrative } from '@/lib/narrative-cache';
import {
  generateReportNarrative,
  type ReportNarrative,
  type ReportNarratorInput,
} from '@/lib/report-narrator';
import { useBlendedMetrics, useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { useVerticalConfig } from '@/hooks/use-vertical-config';
import { computePlanHealth } from '@/lib/plan-health';

export interface NarrativeError {
  message: string;
  limit: boolean;
}

/**
 * AI summary that is only ever requested by an explicit generate() call.
 * Mounting, or re-rendering with a changed plan, never calls the AI: a cached
 * summary is shown only when its input hash matches the current plan.
 */
export function useReportNarrative(base: ReportNarratorInput) {
  const blended = useBlendedMetrics();
  const vertical = useMediaPlanStore((s) => s.onboardingVertical);
  const multipliers = useMediaPlanStore((s) => s.globalMultipliers);
  const verticalConfig = useVerticalConfig();
  const health = computePlanHealth(blended, vertical, multipliers);
  // Engine profitability and the vertical's value label join the input before hashing.
  const input: ReportNarratorInput = {
    ...base,
    profitability: base.profitability ?? {
      losesMoney: health.losesMoney,
      monthlyContribution: health.monthlyContribution,
      breakEvenCpa: health.breakEvenCpa,
      blendedCpa: health.blendedCpa,
    },
    revenueLabel: base.revenueLabel ?? verticalConfig.report.revenueLabel,
  };
  const hash = hashNarratorInput(input);
  const [generated, setGenerated] = useState<{ hash: string; narrative: ReportNarrative } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<NarrativeError | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const narrative =
    generated?.hash === hash ? generated.narrative : getCachedNarrative(hash);

  const generate = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const requested = inputRef.current;
    const requestedHash = hashNarratorInput(requested);
    setLoading(true);
    setError(null);
    try {
      const result = await generateReportNarrative(requested);
      if (result) {
        setCachedNarrative(requestedHash, result);
        if (mounted.current) setGenerated({ hash: requestedHash, narrative: result });
      } else if (mounted.current) {
        setError({ message: 'Could not write the AI summary. Please try again.', limit: false });
      }
    } catch (err) {
      if (mounted.current) {
        setError({
          message: isFreeTierLimit(err) && err instanceof Error
            ? err.message
            : 'Could not write the AI summary. Please try again.',
          limit: isFreeTierLimit(err),
        });
      }
    } finally {
      busy.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  return { narrative, loading, error, generate };
}

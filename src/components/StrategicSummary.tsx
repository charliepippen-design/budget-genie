import { usePlanResult } from '@/hooks/use-media-plan-store';
import { planHealthFromEconomics } from '@/lib/plan-health';
import { buildStrategySummary, type StrategySummaryInput } from '@/lib/strategy-summary';

/** Engine-based fallback for the Output "Strategic Approach" section. Not AI-generated. */
export function StrategicSummary(props: StrategySummaryInput) {
  const { economics } = usePlanResult();
  const health = props.health ?? planHealthFromEconomics(economics);
  return (
    <>
      <div className="border-l-4 border-primary pl-6 py-2">
        <p className="text-xl leading-relaxed text-foreground font-light">
          {buildStrategySummary({ ...props, health })}
        </p>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        Summary calculated from the plan numbers. Not AI-generated.
      </p>
    </>
  );
}

export interface PlanReadyToast {
  title: string;
  options: { description: string; duration: number };
}

/**
 * Fixed, honest copy for the onboarding completion toast. It deliberately takes
 * no arguments: AI-generated text (rationale etc.) must never reach a toast.
 */
export function buildPlanReadyToast(): PlanReadyToast {
  return {
    title: 'Your plan is ready',
    options: {
      description:
        "Figures are estimates from our planning engine, not guarantees. Review the channels and adjust anything that doesn't fit.",
      duration: 6000,
    },
  };
}

import { ENGINE_STORAGE_KEY, getEngine, placeholderEngine, responseCurveEngine } from '@/engine';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { id: placeholderEngine.id, label: 'Standard' },
  { id: responseCurveEngine.id, label: 'Response curves (beta)' },
];

/**
 * Dev / QA only: picks the planning engine for this browser so the two can be compared.
 * Never rendered in a production build; customers always get the standard engine.
 */
export function EngineSwitch() {
  if (!import.meta.env.DEV) return null;
  const activeId = getEngine().id;

  const choose = (id: string) => {
    if (id === activeId) return;
    try {
      // The standard engine is "no key": the switch is read once at startup, so reload.
      if (id === placeholderEngine.id) localStorage.removeItem(ENGINE_STORAGE_KEY);
      else localStorage.setItem(ENGINE_STORAGE_KEY, id);
    } catch {
      return;
    }
    window.location.reload();
  };

  return (
    <section
      data-testid="engine-switch"
      aria-label="Planning engine"
      className="rounded-lg border border-slate-700 bg-[#2a2a2a] p-6 md:col-span-2"
    >
      <h3 className="text-lg font-semibold text-white">Planning engine</h3>
      <p className="mt-1 text-sm text-slate-400">
        Dev and QA only. Switches this browser between the two engines and reloads the page.
      </p>
      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Planning engine">
        {OPTIONS.map((option) => {
          const selected = option.id === activeId;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(option.id)}
              className={cn(
                'min-h-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                selected
                  ? 'border-slate-100 bg-slate-100 text-slate-900'
                  : 'border-slate-600 text-slate-200 hover:border-slate-400'
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

import { useCallback, useRef, useState, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { useCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';

interface BudgetSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export function BudgetSlider({
  value,
  onChange,
  min = 0,
  max = 500000,
  step = 1000,
}: BudgetSliderProps) {
  const { format: formatCurrency } = useCurrency();
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  // Update input value when external value changes
  useEffect(() => {
    if (!isEditing) {
      setInputValue(value.toString());
    }
  }, [value, isEditing]);

  const handleSliderChange = useCallback(
    (values: number[]) => {
      onChange(values[0]);
    },
    [onChange]
  );

  const handleInputBlur = useCallback(() => {
    setIsEditing(false);
    const numValue = parseInt(inputValue.replace(/[^\d]/g, ''), 10);
    if (!isNaN(numValue)) {
      onChange(Math.max(min, Math.min(max, numValue)));
    } else {
      setInputValue(value.toString());
    }
  }, [inputValue, onChange, min, max, value]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        inputRef.current?.blur();
      } else if (e.key === 'Escape') {
        setInputValue(value.toString());
        setIsEditing(false);
      }
    },
    [value]
  );

  // Calculate percentage for gradient
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="relative">
      {/* Background decoration */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5 -z-10" />

      <div className="p-6 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm card-shadow">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Total Max Budget
              </h2>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Drag to scale all channel allocations proportionally
              </p>
            </div>

            {/* Editable Budget Display */}
            <div className="relative">
              {isEditing ? (
                <Input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onBlur={handleInputBlur}
                  onKeyDown={handleInputKeyDown}
                  className="w-40 text-right text-2xl font-bold font-mono bg-background border-accent"
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => {
                    setIsEditing(true);
                    setInputValue(value.toString());
                  }}
                  className={cn(
                    "text-3xl sm:text-4xl font-bold font-mono tracking-tight",
                    "gradient-text hover:opacity-80 transition-opacity cursor-text",
                    "focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 rounded-lg px-2"
                  )}
                >
                  {formatCurrency(value)}
                </button>
              )}
            </div>
          </div>

          {/* Slider Track */}
          <div className="relative py-2">
            {/* Custom slider with gradient track */}
            <div className="relative">
              <Slider
                value={[value]}
                onValueChange={handleSliderChange}
                min={min}
                max={max}
                step={step}
                className="w-full [&_[role=slider]]:h-6 [&_[role=slider]]:w-6 [&_[role=slider]]:border-2 [&_[role=slider]]:border-primary-foreground [&_[role=slider]]:bg-gradient-primary [&_[role=slider]]:shadow-lg [&_[role=slider]]:transition-transform [&_[role=slider]]:hover:scale-110 [&_[role=slider]]:focus-visible:ring-accent"
              />
            </div>

            {/* Min/Max Labels */}
            <div className="flex justify-between mt-3 text-xs text-muted-foreground font-mono">
              <span>{formatCurrency(min, true)}</span>
              <span>{formatCurrency(max, true)}</span>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="flex flex-wrap gap-2">
            {[25000, 50000, 100000, 250000, 500000].map((preset) => (
              <button
                key={preset}
                onClick={() => onChange(preset)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                  value === preset
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                )}
              >
                {formatCurrency(preset, true)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

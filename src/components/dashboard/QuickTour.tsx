import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HelpCircle, ChevronRight, ChevronLeft, Wand2, Sliders, LineChart, Target, Compass } from 'lucide-react';

interface TourStep {
  title: string;
  description: string;
  icon: React.ComponentType<any>;
}

export function QuickTour() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);

  const steps: TourStep[] = [
    {
      title: "Welcome to MediaPlan Pro",
      description: "This interactive budget calibrator helps you allocate digital marketing spend across 5 channels. Let's take a quick 1-minute tour of its core capabilities.",
      icon: Compass,
    },
    {
      title: "Scale Your Total Budget",
      description: "Use the large slider at the top or quick-select preset pills (e.g., 50k, 100k) to adjust your total investment. The system scales your channel budgets automatically.",
      icon: Sliders,
    },
    {
      title: "Set CPA & ROAS Targets",
      description: "Define target CPA and ROAS constraints in the Settings sidebar. If channels exceed target CPA or dip below target ROAS, a warning will highlight them instantly.",
      icon: Target,
    },
    {
      title: "Smart Rebalancing & Auto-Fix",
      description: "Enable targets to activate the 'Auto-Fix Allocations' button. With one click, it drains budget from bleeding channels and siphons it into your top-performing channels.",
      icon: Wand2,
    },
    {
      title: "Multi-Month & Benchmarks",
      description: "Explore progression patterns, seasonality multipliers, and P&L forecasts. Check the 'Industry Benchmarks' tab to compare your plan against Online Casino and Sportsbook benchmarks.",
      icon: LineChart,
    }
  ];

  useEffect(() => {
    const hasSeenTour = localStorage.getItem('mediaplan-tour-seen');
    if (!hasSeenTour) {
      setIsOpen(true);
    }
  }, []);

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem('mediaplan-tour-seen', 'true');
    setIsOpen(false);
  };

  const ActiveIcon = steps[step].icon;

  return (
    <>
      {/* Floating help trigger in case they want to run it again */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => { setStep(0); setIsOpen(true); }}
        className="fixed bottom-4 left-4 z-50 h-10 w-10 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg border border-indigo-500/20"
        title="Start Quick Tour"
      >
        <HelpCircle className="h-5 w-5" />
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                <ActiveIcon className="h-6 w-6" />
              </div>
              <DialogTitle className="text-xl font-bold text-white">
                {steps[step].title}
              </DialogTitle>
            </div>
            <DialogDescription className="text-slate-400 text-sm leading-relaxed pt-2">
              {steps[step].description}
            </DialogDescription>
          </DialogHeader>

          {/* Stepper Dots */}
          <div className="flex justify-center gap-1.5 py-4">
            {steps.map((_, idx) => (
              <div
                key={idx}
                className={`h-2 rounded-full transition-all duration-300 ${
                  idx === step ? 'w-6 bg-indigo-500' : 'w-2 bg-slate-800'
                }`}
              />
            ))}
          </div>

          <DialogFooter className="flex flex-row items-center justify-between sm:justify-between w-full border-t border-slate-800/50 pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleComplete}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Skip
            </Button>
            <div className="flex gap-2">
              {step > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrev}
                  className="h-8 px-3 border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
              <Button
                variant="default"
                size="sm"
                onClick={handleNext}
                className="h-8 px-4 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {step === steps.length - 1 ? "Get Started" : "Next"}
                {step !== steps.length - 1 && <ChevronRight className="h-4 w-4 ml-1" />}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

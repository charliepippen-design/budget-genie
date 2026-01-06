import { useState } from 'react';
import {
  Target,
  Zap,
  DollarSign,
  TrendingUp,
  BarChart3,
  Timer,
  Scale,
  Loader2,
  Play,
  CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/mediaplan-data';
import {
  useMultiMonthStore,
  OptimizationGoal,
  RiskLevel,
} from '@/hooks/use-multi-month-store';

const GOAL_OPTIONS: { value: OptimizationGoal; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'maximize-roas', label: 'Maximize ROAS', icon: <TrendingUp className="h-4 w-4" />, description: 'Best return per € spent' },
  { value: 'minimize-cac', label: 'Minimize CAC', icon: <DollarSign className="h-4 w-4" />, description: 'Lowest cost per acquisition' },
  { value: 'maximize-revenue', label: 'Maximize Revenue', icon: <BarChart3 className="h-4 w-4" />, description: 'Highest total GGR' },
  { value: 'maximize-profit', label: 'Maximize Profit', icon: <Target className="h-4 w-4" />, description: 'Highest net P&L' },
  { value: 'breakeven-fastest', label: 'Break-even Fastest', icon: <Timer className="h-4 w-4" />, description: 'Reach profitability quickly' },
  { value: 'balanced', label: 'Balanced', icon: <Scale className="h-4 w-4" />, description: 'Compromise between profit & efficiency' },
];

const RISK_OPTIONS: { value: RiskLevel; label: string; description: string }[] = [
  { value: 'conservative', label: 'Conservative', description: 'Gradual growth, stability prioritized' },
  { value: 'moderate', label: 'Moderate', description: 'Balanced progression, allows variance' },
  { value: 'aggressive', label: 'Aggressive', description: 'Maximize spend early, chase volume' },
];

export function AutoOptimizer() {
  const {
    optimizationGoal,
    riskLevel,
    constraints,
    optimizationResults,
    isOptimizing,
    setOptimizationGoal,
    setRiskLevel,
    setConstraints,
    runOptimization,
    loadOptimizationResult,
  } = useMultiMonthStore();

  const [progress, setProgress] = useState(0);

  const handleRunOptimization = async () => {
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((p) => Math.min(95, p + 15));
    }, 200);
    
    await runOptimization();
    
    clearInterval(interval);
    setProgress(100);
    setTimeout(() => setProgress(0), 500);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Optimization Goal */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Optimization Goal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {GOAL_OPTIONS.map((goal) => (
              <button
                key={goal.value}
                onClick={() => setOptimizationGoal(goal.value)}
                className={cn(
                  "w-full flex items-center gap-3 p-2 rounded-lg border text-left transition-all",
                  optimizationGoal === goal.value
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <div className={cn(
                  "p-1.5 rounded",
                  optimizationGoal === goal.value ? "bg-primary text-primary-foreground" : "bg-muted"
                )}>
                  {goal.icon}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{goal.label}</div>
                  <div className="text-xs text-muted-foreground">{goal.description}</div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Risk Level & Constraints */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Risk & Constraints
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Risk Level */}
            <div className="space-y-2">
              <Label className="text-xs">Risk Level</Label>
              <Select value={riskLevel} onValueChange={(v) => setRiskLevel(v as RiskLevel)}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RISK_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      <div>
                        <div className="font-medium">{r.label}</div>
                        <div className="text-xs text-muted-foreground">{r.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Budget Constraints */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Min Monthly</Label>
                <Input
                  type="number"
                  value={constraints.minMonthlyBudget}
                  onChange={(e) => setConstraints({ minMonthlyBudget: parseFloat(e.target.value) || 0 })}
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Max Monthly</Label>
                <Input
                  type="number"
                  value={constraints.maxMonthlyBudget}
                  onChange={(e) => setConstraints({ maxMonthlyBudget: parseFloat(e.target.value) || 0 })}
                  className="h-7 text-xs"
                />
              </div>
            </div>

            {/* Target Constraints */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Max CAC (€)</Label>
                <Input
                  type="number"
                  value={constraints.maxCacTolerance ?? ''}
                  onChange={(e) => setConstraints({ 
                    maxCacTolerance: e.target.value ? parseFloat(e.target.value) : null 
                  })}
                  placeholder="None"
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Min ROAS (x)</Label>
                <Input
                  type="number"
                  value={constraints.minRoasTarget ?? ''}
                  onChange={(e) => setConstraints({ 
                    minRoasTarget: e.target.value ? parseFloat(e.target.value) : null 
                  })}
                  placeholder="None"
                  className="h-7 text-xs"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Break-even by Month</Label>
              <Select
                value={constraints.breakEvenByMonth?.toString() ?? ''}
                onValueChange={(v) => setConstraints({ 
                  breakEvenByMonth: v ? parseInt(v) : null 
                })}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="No constraint" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No constraint</SelectItem>
                  {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                    <SelectItem key={m} value={m.toString()}>Month {m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Run Button */}
            <Button
              onClick={handleRunOptimization}
              disabled={isOptimizing}
              className="w-full gap-2"
            >
              {isOptimizing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Optimizing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run Optimization
                </>
              )}
            </Button>

            {progress > 0 && (
              <Progress value={progress} className="h-1" />
            )}
          </CardContent>
        </Card>

        {/* Results */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary" />
              Top Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {optimizationResults.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Run optimization to see recommendations
              </div>
            ) : (
              optimizationResults.map((result, idx) => (
                <Card key={idx} className={cn(
                  "border cursor-pointer transition-all hover:border-primary",
                  idx === 0 && "border-green-500 bg-green-500/5"
                )}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <Badge variant={idx === 0 ? "default" : "secondary"} className="mb-1">
                          #{idx + 1} {result.scenario.progressionPattern?.replace('-', ' ')}
                        </Badge>
                        <div className="text-xs text-muted-foreground">{result.reasoning}</div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {result.confidence.toFixed(0)}%
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                      <div>
                        <div className="text-muted-foreground">Revenue</div>
                        <div className="font-mono font-medium">{formatCurrency(result.metrics.totalRevenue, true)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Profit</div>
                        <div className={cn(
                          "font-mono font-medium",
                          result.metrics.netProfit > 0 ? "text-green-500" : "text-destructive"
                        )}>
                          {formatCurrency(result.metrics.netProfit, true)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">ROAS</div>
                        <div className="font-mono font-medium">{result.metrics.avgRoas.toFixed(2)}x</div>
                      </div>
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-7 text-xs"
                      onClick={() => loadOptimizationResult(idx)}
                    >
                      Load This Plan
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

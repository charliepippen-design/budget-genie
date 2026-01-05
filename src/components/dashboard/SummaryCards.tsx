import { useMemo } from 'react';
import { 
  TrendingUp, 
  Users, 
  Target, 
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency, formatNumber } from '@/lib/mediaplan-data';
import { cn } from '@/lib/utils';

interface SummaryCardsProps {
  totalBudget: number;
  blendedCpa: number | null;
  totalConversions: number;
  projectedRevenue: number;
  blendedRoas: number;
}

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon: React.ReactNode;
  accentColor?: string;
  delay?: number;
}

function MetricCard({ title, value, subtitle, trend, icon, accentColor, delay = 0 }: MetricCardProps) {
  return (
    <Card 
      className={cn(
        "relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-lg",
        "bg-card border-border/50 card-shadow animate-slide-up"
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Accent gradient bar */}
      <div 
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: accentColor || 'var(--gradient-primary)' }}
      />
      
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
              {title}
            </p>
            <p className="text-2xl sm:text-3xl font-bold font-mono tracking-tight">
              {value}
            </p>
            {subtitle && (
              <div className="flex items-center gap-1 mt-2">
                {trend === 'up' && <ArrowUpRight className="h-3 w-3 text-success" />}
                {trend === 'down' && <ArrowDownRight className="h-3 w-3 text-destructive" />}
                <span className={cn(
                  "text-xs",
                  trend === 'up' && "text-success",
                  trend === 'down' && "text-destructive",
                  !trend && "text-muted-foreground"
                )}>
                  {subtitle}
                </span>
              </div>
            )}
          </div>
          
          <div className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl",
            "bg-gradient-to-br from-muted to-muted/50"
          )}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SummaryCards({
  totalBudget,
  blendedCpa,
  totalConversions,
  projectedRevenue,
  blendedRoas,
}: SummaryCardsProps) {
  const metrics = useMemo(() => [
    {
      title: 'Total Budget',
      value: formatCurrency(totalBudget),
      subtitle: 'Monthly allocation',
      icon: <DollarSign className="h-5 w-5 text-primary" />,
      accentColor: 'hsl(var(--primary))',
    },
    {
      title: 'Blended CPA',
      value: blendedCpa ? formatCurrency(blendedCpa) : 'N/A',
      subtitle: blendedCpa ? `Per conversion` : 'No conversions',
      trend: blendedCpa && blendedCpa < 100 ? 'up' as const : 'neutral' as const,
      icon: <Target className="h-5 w-5 text-accent" />,
      accentColor: 'hsl(var(--accent))',
    },
    {
      title: 'Est. Conversions',
      value: formatNumber(totalConversions, true),
      subtitle: `${formatNumber(totalConversions)} total`,
      trend: 'up' as const,
      icon: <Users className="h-5 w-5 text-success" />,
      accentColor: 'hsl(var(--success))',
    },
    {
      title: 'Projected Revenue',
      value: formatCurrency(projectedRevenue, true),
      subtitle: `${blendedRoas.toFixed(1)}x ROAS`,
      trend: blendedRoas > 2 ? 'up' as const : 'neutral' as const,
      icon: <TrendingUp className="h-5 w-5 text-warning" />,
      accentColor: 'hsl(var(--warning))',
    },
  ], [totalBudget, blendedCpa, totalConversions, projectedRevenue, blendedRoas]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((metric, index) => (
        <MetricCard
          key={metric.title}
          {...metric}
          delay={index * 50}
        />
      ))}
    </div>
  );
}

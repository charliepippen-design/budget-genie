import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function RouteLoadingSkeleton() {
  return (
    <div className="min-h-screen p-6 bg-[#020617]">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-44 w-full" />
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          <div className="xl:col-span-3 space-y-6">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-80 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <Skeleton className="h-[520px] w-full" />
        </div>
      </div>
    </div>
  );
}

export function ChartSectionSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="bg-card border-border/50 h-[320px]">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[230px] w-full" />
        </CardContent>
      </Card>
      <Card className="bg-card border-border/50 h-[320px]">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[230px] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export function ScenarioListSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

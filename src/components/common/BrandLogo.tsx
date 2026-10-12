import { DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRAND_NAME } from '@/lib/brand';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  tone?: 'light' | 'dark';
  as?: 'h1' | 'h2' | 'span';
  stacked?: boolean;
  className?: string;
}

const ICON_BOX = { sm: 'h-7 w-7 rounded-lg', md: 'h-10 w-10 rounded-xl', lg: 'h-16 w-16 rounded-2xl' };
const ICON = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-8 w-8' };
const TEXT = { sm: 'text-base', md: 'text-xl', lg: 'text-2xl' };

/** One logo treatment (icon + wordmark) used on every page. */
export function BrandLogo({ size = 'md', tone = 'dark', as: Tag = 'span', stacked = false, className }: BrandLogoProps) {
  return (
    <div className={cn('flex items-center gap-2', stacked && 'flex-col gap-3', className)}>
      <div className={cn('flex items-center justify-center border border-blue-500/30 bg-blue-600/20', ICON_BOX[size])}>
        <DollarSign className={cn('text-blue-500', ICON[size])} />
      </div>
      <Tag className={cn('font-bold tracking-tight', TEXT[size], tone === 'dark' ? 'text-white' : 'text-slate-900')}>
        {BRAND_NAME}
      </Tag>
    </div>
  );
}

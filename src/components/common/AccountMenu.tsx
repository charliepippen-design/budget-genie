import { useUser } from '@clerk/clerk-react';
import { useSignOut } from '@/hooks/use-sign-out';
import { LogOut, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export function AccountMenu({ isDark, className }: { isDark: boolean; className?: string }) {
  const { user } = useUser();
  const signOut = useSignOut();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const name = user?.fullName ?? user?.firstName ?? null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Open account menu" title="Account" className={cn(className)}>
          <UserIcon className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn(
          'border-2',
          isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-300 bg-white'
        )}
      >
        <DropdownMenuLabel className="font-normal">
          {name ? <div className="font-semibold">{name}</div> : null}
          <div className="text-xs opacity-80">{email ?? 'Signed in'}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()} className="cursor-pointer gap-2 font-medium">
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

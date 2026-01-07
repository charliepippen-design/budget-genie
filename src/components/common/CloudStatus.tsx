
import { Cloud, CloudOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAutoSave } from '@/hooks/use-auto-save';

export function CloudStatus() {
    const { status, lastSaved } = useAutoSave();

    return (
        <div className={cn(
            "fixed bottom-4 left-4 z-40 bg-[#0f172a] border border-slate-700 rounded-full px-3 py-1.5 flex items-center gap-2 shadow-lg transition-all duration-300",
            status === 'error' ? "border-red-500/50 bg-red-950/20" : "border-blue-500/20"
        )}>
            {status === 'syncing' && (
                <>
                    <RefreshCw className="h-3 w-3 text-blue-400 animate-spin" />
                    <span className="text-[10px] font-medium text-slate-300">Syncing...</span>
                </>
            )}

            {status === 'idle' && (
                <>
                    <Cloud className="h-3 w-3 text-slate-400" />
                    <span className="text-[10px] font-medium text-slate-400">
                        {lastSaved ? 'Saved' : 'Ready'}
                    </span>
                </>
            )}

            {status === 'error' && (
                <>
                    <CloudOff className="h-3 w-3 text-red-400" />
                    <span className="text-[10px] font-medium text-red-400">Offline</span>
                </>
            )}
        </div>
    );
}

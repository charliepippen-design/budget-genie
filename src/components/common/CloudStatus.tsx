
import { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAutoSave } from '@/hooks/use-auto-save';

export function CloudStatus() {
    const { status, lastSaved } = useAutoSave();
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // If browser is offline, force error state in UI even if useAutoSave hasn't errored yet
    const displayStatus = !isOnline ? 'error' : status;

    return (
        <div className={cn(
            "fixed bottom-4 left-4 z-40 bg-[#0f172a] border border-slate-700 rounded-full px-3 py-1.5 flex items-center gap-2 shadow-lg transition-all duration-300",
            displayStatus === 'error' ? "border-red-500/50 bg-red-950/20" : "border-blue-500/20"
        )}>
            {displayStatus === 'syncing' && (
                <>
                    <RefreshCw className="h-3 w-3 text-blue-400 animate-spin" />
                    <span className="text-[10px] font-medium text-slate-300">Syncing...</span>
                </>
            )}

            {displayStatus === 'idle' && (
                <>
                    <Cloud className="h-3 w-3 text-slate-400" />
                    <span className="text-[10px] font-medium text-slate-400">
                        {lastSaved ? 'Saved' : 'Ready'}
                    </span>
                </>
            )}

            {displayStatus === 'error' && (
                <>
                    <CloudOff className="h-3 w-3 text-red-400" />
                    <span className="text-[10px] font-medium text-red-400">
                        {!isOnline ? 'No Internet' : 'Offline'}
                    </span>
                </>
            )}
        </div>
    );
}

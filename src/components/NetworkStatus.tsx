
import { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAutoSave } from '@/hooks/use-auto-save';

interface NetworkStatusProps {
    className?: string;
    style?: React.CSSProperties;
}

export function NetworkStatus({ className, style }: NetworkStatusProps) {
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

    // Force error state if offline
    const displayStatus = !isOnline ? 'error' : status;

    return (
        <div
            className={cn(
                "fixed bottom-4 left-4 z-[9999] bg-blue-600 text-white px-4 py-2 rounded shadow-xl font-mono text-xs font-bold transition-all duration-300",
                className
            )}
            style={style}
        >
            Network: {isOnline ? 'ONLINE' : 'OFFLINE'}
        </div>
    );
}

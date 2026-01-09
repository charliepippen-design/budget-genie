
import { AlertTriangle, Hammer } from "lucide-react";

export default function MaintenanceMode() {
    // Allow bypassing for devs via invisible clickable area or just url query
    // URL query is handled in App.tsx

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
            <div className="w-24 h-24 bg-yellow-500/10 rounded-full flex items-center justify-center mb-6 animate-pulse">
                <Hammer className="h-10 w-10 text-yellow-500" />
            </div>

            <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">System Maintenance</h1>

            <p className="text-slate-400 max-w-md mx-auto mb-8 text-lg">
                MediaPlanner Pro is currently undergoing scheduled upgrades to improve cloud synchronization and performance.
            </p>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 max-w-sm w-full flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
                <div className="text-left">
                    <h3 className="text-sm font-medium text-slate-200">What does this mean?</h3>
                    <p className="text-xs text-slate-500 mt-1">
                        Data access is temporarily paused. Your existing projects are safe. Please check back in a few minutes.
                    </p>
                </div>
            </div>

            <div className="mt-12 text-slate-600 text-xs font-mono">
                Status: <span className="text-yellow-500">MAINTENANCE_ACTIVE</span> | v1.0.1
            </div>
        </div>
    );
}

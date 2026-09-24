import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, KeyRound, RefreshCw } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught runtime error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      const isConfigError = this.state.error?.message.toLowerCase().includes('publishable') || 
                            this.state.error?.message.toLowerCase().includes('key') ||
                            this.state.error?.message.includes('ClerkProvider');

      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center font-sans">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none" />
            
            <div className="relative z-10 max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-10 shadow-2xl flex flex-col items-center">
                <div className="h-20 w-20 rounded-full bg-rose-500/10 flex items-center justify-center border border-rose-500/30 mb-6 shadow-[0_0_30px_rgba(244,63,94,0.15)]">
                    {isConfigError ? (
                        <KeyRound className="h-10 w-10 text-rose-400" />
                    ) : (
                        <AlertTriangle className="h-10 w-10 text-rose-400" />
                    )}
                </div>

                <h1 className="text-3xl font-black text-white tracking-tight mb-2">
                    {isConfigError ? "System Configuration Required" : "Fatal Exception"}
                </h1>
                
                <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-rose-900/50 w-full text-left">
                    <p className="text-rose-400 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap">
                        {this.state.error?.message || "An unexpected rendering error occurred."}
                    </p>
                </div>

                {isConfigError && (
                    <p className="mt-6 text-slate-400 text-sm leading-relaxed">
                        The application requires a valid Clerk API Key to initialize authentication. 
                        Please ensure <strong className="text-slate-200">VITE_CLERK_PUBLISHABLE_KEY</strong> is set in your <strong className="text-slate-200">.env.local</strong> file.
                    </p>
                )}

                <button 
                    onClick={() => window.location.reload()}
                    className="mt-8 flex items-center justify-center gap-2 h-12 px-8 rounded-full bg-white text-slate-900 font-bold hover:bg-slate-200 transition-colors"
                >
                    <RefreshCw className="h-4 w-4" /> REBOOT SYSTEM
                </button>
            </div>
        </div>
      );
    }

    return this.props.children;
  }
}

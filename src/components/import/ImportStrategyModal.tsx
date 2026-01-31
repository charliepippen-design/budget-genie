import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet, Bot, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImportStrategyModalProps {
    open: boolean;
    onClose: () => void;
    onSelectStrategy: (strategy: 'standard' | 'ai') => void;
}

export function ImportStrategyModal({ open, onClose, onSelectStrategy }: ImportStrategyModalProps) {
    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="sm:max-w-[600px] gap-6">
                <DialogHeader>
                    <DialogTitle>Select Import Strategy</DialogTitle>
                    <DialogDescription>
                        Choose how you want to process this file.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid md:grid-cols-2 gap-4">
                    <button
                        onClick={() => onSelectStrategy('standard')}
                        className="flex flex-col items-center text-center gap-3 p-6 rounded-xl border-2 border-muted hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
                    >
                        <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                            <FileSpreadsheet className="h-6 w-6 text-blue-600" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="font-semibold text-foreground">Standard Import</h3>
                            <p className="text-xs text-muted-foreground">Clean files with strict formatting (Row 1 headers). Fast & Free.</p>
                        </div>
                    </button>

                    <button
                        onClick={() => onSelectStrategy('ai')}
                        className="flex flex-col items-center text-center gap-3 p-6 rounded-xl border-2 border-muted hover:border-purple-500/50 hover:bg-purple-500/5 transition-all text-left group relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-2 opacity-50">
                            <Bot className="h-24 w-24 text-purple-500/5 -rotate-12 translate-x-4 -translate-y-4" />
                        </div>
                        <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                            <Bot className="h-6 w-6 text-purple-600" />
                        </div>
                        <div className="space-y-1 relative z-10">
                            <h3 className="font-semibold text-foreground">AI Agent</h3>
                            <p className="text-xs text-muted-foreground">Messy or complex files? Let the AI analyze and map the data for you.</p>
                        </div>
                    </button>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

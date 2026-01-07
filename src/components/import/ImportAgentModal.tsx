import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChat } from 'ai/react';
import { Bot, FileText, Send, User, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ImportAgentModalProps {
    open: boolean;
    onClose: () => void;
    fileContent: string | null;
    fileName: string;
    onSuccess: (data: any[]) => void;
}

export function ImportAgentModal({ open, onClose, fileContent, fileName, onSuccess }: ImportAgentModalProps) {
    const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
        api: '/api/chat/import-agent',
        initialMessages: [{
            id: 'system-init',
            role: 'system',
            content: `CONTEXT: User just uploaded a file named "${fileName}". Here is the first 20 lines preview:
            ${fileContent?.split('\n').slice(0, 20).join('\n')}
            ---
            Initialize: Analyze this preview immediately. Identify logical headers and data types. Propose a mapping to the standard schema (Budget, Spend, Month, Channel). Ask the user for confirmation.`
        }],
        onToolCall: (toolCall) => {
            if (toolCall.toolCall.toolName === 'extractAndClose') {
                // Format the data and close
                const args = toolCall.toolCall.args as any;
                onSuccess(args.data);
                onClose();
            }
        }
    });

    if (!open) return null;

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="max-w-[95vw] h-[90vh] p-0 gap-0 overflow-hidden flex flex-col md:flex-row">

                {/* LEFT PANEL: Context Preview */}
                <div className="md:w-1/2 border-r bg-muted/10 flex flex-col h-full">
                    <div className="p-4 border-b flex items-center gap-2 bg-muted/20">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold text-sm truncate">{fileName}</span>
                    </div>
                    <ScrollArea className="flex-1 p-4">
                        <pre className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap bg-card p-4 rounded-lg border shadow-sm">
                            {fileContent?.split('\n').slice(0, 50).join('\n')}
                            {fileContent && fileContent.split('\n').length > 50 && (
                                <div className="text-muted-foreground mt-4 text-center italic">
                                    ... {fileContent.split('\n').length - 50} more lines
                                </div>
                            )}
                        </pre>
                    </ScrollArea>
                </div>

                {/* RIGHT PANEL: Chat Interface */}
                <div className="md:w-1/2 flex flex-col h-full bg-background">
                    <div className="p-4 border-b flex items-center justify-between shadow-sm z-10">
                        <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                                <Bot className="h-4 w-4 text-purple-600" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-sm">Import Assistant</h3>
                                <p className="text-[10px] text-muted-foreground">AI Data Concierge</p>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    <ScrollArea className="flex-1 p-4">
                        <div className="space-y-4 pb-4">
                            {messages.filter(m => m.role !== 'system').map((m) => (
                                <div
                                    key={m.id}
                                    className={cn(
                                        "flex gap-3 text-sm max-w-[90%]",
                                        m.role === 'user' ? "ml-auto flex-row-reverse" : ""
                                    )}
                                >
                                    <div className={cn(
                                        "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                                        m.role === 'user' ? "bg-primary text-primary-foreground" : "bg-purple-100 text-purple-600"
                                    )}>
                                        {m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                                    </div>
                                    <div className={cn(
                                        "p-3 rounded-2xl",
                                        m.role === 'user'
                                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                                            : "bg-muted rounded-tl-sm"
                                    )}>
                                        {m.role === 'assistant' && (m.content === '' && m.toolInvocations?.length ? (
                                            <div className="flex items-center text-xs text-muted-foreground italic">
                                                <Loader2 className="h-3 w-3 animate-spin mr-2" />
                                                Running extraction...
                                            </div>
                                        ) : null)}
                                        <p className="whitespace-pre-wrap">{m.content}</p>
                                    </div>
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex gap-3 text-sm">
                                    <div className="h-8 w-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                                        <Bot className="h-4 w-4" />
                                    </div>
                                    <div className="bg-muted p-3 rounded-2xl rounded-tl-sm">
                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    </div>
                                </div>
                            )}
                        </div>
                    </ScrollArea>

                    <form onSubmit={handleSubmit} className="p-4 border-t bg-muted/10">
                        <div className="flex gap-2">
                            <input
                                className="flex-1 bg-background border rounded-full px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                placeholder="Type a message..."
                                value={input}
                                onChange={handleInputChange}
                                disabled={isLoading}
                                autoFocus
                            />
                            <Button
                                type="submit"
                                size="icon"
                                className="rounded-full h-10 w-10 shrink-0"
                                disabled={isLoading || !input.trim()}
                            >
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>
                    </form>
                </div>
            </DialogContent>
        </Dialog>
    );
}

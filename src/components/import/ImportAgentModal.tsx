import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, FileText, Send, User, X, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, CoreMessage } from 'ai';

interface ImportAgentModalProps {
    open: boolean;
    onClose: () => void;
    fileContent: string | null;
    fileName: string;
    onSuccess: (data: any[]) => void;
}

export function ImportAgentModal({ open, onClose, fileContent, fileName, onSuccess }: ImportAgentModalProps) {
    // Manual State for Client-Side AI
    const [messages, setMessages] = useState<CoreMessage[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Initial System Message
    useEffect(() => {
        if (open && messages.length === 0 && fileContent) {
            setMessages([
                {
                    role: 'assistant',
                    content: `I see you've uploaded **"${fileName}"**. \n\nI'll help you map this data correctly. I've analyzed the first few lines. \n\nDoes this look like a **Monthly Budget Plan** or a **Channel Performance Report**?`
                }
            ]);
        }
    }, [open, fileContent, fileName, messages.length]);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage = { role: 'user' as const, content: input };
        const newMessages = [...messages, userMessage];

        setMessages(newMessages);
        setInput("");
        setIsLoading(true);

        try {
            const apiKey = import.meta.env.VITE_GOOGLE_GENERATIVE_AI_API_KEY;

            if (!apiKey) {
                throw new Error("Missing Google API Key");
            }

            const google = createGoogleGenerativeAI({ apiKey });

            const systemPrompt = `
                You are an "Import Agent" for Budget Genie.
                
                USER CONTEXT:
                File Name: "${fileName}"
                File Preview (First 50 lines):
                \`\`\`
                ${fileContent?.split('\n').slice(0, 50).join('\n')}
                \`\`\`

                GOAL: 
                Help the user map this CSV/Text data to our internal schema:
                - Channel Name (String)
                - Spend (Number)
                - Impressions (Number, optional)
                - Revenue (Number, optional)

                INSTRUCTIONS:
                1. Chat with the user to clarify columns if needed.
                2. If the user confirms the mapping or says "Go ahead" / "Extract", you MUST output a special JSON block at the END of your response.
                
                SPECIAL JSON FORMAT (Only when extracting):
                \`\`\`json
                {
                    "action": "extract",
                    "data": [
                        { "Channel Name": "...", "Spend": 100, ... }
                    ]
                }
                \`\`\`
            `;

            // Use generateText (Stable)
            const { text } = await generateText({
                model: google('gemini-1.5-flash'), // Use the stable model
                system: systemPrompt,
                messages: newMessages,
            });

            // Check for Extraction JSON
            const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
            let responseText = text;

            if (jsonMatch) {
                try {
                    const json = JSON.parse(jsonMatch[1]);
                    if (json.action === 'extract' && Array.isArray(json.data)) {
                        responseText = text.replace(jsonMatch[0], "").trim(); // Remove JSON from chat
                        responseText += "\n\n✅ **Extraction Complete!** Importing data now...";

                        // Trigger Success after a brief delay
                        setTimeout(() => {
                            onSuccess(json.data);
                            onClose();
                        }, 2000);
                    }
                } catch (e) {
                    console.error("Failed to parse AI JSON extraction");
                }
            }

            setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);

        } catch (error: any) {
            console.error("Import Agent Error:", error);
            let errorMessage = "Sorry, I encountered an error analyzing the file.";
            if (error.message?.includes("Missing Google API Key")) {
                errorMessage = "Configuration Error: Missing API Key. I cannot analyze files without it.";
            }
            setMessages(prev => [...prev, { role: 'assistant', content: errorMessage }]);
        } finally {
            setIsLoading(false);
        }
    };

    if (!open) return null;

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="max-w-[95vw] h-[90vh] p-0 gap-0 overflow-hidden flex flex-col md:flex-row">

                {/* LEFT PANEL: Context Preview */}
                <div className="md:w-1/2 border-r bg-muted/10 flex flex-col h-full hidden md:flex">
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
                <div className="md:w-1/2 flex flex-col h-full bg-background w-full">
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
                            {messages.filter(m => m.role !== 'system').map((m, i) => (
                                <div
                                    key={i}
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
                                        <p className="whitespace-pre-wrap">{typeof m.content === 'string' ? m.content : '...'}</p>
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
                            <div ref={scrollRef} />
                        </div>
                    </ScrollArea>

                    <form onSubmit={handleSubmit} className="p-4 border-t bg-muted/10">
                        <div className="flex gap-2">
                            <input
                                className="flex-1 bg-background border rounded-full px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                placeholder="Type a message..."
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
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

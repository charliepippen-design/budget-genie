import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, FileText } from 'lucide-react';
import { parseMessyCSVWithAI } from '@/actions/ai-import';
import { toast } from 'sonner';

interface MagicImportButtonProps {
    fileContent: string | null;
    onSuccess: (data: any[]) => void;
    disabled?: boolean;
}

export function MagicImportButton({ fileContent, onSuccess, disabled }: MagicImportButtonProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleMagicImport = async () => {
        if (!fileContent) {
            toast.error("Please upload a file first.");
            return;
        }

        setIsLoading(true);
        try {
            const result = await parseMessyCSVWithAI(fileContent);

            if (result.success && result.data) {
                onSuccess(result.data);
                toast.success("AI Import Successful! Data structure extracted.");
            } else {
                toast.error("AI Import Failed", {
                    description: "Could not parse the data structure. Please ensure the file is readable."
                });
            }
        } catch (error) {
            console.error(error);
            toast.error("An error occurred during AI processing.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <Button
                onClick={handleMagicImport}
                disabled={disabled || isLoading || !fileContent}
                className="w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white border-0 hover:opacity-90 transition-opacity"
            >
                {isLoading ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing with AI...
                    </>
                ) : (
                    <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Magic AI Import
                    </>
                )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
                Standard import failed? Try Magic Import to parse messy files.
            </p>
        </div>
    );
}

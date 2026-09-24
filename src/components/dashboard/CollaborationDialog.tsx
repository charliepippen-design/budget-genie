import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Share2, Link, MessageSquare, Send, Clock, User, Check, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';

interface Comment {
  id: string;
  author: string;
  avatar: string;
  text: string;
  timestamp: string;
}

interface Version {
  id: string;
  name: string;
  timestamp: string;
  author: string;
}

interface CollaborationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CollaborationDialog({ open, onOpenChange }: CollaborationDialogProps) {
  const { toast } = useToast();
  const { projectName } = useMediaPlanStore();

  const [permission, setPermission] = useState('view');
  const [expiry, setExpiry] = useState('7d');
  const [isCopied, setIsCopied] = useState(false);
  const [commentText, setCommentText] = useState('');
  
  // Persist mock comments in localStorage
  const [comments, setComments] = useState<Comment[]>([
    {
      id: '1',
      author: 'Sarah Jenkins (VP Acquisition)',
      avatar: 'SJ',
      text: 'Our Sportsbook CPA in Sweden looks slightly optimized. Can we shift 5% more into Affiliates for launch?',
      timestamp: '2 hours ago'
    },
    {
      id: '2',
      author: 'Marcus Vance (Media Buyer)',
      avatar: 'MV',
      text: 'Good point. Auto-Fix siphoned budget into Google Search, which has lower CPA right now. Will lock SEO budgets.',
      timestamp: '45 mins ago'
    }
  ]);

  const [versions] = useState<Version[]>([
    { id: 'v1', name: 'Baseline CSV Import', timestamp: 'Yesterday, 4:32 PM', author: 'System' },
    { id: 'v2', name: 'ROAS Calibrated', timestamp: 'Today, 9:02 AM', author: 'Marcus Vance' },
    { id: 'v3', name: 'Aggressive Preset Applied', timestamp: 'Today, 9:15 AM', author: 'Sarah Jenkins' }
  ]);

  const shareUrl = `http://localhost:5173/?plan=${projectName.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'my-plan'}&permission=${permission}&token=auth_tok_${Math.round(Math.random() * 1000000)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setIsCopied(true);
    toast({
      title: 'Link Copied',
      description: 'Collaborative share link copied to clipboard.',
    });
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleSendComment = () => {
    if (!commentText.trim()) return;

    const newComment: Comment = {
      id: Date.now().toString(),
      author: 'Marcus Vance (You)',
      avatar: 'MV',
      text: commentText,
      timestamp: 'Just now'
    };

    setComments([...comments, newComment]);
    setCommentText('');
    toast({
      title: 'Comment Posted',
      description: 'Your feedback has been added to the plan thread.',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-xl overflow-y-auto max-h-[90vh] custom-scrollbar">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Share2 className="h-5 w-5 text-indigo-400" />
            <DialogTitle className="text-lg font-bold">Collaborate & Share Plan</DialogTitle>
          </div>
          <DialogDescription className="text-slate-400 text-xs">
            Generate external access links, manage client review feeds, and inspect version snapshots.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-3">
          {/* Link Generator */}
          <div className="space-y-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Link className="h-3.5 w-3.5" /> Collaboration Access Link
              </h4>
              <Badge variant="outline" className="text-[9px] border-emerald-500/20 bg-emerald-500/5 text-emerald-400">
                Active Sharing
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">Permission Scope</Label>
                <Select value={permission} onValueChange={setPermission}>
                  <SelectTrigger className="bg-slate-900 border-slate-800 h-8 text-xs text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-950 border-slate-800 text-white">
                    <SelectItem value="view">View Only (Client presentation)</SelectItem>
                    <SelectItem value="edit">Can Edit (Team calibration)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">Expiration</Label>
                <Select value={expiry} onValueChange={setExpiry}>
                  <SelectTrigger className="bg-slate-900 border-slate-800 h-8 text-xs text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-950 border-slate-800 text-white">
                    <SelectItem value="24h">24 Hours</SelectItem>
                    <SelectItem value="7d">7 Days</SelectItem>
                    <SelectItem value="never">Never Expire</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Input
                readOnly
                value={shareUrl}
                className="bg-slate-900 border-slate-800 text-xs font-mono text-indigo-300 select-all h-8 flex-1"
              />
              <Button onClick={handleCopy} size="sm" className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white">
                {isCopied ? <Check className="h-4.5 w-4.5" /> : <Copy className="h-4.5 w-4.5" />}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Version Snapshots */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Plan Version History
              </h4>
              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                {versions.map((ver) => (
                  <div key={ver.id} className="p-2.5 rounded-lg bg-slate-950/20 border border-slate-800/80 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200">{ver.name}</span>
                      <span className="text-[9px] font-bold bg-slate-800 px-1.5 py-0.5 rounded text-indigo-400 font-mono">
                        {ver.id.toUpperCase()}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {ver.timestamp} • {ver.author}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Comment Thread */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" /> Feedback & Comments
              </h4>
              <div className="space-y-2.5 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                {comments.map((comm) => (
                  <div key={comm.id} className="text-left text-xs p-2.5 rounded-lg bg-slate-950/20 border border-slate-800/80 flex gap-2">
                    <div className="h-6 w-6 rounded-full bg-indigo-600/30 text-indigo-400 font-bold flex items-center justify-center text-[10px] shrink-0">
                      {comm.avatar}
                    </div>
                    <div className="flex-1 space-y-0.5 min-w-0">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-semibold text-slate-200 truncate">{comm.author}</span>
                        <span className="text-slate-500 shrink-0">{comm.timestamp}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-normal break-words">{comm.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Comment Input */}
              <div className="flex gap-2">
                <Input
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Ask a question or add team context..."
                  className="bg-slate-950 border-slate-800 h-8 text-xs text-white flex-1"
                />
                <Button onClick={handleSendComment} size="sm" className="h-8 w-8 p-0 bg-indigo-600 hover:bg-indigo-700 text-white shrink-0">
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-slate-800/50 pt-3">
          <Button
            onClick={() => onOpenChange(false)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs w-full sm:w-auto"
          >
            Close Panel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

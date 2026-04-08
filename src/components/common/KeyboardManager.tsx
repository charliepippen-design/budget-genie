import { useEffect, useRef } from 'react';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { useHistoryStore } from '@/hooks/use-history';
import { useToast } from '@/components/ui/use-toast';

const HOTKEY_DEBOUNCE_MS = 140;
const TIERS = ['free', 'pro', 'enterprise'] as const;

export function KeyboardManager() {
  const { undo, redo, canUndo, canRedo } = useHistoryStore();
  const { setChannelAllocation, channels, subscriptionTier, setSubscriptionTier } = useMediaPlanStore();
  const { toast } = useToast();
  const lastHotkeyAtRef = useRef(0);

  const isDebouncedHotkey = () => {
    const now = Date.now();
    if (now - lastHotkeyAtRef.current < HOTKEY_DEBOUNCE_MS) {
      return true;
    }
    lastHotkeyAtRef.current = now;
    return false;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Global Shortcuts (Ctrl/Cmd based)
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();

        if (key === 's') {
          e.preventDefault();
          toast({
            title: 'Project Saved',
            description: 'Your changes have been saved locally.',
          });
          return;
        }

        if (key === 'z') {
          e.preventDefault();
          if (isDebouncedHotkey()) return;

          if (e.shiftKey) {
            if (canRedo) {
              redo();
              toast({ description: 'Redo', duration: 900 });
            }
          } else {
            if (canUndo) {
              undo();
              toast({ description: 'Undo', duration: 900 });
            }
          }
          return;
        }

        if (key === 'y') {
          e.preventDefault();
          if (isDebouncedHotkey()) return;

          if (canRedo) {
            redo();
            toast({ description: 'Redo', duration: 900 });
          }
          return;
        }

        // QA God Mode: Ctrl+Shift+T — cycles subscription tier (DEV only)
        if (import.meta.env.DEV && e.shiftKey && key === 't') {
          e.preventDefault();
          if (isDebouncedHotkey()) return;

          const currentIndex = TIERS.indexOf(subscriptionTier as typeof TIERS[number]);
          const nextTier = TIERS[(currentIndex + 1) % TIERS.length];
          setSubscriptionTier(nextTier);
          toast({
            title: `QA Mode — Tier: ${nextTier.toUpperCase()}`,
            description: 'Press Ctrl+Shift+T to cycle. DEV only.',
            duration: 2000,
          });
          return;
        }
      }

      // 2. Slider Shortcuts (Arrow Keys)
      const activeElement = document.activeElement as HTMLElement;
      if (!activeElement || activeElement.getAttribute('role') !== 'slider') return;

      const sliderRoot = activeElement.closest('[data-channel-id]');
      if (!sliderRoot) return;

      const channelId = sliderRoot.getAttribute('data-channel-id');
      if (!channelId) return;

      const channel = channels.find((c) => c.id === channelId);
      if (!channel) return;

      let delta = 0;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        if (e.shiftKey) delta = 1.0;
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        if (e.shiftKey) delta = -1.0;
      }

      if (delta !== 0) {
        e.preventDefault();
        e.stopPropagation();

        const current = channel.allocationPct;
        const next = Math.max(0, Math.min(100, current + delta));

        if (next !== current) {
          setChannelAllocation(channelId, next);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [undo, redo, canUndo, canRedo, setChannelAllocation, channels, subscriptionTier, setSubscriptionTier, toast]);

  return null;
}

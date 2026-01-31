// SHIM: This file exists to map the user's requested 'useProjectStore' 
// to the actual 'useMediaPlanStore' implementation.
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';

// Re-export the store hook as useProjectStore
export const useProjectStore = useMediaPlanStore;

// Re-export types if needed, though usually they are imported separately.
export type { ChannelData, ChannelWithMetrics } from '@/hooks/use-media-plan-store';

import { create } from 'zustand';
import { useEffect, useRef } from 'react';
import { useMediaPlanStore } from './use-media-plan-store';
import { useMultiMonthStore } from './use-multi-month-store';

const HISTORY_LIMIT = 120;
const RECORD_DEBOUNCE_MS = 220;

interface MediaPlanSnapshot {
  totalBudget: number;
  channels: ReturnType<typeof useMediaPlanStore.getState>['channels'];
  globalMultipliers: ReturnType<typeof useMediaPlanStore.getState>['globalMultipliers'];
  presets: ReturnType<typeof useMediaPlanStore.getState>['presets'];
  projectName: ReturnType<typeof useMediaPlanStore.getState>['projectName'];
}

interface MultiMonthSnapshot {
  includeSoftLaunch: ReturnType<typeof useMultiMonthStore.getState>['includeSoftLaunch'];
  planningMonths: ReturnType<typeof useMultiMonthStore.getState>['planningMonths'];
  startMonth: ReturnType<typeof useMultiMonthStore.getState>['startMonth'];
  progressionPattern: ReturnType<typeof useMultiMonthStore.getState>['progressionPattern'];
  patternParams: ReturnType<typeof useMultiMonthStore.getState>['patternParams'];
  globalSettings: ReturnType<typeof useMultiMonthStore.getState>['globalSettings'];
  months: ReturnType<typeof useMultiMonthStore.getState>['months'];
  scenarios: ReturnType<typeof useMultiMonthStore.getState>['scenarios'];
  activeScenarioId: ReturnType<typeof useMultiMonthStore.getState>['activeScenarioId'];
  comparisonScenarioId: ReturnType<typeof useMultiMonthStore.getState>['comparisonScenarioId'];
  optimizationGoal: ReturnType<typeof useMultiMonthStore.getState>['optimizationGoal'];
  riskLevel: ReturnType<typeof useMultiMonthStore.getState>['riskLevel'];
  constraints: ReturnType<typeof useMultiMonthStore.getState>['constraints'];
  optimizationResults: ReturnType<typeof useMultiMonthStore.getState>['optimizationResults'];
  pdfSections: ReturnType<typeof useMultiMonthStore.getState>['pdfSections'];
  userNotes: ReturnType<typeof useMultiMonthStore.getState>['userNotes'];
}

export interface VersionedBudgetState {
  mediaPlan: MediaPlanSnapshot;
  multiMonth: MultiMonthSnapshot;
}

interface HistoryState {
  past: VersionedBudgetState[];
  present: VersionedBudgetState | null;
  future: VersionedBudgetState[];
  canUndo: boolean;
  canRedo: boolean;
  isApplyingHistory: boolean;

  initialize: (snapshot: VersionedBudgetState) => void;
  record: (snapshot: VersionedBudgetState) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
}

function cloneSnapshot<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function createSnapshot(): VersionedBudgetState {
  const mediaState = useMediaPlanStore.getState();
  const multiMonthState = useMultiMonthStore.getState();

  return cloneSnapshot({
    mediaPlan: {
      totalBudget: mediaState.totalBudget,
      channels: mediaState.channels,
      globalMultipliers: mediaState.globalMultipliers,
      presets: mediaState.presets,
      projectName: mediaState.projectName,
    },
    multiMonth: {
      includeSoftLaunch: multiMonthState.includeSoftLaunch,
      planningMonths: multiMonthState.planningMonths,
      startMonth: multiMonthState.startMonth,
      progressionPattern: multiMonthState.progressionPattern,
      patternParams: multiMonthState.patternParams,
      globalSettings: multiMonthState.globalSettings,
      months: multiMonthState.months,
      scenarios: multiMonthState.scenarios,
      activeScenarioId: multiMonthState.activeScenarioId,
      comparisonScenarioId: multiMonthState.comparisonScenarioId,
      optimizationGoal: multiMonthState.optimizationGoal,
      riskLevel: multiMonthState.riskLevel,
      constraints: multiMonthState.constraints,
      optimizationResults: multiMonthState.optimizationResults,
      pdfSections: multiMonthState.pdfSections,
      userNotes: multiMonthState.userNotes,
    },
  });
}

function snapshotHash(snapshot: VersionedBudgetState): string {
  return JSON.stringify(snapshot);
}

function applySnapshot(snapshot: VersionedBudgetState) {
  const mediaState = useMediaPlanStore.getState();
  const multiMonthState = useMultiMonthStore.getState();

  mediaState.restoreState({
    totalBudget: snapshot.mediaPlan.totalBudget,
    channels: cloneSnapshot(snapshot.mediaPlan.channels),
    globalMultipliers: cloneSnapshot(snapshot.mediaPlan.globalMultipliers),
    presets: cloneSnapshot(snapshot.mediaPlan.presets),
    projectName: snapshot.mediaPlan.projectName,
  });

  useMultiMonthStore.setState({
    includeSoftLaunch: snapshot.multiMonth.includeSoftLaunch,
    planningMonths: snapshot.multiMonth.planningMonths,
    startMonth: snapshot.multiMonth.startMonth,
    progressionPattern: snapshot.multiMonth.progressionPattern,
    patternParams: cloneSnapshot(snapshot.multiMonth.patternParams),
    globalSettings: cloneSnapshot(snapshot.multiMonth.globalSettings),
    months: cloneSnapshot(snapshot.multiMonth.months),
    scenarios: cloneSnapshot(snapshot.multiMonth.scenarios),
    activeScenarioId: snapshot.multiMonth.activeScenarioId,
    comparisonScenarioId: snapshot.multiMonth.comparisonScenarioId,
    optimizationGoal: snapshot.multiMonth.optimizationGoal,
    riskLevel: snapshot.multiMonth.riskLevel,
    constraints: cloneSnapshot(snapshot.multiMonth.constraints),
    optimizationResults: cloneSnapshot(snapshot.multiMonth.optimizationResults),
    pdfSections: cloneSnapshot(snapshot.multiMonth.pdfSections),
    userNotes: snapshot.multiMonth.userNotes,
    isOptimizing: multiMonthState.isOptimizing,
  });
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  present: null,
  future: [],
  canUndo: false,
  canRedo: false,
  isApplyingHistory: false,

  initialize: (snapshot) => {
    set((state) => {
      if (state.present) return state;
      return {
        ...state,
        present: cloneSnapshot(snapshot),
        canUndo: state.past.length > 0,
        canRedo: state.future.length > 0,
      };
    });
  },

  record: (snapshot) => {
    const state = get();
    if (state.isApplyingHistory) return;

    const snapshotToStore = cloneSnapshot(snapshot);
    if (state.present && snapshotHash(state.present) === snapshotHash(snapshotToStore)) {
      return;
    }

    if (!state.present) {
      set({
        present: snapshotToStore,
        past: [],
        future: [],
        canUndo: false,
        canRedo: false,
      });
      return;
    }

    const nextPast = [...state.past, cloneSnapshot(state.present)].slice(-HISTORY_LIMIT);
    set({
      past: nextPast,
      present: snapshotToStore,
      future: [],
      canUndo: nextPast.length > 0,
      canRedo: false,
    });
  },

  undo: () => {
    const state = get();
    if (!state.present || state.past.length === 0) return;

    const previous = state.past[state.past.length - 1];
    const nextPast = state.past.slice(0, -1);
    const nextFuture = [cloneSnapshot(state.present), ...state.future];

    set({
      past: nextPast,
      present: cloneSnapshot(previous),
      future: nextFuture,
      canUndo: nextPast.length > 0,
      canRedo: true,
      isApplyingHistory: true,
    });

    applySnapshot(previous);
    set({ isApplyingHistory: false });
  },

  redo: () => {
    const state = get();
    if (!state.present || state.future.length === 0) return;

    const next = state.future[0];
    const nextFuture = state.future.slice(1);
    const nextPast = [...state.past, cloneSnapshot(state.present)].slice(-HISTORY_LIMIT);

    set({
      past: nextPast,
      present: cloneSnapshot(next),
      future: nextFuture,
      canUndo: nextPast.length > 0,
      canRedo: nextFuture.length > 0,
      isApplyingHistory: true,
    });

    applySnapshot(next);
    set({ isApplyingHistory: false });
  },

  clear: () => {
    set({
      past: [],
      present: null,
      future: [],
      canUndo: false,
      canRedo: false,
      isApplyingHistory: false,
    });
  },
}));

export function useHistoryRecorder() {
  const initialize = useHistoryStore((state) => state.initialize);
  const record = useHistoryStore((state) => state.record);
  const isApplyingHistory = useHistoryStore((state) => state.isApplyingHistory);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const initialSnapshot = createSnapshot();
    initialize(initialSnapshot);

    const handleStoreChange = () => {
      if (useHistoryStore.getState().isApplyingHistory || isApplyingHistory) return;

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        record(createSnapshot());
        debounceRef.current = null;
      }, RECORD_DEBOUNCE_MS);
    };

    const unsubMedia = useMediaPlanStore.subscribe(handleStoreChange);
    const unsubMulti = useMultiMonthStore.subscribe(handleStoreChange);

    return () => {
      unsubMedia();
      unsubMulti();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [initialize, isApplyingHistory, record]);
}

export function useHistory() {
  return useHistoryStore();
}

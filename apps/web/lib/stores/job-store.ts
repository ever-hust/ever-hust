import { create } from "zustand";
import { persist } from "zustand/middleware";

// ---------------------------------------------------------------------------
// Hidden Jobs Store — persists which jobs a user has hidden
// ---------------------------------------------------------------------------

interface HiddenJobsState {
  hiddenJobIds: Set<number>;
  hideJob: (jobId: number) => void;
  unhideJob: (jobId: number) => void;
  isHidden: (jobId: number) => boolean;
  clearHidden: () => void;
}

export const useHiddenJobsStore = create<HiddenJobsState>()(
  persist(
    (set, get) => ({
      hiddenJobIds: new Set<number>(),
      hideJob: (jobId: number) =>
        set((state) => ({
          hiddenJobIds: new Set([...state.hiddenJobIds, jobId]),
        })),
      unhideJob: (jobId: number) =>
        set((state) => {
          const next = new Set(state.hiddenJobIds);
          next.delete(jobId);
          return { hiddenJobIds: next };
        }),
      isHidden: (jobId: number) => get().hiddenJobIds.has(jobId),
      clearHidden: () => set({ hiddenJobIds: new Set() }),
    }),
    {
      name: "hust-hidden-jobs",
      // Custom serialization for Set<number>
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const parsed = JSON.parse(str);
          return {
            ...parsed,
            state: {
              ...parsed.state,
              hiddenJobIds: new Set(parsed.state.hiddenJobIds || []),
            },
          };
        },
        setItem: (name, value) => {
          const serialized = {
            ...value,
            state: {
              ...value.state,
              hiddenJobIds: [...value.state.hiddenJobIds],
            },
          };
          localStorage.setItem(name, JSON.stringify(serialized));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);

// ---------------------------------------------------------------------------
// Map Visibility Store
// ---------------------------------------------------------------------------

interface MapVisibilityState {
  showMap: boolean;
  toggleMap: () => void;
  setShowMap: (show: boolean) => void;
}

export const useMapVisibilityStore = create<MapVisibilityState>()(
  persist(
    (set) => ({
      showMap: false,
      toggleMap: () => set((state) => ({ showMap: !state.showMap })),
      setShowMap: (show: boolean) => set({ showMap: show }),
    }),
    { name: "hust-map-visibility" }
  )
);

// ---------------------------------------------------------------------------
// Compare Jobs Store 
// ---------------------------------------------------------------------------

interface CompareJobsState {
  compareMode: boolean;
  selectedJobIds: Set<number>;
  setCompareMode: (on: boolean) => void;
  toggleJobSelection: (jobId: number) => void;
  clearSelection: () => void;
}

export const useCompareJobsStore = create<CompareJobsState>()((set) => ({
  compareMode: false,
  selectedJobIds: new Set<number>(),
  setCompareMode: (on) => set({ compareMode: on, selectedJobIds: new Set() }),
  toggleJobSelection: (jobId) =>
    set((state) => {
      const next = new Set(state.selectedJobIds);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return { selectedJobIds: next };
    }),
  clearSelection: () => set({ selectedJobIds: new Set() }),
}));

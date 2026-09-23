import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { RawTransaction } from '../types';
import type { CategoryRule } from '../lib/categorise';
import { defaultRules } from '../lib/defaultRules';
import { DEFAULT_FILTERS, type Filters } from '../lib/filters';
import { pushSteps, type DrillStep } from '../lib/drill';
import { DEFAULT_PIVOT, type PivotConfig } from '../lib/pivot';
import type { ParseReport } from '../lib/parse';

export type Tab = 'dashboard' | 'transactions' | 'pivot' | 'waterfall' | 'flow' | 'data';
export type Theme = 'system' | 'light' | 'dark';

export interface SavedPivot {
  id: string;
  name: string;
  config: PivotConfig;
}

/** The Google Sheet to refresh from. Only the IDs are stored; never the access token. */
export interface SheetSource {
  spreadsheetId: string;
  tab: string;
  title: string;
}

/** Transactions shown in the "peek" dialog (right-click / long-press / pivot cell). */
export interface Peek {
  title: string;
  ids: string[];
}

export interface AppState {
  // ---- data (persisted) ----
  transactions: RawTransaction[];
  report: ParseReport | null;
  rules: CategoryRule[];
  rulesOverride: boolean;
  sheetSource: SheetSource | null;

  // ---- view state ----
  filters: Filters;
  /** Drill path shared by every chart, the summary, the table and the pivot. Mirrored to the URL. */
  drill: DrillStep[];
  pivot: PivotConfig;
  savedPivots: SavedPivot[];
  theme: Theme;
  tab: Tab;
  peek: Peek | null;
  storageError: string | null;

  // ---- actions ----
  loadData: (transactions: RawTransaction[], report: ParseReport) => void;
  clearData: () => void;
  resetEverything: () => void;
  setSheetSource: (s: SheetSource | null) => void;

  addRule: (rule?: Partial<CategoryRule>) => void;
  updateRule: (id: string, patch: Partial<CategoryRule>) => void;
  moveRule: (id: string, delta: number) => void;
  removeRule: (id: string) => void;
  resetRules: () => void;
  setRulesOverride: (v: boolean) => void;

  setFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;

  drillInto: (steps: DrillStep[]) => void;
  /** Keep the first `depth` steps (0 = All). */
  drillToDepth: (depth: number) => void;
  drillBack: () => void;
  setDrill: (path: DrillStep[]) => void;

  setPivot: (patch: Partial<PivotConfig>) => void;
  savePivot: (name: string) => void;
  loadPivot: (id: string) => void;
  deletePivot: (id: string) => void;

  setTheme: (t: Theme) => void;
  setTab: (t: Tab) => void;
  openPeek: (title: string, ids: string[]) => void;
  closePeek: () => void;
}

const STORAGE_KEY = 'cashflow-lens';

// localStorage can throw (private mode, quota, blocked site data). Never let that crash the app.
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
      if (useAppStore.getState().storageError) useAppStore.setState({ storageError: null });
    } catch (e) {
      useAppStore.setState({
        storageError: `Couldn't save to browser storage (${(e as Error).name}). Your data is loaded but won't survive a refresh.`,
      });
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

const uid = () => Math.random().toString(36).slice(2, 10);

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      transactions: [],
      report: null,
      rules: defaultRules(),
      rulesOverride: false,
      sheetSource: null,
      filters: DEFAULT_FILTERS,
      drill: [],
      pivot: DEFAULT_PIVOT,
      savedPivots: [],
      theme: 'system',
      tab: 'dashboard',
      peek: null,
      storageError: null,

      loadData: (transactions, report) =>
        set({ transactions, report, drill: [], filters: { ...DEFAULT_FILTERS, includeFuture: get().filters.includeFuture } }),
      clearData: () => set({ transactions: [], report: null, drill: [], filters: DEFAULT_FILTERS, peek: null }),
      resetEverything: () => {
        safeStorage.removeItem(STORAGE_KEY);
        set({
          transactions: [],
          report: null,
          rules: defaultRules(),
          rulesOverride: false,
          sheetSource: null,
          filters: DEFAULT_FILTERS,
          drill: [],
          pivot: DEFAULT_PIVOT,
          savedPivots: [],
          peek: null,
          tab: 'dashboard',
        });
      },
      setSheetSource: (sheetSource) => set({ sheetSource }),

      addRule: (rule) =>
        set((s) => ({
          rules: [...s.rules, { id: uid(), pattern: '', match: 'contains', category: '', enabled: true, ...rule }],
        })),
      updateRule: (id, patch) => set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
      moveRule: (id, delta) =>
        set((s) => {
          const i = s.rules.findIndex((r) => r.id === id);
          const j = i + delta;
          if (i < 0 || j < 0 || j >= s.rules.length) return s;
          const rules = [...s.rules];
          [rules[i], rules[j]] = [rules[j], rules[i]];
          return { rules };
        }),
      removeRule: (id) => set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),
      resetRules: () => set({ rules: defaultRules(), rulesOverride: false }),
      setRulesOverride: (rulesOverride) => set({ rulesOverride }),

      setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
      resetFilters: () => set((s) => ({ filters: { ...DEFAULT_FILTERS, includeFuture: s.filters.includeFuture } })),

      drillInto: (steps) => set((s) => ({ drill: pushSteps(s.drill, steps) })),
      drillToDepth: (depth) => set((s) => ({ drill: s.drill.slice(0, Math.max(0, depth)) })),
      drillBack: () => set((s) => ({ drill: s.drill.slice(0, -1) })),
      setDrill: (drill) => set({ drill }),

      setPivot: (patch) => set((s) => ({ pivot: { ...s.pivot, ...patch } })),
      savePivot: (name) =>
        set((s) => {
          const existing = s.savedPivots.find((p) => p.name === name);
          const entry = { id: existing?.id ?? uid(), name, config: s.pivot };
          return {
            savedPivots: existing ? s.savedPivots.map((p) => (p.id === entry.id ? entry : p)) : [...s.savedPivots, entry],
          };
        }),
      loadPivot: (id) =>
        set((s) => {
          const p = s.savedPivots.find((x) => x.id === id);
          return p ? { pivot: { ...DEFAULT_PIVOT, ...p.config } } : s;
        }),
      deletePivot: (id) => set((s) => ({ savedPivots: s.savedPivots.filter((p) => p.id !== id) })),

      setTheme: (theme) => set({ theme }),
      setTab: (tab) => set({ tab }),
      openPeek: (title, ids) => set({ peek: { title, ids } }),
      closePeek: () => set({ peek: null }),
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => safeStorage),
      // v1 used [] to mean "no restriction"; v2 uses null (and [] means "none selected").
      migrate: (persisted, version) => {
        const s = persisted as Partial<AppState>;
        if (version < 2) {
          if (s.filters) s.filters = { ...DEFAULT_FILTERS, includeFuture: s.filters.includeFuture };
          const fixPivot = (p: PivotConfig): PivotConfig => ({
            ...p,
            filters: Object.fromEntries(Object.entries(p.filters ?? {}).map(([k, v]) => [k, v && v.length ? v : null])),
          });
          if (s.pivot) s.pivot = fixPivot(s.pivot);
          if (s.savedPivots) s.savedPivots = s.savedPivots.map((sp) => ({ ...sp, config: fixPivot(sp.config) }));
        }
        return s as AppState;
      },
      // Only data and preferences persist; drill and tab live in the URL.
      partialize: (s) => ({
        transactions: s.transactions,
        report: s.report,
        rules: s.rules,
        rulesOverride: s.rulesOverride,
        sheetSource: s.sheetSource,
        pivot: s.pivot,
        savedPivots: s.savedPivots,
        theme: s.theme,
        filters: { ...DEFAULT_FILTERS, includeFuture: s.filters.includeFuture },
      }),
    },
  ),
);

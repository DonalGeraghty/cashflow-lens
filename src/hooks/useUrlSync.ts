import { useEffect, useRef } from 'react';
import { decodeDrill, encodeDrill } from '../lib/drill';
import { useAppStore, type Tab } from '../store/useAppStore';

const TABS: Tab[] = ['dashboard', 'transactions', 'pivot', 'data'];

function readUrl() {
  const p = new URLSearchParams(window.location.search);
  const tab = p.get('tab') as Tab | null;
  return { drill: decodeDrill(p.get('drill')), tab: tab && TABS.includes(tab) ? tab : 'dashboard' };
}

function buildSearch(drill: ReturnType<typeof decodeDrill>, tab: Tab): string {
  const p = new URLSearchParams();
  if (tab !== 'dashboard') p.set('tab', tab);
  if (drill.length) p.set('drill', encodeDrill(drill));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Call once before the first render so a refresh restores the drill path and tab. */
export function hydrateFromUrl() {
  useAppStore.setState(readUrl());
}

/**
 * Keeps ?drill=…&tab=… in sync with the store. Each change pushes a history
 * entry, so the browser Back button walks back up the drill path too.
 */
export function useUrlSync() {
  const drill = useAppStore((s) => s.drill);
  const tab = useAppStore((s) => s.tab);
  const applyingPop = useRef(false);

  useEffect(() => {
    const onPop = () => {
      applyingPop.current = true;
      useAppStore.setState(readUrl());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const search = buildSearch(drill, tab);
    if (applyingPop.current) {
      applyingPop.current = false;
      return;
    }
    if (search === window.location.search) return;
    window.history.pushState(null, '', `${window.location.pathname}${search}${window.location.hash}`);
  }, [drill, tab]);
}

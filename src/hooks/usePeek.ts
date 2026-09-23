import { useCallback } from 'react';
import type { Transaction } from '../types';
import { useAppStore } from '../store/useAppStore';

/** Open the transactions dialog for a set of rows without changing the drill path. */
export function usePeek() {
  const openPeek = useAppStore((s) => s.openPeek);
  return useCallback((title: string, rows: Transaction[]) => openPeek(title, rows.map((r) => r.id)), [openPeek]);
}

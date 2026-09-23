import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

/** Stamps data-theme on <html> for an explicit choice; "system" defers to prefers-color-scheme. */
export function useTheme() {
  const theme = useAppStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);
}

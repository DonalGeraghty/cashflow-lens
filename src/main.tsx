import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { hydrateFromUrl } from './hooks/useUrlSync';
import './styles.css';

// Restore the drill path and tab from the URL before the first render.
hydrateFromUrl();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

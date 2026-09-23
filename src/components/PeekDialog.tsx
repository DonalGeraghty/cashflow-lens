import { useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useData } from '../store/DataContext';
import { TransactionTable } from './TransactionTable';

/** Modal listing the raw transactions behind a chart element or pivot cell. */
export function PeekDialog() {
  const peek = useAppStore((s) => s.peek);
  const close = useAppStore((s) => s.closePeek);
  const { byId, currency } = useData();
  const ref = useRef<HTMLDialogElement>(null);

  const rows = useMemo(() => (peek ? peek.ids.map((id) => byId.get(id)).filter((t) => t !== undefined) : []), [peek, byId]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (peek && !d.open) d.showModal();
    if (!peek && d.open) d.close();
  }, [peek]);

  return (
    <dialog
      ref={ref}
      className="peek"
      onClose={close}
      onClick={(e) => {
        // Clicking the backdrop (the dialog element itself) closes it.
        if (e.target === ref.current) close();
      }}
      aria-labelledby="peek-title"
    >
      {peek && (
        <div className="peek-body">
          <header>
            <h2 id="peek-title">{peek.title}</h2>
            <button type="button" className="icon" onClick={close} aria-label="Close">
              ✕
            </button>
          </header>
          <TransactionTable key={peek.title + peek.ids.length} rows={rows} currency={currency} pageSize={50} autoFocus />
        </div>
      )}
    </dialog>
  );
}

import { useAppStore } from '../store/useAppStore';
import { stepLabel } from '../lib/drill';

const DIM_LABEL: Record<string, string> = {
  year: 'Year',
  month: 'Month',
  category: 'Category',
  merchant: 'Merchant',
  account: 'Account',
  bucket: 'Bucket',
};

/** All > 2026 > August > Groceries. Every crumb jumps back to that level. */
export function Breadcrumbs() {
  const drill = useAppStore((s) => s.drill);
  const drillToDepth = useAppStore((s) => s.drillToDepth);
  const drillBack = useAppStore((s) => s.drillBack);

  return (
    <nav className="breadcrumbs" aria-label="Drill-down path">
      <button type="button" className="back" onClick={drillBack} disabled={!drill.length} aria-label="Back one level" title="Back one level">
        ←
      </button>
      <ol>
        <li>
          {drill.length ? (
            <button type="button" className="crumb" onClick={() => drillToDepth(0)}>
              All
            </button>
          ) : (
            <span className="crumb current" aria-current="page">
              All
            </span>
          )}
        </li>
        {drill.map((step, i) => {
          const label = stepLabel(step, drill);
          const last = i === drill.length - 1;
          return (
            <li key={`${step.dim}:${step.value}`}>
              <span className="sep" aria-hidden="true">
                ›
              </span>
              {last ? (
                <span className="crumb current" aria-current="page" title={DIM_LABEL[step.dim]}>
                  {label}
                </span>
              ) : (
                <button type="button" className="crumb" onClick={() => drillToDepth(i + 1)} title={DIM_LABEL[step.dim]}>
                  {label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {!drill.length && <span className="hint">Click any chart element to drill in. Right-click or long-press to see its transactions.</span>}
    </nav>
  );
}

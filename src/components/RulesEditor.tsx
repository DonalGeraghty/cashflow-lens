import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useData } from '../store/DataContext';
import { compileRule, ruleError, UNCATEGORISED, type MatchType } from '../lib/categorise';
import { Panel } from './Panel';

const MATCH_TYPES: { id: MatchType; label: string }[] = [
  { id: 'contains', label: 'contains' },
  { id: 'startsWith', label: 'starts with' },
  { id: 'exact', label: 'is exactly' },
  { id: 'regex', label: 'matches regex' },
];

/** Edit keyword rules. Changes re-categorise every view immediately and are saved in localStorage. */
export function RulesEditor() {
  const rules = useAppStore((s) => s.rules);
  const override = useAppStore((s) => s.rulesOverride);
  const { addRule, updateRule, moveRule, removeRule, resetRules, setRulesOverride } = useAppStore.getState();
  const { all, options } = useData();

  const descriptions = useMemo(() => all.map((t) => t.description), [all]);
  const counts = useMemo(
    () =>
      new Map(
        rules.map((r) => {
          const test = compileRule(r);
          return [r.id, test ? descriptions.filter(test).length : 0];
        }),
      ),
    [rules, descriptions],
  );
  const byRule = all.filter((t) => t.categorySource === 'rule').length;
  const uncategorised = all.filter((t) => t.category === UNCATEGORISED);
  const topUncategorised = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of uncategorised) m.set(t.merchant, (m.get(t.merchant) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [uncategorised]);

  return (
    <Panel
      title="Categorisation rules"
      subtitle={`First matching rule wins. ${byRule} rows categorised by rules · ${uncategorised.length} uncategorised.`}
      controls={
        <>
          <button type="button" onClick={() => addRule()}>
            + Add rule
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm('Replace your rules with the defaults?')) resetRules();
            }}
          >
            Restore defaults
          </button>
        </>
      }
    >
      <label className="toggle">
        <input type="checkbox" checked={override} onChange={(e) => setRulesOverride(e.target.checked)} />
        Rules override categories from the CSV (off: rules only fill in blanks)
      </label>

      {topUncategorised.length > 0 && (
        <div className="uncat">
          <span className="muted">Uncategorised:</span>
          {topUncategorised.map(([merchant, n]) => (
            <button key={merchant} type="button" className="chip" onClick={() => addRule({ pattern: merchant.toLowerCase(), category: '' })} title="Create a rule for this">
              {merchant} <span className="muted">×{n}</span> +
            </button>
          ))}
        </div>
      )}

      <datalist id="category-options">
        {options.categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <div className="table-scroll">
        <table className="rules">
          <thead>
            <tr>
              <th>On</th>
              <th>If description…</th>
              <th>Pattern</th>
              <th>Category</th>
              <th className="num">Matches</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rules.map((r, i) => {
              const err = ruleError(r);
              return (
                <tr key={r.id} className={r.enabled ? '' : 'disabled'}>
                  <td>
                    <input type="checkbox" checked={r.enabled} onChange={(e) => updateRule(r.id, { enabled: e.target.checked })} aria-label="Enabled" />
                  </td>
                  <td>
                    <select value={r.match} onChange={(e) => updateRule(r.id, { match: e.target.value as MatchType })} aria-label="Match type">
                      {MATCH_TYPES.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className={`pattern${err && r.pattern ? ' invalid' : ''}`}
                      value={r.pattern}
                      onChange={(e) => updateRule(r.id, { pattern: e.target.value })}
                      aria-label="Pattern"
                      aria-invalid={Boolean(err)}
                      placeholder="e.g. tesco"
                      spellCheck={false}
                    />
                    {err && <div className="field-error">{err}</div>}
                  </td>
                  <td>
                    <input list="category-options" value={r.category} onChange={(e) => updateRule(r.id, { category: e.target.value })} aria-label="Category" placeholder="Category" />
                  </td>
                  <td className="num">{counts.get(r.id) ?? 0}</td>
                  <td className="nowrap">
                    <button type="button" className="icon" onClick={() => moveRule(r.id, -1)} disabled={i === 0} aria-label="Move up">
                      ↑
                    </button>
                    <button type="button" className="icon" onClick={() => moveRule(r.id, 1)} disabled={i === rules.length - 1} aria-label="Move down">
                      ↓
                    </button>
                    <button type="button" className="icon" onClick={() => removeRule(r.id)} aria-label="Delete rule">
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

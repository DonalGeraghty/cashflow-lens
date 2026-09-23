import { useAppStore } from '../store/useAppStore';
import { Panel } from './Panel';

/** Import report (what was kept, what was skipped and why) plus the reset controls. */
export function DataPanel() {
  const report = useAppStore((s) => s.report);
  const count = useAppStore((s) => s.transactions.length);
  const storageError = useAppStore((s) => s.storageError);
  const { clearData, resetEverything } = useAppStore.getState();

  return (
    <Panel
      title="Loaded data"
      subtitle="Everything stays in this browser. Nothing is uploaded anywhere."
      controls={
        <>
          <button
            type="button"
            disabled={!count}
            onClick={() => {
              if (confirm('Forget the loaded transactions? Your rules and saved pivot layouts are kept.')) clearData();
            }}
          >
            Clear data
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (confirm('Reset everything? This removes the loaded data, your rules and saved pivot layouts from this browser.')) resetEverything();
            }}
          >
            Reset everything
          </button>
        </>
      }
    >
      {storageError && <p className="banner warn">{storageError}</p>}
      {!report ? (
        <p className="muted">No file loaded.</p>
      ) : (
        <div className="report">
          <dl className="report-stats">
            <div>
              <dt>File</dt>
              <dd>{report.fileName}</dd>
            </div>
            <div>
              <dt>Loaded</dt>
              <dd>{new Date(report.loadedAt).toLocaleString('en-IE')}</dd>
            </div>
            <div>
              <dt>Rows in file</dt>
              <dd>{report.totalRows.toLocaleString('en-IE')}</dd>
            </div>
            <div>
              <dt>Imported</dt>
              <dd>{report.kept.toLocaleString('en-IE')}</dd>
            </div>
            <div>
              <dt>Skipped</dt>
              <dd>{report.skipped.length.toLocaleString('en-IE')}</dd>
            </div>
            <div>
              <dt>Currencies</dt>
              <dd>{report.currencies.join(', ') || '–'}</dd>
            </div>
          </dl>

          {report.warnings.map((w) => (
            <p key={w} className="banner warn">
              {w}
            </p>
          ))}

          {report.skipped.length > 0 && (
            <>
              <h3>Why rows were skipped</h3>
              <ul className="reasons">
                {Object.entries(report.reasons).map(([reason, n]) => (
                  <li key={reason}>
                    <strong>{n}</strong> {reason}
                  </li>
                ))}
              </ul>
              <details>
                <summary>Show skipped rows</summary>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th className="num">Line</th>
                        <th>Reason</th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.skipped.slice(0, 500).map((s) => (
                        <tr key={s.line}>
                          <td className="num">{s.line}</td>
                          <td>{s.reason}</td>
                          <td className="mono">{s.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}

          <h3>Column mapping</h3>
          <ul className="mapping">
            {Object.entries(report.columns).map(([role, header]) => (
              <li key={role}>
                <span className="muted">{role}</span> ← {header ?? <em className="muted">not found</em>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

import { Link } from 'react-router-dom';
import { formatCurrency, formatDate } from '../utils/format';
import './DuplicateEobPanel.css';

function duplicateLabel(group) {
  if (group.match_type === 'eob_reference') {
    return `EOB reference ${group.match_key}`;
  }
  const first = group.eobs?.[0];
  if (!first) return 'Matching statement';
  return `${first.member_name || 'Unknown member'} · ${formatDate(first.statement_date)}`;
}

export default function DuplicateEobPanel({ groups, onDelete, deletingId }) {
  if (!groups?.length) return null;

  const handleKeepNewest = (group) => {
    const sorted = [...group.eobs].sort((a, b) => b.id - a.id);
    const toDelete = sorted.slice(1).map((eob) => eob.id);
    if (toDelete.length === 0) return;
    if (!window.confirm(`Delete ${toDelete.length} older duplicate(s) and keep the newest?`)) return;
    onDelete(toDelete);
  };

  return (
    <section className="dashboard-section duplicate-panel">
      <h2>Duplicate EOBs</h2>
      <p className="section-hint">
        These statements appear more than once. Remove extras to keep claim tracking accurate.
      </p>

      {groups.map((group) => (
        <div key={`${group.match_type}-${group.match_key}`} className="duplicate-group">
          <div className="duplicate-group-header">
            <div>
              <strong>{duplicateLabel(group)}</strong>
              <span className="duplicate-count">{group.eobs.length} copies</span>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleKeepNewest(group)}
              disabled={Boolean(deletingId)}
            >
              Keep newest, delete others
            </button>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Statement date</th>
                  <th>Member</th>
                  <th>Service period</th>
                  <th>Total owed</th>
                  <th>Reference</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {group.eobs.map((eob) => (
                  <tr key={eob.id}>
                    <td>
                      <Link to={`/eobs/${eob.id}`} className="table-link">
                        {formatDate(eob.statement_date)}
                      </Link>
                    </td>
                    <td>{eob.member_name || '—'}</td>
                    <td>
                      {formatDate(eob.service_period_start)}
                      {eob.service_period_end ? ` – ${formatDate(eob.service_period_end)}` : ''}
                    </td>
                    <td className="amount">{formatCurrency(eob.total_amount_owed)}</td>
                    <td className="mono">{eob.eob_reference || '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-danger btn-small"
                        onClick={() => {
                          if (!window.confirm('Delete this duplicate EOB?')) return;
                          onDelete([eob.id]);
                        }}
                        disabled={deletingId === eob.id}
                      >
                        {deletingId === eob.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}

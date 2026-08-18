import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getEobs } from '../api/api';
import { formatCurrency, formatDate, formatDateSpan } from '../utils/format';
import './EobListPage.css';

export default function EobListPage() {
  const [eobs, setEobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadEobs();
  }, []);

  const loadEobs = async () => {
    try {
      setLoading(true);
      const response = await getEobs();
      setEobs(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load EOB statements');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="page-message">Loading EOB statements...</div>;
  if (error) return <div className="page-message error">{error}</div>;

  return (
    <div className="eob-list-page page-scroll">
      <header className="page-header row-header">
        <div>
          <h1>EOB Statements</h1>
          <p>All imported and manually entered explanation of benefits documents.</p>
        </div>
        <Link to="/eobs/new" className="btn-primary">
          Add EOB
        </Link>
      </header>

      {eobs.length === 0 ? (
        <p className="empty-message">No EOB statements yet. <Link to="/eobs/new">Add one</Link>.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Statement date</th>
                <th>Service period</th>
                <th>Member</th>
                <th>Claims</th>
                <th>Total owed</th>
                <th>Billed date</th>
                <th>Paid date</th>
              </tr>
            </thead>
            <tbody>
              {eobs.map((eob) => (
                <tr key={eob.id}>
                  <td>
                    <Link to={`/eobs/${eob.id}`} className="table-link">
                      {formatDate(eob.statement_date)}
                    </Link>
                  </td>
                  <td>
                    {formatDate(eob.service_period_start)}
                    {eob.service_period_end ? ` – ${formatDate(eob.service_period_end)}` : ''}
                  </td>
                  <td>{eob.member_name || '—'}</td>
                  <td>{eob.claim_count}</td>
                  <td className="amount">{formatCurrency(eob.total_owed)}</td>
                  <td>{formatDateSpan(eob.billed_date, eob.billed_date_end)}</td>
                  <td>{formatDateSpan(eob.paid_date, eob.paid_date_end)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

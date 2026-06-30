import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getClaim, updateClaim } from '../api/api';
import StatusBadge from '../components/StatusBadge';
import DateField from '../components/DateField';
import { formatCurrency, formatDate, toInputDate } from '../utils/format';
import './ClaimDetailPage.css';

export default function ClaimDetailPage() {
  const { id } = useParams();
  const [claim, setClaim] = useState(null);
  const [billedDate, setBilledDate] = useState('');
  const [paidDate, setPaidDate] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadClaim();
  }, [id]);

  const loadClaim = async () => {
    try {
      setLoading(true);
      const response = await getClaim(id);
      const data = response.data;
      setClaim(data);
      setBilledDate(toInputDate(data.billed_date));
      setPaidDate(toInputDate(data.paid_date));
      setNotes(data.notes || '');
      setError(null);
    } catch (err) {
      setError('Failed to load claim');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);
      const response = await updateClaim(id, {
        billed_date: billedDate || null,
        paid_date: paidDate || null,
        notes,
      });
      setClaim((prev) => ({ ...prev, ...response.data }));
      setMessage('Claim updated');
    } catch (err) {
      setError('Failed to save claim');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page-message">Loading claim...</div>;
  if (error && !claim) return <div className="page-message error">{error}</div>;
  if (!claim) return null;

  return (
    <div className="claim-detail-page page-scroll">
      <div className="breadcrumb">
        <Link to="/">Dashboard</Link>
        <span> / </span>
        <Link to={`/eobs/${claim.eob_statement_id}`}>EOB</Link>
        <span> / Claim</span>
      </div>

      <header className="page-header claim-header">
        <div>
          <h1>{claim.provider_name}</h1>
          <p>
            Claim {claim.claim_number || '—'} · <StatusBadge status={claim.status} />
          </p>
        </div>
        <p className="claim-total">You owe: {formatCurrency(claim.total_owed)}</p>
      </header>

      <section className="panel">
        <h2>Tracking</h2>
        <p className="section-hint">
          Set Billed when you receive the provider bill. Set Paid when payment is made.
        </p>
        <div className="tracking-fields">
          <DateField label="Billed date" value={billedDate} onChange={setBilledDate} />
          <DateField label="Paid date" value={paidDate} onChange={setPaidDate} />
        </div>
        <label className="notes-field">
          <span>Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>
        <div className="actions">
          <button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          {message && <span className="success-message">{message}</span>}
          {error && <span className="error-inline">{error}</span>}
        </div>
      </section>

      <section className="panel">
        <h2>Claim details</h2>
        <dl className="detail-grid">
          <dt>Network</dt>
          <dd>{claim.network_status || '—'}</dd>
          <dt>Patient account</dt>
          <dd>{claim.patient_account_number || '—'}</dd>
          <dt>EOB date</dt>
          <dd>{formatDate(claim.statement_date)}</dd>
          <dt>Member</dt>
          <dd>{claim.member_name || '—'}</dd>
        </dl>
      </section>

      <section className="panel">
        <h2>Service lines</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Date</th>
                <th>Code</th>
                <th>Provider billed</th>
                <th>Plan allowed</th>
                <th>You owe</th>
              </tr>
            </thead>
            <tbody>
              {claim.lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    {line.service_description}
                    {line.processing_code_description && (
                      <span className="code-hint" title={line.processing_code_description}>
                        {line.processing_code}
                      </span>
                    )}
                  </td>
                  <td>
                    {formatDate(line.service_date_start)}
                    {line.service_date_end && line.service_date_end !== line.service_date_start
                      ? ` – ${formatDate(line.service_date_end)}`
                      : ''}
                  </td>
                  <td>{line.processing_code || '—'}</td>
                  <td>{formatCurrency(line.provider_billed)}</td>
                  <td>{formatCurrency(line.plan_allowed)}</td>
                  <td className="amount">{formatCurrency(line.amount_owed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

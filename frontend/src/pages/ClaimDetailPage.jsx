import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getClaim, updateClaim, updateClaimLine } from '../api/api';
import StatusBadge from '../components/StatusBadge';
import DateField from '../components/DateField';
import { formatCurrency, formatDate, toInputDate } from '../utils/format';
import './ClaimDetailPage.css';

function toBilledInput(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
}

function billedPayload(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

function moneyOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : value;
}

export default function ClaimDetailPage() {
  const { id } = useParams();
  const [claim, setClaim] = useState(null);
  const [billedDate, setBilledDate] = useState('');
  const [paidDate, setPaidDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lineDrafts, setLineDrafts] = useState({});
  const lineDraftsRef = useRef({});
  const [savingLineId, setSavingLineId] = useState(null);
  const [lineMessage, setLineMessage] = useState(null);
  const [lineError, setLineError] = useState(null);
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
      const drafts = Object.fromEntries(
        (data.lines || []).map((line) => [
          line.id,
          { actual_billed: toBilledInput(line.actual_billed), notes: line.notes || '' },
        ])
      );
      lineDraftsRef.current = drafts;
      setLineDrafts(drafts);
      setLineMessage(null);
      setLineError(null);
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

  const fallbackDraft = (line) => ({
    actual_billed: toBilledInput(line.actual_billed),
    notes: line.notes || '',
  });

  const getLineDraft = (line) => lineDrafts[line.id] ?? fallbackDraft(line);

  const updateLineDraft = (line, patch) => {
    setLineDrafts((prev) => {
      const next = {
        ...prev,
        [line.id]: { ...(prev[line.id] ?? fallbackDraft(line)), ...patch },
      };
      lineDraftsRef.current = next;
      return next;
    });
  };

  const saveLine = async (line, patch = {}) => {
    const draft = { ...(lineDraftsRef.current[line.id] ?? fallbackDraft(line)), ...patch };
    lineDraftsRef.current = { ...lineDraftsRef.current, [line.id]: draft };
    setLineDrafts(lineDraftsRef.current);
    const actualBilled = billedPayload(draft.actual_billed);
    const lineNotes = draft.notes.trim() === '' ? null : draft.notes.trim();
    if (moneyOrNull(line.actual_billed) === moneyOrNull(actualBilled) && (line.notes || null) === lineNotes) {
      return;
    }

    try {
      setSavingLineId(line.id);
      setLineMessage(null);
      setLineError(null);
      const response = await updateClaimLine(id, line.id, {
        actual_billed: actualBilled,
        notes: lineNotes,
      });
      setClaim((prev) => ({
        ...prev,
        lines: prev.lines.map((row) => (row.id === line.id ? { ...row, ...response.data } : row)),
      }));
      const savedDraft = {
        actual_billed: toBilledInput(response.data.actual_billed),
        notes: response.data.notes || '',
      };
      lineDraftsRef.current = { ...lineDraftsRef.current, [line.id]: savedDraft };
      setLineDrafts(lineDraftsRef.current);
      setLineMessage('Line saved');
    } catch (err) {
      setLineError(err.response?.data?.error || 'Failed to save line');
      console.error(err);
    } finally {
      setSavingLineId(null);
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
        <p className="section-hint">
          Bill is the amount on the provider invoice. It can differ from the EOB. Changes save when you leave the field.
        </p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Date</th>
                <th>Code</th>
                <th>Provider billed</th>
                <th>Bill</th>
                <th>Plan allowed</th>
                <th>You owe</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {claim.lines.map((line) => {
                const draft = getLineDraft(line);
                return (
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
                    <td>
                      <input
                        className="line-bill-input"
                        type="number"
                        step="0.01"
                        value={draft.actual_billed}
                        disabled={savingLineId === line.id}
                        aria-label={`Bill amount for ${line.service_description}`}
                        onChange={(e) => updateLineDraft(line, { actual_billed: e.target.value })}
                        onBlur={(e) => saveLine(line, { actual_billed: e.target.value })}
                      />
                    </td>
                    <td>{formatCurrency(line.plan_allowed)}</td>
                    <td className="amount">{formatCurrency(line.amount_owed)}</td>
                    <td>
                      <textarea
                        className="line-notes-input"
                        rows={2}
                        value={draft.notes}
                        disabled={savingLineId === line.id}
                        aria-label={`Notes for ${line.service_description}`}
                        onChange={(e) => updateLineDraft(line, { notes: e.target.value })}
                        onBlur={(e) => saveLine(line, { notes: e.target.value })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {(lineMessage || lineError) && (
          <div className="line-save-status">
            {lineMessage && <span className="success-message">{lineMessage}</span>}
            {lineError && <span className="error-inline">{lineError}</span>}
          </div>
        )}
      </section>
    </div>
  );
}

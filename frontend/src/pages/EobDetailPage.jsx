import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteEob, getEob, createClaimLine } from '../api/api';
import ClaimTable from '../components/ClaimTable';
import { formatCurrency, formatDate, toInputDate } from '../utils/format';
import './EobDetailPage.css';

export default function EobDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [eob, setEob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    loadEob();
  }, [id]);

  const loadEob = async ({ quiet } = {}) => {
    try {
      if (!quiet) setLoading(true);
      const response = await getEob(id);
      setEob(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load EOB statement');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this EOB statement and all its claims?')) return;
    try {
      setDeleting(true);
      await deleteEob(id);
      navigate('/eobs');
    } catch (err) {
      setError('Failed to delete EOB');
      console.error(err);
      setDeleting(false);
    }
  };

  const handleAssignLeftover = async (claimId, amount) => {
    try {
      setAssigning(true);
      await createClaimLine(claimId, {
        service_description: 'Amount you owe',
        service_date_start: toInputDate(eob.service_period_start) || null,
        amount_owed: amount,
      });
      await loadEob({ quiet: true });
    } catch (err) {
      setError('Failed to assign leftover amount to claim');
      console.error(err);
    } finally {
      setAssigning(false);
    }
  };

  if (loading) return <div className="page-message">Loading EOB...</div>;
  if (error && !eob) return <div className="page-message error">{error}</div>;
  if (!eob) return null;

  const claimsOwed = (eob.claims || []).reduce((sum, claim) => sum + Number(claim.total_owed || 0), 0);
  const headerOwed = Number(eob.total_amount_owed || 0);
  const leftover = Math.round((headerOwed - claimsOwed) * 100) / 100;
  const owedMismatch = Math.abs(leftover) >= 0.01;
  const emptyClaims = (eob.claims || []).filter((claim) => !(claim.lines || []).length);
  const assignTarget = leftover > 0 && emptyClaims.length === 1 ? emptyClaims[0] : null;

  return (
    <div className="eob-detail-page page-scroll">
      <div className="breadcrumb">
        <Link to="/eobs">EOB Statements</Link>
        <span> / Detail</span>
      </div>

      <header className="page-header row-header">
        <div>
          <h1>EOB — {formatDate(eob.statement_date)}</h1>
          <p>{eob.member_name || 'Unknown member'}</p>
        </div>
        <button type="button" className="btn-danger" onClick={handleDelete} disabled={deleting}>
          {deleting ? 'Deleting...' : 'Delete EOB'}
        </button>
      </header>

      <section className="panel">
        <dl className="detail-grid">
          <dt>Service period</dt>
          <dd>
            {formatDate(eob.service_period_start)}
            {eob.service_period_end ? ` – ${formatDate(eob.service_period_end)}` : ''}
          </dd>
          <dt>Member ID</dt>
          <dd>{eob.member_id || '—'}</dd>
          <dt>Reference</dt>
          <dd>{eob.eob_reference || '—'}</dd>
          <dt>Provider billed</dt>
          <dd>{formatCurrency(eob.total_provider_billed)}</dd>
          <dt>Total you owe</dt>
          <dd className="amount">{formatCurrency(eob.total_amount_owed)}</dd>
        </dl>
        {owedMismatch && (
          <div className="owed-mismatch">
            <p>
              Statement total {formatCurrency(headerOwed)} does not match claim line items{' '}
              {formatCurrency(claimsOwed)}.
            </p>
            {assignTarget && (
              <button
                type="button"
                onClick={() => handleAssignLeftover(assignTarget.id, leftover)}
                disabled={assigning}
              >
                {assigning
                  ? 'Assigning...'
                  : `Assign ${formatCurrency(leftover)} to ${assignTarget.provider_name}`}
              </button>
            )}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Claims</h2>
        <ClaimTable claims={eob.claims} showEob={false} />
      </section>
    </div>
  );
}

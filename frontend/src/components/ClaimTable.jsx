import { Link } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import { formatCurrency, formatDate } from '../utils/format';

export default function ClaimTable({ claims, showEob = true }) {
  if (!claims?.length) {
    return <p className="empty-message">No claims in this section.</p>;
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Provider</th>
            <th>Claim #</th>
            {showEob && <th>EOB Date</th>}
            <th>Amount Owed</th>
            <th>Billed</th>
            <th>Paid</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((claim) => (
            <tr key={claim.id}>
              <td>
                <Link to={`/claims/${claim.id}`} className="table-link">
                  {claim.provider_name}
                </Link>
              </td>
              <td>{claim.claim_number || '—'}</td>
              {showEob && <td>{formatDate(claim.statement_date)}</td>}
              <td className="amount">{formatCurrency(claim.total_owed)}</td>
              <td>{formatDate(claim.billed_date)}</td>
              <td>{formatDate(claim.paid_date)}</td>
              <td>
                <StatusBadge status={claim.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

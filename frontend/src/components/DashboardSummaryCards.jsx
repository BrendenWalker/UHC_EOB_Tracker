import { formatCurrency } from '../utils/format';

export default function DashboardSummaryCards({ summary }) {
  if (!summary) return null;

  const cards = [
    {
      key: 'unbilled',
      title: 'Unbilled',
      count: summary.unbilled_count,
      total: summary.unbilled_total,
      description: 'EOB shows balance — no provider bill yet',
      className: 'summary-unbilled',
    },
    {
      key: 'unpaid',
      title: 'Unpaid',
      count: summary.unpaid_count,
      total: summary.unpaid_total,
      description: 'Bill received — payment not recorded',
      className: 'summary-unpaid',
    },
    {
      key: 'paid',
      title: 'Paid',
      count: summary.paid_count,
      total: summary.paid_total,
      description: 'Payment recorded',
      className: 'summary-paid',
    },
  ];

  return (
    <div className="summary-cards">
      {cards.map((card) => (
        <div key={card.key} className={`summary-card ${card.className}`}>
          <h3>{card.title}</h3>
          <p className="summary-amount">{formatCurrency(card.total)}</p>
          <p className="summary-count">{card.count} claim{card.count === 1 ? '' : 's'}</p>
          <p className="summary-description">{card.description}</p>
        </div>
      ))}
    </div>
  );
}

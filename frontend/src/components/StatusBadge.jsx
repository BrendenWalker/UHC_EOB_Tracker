const STATUS_LABELS = {
  unbilled: 'Unbilled',
  unpaid: 'Unpaid',
  paid: 'Paid',
  no_balance: 'No Balance',
};

export default function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{STATUS_LABELS[status] || status}</span>;
}

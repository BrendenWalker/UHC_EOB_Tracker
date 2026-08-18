export function formatCurrency(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateSpan(start, end) {
  const startKey = start ? String(start).slice(0, 10) : '';
  const endKey = end ? String(end).slice(0, 10) : '';
  if (!startKey) return '—';
  if (!endKey || startKey === endKey) return formatDate(startKey);
  return `${formatDate(startKey)} – ${formatDate(endKey)}`;
}

export function toInputDate(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

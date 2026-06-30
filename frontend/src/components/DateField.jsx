export default function DateField({ label, value, onChange }) {
  return (
    <label className="date-field">
      <span>{label}</span>
      <input type="date" value={value || ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

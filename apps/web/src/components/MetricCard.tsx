type Props = {
  label: string;
  value: string;
  sublabel?: string;
};

export function MetricCard({ label, value, sublabel }: Props) {
  return (
    <section className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {sublabel ? <small>{sublabel}</small> : null}
    </section>
  );
}

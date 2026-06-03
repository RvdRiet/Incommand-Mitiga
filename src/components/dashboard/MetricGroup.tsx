export function MetricGroup({ items }: { items: { value: number | string; label: string }[] }) {
  return (
    <section className={`ic-metrics ic-metrics--${items.length}`}>
      {items.map((item) => (
        <section key={item.label} className="ic-metric">
          <p className="ic-metric__value">{item.value}</p>
          <p className="ic-metric__label">{item.label}</p>
        </section>
      ))}
    </section>
  );
}

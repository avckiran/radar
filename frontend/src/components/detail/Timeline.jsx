export default function Timeline({ entries, empty, renderAfter }) {
  if (entries.length === 0) return empty ?? null;
  return (
    <ol className="rd-timeline detail-timeline">
      {entries.map((entry, index) => (
        <li key={entry.id} className={`rd-timeline__item ${index === entries.length - 1 ? 'rd-timeline__item--start' : ''}`}>
          <span className="rd-t-secondary rd-quiet">
            {entry.stamp}
            {entry.by ? ` · ${entry.by}` : ''}
          </span>
          <span className="rd-t-ui">{entry.text}</span>
          {entry.detail && <span className="rd-t-secondary rd-muted">{entry.detail}</span>}
          {renderAfter?.(entry, index)}
        </li>
      ))}
    </ol>
  );
}

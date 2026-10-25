export default function SegmentChip({ segment }) {
  if (!segment) return <span className="rd-chip rd-chip--none">No segment</span>;
  return (
    <span className={`rd-chip rd-seg-${segment.color}`}>
      <i className="rd-dot" aria-hidden="true" />
      <span className="rd-ell">{segment.name}</span>
    </span>
  );
}

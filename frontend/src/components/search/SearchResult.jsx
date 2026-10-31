import Icon from '../Icon.jsx';
import SegmentChip from '../home/SegmentChip.jsx';
import StateTag from '../home/StateTag.jsx';

const KIND_ICON = { action: 'check', note: 'note', link: 'link' };
const KIND_LABEL = { note: 'Note', link: 'Link' };

function Marked({ parts }) {
  return parts.map((part, i) =>
    part.mark ? (
      <mark key={i} className="search-mark">
        {part.text}
      </mark>
    ) : (
      <span key={i}>{part.text}</span>
    )
  );
}

export default function SearchResult({ result, id, active, onOpen, onHover }) {
  const { line } = result;
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={active}
      className={`rd-card search-result ${active ? 'search-result--active' : ''}`}
      onClick={() => onOpen(result)}
      onMouseMove={onHover}
    >
      <span className="search-result__icon">
        <Icon name={KIND_ICON[result.kind]} size={16} />
      </span>
      <span className="search-result__body">
        <span className="search-result__title">
          <Marked parts={result.title} />
        </span>
        <span className="rd-t-secondary rd-muted search-result__line">
          {line.prefix}
          {line.lead && '…'}
          <Marked parts={line.parts} />
          {line.trail && '…'}
          {line.suffix}
        </span>
        <span className="search-result__meta">
          <SegmentChip segment={result.segment} />
          {result.tag ? (
            <StateTag tag={result.tag} />
          ) : (
            KIND_LABEL[result.kind] && <span className="rd-t-secondary rd-muted">{KIND_LABEL[result.kind]}</span>
          )}
        </span>
      </span>
    </button>
  );
}

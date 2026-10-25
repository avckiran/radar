import Icon from '../Icon.jsx';

function timeLabel(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function OfflineStrip({ updatedAt }) {
  return (
    <div className="rd-banner" role="status">
      <Icon name="offline" size={18} />
      <span>{updatedAt ? `Offline · showing data from ${timeLabel(updatedAt)}` : 'Offline · nothing saved to show yet'}</span>
    </div>
  );
}

export function ErrorBanner({ message, onRetry }) {
  return (
    <div className="rd-banner rd-banner--error" role="alert">
      <Icon name="alert" size={18} />
      <span className="rd-fill">{message}</span>
      {onRetry && (
        <button type="button" className="rd-btn rd-btn--sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

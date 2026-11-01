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

// Online, but the server cannot be reached: the screen shows the last saved copy
export function StaleStrip({ updatedAt, onRetry }) {
  return (
    <div className="rd-banner" role="status">
      <Icon name="offline" size={18} />
      <span className="rd-fill">{updatedAt ? `Can’t reach the server · showing data from ${timeLabel(updatedAt)}` : 'Can’t reach the server'}</span>
      {onRetry && (
        <button type="button" className="rd-btn rd-btn--sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

export default function PlaceholderPage({ title, subtitle, children, accent }) {
  useDocumentTitle(title);
  return (
    <div className="page">
      <header className={`page__header ${accent ? `rd-seg-${accent} page__header--accent` : ''}`}>
        <h1 className="page__title rd-t-screen-title">{title}</h1>
        {subtitle && <p className="rd-t-secondary rd-quiet page__subtitle">{subtitle}</p>}
      </header>
      {children ?? <div className="rd-reserved page__reserved">This screen is built in a later step.</div>}
    </div>
  );
}

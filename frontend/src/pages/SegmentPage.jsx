import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import ActionRow from '../components/segment/ActionRow.jsx';
import { apiGet } from '../lib/api.js';
import { useResource } from '../hooks/useResource.js';
import { useItemActions } from '../hooks/useItemActions.js';
import { useOpenItem } from '../hooks/useOpenItem.js';
import { useQuickAdd } from '../hooks/useQuickAdd.js';
import { useOnline } from '../hooks/useOnline.js';
import { useElementWidth } from '../hooks/useElementWidth.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

function isWebUrl(url) {
  return /^https?:\/\//i.test(url ?? '');
}

function Section({ title, count, children }) {
  const id = `sec-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="home__section">
      <div className="home__heading">
        <h2 id={id} className="rd-overline">
          {title}
        </h2>
        <span className="rd-t-secondary rd-quiet">{count}</span>
      </div>
      {children}
    </section>
  );
}

function SegmentSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading segment">
      <Skeleton width={180} height={28} />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} height={72} />
      ))}
    </div>
  );
}

function DoneSection({ segmentId, done, onOpen }) {
  const [open, setOpen] = useState(false);
  const [extra, setExtra] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const rows = [...done.items, ...extra];

  async function more() {
    setLoadingMore(true);
    try {
      const page = await apiGet(`/api/segments/${segmentId}/done?offset=${rows.length}`);
      setExtra((e) => [...e, ...page.items]);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="home__section" aria-label="Done">
      <button type="button" className="seg-done__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name={open ? 'chevd' : 'chev'} size={16} />
        <span className="rd-overline">Done</span>
        <span className="rd-t-secondary rd-quiet">{done.count}</span>
      </button>
      {open && (
        <>
          <ul className="home__list home__list--tight">
            {rows.map((row) => (
              <li key={row.id} className="recent__item">
                <Icon name="check" size={16} />
                <button type="button" className="seg-row__title rd-ell rd-fill" onClick={() => onOpen(row.id)}>
                  {row.title}
                </button>
                <span className="rd-t-secondary rd-quiet">
                  {row.by ? `${row.by} · ` : ''}
                  {row.dayLabel}
                </span>
              </li>
            ))}
          </ul>
          {rows.length < done.count && (
            <button type="button" className="rd-btn rd-btn--sm" disabled={loadingMore} onClick={more}>
              Show more
            </button>
          )}
        </>
      )}
    </section>
  );
}

export default function SegmentPage() {
  const { segmentId } = useParams();
  const { data, loading, error, reload, setData } = useResource(`/api/segments/${segmentId}`);
  const { run, pending } = useItemActions();
  const { openItem } = useOpenItem();
  const quickAdd = useQuickAdd();
  const online = useOnline();
  const [bodyRef, width] = useElementWidth();
  useDocumentTitle(data?.segment.name ?? 'Segment');

  const markDone = useCallback(
    (row) => {
      setData((d) => ({
        ...d,
        active: d.active.filter((r) => r.id !== row.id),
        waiting: d.waiting.filter((r) => r.id !== row.id),
        snoozed: d.snoozed.filter((r) => r.id !== row.id),
      }));
      run(row.id, 'done', {}, { success: 'Marked done', undo: true });
    },
    [run, setData]
  );

  if (!data) {
    if (loading) return <SegmentSkeleton />;
    const missing = /not found/i.test(error ?? '');
    return (
      <div className="page">
        <div className="rd-card home__error" role="alert">
          <Icon name="alert" size={22} />
          <div className="rd-fill">
            <div className="allclear__title">{missing ? 'Segment not found' : 'Couldn’t load this segment'}</div>
            <div className="rd-t-secondary rd-muted">{missing ? 'It may have been deleted.' : error}</div>
          </div>
          {missing ? (
            <Link to="/" className="rd-btn">
              Go to Home
            </Link>
          ) : (
            <button type="button" className="rd-btn" onClick={reload}>
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  const { segment, stats } = data;
  const cols = width >= 900 ? 3 : width >= 480 ? 2 : 1;
  const overdue = data.active.filter((row) => row.tag.kind === 'overdue').length;
  const next = overdue > 0 ? `${overdue} overdue` : stats.nextDue ? `next due ${stats.nextDue}` : 'no due dates';
  const empty = !data.active.length && !data.waiting.length && !data.snoozed.length && !data.notes.length && !data.links.length && data.done.count === 0;

  const actionRows = (rows) => (
    <ul className="home__list home__list--tight">
      {rows.map((row) => (
        <li key={row.id}>
          <ActionRow row={row} disabled={!online || pending.has(row.id)} onDone={markDone} onOpen={openItem} />
        </li>
      ))}
    </ul>
  );

  const active = (
    <Section key="active" title="Active" count={data.active.length}>
      {data.active.length ? actionRows(data.active) : <p className="rd-t-secondary rd-quiet seg-none">Nothing active.</p>}
    </Section>
  );
  const waiting = data.waiting.length > 0 && (
    <Section key="waiting" title="Waiting" count={data.waiting.length}>
      {actionRows(data.waiting)}
    </Section>
  );
  const snoozed = data.snoozed.length > 0 && (
    <Section key="snoozed" title="Snoozed" count={data.snoozed.length}>
      {actionRows(data.snoozed)}
    </Section>
  );
  const notes = data.notes.length > 0 && (
    <Section key="notes" title="Notes" count={data.notes.length}>
      <ul className="home__list home__list--tight">
        {data.notes.map((note) => (
          <li key={note.id}>
            <button type="button" className="rd-card seg-note" onClick={() => openItem(note.id)}>
              <span className="seg-note__title rd-ell">{note.title}</span>
              {note.excerpt && <span className="rd-t-secondary rd-muted seg-note__excerpt">{note.excerpt}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
  const links = data.links.length > 0 && (
    <Section key="links" title="Links and Resources" count={data.links.length}>
      <ul className="home__list home__list--tight">
        {data.links.map((link) => (
          <li key={link.id} className="rd-card seg-link">
            <Icon name="link" size={18} />
            <div className="seg-link__text">
              {isWebUrl(link.url) ? (
                <a className="seg-row__title" href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.title}
                </a>
              ) : (
                <span className="seg-row__title">{link.title}</span>
              )}
              <span className="rd-t-secondary rd-muted rd-ell">{link.domain}</span>
            </div>
            <button type="button" className="rd-btn rd-btn--sm rd-btn--ghost" aria-label={`Details for ${link.title}`} onClick={() => openItem(link.id)}>
              Details
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
  const done = data.done.count > 0 && <DoneSection key="done" segmentId={segment.id} done={data.done} onOpen={openItem} />;

  let columns;
  if (cols === 3) columns = [[active], [waiting, snoozed, done], [notes, links]];
  else if (cols === 2) columns = [[active, waiting, snoozed, done], [notes, links]];
  else columns = [[active, waiting, snoozed, notes, links, done]];

  return (
    <div className="page seg">
      <header className={`page__header page__header--accent rd-seg-${segment.color}`}>
        <div className="seg__title">
          <i className="rd-dot rd-dot--lg" aria-hidden="true" />
          <h1 className="page__title rd-t-screen-title rd-fill rd-ell">{segment.name}</h1>
          <button type="button" className="rd-btn rd-btn--sm" onClick={() => quickAdd({ segmentId: segment.id })}>
            <Icon name="plus" size={16} />
            Add to {segment.name}
          </button>
        </div>
        <p className="rd-t-secondary rd-quiet page__subtitle">
          {stats.active} active · {stats.waiting} waiting · {next}
        </p>
      </header>

      <div className="seg-tabs" role="tablist" aria-label="Segment views">
        <button type="button" role="tab" aria-selected="true" className="seg-tab seg-tab--on">
          Overview
        </button>
        <button type="button" role="tab" aria-selected="false" aria-disabled="true" className="seg-tab" tabIndex={-1}>
          Files · coming soon
        </button>
      </div>

      <div ref={bodyRef} className="seg__body">
        {empty ? (
          <div className="rd-card seg-empty">
            <div className="allclear__title">Nothing in {segment.name} yet.</div>
            <p className="rd-t-secondary rd-muted">Actions show up grouped by state. Notes and links collect below.</p>
            <button type="button" className="rd-btn rd-btn--primary" onClick={() => quickAdd({ segmentId: segment.id })}>
              <Icon name="plus" size={16} />
              Add to {segment.name}
            </button>
          </div>
        ) : (
          <div className="seg__columns" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
            {columns.map((column, index) => (
              <div key={index} className="home__column">
                {column}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

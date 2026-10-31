import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import SortPhone from '../components/inbox/SortPhone.jsx';
import SortWideRow from '../components/inbox/SortWideRow.jsx';
import { inboxMeta } from '../components/inbox/InboxMeta.js';
import { useToast } from '../components/ui/Toast.jsx';
import { apiPost } from '../lib/api.js';
import { useResource } from '../hooks/useResource.js';
import { useShellData } from '../hooks/useShellData.jsx';
import { useOnline } from '../hooks/useOnline.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useOpenItem } from '../hooks/useOpenItem.js';
import { plural } from '../lib/text.js';

function InboxSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading Inbox">
      <Skeleton width={120} height={28} />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} height={64} />
      ))}
    </div>
  );
}

export default function Inbox() {
  useDocumentTitle('Inbox');
  const toast = useToast();
  const online = useOnline();
  const wide = useMediaQuery('(min-width: 768px)');
  const desktop = useMediaQuery('(min-width: 1024px)');
  const shell = useShellData();
  const { notifyChanged } = shell;
  const { data, loading, error, reload, setData } = useResource('/api/inbox');
  const { openItem, itemLink } = useOpenItem();
  const segments = shell.data?.segments ?? [];
  const [expanded, setExpanded] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const controller = useRef({});
  const swipe = useRef(null);
  const keyHandler = useRef(null);

  useEffect(() => {
    const listener = (e) => keyHandler.current?.(e);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);

  const move = useCallback(
    async (item, segmentId, dueDate) => {
      setBusyId(item.id);
      try {
        const result = await apiPost(`/api/items/${item.id}/sort`, { segmentId, dueDate });
        setData((d) => (d ? { ...d, items: d.items.filter((i) => i.id !== item.id) } : d));
        setExpanded(null);
        toast.show(`Moved to ${result.segmentName}`);
      } catch (err) {
        toast.show(err.message);
      } finally {
        setBusyId(null);
        notifyChanged();
      }
    },
    [notifyChanged, setData, toast]
  );

  if (!data) {
    if (loading) return <InboxSkeleton />;
    return (
      <div className="page">
        <div className="rd-card home__error" role="alert">
          <Icon name="alert" size={22} />
          <div className="rd-fill">
            <div className="allclear__title">Couldn’t load Inbox</div>
            <div className="rd-t-secondary rd-muted">{error}</div>
          </div>
          <button type="button" className="rd-btn" onClick={reload}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const items = data.items;
  const offline = !online;

  const currentId = items.some((i) => i.id === activeId) ? activeId : (items[0]?.id ?? null);

  keyHandler.current = (e) => {
    if (!desktop || items.length === 0 || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    if (document.querySelector('[role="dialog"]')) return;
    const target = e.target;
    if (target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.closest('.detail-panel'))) return;
    const index = Math.max(0, items.findIndex((i) => i.id === currentId));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = items[Math.min(items.length - 1, Math.max(0, index + (e.key === 'ArrowDown' ? 1 : -1)))];
      setActiveId(next.id);
    } else if (/^[1-9]$/.test(e.key)) {
      controller.current[items[index].id]?.pick(Number(e.key) - 1);
      setActiveId(items[index].id);
    } else if (e.key === 'Enter' && !(target instanceof HTMLButtonElement)) {
      controller.current[items[index].id]?.move();
    }
  };

  return (
    <div className="page inbox">
      <header className="page__header">
        <h1 className="page__title rd-t-screen-title">Inbox</h1>
        <p className="rd-t-secondary rd-quiet page__subtitle">
          {items.length > 0 ? `${wide ? plural(items.length, 'item') : items.length} to sort` : 'Nothing to sort'}
        </p>
      </header>

      {items.length === 0 ? (
        <div className="rd-card allclear">
          <Icon name="check" size={22} />
          <div>
            <div className="allclear__title">Inbox is clear.</div>
            <div className="rd-t-secondary rd-muted">Everything you captured has a home.</div>
          </div>
        </div>
      ) : (
        <>
          <p className="rd-t-secondary rd-muted inbox__intro">
            Sort each item into a segment. Items unsorted for 2+ days also appear in Needs attention{wide ? ' on Home' : ''}.
          </p>
          {offline && <p className="rd-t-secondary rd-muted">You’re offline. You can read the Inbox, but sorting needs a connection.</p>}
          {wide ? (
            <>
              {desktop && (
                <p className="rd-t-secondary rd-quiet inbox__keys">
                  <kbd className="rd-kbd">↑↓</kbd> move · <kbd className="rd-kbd">1–9</kbd> segment · <kbd className="rd-kbd">↵</kbd> move
                </p>
              )}
              <div className="inbox-wide__heads rd-overline" aria-hidden="true">
                <span className="rd-fill">Item</span>
                <span className="inbox-wide__segment">Segment</span>
                <span className="inbox-wide__due">Due date</span>
                <span className="inbox-wide__move" />
              </div>
              <ul className="home__list home__list--tight">
                {items.map((item) => (
                  <li key={item.id}>
                    <SortWideRow
                      item={item}
                      segments={segments}
                      busy={busyId === item.id}
                      offline={offline}
                      active={desktop && currentId === item.id}
                      onActivate={() => setActiveId(item.id)}
                      onMove={(segmentId, dueDate) => move(item, segmentId, dueDate)}
                      openItem={openItem}
                      showNumbers={desktop}
                      controller={controller}
                    />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <ul className="home__list home__list--tight">
                {items.map((item) => {
                  const open = expanded === item.id;
                  return (
                    <li
                      key={item.id}
                      className="rd-card inbox-row"
                      onTouchStart={(e) => {
                        const t = e.touches[0];
                        swipe.current = { x: t.clientX, y: t.clientY };
                      }}
                      onTouchEnd={(e) => {
                        const start = swipe.current;
                        swipe.current = null;
                        if (!start || offline) return;
                        const t = e.changedTouches[0];
                        if (t.clientX - start.x > 70 && Math.abs(t.clientY - start.y) < 40) setExpanded(item.id);
                      }}
                    >
                      <div className="inbox-row__head">
                        <button type="button" className="inbox-row__main" aria-expanded={open} onClick={() => setExpanded(open ? null : item.id)}>
                          <span className="rd-itemrow__title rd-ell">{item.title}</span>
                          <span className="rd-t-secondary rd-muted rd-ell">{inboxMeta(item)}</span>
                        </button>
                        <button type="button" className="rd-btn rd-btn--sm" disabled={offline} onClick={() => setExpanded(open ? null : item.id)} aria-label={`Sort ${item.title}`}>
                          Sort
                        </button>
                      </div>
                      {open && (
                        <SortPhone
                          item={item}
                          segments={segments}
                          today={data.today}
                          busy={busyId === item.id}
                          offline={offline}
                          onMove={(segmentId, dueDate) => move(item, segmentId, dueDate)}
                          openDetails={itemLink(item.id)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="rd-t-secondary rd-quiet inbox__swipe">Swipe a row right to sort it quickly</p>
            </>
          )}
        </>
      )}
    </div>
  );
}

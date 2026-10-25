import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import Overlay from '../components/ui/Overlay.jsx';
import ItemRow from '../components/home/ItemRow.jsx';
import SegmentCard from '../components/home/SegmentCard.jsx';
import SnoozePicker from '../components/home/SnoozePicker.jsx';
import WaitingForm from '../components/home/WaitingForm.jsx';
import AllClearCard from '../components/home/AllClearCard.jsx';
import Popover from '../components/home/Popover.jsx';
import { useHome } from '../hooks/useHome.js';
import { useOnline } from '../hooks/useOnline.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { dayHint, longDate, shortDate, weekdayLong } from '../lib/dates.js';
import { plural } from '../lib/text.js';

function HomeSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading Home">
      <Skeleton width={160} height={28} />
      <div className="home__list">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={112} />
        ))}
      </div>
      <div className="home__list">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={56} />
        ))}
      </div>
    </div>
  );
}

function LoadError({ message, onRetry }) {
  return (
    <div className="page">
      <div className="rd-card home__error" role="alert">
        <Icon name="alert" size={22} />
        <div className="rd-fill">
          <div className="allclear__title">Couldn’t load Home</div>
          <div className="rd-t-secondary rd-muted">{message}</div>
        </div>
        <button type="button" className="rd-btn" onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  );
}

function NextUp({ items }) {
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 1280px)').matches);
  if (items.length === 0) return null;
  return (
    <details className="nextup" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="rd-overline">Next up · {items.length}</summary>
      <ul className="nextup__list">
        {items.map((item) => (
          <li key={item.id} className="nextup__item">
            <span className="nextup__day">{item.dayLabel}</span>
            <span className="rd-fill rd-ell">{item.title}</span>
            {item.segment && <span className="rd-ell nextup__segment">{item.segment.name}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

function RecentlyCompleted({ items }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="recent-h" className="home__section">
      <h2 id="recent-h" className="rd-overline">
        Recently completed
      </h2>
      <ul className="home__list home__list--tight">
        {items.map((item) => (
          <li key={item.id} className="recent__item">
            <Icon name="check" size={16} />
            <span className="rd-fill rd-ell">{item.title}</span>
            <span className="rd-t-secondary rd-quiet">
              {item.by ? `${item.by} · ` : ''}
              {item.dayLabel}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InboxStrip({ count }) {
  if (count === 0) return null;
  return (
    <div className="rd-card inbox-strip">
      <Icon name="tray" size={18} />
      <span className="rd-fill">{plural(count, 'item')} to sort in Inbox</span>
      <Link to="/inbox" className="rd-btn rd-btn--sm">
        Sort
      </Link>
    </div>
  );
}

export default function Home() {
  useDocumentTitle('Home');
  const navigate = useNavigate();
  const online = useOnline();
  const wide = useMediaQuery('(min-width: 768px)');
  const twoColumns = useMediaQuery('(min-width: 1024px)');
  const { data, loading, error, pending, reload, act } = useHome();
  const [popoverFor, setPopoverFor] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [waiting, setWaiting] = useState({ busy: false, error: null });

  const closeAll = useCallback(() => {
    setPopoverFor(null);
    setDialog(null);
    setWaiting({ busy: false, error: null });
  }, []);

  if (!data) return loading ? <HomeSkeleton /> : <LoadError message={error} onRetry={reload} />;

  const today = data.today;

  function snooze(row, date) {
    closeAll();
    act(row, 'snooze', { until: date }, { success: `Snoozed until ${dayHint(date, today)}`, optimistic: true });
  }

  async function markWaiting(row, values) {
    setWaiting({ busy: true, error: null });
    const result = await act(row, 'waiting', values, { success: 'Marked as waiting' });
    if (result.ok) closeAll();
    else setWaiting({ busy: false, error: result.error });
  }

  function onAction(key, row) {
    if (key === 'done') act(row, 'done', {}, { success: 'Marked done', optimistic: true });
    else if (key === 'back') act(row, 'reopen', {}, { success: 'Back to active' });
    else if (key === 'sort') navigate('/inbox');
    else if (key === 'snooze') (wide ? setPopoverFor(row.id) : setDialog({ type: 'snooze', row }));
    else if (key === 'waiting') setDialog({ type: 'waiting', row });
  }

  const attention = (
    <section aria-labelledby="attention-h" className="home__section">
      <div className="home__heading">
        <h2 id="attention-h" className="rd-overline">
          Needs attention
        </h2>
        {data.needsAttention.length > 0 && <span className="count-chip">{data.needsAttention.length}</span>}
      </div>
      {data.needsAttention.length === 0 ? (
        <AllClearCard />
      ) : (
        <ul className="home__list">
          {data.needsAttention.map((row) => (
            <li key={row.id} className="home__row">
              <ItemRow row={row} wide={wide} disabled={!online || pending.has(row.id)} onAction={onAction} />
              {popoverFor === row.id && (
                <Popover label="Snooze until" onClose={() => setPopoverFor(null)}>
                  <SnoozePicker today={today} onPick={(date) => snooze(row, date)} onCancel={() => setPopoverFor(null)} />
                </Popover>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const segments = (
    <section aria-labelledby="segments-h" className="home__section">
      <h2 id="segments-h" className="rd-overline">
        Segments
      </h2>
      <ul className="home__list home__list--tight">
        {data.segments.map((segment) => (
          <li key={segment.id}>
            <SegmentCard segment={segment} />
          </li>
        ))}
      </ul>
    </section>
  );

  const inbox = <InboxStrip count={data.inboxCount} />;
  const nextUp = <NextUp items={data.nextUp} />;
  const recent = <RecentlyCompleted items={data.recentlyCompleted} />;

  return (
    <div className="page home">
      <header className="page__header">
        <h1 className="page__title rd-t-screen-title">
          <span className="sr-only">Home, </span>
          {wide ? longDate(today) : shortDate(today)}
        </h1>
        {wide && (
          <p className="rd-t-secondary rd-quiet page__subtitle">
            {data.weekEnd === today ? 'The week ends today' : `The week ends ${weekdayLong(data.weekEnd)}`}
          </p>
        )}
      </header>

      {wide && <div className="rd-reserved home__strip">Today / This week</div>}

      {twoColumns ? (
        <div className="home__columns">
          <div className="home__column">
            {attention}
            {recent}
          </div>
          <div className="home__column">
            {inbox}
            {segments}
            {nextUp}
          </div>
        </div>
      ) : (
        <>
          {attention}
          {inbox}
          {segments}
          {nextUp}
          {recent}
        </>
      )}

      {dialog?.type === 'snooze' && (
        <Overlay label="Snooze until" onClose={closeAll}>
          <h2 className="rd-t-item-title">Snooze “{dialog.row.title}” until</h2>
          <SnoozePicker today={today} onPick={(date) => snooze(dialog.row, date)} onCancel={closeAll} />
        </Overlay>
      )}
      {dialog?.type === 'waiting' && (
        <Overlay label="Mark as waiting" onClose={closeAll}>
          <WaitingForm
            today={today}
            busy={waiting.busy}
            error={waiting.error}
            onSubmit={(values) => markWaiting(dialog.row, values)}
            onCancel={closeAll}
          />
        </Overlay>
      )}
    </div>
  );
}

import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import Overlay from '../components/ui/Overlay.jsx';
import ItemRow from '../components/home/ItemRow.jsx';
import SnoozePicker from '../components/home/SnoozePicker.jsx';
import { CalendarBox, FollowUpsBox, NotesBox, ShoppingBox } from '../components/home/HomeBoxes.jsx';
import { DoneForm } from '../components/detail/DetailForms.jsx';
import { doneBody } from '../lib/followUp.js';
import AllClearCard from '../components/home/AllClearCard.jsx';
import Popover from '../components/home/Popover.jsx';
import { useOpenItem } from '../hooks/useOpenItem.js';
import { useHome } from '../hooks/useHome.js';
import { useOnline } from '../hooks/useOnline.js';
import { ATTENTION_SECTIONS, columnCount } from '../lib/homeState.js';
import { useElementWidth } from '../hooks/useElementWidth.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { dayHint, longDate, shortDate, weekdayLong } from '../lib/dates.js';
import { plural } from '../lib/text.js';

function HomeSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading Home">
      <Skeleton width={160} height={28} />
      <div className="home__list">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={64} />
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
  const { openItem } = useOpenItem();
  const online = useOnline();
  const wide = useMediaQuery('(min-width: 768px)');
  const wideViewport = useMediaQuery('(min-width: 1024px)');
  const [pageRef, pageWidth] = useElementWidth();
  const columns = columnCount(pageWidth, wideViewport);
  const { data, loading, error, pending, reload, act } = useHome();
  const [popoverFor, setPopoverFor] = useState(null);
  const [dialog, setDialog] = useState(null);

  const closeAll = useCallback(() => {
    setPopoverFor(null);
    setDialog(null);
  }, []);

  if (!data) return loading ? <HomeSkeleton /> : <LoadError message={error} onRetry={reload} />;

  const today = data.today;
  const disabled = (row) => !online || pending.has(row.id);

  function snooze(row, date) {
    closeAll();
    act(row, 'snooze', { until: date }, { success: `Snoozed until ${dayHint(date, today)}`, optimistic: true });
  }

  // Done asks for an optional note and an optional follow-up first, the same popup as on the segment pages.
  // It is the only way to start a follow-up.
  function markDone(row, { note, followUp }) {
    closeAll();
    act(row, 'done', doneBody(note, followUp), { success: followUp ? 'Marked done. Follow-up added' : 'Marked done', optimistic: true, undo: true });
  }

  function onAction(key, row) {
    if (key === 'done') setDialog({ type: 'done', row });
    else if (key === 'snooze') (wide ? setPopoverFor(row.id) : setDialog({ type: 'snooze', row }));
  }

  const attention = (
    <section aria-labelledby="attention-h" className="home__section">
      <div className="home__heading">
        <h2 id="attention-h" className="rd-overline">
          Needs attention
        </h2>
        {data.attentionCount > 0 && <span className="count-chip">{data.attentionCount}</span>}
      </div>
      {data.attentionCount === 0 ? (
        <AllClearCard />
      ) : (
        ATTENTION_SECTIONS.filter(({ key }) => data.attention[key].length > 0).map(({ key, title }) => (
          <div key={key} className="home__group" role="group" aria-label={title}>
            <h3 className={`home__group-title ${key === 'overdue' ? 'home__group-title--late' : ''}`}>{title}</h3>
            <ul className="home__list home__list--tight">
              {data.attention[key].map((row) => (
                <li key={row.id} className="home__row">
                  <ItemRow row={row} disabled={disabled(row)} onAction={onAction} onOpen={openItem} />
                  {popoverFor === row.id && (
                    <Popover label="Snooze until" onClose={() => setPopoverFor(null)}>
                      <SnoozePicker today={today} onPick={(date) => snooze(row, date)} onCancel={() => setPopoverFor(null)} />
                    </Popover>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );

  const inbox = <InboxStrip count={data.inboxCount} />;
  const followUps = <FollowUpsBox rows={data.followUps} disabled={disabled} onAction={onAction} onOpen={openItem} />;
  const calendar = <CalendarBox />;
  const shopping = <ShoppingBox shopping={data.shopping} />;
  const notes = <NotesBox notes={data.notes} onOpen={openItem} />;

  return (
    <div ref={pageRef} className="page home">
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

      {columns === 3 && (
        <div className="home__columns home__columns--3">
          <div className="home__column">
            {attention}
            {inbox}
          </div>
          <div className="home__column">
            {followUps}
            {calendar}
          </div>
          <div className="home__column">
            {shopping}
            {notes}
          </div>
        </div>
      )}
      {columns === 2 && (
        <div className="home__columns home__columns--2">
          <div className="home__column">
            {attention}
            {inbox}
          </div>
          <div className="home__column">
            {followUps}
            {calendar}
            {shopping}
            {notes}
          </div>
        </div>
      )}
      {columns === 1 && (
        <>
          {attention}
          {inbox}
          {followUps}
          {shopping}
          {notes}
        </>
      )}

      {dialog?.type === 'snooze' && (
        <Overlay label="Snooze until" onClose={closeAll}>
          <h2 className="rd-t-item-title">Snooze “{dialog.row.title}” until</h2>
          <SnoozePicker today={today} onPick={(date) => snooze(dialog.row, date)} onCancel={closeAll} />
        </Overlay>
      )}
      {dialog?.type === 'done' && (
        <Overlay label="Mark done" onClose={closeAll}>
          <DoneForm today={today} busy={false} onCancel={closeAll} onSubmit={(values) => markDone(dialog.row, values)} />
        </Overlay>
      )}
    </div>
  );
}

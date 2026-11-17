import { useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import CheckButton from '../components/trackers/CheckButton.jsx';
import SkipDialog from '../components/trackers/SkipDialog.jsx';
import { useResource } from '../hooks/useResource.js';
import { useOnline } from '../hooks/useOnline.js';
import { useTrackerActions } from '../hooks/useTrackerActions.js';
import { addDays, longDate } from '../lib/dates.js';
import { PART_LABEL, canEditDay, dayHeading, daySummary, quotaText, streakText } from '../lib/trackers.js';

export function LoadError({ what, message, onRetry }) {
  return (
    <div className="rd-card home__error" role="alert">
      <Icon name="alert" size={22} />
      <div className="rd-fill">
        <div className="allclear__title">Couldn’t load {what}</div>
        <div className="rd-t-secondary rd-muted">{message}</div>
      </div>
      <button type="button" className="rd-btn" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function NoTrackers({ onNew, disabled }) {
  return (
    <div className="rd-card seg-empty">
      <div className="allclear__title">No trackers yet.</div>
      <p className="rd-t-secondary rd-muted">
        Trackers are for the things you do again and again: a pill every other day, meditation, trash out on Tuesday, four workouts a week. Tick them off and watch the streak grow.
      </p>
      <button type="button" className="rd-btn rd-btn--primary" disabled={disabled} onClick={onNew}>
        <Icon name="plus" size={16} />
        New tracker
      </button>
    </div>
  );
}

function Ring({ done, total, state }) {
  const pct = total ? Math.round((100 * done) / total) : state === 'win' ? 100 : 0;
  return (
    <div className={`trk-ring ${state === 'win' ? 'trk-ring--win' : ''}`} style={{ '--p': pct }} role="img" aria-label={total ? `${done} of ${total} done` : 'Nothing fixed today'}>
      <span className="trk-ring__text" aria-hidden="true">
        {total ? `${done}/${total}` : state === 'win' ? <Icon name="check" size={22} /> : '–'}
      </span>
    </div>
  );
}

function metaFor(row) {
  const bits = [];
  if (row.kind === 'quota') bits.push(quotaText(row.quota));
  else bits.push(row.scheduleText);
  const streak = streakText(row.streak);
  if (streak) bits.push(streak);
  if (row.scope === 'household') bits.push(row.state === 'done' && row.checkedBy ? `Done by ${row.checkedBy}` : 'Household');
  return bits.filter(Boolean).join(' · ');
}

function Row({ row, date, today, disabled, onTick, onUntick, onSkip, onEdit }) {
  const editable = canEditDay(date, today);
  const done = row.state === 'done';
  const skipped = row.state === 'skipped';
  const tag = row.state === 'missed' ? 'Missed' : null;
  const goalMet = row.kind === 'quota' && row.quota?.status === 'met' && !done && !skipped;
  const dayWord = dayHeading(date, today).toLowerCase();
  return (
    <li className={`trk-row trk-row--${row.state}`}>
      <CheckButton
        checked={done}
        disabled={disabled || !editable || skipped}
        label={done ? `Undo ${row.title}, ${dayWord}` : `Mark ${row.title} done, ${dayWord}`}
        onClick={() => (done ? onUntick(row) : onTick(row))}
      />
      <div className="trk-row__body">
        <button type="button" className="trk-row__title" onClick={() => onEdit(row.id)}>
          {row.title}
        </button>
        <span className="trk-row__meta rd-t-secondary rd-quiet">{metaFor(row)}</span>
        {skipped && <span className="trk-row__meta rd-t-secondary rd-muted">Skipped{row.skipNote ? `: ${row.skipNote}` : ''}</span>}
        {goalMet && <span className="trk-row__meta rd-t-secondary rd-muted">Goal reached for this week. Extra days are a bonus.</span>}
      </div>
      {tag && <span className="rd-tag rd-tag--overdue trk-row__tag">{tag}</span>}
      {skipped && editable && (
        <button type="button" className="rd-btn rd-btn--ghost rd-btn--sm trk-row__action" disabled={disabled} onClick={() => onUntick(row)}>
          Undo skip
        </button>
      )}
      {!done && !skipped && editable && (
        <button type="button" className="rd-btn rd-btn--ghost rd-btn--sm trk-row__action" disabled={disabled} onClick={() => onSkip(row)}>
          Skip
        </button>
      )}
    </li>
  );
}

export default function TrackersToday() {
  const { openForm, trackers, listLoaded } = useOutletContext();
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  const asked = params.get('date');
  const { data, loading, error, reload, setData } = useResource(`/api/trackers/day${asked ? `?date=${encodeURIComponent(asked)}` : ''}`);
  const actions = useTrackerActions({ onDay: (day) => setData({ day }) });
  const [skipFor, setSkipFor] = useState(null);

  if (!data) {
    if (loading) {
      return (
        <div aria-busy="true" aria-label="Loading trackers" className="trk-stack">
          <Skeleton height={84} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </div>
      );
    }
    return <LoadError what="your trackers" message={error} onRetry={reload} />;
  }

  const day = data.day;
  const { date, today, summary } = day;
  const earliest = addDays(today, -6);
  const go = (to) => setParams(to === today ? {} : { date: to }, { replace: true });
  const edit = (id) => {
    const found = trackers.find((t) => t.id === id);
    if (found) openForm(found);
  };
  const off = (row) => !online || actions.isPending(row.id, date);
  const empty = day.groups.length === 0;

  return (
    <div className="trk-stack">
      <div className="trk-daynav">
        <button type="button" className="rd-btn rd-btn--ghost trk-daynav__btn" aria-label="Previous day" disabled={date <= earliest} onClick={() => go(addDays(date, -1))}>
          <Icon name="back" size={18} />
        </button>
        <div className="rd-fill trk-daynav__label">
          <h2 className="rd-t-item-title trk-daynav__title">{dayHeading(date, today)}</h2>
          <span className="rd-t-secondary rd-quiet">{longDate(date)}</span>
        </div>
        {date !== today && (
          <button type="button" className="rd-btn rd-btn--sm" onClick={() => go(today)}>
            Today
          </button>
        )}
        <button type="button" className="rd-btn rd-btn--ghost trk-daynav__btn" aria-label="Next day" disabled={date >= today} onClick={() => go(addDays(date, 1))}>
          <span className="trk-flip">
            <Icon name="back" size={18} />
          </span>
        </button>
      </div>

      {!empty || summary.state === 'win' ? (
        <section className={`rd-card trk-summary ${summary.state === 'win' ? 'trk-summary--win' : ''}`} aria-label="Summary of the day">
          <Ring done={summary.done} total={summary.total} state={summary.state} />
          <div className="rd-fill">
            <div className="allclear__title">{daySummary(summary)}</div>
            <div className="rd-t-secondary rd-muted">
              {streakText({ current: day.dayStreak.current, unit: 'days' }) ? `${day.dayStreak.current} winning ${day.dayStreak.current === 1 ? 'day' : 'days'} in a row` : 'Win a day by finishing everything on it'}
              {summary.skipped ? ` · ${summary.skipped} skipped` : ''}
            </div>
          </div>
          <Link to="/trackers/progress" className="rd-btn rd-btn--sm">
            Progress
          </Link>
        </section>
      ) : null}

      {trackers.length === 0 && listLoaded ? (
        <NoTrackers onNew={() => openForm(null)} disabled={!online} />
      ) : empty ? (
        <div className="rd-card trk-empty">
          <div className="allclear__title">Nothing is scheduled {date === today ? 'today' : 'on this day'}.</div>
          <p className="rd-t-secondary rd-muted">Enjoy it. Your trackers will show up on the days they are due.</p>
        </div>
      ) : (
        day.groups.map((g) => (
          <section key={g.part} className="home__section" aria-labelledby={`part-${g.part}`}>
            <h3 id={`part-${g.part}`} className="rd-overline">
              {PART_LABEL[g.part]}
            </h3>
            <ul className="home__list home__list--tight rd-card trk-list">
              {g.rows.map((row) => (
                <Row
                  key={row.id}
                  row={row}
                  date={date}
                  today={today}
                  disabled={off(row)}
                  onTick={(r) => actions.tick(r.id, date)}
                  onUntick={(r) => actions.untick(r.id, date)}
                  onSkip={setSkipFor}
                  onEdit={edit}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {skipFor && (
        <SkipDialog
          row={skipFor}
          dayLabel={dayHeading(date, today)}
          busy={actions.isPending(skipFor.id, date)}
          onClose={() => setSkipFor(null)}
          onSkip={async (note) => {
            const r = await actions.skip(skipFor.id, date, note);
            if (r) setSkipFor(null);
          }}
        />
      )}
    </div>
  );
}


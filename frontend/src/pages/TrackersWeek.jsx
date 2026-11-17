import { useOutletContext, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useResource } from '../hooks/useResource.js';
import { useOnline } from '../hooks/useOnline.js';
import { useTrackerActions } from '../hooks/useTrackerActions.js';
import { addDays, monthDay, weekdayLong, weekdayShort } from '../lib/dates.js';
import { PART_LABEL, STATE_LABEL, WEEK_STATUS, canEditDay, quotaText, weekHeading, weekLabel } from '../lib/trackers.js';
import { LoadError, NoTrackers } from './TrackersToday.jsx';

const CELL_ICON = { done: 'check', missed: 'x' };

function Cell({ row, day, today, disabled, onToggle }) {
  const { date, state } = day;
  const editable = canEditDay(date, today) && state !== 'off' && state !== 'upcoming';
  const label = `${row.title}, ${weekdayLong(date)} ${monthDay(date)}: ${STATE_LABEL[state]}${editable ? (state === 'done' || state === 'skipped' ? '. Press to undo' : '. Press to mark done') : ''}`;
  return (
    <div className="trk-cellwrap">
      <span className={`trk-cell__dow ${date === today ? 'trk-cell__dow--today' : ''}`}>{weekdayShort(date).slice(0, 1)}</span>
      <button type="button" className={`trk-cell trk-cell--${state}`} aria-label={label} disabled={disabled || !editable} onClick={() => onToggle(row, day)}>
        <span aria-hidden="true">{CELL_ICON[state] ? <Icon name={CELL_ICON[state]} size={16} /> : state === 'skipped' ? '–' : ''}</span>
      </button>
    </div>
  );
}

export default function TrackersWeek() {
  const { openForm, trackers, listLoaded } = useOutletContext();
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  const asked = params.get('week');
  const { data, loading, error, reload } = useResource(`/api/trackers/week${asked ? `?start=${encodeURIComponent(asked)}` : ''}`);
  const actions = useTrackerActions({ onDay: () => reload() });

  if (!data) {
    if (loading) {
      return (
        <div aria-busy="true" aria-label="Loading the week" className="trk-stack">
          <Skeleton height={72} />
          <Skeleton height={96} />
          <Skeleton height={96} />
        </div>
      );
    }
    return <LoadError what="the week" message={error} onRetry={reload} />;
  }

  const w = data.week;
  const go = (start) => setParams(start === w.currentWeek ? {} : { week: start }, { replace: true });
  const toggle = (row, day) => (day.state === 'done' || day.state === 'skipped' ? actions.untick(row.id, day.date) : actions.tick(row.id, day.date));

  return (
    <div className="trk-stack">
      <div className="trk-daynav">
        <button type="button" className="rd-btn rd-btn--ghost trk-daynav__btn" aria-label="Previous week" onClick={() => go(addDays(w.weekStart, -7))}>
          <Icon name="back" size={18} />
        </button>
        <div className="rd-fill trk-daynav__label">
          <h2 className="rd-t-item-title trk-daynav__title">{weekHeading(w.weekStart, w.currentWeek)}</h2>
          <span className="rd-t-secondary rd-quiet">{weekLabel(w.weekStart)}</span>
        </div>
        {w.weekStart !== w.currentWeek && (
          <button type="button" className="rd-btn rd-btn--sm" onClick={() => go(w.currentWeek)}>
            This week
          </button>
        )}
        <button type="button" className="rd-btn rd-btn--ghost trk-daynav__btn" aria-label="Next week" disabled={w.weekStart >= addDays(w.currentWeek, 7)} onClick={() => go(addDays(w.weekStart, 7))}>
          <span className="trk-flip">
            <Icon name="back" size={18} />
          </span>
        </button>
      </div>

      <section className={`rd-card trk-glance ${w.status === 'met' ? 'trk-summary--win' : ''}`} aria-label="The week at a glance">
        <div className="trk-glance__head">
          <span className="allclear__title">{WEEK_STATUS[w.status]}</span>
          <span className="rd-t-secondary rd-quiet">All your trackers, day by day</span>
        </div>
        <div className="trk-strip" role="list" aria-label="Each day of the week">
          {w.days.map((d) => (
            <div key={d.date} role="listitem" className="trk-cellwrap">
              <span className={`trk-cell__dow ${d.date === w.today ? 'trk-cell__dow--today' : ''}`}>{weekdayShort(d.date).slice(0, 1)}</span>
              <span className={`trk-dot trk-dot--${d.state}`} role="img" aria-label={`${weekdayLong(d.date)} ${monthDay(d.date)}: ${{ win: 'won', miss: 'missed something', rest: 'nothing to do', open: 'still open', upcoming: 'coming up' }[d.state]}${d.total ? `, ${d.done} of ${d.total} done` : ''}`}>
                {d.state === 'win' && <Icon name="check" size={14} />}
                {d.state === 'miss' && <Icon name="x" size={14} />}
              </span>
            </div>
          ))}
        </div>
      </section>

      {w.rows.length === 0 ? (
        trackers.length === 0 && listLoaded ? (
          <NoTrackers onNew={() => openForm(null)} disabled={!online} />
        ) : (
          <div className="rd-card trk-empty">
            <div className="allclear__title">Nothing was scheduled this week.</div>
          </div>
        )
      ) : (
        <ul className="home__list home__list--tight">
          {w.rows.map((row) => (
            <li key={row.id} className="rd-card trk-weekrow">
              <div className="trk-weekrow__head">
                <span className="trk-weekrow__title">{row.title}</span>
                <span className="rd-t-secondary rd-quiet">
                  {[PART_LABEL[row.part], row.quota ? quotaText(row.quota) : row.scheduleText, row.scope === 'household' ? 'Household' : null].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className="trk-strip">
                {row.days.map((day) => (
                  <Cell key={day.date} row={row} day={day} today={w.today} disabled={!online || actions.isPending(row.id, day.date)} onToggle={toggle} />
                ))}
              </div>
              {row.quota?.atRisk && <p className="rd-t-secondary trk-weekrow__warn">{row.quota.daysLeft} {row.quota.daysLeft === 1 ? 'day' : 'days'} left and {row.quota.required - row.quota.done} to go.</p>}
            </li>
          ))}
        </ul>
      )}
      <p className="rd-t-secondary rd-quiet">You can tick or undo today and the six days before it.</p>
    </div>
  );
}

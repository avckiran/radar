import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useResource } from '../hooks/useResource.js';
import { useOnline } from '../hooks/useOnline.js';
import { longDate, monthDay, weekdayLong } from '../lib/dates.js';
import { PART_LABEL, RANGES, STATUS_LABEL, streakText } from '../lib/trackers.js';
import { LoadError, NoTrackers } from './TrackersToday.jsx';

function Tile({ label, value, hint }) {
  return (
    <div className="rd-card trk-tile">
      <span className="rd-t-secondary rd-muted">{label}</span>
      <span className="trk-tile__value">{value}</span>
      {hint && <span className="rd-t-secondary rd-quiet">{hint}</span>}
    </div>
  );
}

const HEAT_WORD = { win: 'won', miss: 'missed something', rest: 'nothing to do', open: 'still open', upcoming: 'coming up' };

function Heatmap({ weeks, today }) {
  const all = weeks.flatMap((w) => w.days);
  const wins = all.filter((d) => d.state === 'win').length;
  const misses = all.filter((d) => d.state === 'miss').length;
  return (
    <section className="rd-card trk-heat" aria-labelledby="heat-h">
      <h3 id="heat-h" className="rd-overline">
        The last 12 weeks
      </h3>
      <div className="trk-heat__grid" role="img" aria-label={`The last 12 weeks: ${wins} days won, ${misses} days with something missed`}>
        {weeks.map((w) => (
          <div key={w.weekStart} className="trk-heat__week">
            {w.days.map((d) => (
              <span key={d.date} className={`trk-heat__cell trk-dot--${d.state} ${d.date === today ? 'trk-heat__cell--today' : ''}`} title={`${weekdayLong(d.date)} ${monthDay(d.date)}: ${HEAT_WORD[d.state]}`} />
            ))}
          </div>
        ))}
      </div>
      <div className="trk-legend rd-t-secondary rd-quiet" aria-hidden="true">
        <span><i className="trk-dot trk-dot--win trk-legend__dot" /> Won</span>
        <span><i className="trk-dot trk-dot--miss trk-legend__dot" /> Missed</span>
        <span><i className="trk-dot trk-dot--rest trk-legend__dot" /> Nothing to do</span>
      </div>
    </section>
  );
}

function Trend({ trend }) {
  return (
    <div className="trk-trend" role="img" aria-label={`Weekly completion, oldest first: ${trend.map((t) => (t.pct == null ? 'no data' : `${t.pct} percent`)).join(', ')}`}>
      {trend.map((t) => (
        <span key={t.weekStart} className="trk-trend__col">
          <span className={`trk-trend__bar ${t.pct == null ? 'trk-trend__bar--none' : ''}`} style={{ height: `${t.pct == null ? 6 : Math.max(6, t.pct * 0.32)}px` }} />
        </span>
      ))}
    </div>
  );
}

function Card({ card, onFilter, onEdit, canEdit, filtered }) {
  const streak = streakText(card.streak);
  return (
    <li className="rd-card trk-card">
      <div className="trk-card__head">
        <div className="rd-fill">
          <div className="trk-card__title">{card.title}</div>
          <div className="rd-t-secondary rd-quiet">
            {[PART_LABEL[card.part], card.scheduleText, card.status !== 'active' ? STATUS_LABEL[card.status] : null, card.scope === 'household' ? 'Household' : null].filter(Boolean).join(' · ')}
          </div>
        </div>
        <Trend trend={card.trend} />
      </div>
      <dl className="trk-card__stats">
        <div>
          <dt className="rd-t-secondary rd-muted">Streak</dt>
          <dd>{streak ?? 'None yet'}</dd>
        </div>
        <div>
          <dt className="rd-t-secondary rd-muted">Best</dt>
          <dd>{card.streak.best ? `${card.streak.best} ${card.streak.unit === 'weeks' ? 'wk' : card.streak.best === 1 ? 'day' : 'days'}` : '–'}</dd>
        </div>
        <div>
          <dt className="rd-t-secondary rd-muted">Done</dt>
          <dd>{card.completion == null ? '–' : `${card.completion}%`}</dd>
        </div>
      </dl>
      <p className="rd-t-secondary rd-quiet trk-card__counts">
        {card.done} done · {card.missed} missed{card.skipped ? ` · ${card.skipped} skipped` : ''}
      </p>
      <div className="trk-card__actions">
        {!filtered && (
          <button type="button" className="rd-btn rd-btn--sm" onClick={() => onFilter(card.id)}>
            Show only this
          </button>
        )}
        {canEdit && (
          <button type="button" className="rd-btn rd-btn--sm" onClick={() => onEdit(card.id)}>
            <Icon name="edit" size={16} />
            Edit
          </button>
        )}
      </div>
    </li>
  );
}

export default function TrackersProgress() {
  const { openForm, trackers, listLoaded } = useOutletContext();
  const online = useOnline();
  const [range, setRange] = useState('30');
  const [trackerId, setTrackerId] = useState('');
  const query = `range=${range}${trackerId ? `&trackerId=${trackerId}` : ''}`;
  const { data, loading, error, reload } = useResource(`/api/trackers/progress?${query}`);

  if (!data) {
    if (loading) {
      return (
        <div aria-busy="true" aria-label="Loading progress" className="trk-stack">
          <Skeleton height={44} />
          <Skeleton height={96} />
          <Skeleton height={160} />
        </div>
      );
    }
    return <LoadError what="your progress" message={error} onRetry={reload} />;
  }

  const p = data.progress;
  const s = p.summary;
  const edit = (id) => {
    const found = trackers.find((t) => t.id === id);
    if (found) openForm(found);
  };
  const editable = (id) => trackers.some((t) => t.id === id && t.status !== 'finished');

  return (
    <div className="trk-stack">
      <div className="trk-filters">
        <div className="rd-segmented trk-segmented" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.key} type="button" aria-pressed={range === r.key} onClick={() => setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        <label className="trk-filters__pick">
          <span className="sr-only">Show</span>
          <select className="rd-input trk-select" value={trackerId} onChange={(e) => setTrackerId(e.target.value)}>
            <option value="">All trackers</option>
            {trackers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!p.hasTrackers ? (
        trackers.length === 0 && listLoaded ? (
          <NoTrackers onNew={() => openForm(null)} disabled={!online} />
        ) : (
          <div className="rd-card trk-empty">
            <div className="allclear__title">Nothing to show for that tracker yet.</div>
          </div>
        )
      ) : (
        <>
          <section className="trk-tiles" aria-label="How you are doing">
            <Tile label="Day streak" value={s.dayStreak} hint={s.bestDayStreak ? `Best: ${s.bestDayStreak}` : 'Win a day to start one'} />
            <Tile label="Week streak" value={s.weekStreak} hint={s.bestWeekStreak ? `Best: ${s.bestWeekStreak}` : 'Win a week to start one'} />
            <Tile label="Done" value={s.completion == null ? '–' : `${s.completion}%`} hint={`${s.done} done, ${s.missed} missed`} />
            <Tile label="Days won" value={s.winDays} hint={`since ${longDate(p.from).replace(/^[A-Za-z]+, /, '')}`} />
          </section>
          {s.nextMilestone && (
            <p className="rd-t-secondary rd-muted trk-milestone">
              Next milestone: a {s.nextMilestone.target}-day streak, {s.nextMilestone.toGo} {s.nextMilestone.toGo === 1 ? 'day' : 'days'} to go.
            </p>
          )}
          {p.insights.length > 0 && (
            <ul className="rd-card trk-insights" aria-label="Things to notice">
              {p.insights.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <Heatmap weeks={p.heatmap} today={p.today} />
          <section className="home__section" aria-labelledby="by-tracker-h">
            <h3 id="by-tracker-h" className="rd-overline">
              By tracker
            </h3>
            <ul className="trk-cards">
              {p.cards.map((card) => (
                <Card key={card.id} card={card} filtered={Boolean(p.trackerId)} canEdit={editable(card.id)} onFilter={setTrackerId} onEdit={edit} />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

import { Link } from 'react-router-dom';
import Icon from '../Icon.jsx';
import { Box } from '../home/HomeBoxes.jsx';
import CheckButton from './CheckButton.jsx';
import { useOnline } from '../../hooks/useOnline.js';
import { useTrackerActions } from '../../hooks/useTrackerActions.js';
import { PART_LABEL, daySummary, quotaText } from '../../lib/trackers.js';

export default function HomeTrackers({ trackers, today }) {
  const online = useOnline();
  const actions = useTrackerActions();

  if (trackers.count === 0) {
    return (
      <Box id="trackers-h" title="Trackers today" to="/trackers" toLabel="Trackers">
        <p className="home__quiet rd-t-secondary rd-quiet">
          Nothing to track today. <Link to="/trackers/manage">Set up a tracker</Link> for the things you do again and again.
        </p>
      </Box>
    );
  }

  const open = trackers.rows.filter((r) => r.state === 'open' || r.state === 'idle').length;
  const won = trackers.summary.state === 'win';

  return (
    <Box id="trackers-h" title="Trackers today" count={won ? 0 : open} to="/trackers" toLabel="Open">
      <div className={`rd-card trk-home ${won ? 'trk-summary--win' : ''}`}>
        <p className="trk-home__summary rd-t-secondary rd-muted">
          {won && <Icon name="check" size={16} />} {daySummary(trackers.summary)}
          {trackers.dayStreak > 1 ? ` · ${trackers.dayStreak} days in a row` : ''}
        </p>
        <ul className="trk-home__list">
          {trackers.rows.map((r) => {
            const done = r.state === 'done';
            const skipped = r.state === 'skipped';
            return (
              <li key={r.id} className={`trk-row trk-row--${r.state} trk-row--home`}>
                <CheckButton
                  checked={done}
                  disabled={!online || skipped || actions.isPending(r.id, today)}
                  label={done ? `Undo ${r.title}` : `Mark ${r.title} done`}
                  onClick={() => (done ? actions.untick(r.id, today) : actions.tick(r.id, today))}
                />
                <div className="trk-row__body">
                  <span className="trk-row__title trk-row__title--plain">{r.title}</span>
                  <span className="trk-row__meta rd-t-secondary rd-quiet">
                    {skipped ? 'Skipped' : r.kind === 'quota' ? quotaText(r.quota) : PART_LABEL[r.part]}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        {trackers.more > 0 && (
          <Link to="/trackers" className="trk-home__more rd-t-secondary">
            + {trackers.more} more
          </Link>
        )}
      </div>
    </Box>
  );
}

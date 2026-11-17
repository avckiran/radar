import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Overlay from '../components/ui/Overlay.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import MoreMenu from '../components/shopping/MoreMenu.jsx';
import { apiDelete, apiPost } from '../lib/api.js';
import { useOnline } from '../hooks/useOnline.js';
import { useShellData } from '../hooks/useShellData.jsx';
import { monthDay } from '../lib/dates.js';
import { PART_LABEL, STATUS_LABEL, streakText } from '../lib/trackers.js';
import { LoadError, NoTrackers } from './TrackersToday.jsx';

const GROUPS = [
  { key: 'active', title: 'Active' },
  { key: 'upcoming', title: 'Starting soon' },
  { key: 'paused', title: 'Paused' },
  { key: 'finished', title: 'Finished' },
];

function ConfirmDialog({ title, text, confirm, danger, busy, onClose, onConfirm }) {
  return (
    <Overlay label={title} onClose={onClose}>
      <div className="waiting-form">
        <h2 className="rd-t-item-title waiting-form__title">{title}</h2>
        <p className="rd-t-secondary rd-muted trk-dialog__text">{text}</p>
        <div className="picker__buttons">
          <button type="button" data-autofocus className="rd-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={`rd-btn ${danger ? 'rd-btn--danger' : 'rd-btn--primary'}`} onClick={onConfirm} disabled={busy}>
            {confirm}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function when(t) {
  if (t.status === 'upcoming') return `Starts ${monthDay(t.startDate)}`;
  if (t.status === 'finished') return `Ended ${monthDay(t.endDate)}`;
  if (t.endDate) return `Ends ${monthDay(t.endDate)}`;
  return null;
}

export default function TrackersManage() {
  const { trackers, listLoaded, listError, reloadList, openForm } = useOutletContext();
  const online = useOnline();
  const toast = useToast();
  const { notifyChanged } = useShellData();
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  async function run(fn, message) {
    setBusy(true);
    try {
      await fn();
      setConfirm(null);
      if (message) toast.show(message);
      notifyChanged();
      reloadList();
    } catch (err) {
      toast.show(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!listLoaded) {
    return listError ? (
      <LoadError what="your trackers" message={listError} onRetry={reloadList} />
    ) : (
      <div aria-busy="true" aria-label="Loading trackers" className="trk-stack">
        <Skeleton height={72} />
        <Skeleton height={72} />
      </div>
    );
  }
  if (trackers.length === 0) return <NoTrackers onNew={() => openForm(null)} disabled={!online} />;

  const menuFor = (t) => {
    const items = [{ label: 'Edit', icon: 'edit', onClick: () => openForm(t) }];
    if (t.status === 'active' || t.status === 'upcoming') items.push({ label: 'Pause', icon: 'clock', onClick: () => run(() => apiPost(`/api/trackers/${t.id}/pause`), 'Paused. Paused days never count as missed') });
    if (t.status === 'paused') items.push({ label: 'Resume', icon: 'refresh', onClick: () => run(() => apiPost(`/api/trackers/${t.id}/resume`), 'Resumed') });
    if (t.status !== 'finished') items.push({ label: 'Stop tracking', icon: 'check', onClick: () => setConfirm({ kind: 'end', t }) });
    items.push({ label: 'Delete', icon: 'trash', danger: true, onClick: () => setConfirm({ kind: 'delete', t }) });
    return items;
  };

  return (
    <div className="trk-stack">
      {GROUPS.map((g) => {
        const rows = trackers.filter((t) => t.status === g.key);
        if (!rows.length) return null;
        return (
          <section key={g.key} className="home__section" aria-labelledby={`grp-${g.key}`}>
            <h3 id={`grp-${g.key}`} className="rd-overline">
              {g.title}
            </h3>
            <ul className="home__list home__list--tight">
              {rows.map((t) => (
                <li key={t.id} className="rd-card trk-manage">
                  <button type="button" className="trk-manage__main" onClick={() => openForm(t)} aria-label={`Edit ${t.title}`}>
                    <span className="trk-manage__title">{t.title}</span>
                    <span className="rd-t-secondary rd-quiet">
                      {[t.scheduleText, PART_LABEL[t.part], t.scope === 'household' ? 'Household' : null, when(t), streakText(t.streak), t.status === 'paused' ? STATUS_LABEL.paused : null].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                  <MoreMenu label={`More for ${t.title}`} items={menuFor(t)} disabled={!online || busy} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {confirm?.kind === 'end' && (
        <ConfirmDialog
          title={`Stop tracking “${confirm.t.title}”?`}
          text="It moves to Finished and keeps its history and streaks. It won’t show up on any day from now on."
          confirm="Stop tracking"
          busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={() => run(() => apiPost(`/api/trackers/${confirm.t.id}/end`), 'Tracker finished')}
        />
      )}
      {confirm?.kind === 'delete' && (
        <ConfirmDialog
          title={`Delete “${confirm.t.title}”?`}
          text="It disappears from every screen, including its history and streaks. Stopping it instead keeps the history."
          confirm="Delete"
          danger
          busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={() => run(() => apiDelete(`/api/trackers/${confirm.t.id}`), 'Tracker deleted')}
        />
      )}
      <p className="rd-t-secondary rd-quiet">
        <Icon name="clock" size={14} /> Pausing is for a holiday or a break: the days in between never count as missed.
      </p>
    </div>
  );
}

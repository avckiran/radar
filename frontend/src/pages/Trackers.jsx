import { useCallback, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import TrackerForm from '../components/trackers/TrackerForm.jsx';
import { useResource } from '../hooks/useResource.js';
import { useOnline } from '../hooks/useOnline.js';
import { useShellData } from '../hooks/useShellData.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

const TABS = [
  { to: '/trackers', label: 'Today', end: true },
  { to: '/trackers/week', label: 'Week' },
  { to: '/trackers/progress', label: 'Progress' },
  { to: '/trackers/manage', label: 'All' },
];

export default function Trackers() {
  useDocumentTitle('Trackers');
  const online = useOnline();
  const toast = useToast();
  const { notifyChanged } = useShellData();
  const list = useResource('/api/trackers');
  const [form, setForm] = useState(null);
  const trackers = list.data?.trackers ?? [];
  const today = list.data?.today;

  const openForm = useCallback((tracker) => setForm({ tracker }), []);
  const close = useCallback(() => setForm(null), []);

  return (
    <div className="page trk">
      <header className="page__header">
        <div className="shop-head">
          <h1 className="page__title rd-t-screen-title rd-fill rd-ell">Trackers</h1>
          <button type="button" className="rd-btn rd-btn--primary" disabled={!online || !today} onClick={() => openForm(null)}>
            <Icon name="plus" size={18} />
            New tracker
          </button>
        </div>
        <p className="rd-t-secondary rd-quiet page__subtitle">Things you do again and again, so nothing gets forgotten.</p>
      </header>

      <nav className="trk-tabs" aria-label="Trackers">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className="trk-tab">
            {t.label}
          </NavLink>
        ))}
      </nav>

      <Outlet context={{ openForm, trackers, listLoaded: Boolean(list.data), listError: list.error, reloadList: list.reload }} />

      {form && today && (
        <TrackerForm
          tracker={form.tracker}
          today={today}
          onClose={close}
          onSaved={(saved, isNew) => {
            close();
            toast.show(isNew ? 'Tracker created' : 'Tracker saved');
            notifyChanged();
            list.reload();
          }}
        />
      )}
    </div>
  );
}

import { useCallback } from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import HouseholdSection from '../components/settings/HouseholdSection.jsx';
import SegmentsSection from '../components/settings/SegmentsSection.jsx';
import DigestSection from '../components/settings/DigestSection.jsx';
import DataSection from '../components/settings/DataSection.jsx';
import { apiDelete, apiPatch, apiPost } from '../lib/api.js';
import { plural } from '../lib/text.js';
import { useResource } from '../hooks/useResource.js';
import { useShellData } from '../hooks/useShellData.jsx';
import { useOnline } from '../hooks/useOnline.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

const SECTIONS = [
  { id: 'household', label: 'Household and members', icon: 'user' },
  { id: 'segments', label: 'Segments', icon: 'folder' },
  { id: 'digest', label: 'Daily digest and nudges', icon: 'mail' },
  { id: 'data', label: 'Your data', icon: 'download' },
];

function SettingsSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading Settings">
      <Skeleton width={140} height={28} />
      <Skeleton height={64} />
      <Skeleton height={180} />
      <Skeleton height={120} />
    </div>
  );
}

export default function Settings() {
  useDocumentTitle('Settings');
  const { section } = useParams();
  const toast = useToast();
  const online = useOnline();
  const wide = useMediaQuery('(min-width: 768px)');
  const { notifyChanged } = useShellData();
  const { signOut } = useAuth();
  const { data, loading, error, reload } = useResource('/api/settings');

  // Runs a change, then refreshes this screen and the sidebar. Forms read { ok, error } to show what went wrong.
  const run = useCallback(
    async (action, message) => {
      try {
        const result = await action();
        await reload();
        notifyChanged();
        if (message) toast.show(typeof message === 'function' ? message(result) : message);
        return { ok: true, result };
      } catch (err) {
        if (err.status === 409) reload();
        return { ok: false, error: err.message };
      }
    },
    [reload, notifyChanged, toast]
  );

  const save = useCallback(
    async (patch, message) => {
      const result = await run(() => apiPatch('/api/settings', patch), message);
      if (!result.ok) toast.show(result.error);
      return result;
    },
    [run, toast]
  );

  if (!data) {
    if (loading) return <SettingsSkeleton />;
    return (
      <div className="page">
        <div className="rd-card home__error" role="alert">
          <Icon name={online ? 'alert' : 'offline'} size={22} />
          <div className="rd-fill">
            <div className="allclear__title">Couldn’t load Settings</div>
            <div className="rd-t-secondary rd-muted">{error}</div>
          </div>
          <button type="button" className="rd-btn" onClick={reload}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const canEdit = online;
  const parts = {
    household: <HouseholdSection data={data} wide={wide} canEdit={canEdit} onSave={save} />,
    segments: (
      <SegmentsSection
        data={data}
        canEdit={canEdit}
        onCreate={(v) => run(() => apiPost('/api/segments', v), `Added ${v.name}`)}
        onUpdate={(id, v) => run(() => apiPatch(`/api/segments/${id}`, v), 'Segment saved')}
        onReorder={async (ids) => {
          const result = await run(() => apiPost('/api/segments/reorder', { ids }));
          if (!result.ok) toast.show(result.error);
          return result;
        }}
        onDelete={(segment, body) =>
          run(
            () => apiDelete(`/api/segments/${segment.id}`, body),
            (r) =>
              r.moved
                ? `Deleted ${segment.name}. ${plural(r.moved, 'item')} moved.`
                : r.deleted
                  ? `Deleted ${segment.name} and ${plural(r.deleted, 'item')}.`
                  : `Deleted ${segment.name}.`
          )
        }
      />
    ),
    digest: <DigestSection data={data} wide={wide} canEdit={canEdit} onSave={save} />,
    data: (
      <DataSection
        data={data}
        canEdit={canEdit}
        online={online}
        onNotify={toast.show}
        onDeleteArchived={(count) => run(() => apiDelete('/api/items/archived', { count }), (r) => `Permanently deleted ${plural(r.deleted, 'item')}`)}
      />
    ),
  };

  if (!wide) {
    if (section) return <Navigate to="/settings" replace />;
    return (
      <div className="page settings">
        <header className="page__header">
          <h1 className="page__title rd-t-screen-title">Settings</h1>
        </header>
        {!online && <p className="rd-t-secondary rd-muted settings__offline">You’re offline, so Settings is read-only.</p>}
        {SECTIONS.map((s) => (
          <div key={s.id} className="settings__block">
            {parts[s.id]}
          </div>
        ))}
        <button type="button" className="rd-btn settings__signout" onClick={signOut}>
          Sign out
        </button>
      </div>
    );
  }

  const current = SECTIONS.find((s) => s.id === section);
  if (!current) return <Navigate to={`/settings/${SECTIONS[0].id}`} replace />;

  return (
    <div className="page settings">
      <header className="page__header">
        <h1 className="page__title rd-t-screen-title">Settings</h1>
        {!online && <p className="rd-t-secondary rd-muted">You’re offline, so Settings is read-only.</p>}
      </header>
      <div className="settings__wide">
        <nav className="settings__nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <NavLink key={s.id} to={`/settings/${s.id}`} className="rd-nav" replace>
              <Icon name={s.icon} />
              <span className="rd-fill">{s.label}</span>
            </NavLink>
          ))}
          <button type="button" className="rd-btn settings__signout" onClick={signOut}>
            Sign out
          </button>
        </nav>
        <div className="settings__content">{parts[current.id]}</div>
      </div>
    </div>
  );
}

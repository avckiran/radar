import { useState } from 'react';
import { Card, Group, NameForm, Row, SheetFrame } from './SettingsParts.jsx';

function initials(name) {
  return (name || '?').trim().slice(0, 1).toUpperCase();
}

export default function HouseholdSection({ data, wide, canEdit, onSave }) {
  const [editing, setEditing] = useState(false);
  const { household, members, me } = data;

  async function save(name) {
    const result = await onSave({ householdName: name }, 'Household name saved');
    if (result.ok) setEditing(false);
    return result;
  }

  return (
    <>
      <Group title="Household">
        <Card>
          {wide ? (
            <div className="settings-pad">
              <NameForm label="Household name" value={household.name} maxLength={60} disabled={!canEdit} onSave={save} inline />
            </div>
          ) : (
            <Row label="Household name" value={household.name} onClick={() => setEditing(true)} disabled={!canEdit} />
          )}
        </Card>
      </Group>

      <Group
        title="Members"
        note="Adding or removing people isn’t available yet. Both of you can see and change everything in the household."
      >
        <Card>
          <ul className="member-list">
            {members.map((m) => (
              <li key={m.id} className="settings-row member">
                <span className="rd-avatar member__avatar" aria-hidden="true">
                  {initials(m.displayName)}
                </span>
                <span className="settings-row__text rd-fill">
                  <span className="settings-row__label">
                    {m.displayName}
                    {m.id === me.id && <span className="rd-quiet"> · you</span>}
                  </span>
                  <span className="rd-t-secondary rd-muted settings-row__hint rd-ell">{m.email || `@${m.username}`}</span>
                </span>
                <span className="rd-nav__pill settings-row__pill">{m.isOwner ? 'Owner' : 'Member'}</span>
              </li>
            ))}
          </ul>
          <Row label="Invite a member" pill="Coming later" disabled />
        </Card>
      </Group>

      {editing && (
        <SheetFrame title="Household name" onClose={() => setEditing(false)}>
          <NameForm label="Household name" value={household.name} maxLength={60} onSave={save} autoFocus />
        </SheetFrame>
      )}
    </>
  );
}

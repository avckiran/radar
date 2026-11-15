import { useMemo } from 'react';
import { Card, Group, Stepper } from './SettingsParts.jsx';
import NotificationsGroup from './NotificationsGroup.jsx';
import { SEND_TIMES, digestLabel, zoneLabel, zoneOptions } from '../../lib/zones.js';

const SLOTS = [
  { key: 'morning', label: 'Morning', hint: 'Sent every day.' },
  { key: 'afternoon', label: 'Afternoon', hint: 'Only if something needs you.' },
  { key: 'evening', label: 'Evening', hint: 'Only if something needs you.' },
];

function timeChoices(current) {
  if (SEND_TIMES.some((t) => t.value === current)) return SEND_TIMES;
  return [...SEND_TIMES, { value: current, label: current }].sort((a, b) => a.value.localeCompare(b.value));
}

export default function DigestSection({ data, wide, canEdit, onSave, onRun, onNotify }) {
  const { household, me } = data;
  const zones = useMemo(() => zoneOptions(household.timeZone), [household.timeZone]);
  const masterOn = me.digestEnabled !== false;
  const noEmail = me.hasEmail === false;
  const slots = me.digestSlots ?? { morning: { enabled: true, push: false, time: me.digestTime }, afternoon: { enabled: false, push: false, time: '14:00' }, evening: { enabled: false, push: false, time: '18:00' } };
  const noDevice = (me.pushDevices ?? []).length === 0;
  const pushWanted = SLOTS.some((s) => slots[s.key].push);

  const saveSlot = (key, change, message) => onSave({ digestSlots: { [key]: change } }, message);

  const masterSwitch = (
    <input
      id="digest-enabled"
      type="checkbox"
      className="settings-check"
      checked={masterOn}
      disabled={!canEdit}
      onChange={(e) => onSave({ digestEnabled: e.target.checked }, e.target.checked ? 'Daily emails and notifications turned on' : 'Daily emails and notifications turned off')}
    />
  );

  const slotControls = (slot) => {
    const value = slots[slot.key];
    const off = !masterOn || (!value.enabled && !value.push);
    const locked = !canEdit || !masterOn;
    return {
      email: (
        <label className="settings-check-line" htmlFor={`digest-${slot.key}-on`}>
          <input
            id={`digest-${slot.key}-on`}
            type="checkbox"
            className="settings-check"
            aria-label={`${slot.label} email`}
            checked={value.enabled}
            disabled={locked}
            onChange={(e) => saveSlot(slot.key, { enabled: e.target.checked }, `${slot.label} email turned ${e.target.checked ? 'on' : 'off'}`)}
          />
          Email
        </label>
      ),
      push: (
        <label className="settings-check-line" htmlFor={`digest-${slot.key}-push`}>
          <input
            id={`digest-${slot.key}-push`}
            type="checkbox"
            className="settings-check"
            aria-label={`${slot.label} notification`}
            checked={value.push}
            disabled={locked}
            onChange={(e) => saveSlot(slot.key, { push: e.target.checked }, `${slot.label} notification turned ${e.target.checked ? 'on' : 'off'}`)}
          />
          Notification
        </label>
      ),
      time: (
        <select
          id={`digest-${slot.key}-time`}
          className="rd-input settings-select"
          aria-label={`${slot.label} time`}
          value={value.time}
          disabled={!canEdit || off}
          onChange={(e) => saveSlot(slot.key, { time: e.target.value }, `${slot.label} time saved`)}
        >
          {timeChoices(value.time).map((t) => (
            <option key={t.value} value={t.value}>
              {t.value === value.time ? digestLabel(t.value, household.timeZone) : t.label}
            </option>
          ))}
        </select>
      ),
      off,
    };
  };

  const zoneSelect = (
    <select
      id="digest-zone"
      className="rd-input settings-select"
      aria-label="Time zone"
      value={household.timeZone}
      disabled={!canEdit}
      onChange={(e) => onSave({ timeZone: e.target.value }, `Time zone set to ${zoneLabel(e.target.value)}`)}
    >
      <optgroup label="Common">
        {zones.common.map((z) => (
          <option key={z.value} value={z.value}>
            {z.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="All time zones">
        {zones.rest.map((z) => (
          <option key={z.value} value={z.value}>
            {z.label}
          </option>
        ))}
      </optgroup>
    </select>
  );

  const stepper = (
    <Stepper
      label="Nudge follow-ups after"
      value={household.nudgeDays}
      min={1}
      max={60}
      unit="day"
      disabled={!canEdit}
      onCommit={(n) => onSave({ nudgeDays: n }, `Nudging after ${n} ${n === 1 ? 'day' : 'days'}`)}
    />
  );

  const note = [
    noEmail
      ? 'There is no email address on your account yet, so no emails can be sent (notifications still can). The address is set by the owner in the server settings.'
      : 'Choose how you hear from RADAR (email, a notification, or both) and when. The afternoon and evening ones are skipped on days nothing needs you. Follow-ups that pass the nudge limit also show up as Needs attention on Home.',
    pushWanted && noDevice ? 'You chose notifications, but no device has them turned on yet. Turn them on in the next box.' : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
    <Group title="Emails, notifications and nudges" note={note}>
      <Card>
        <div className="settings-row">
          <label className="settings-row__text rd-fill" htmlFor="digest-enabled">
            <span className="settings-row__label">Daily emails and notifications</span>
            <span className="rd-t-secondary rd-muted settings-row__hint">{masterOn ? 'On. Turn off to stop all three times of day.' : 'Off. You will not get any emails or notifications.'}</span>
          </label>
          {masterSwitch}
        </div>
        {SLOTS.map((slot) => {
          const c = slotControls(slot);
          return (
            <div key={slot.key} className={`settings-row digest-slot ${c.off ? 'digest-slot--off' : ''}`} role="group" aria-label={`${slot.label} summary`}>
              <span className="settings-row__text rd-fill">
                <span className="settings-row__label">{slot.label}</span>
                <span className="rd-t-secondary rd-muted settings-row__hint">{slot.hint}</span>
              </span>
              {c.time}
              <div className="digest-slot__channels">
                {c.email}
                {c.push}
              </div>
            </div>
          );
        })}
        {wide ? (
          <div className="settings-pad settings-fields">
            <div className="settings-field">
              <label className="rd-t-secondary rd-muted" htmlFor="digest-zone">
                Time zone
              </label>
              {zoneSelect}
            </div>
            <div className="settings-field">
              <span className="rd-t-secondary rd-muted">Nudge follow-ups after</span>
              {stepper}
            </div>
          </div>
        ) : (
          <>
            <div className="settings-row">
              <label className="settings-row__label rd-fill" htmlFor="digest-zone">
                Time zone
              </label>
              {zoneSelect}
            </div>
            <div className="settings-row">
              <span className="settings-row__label rd-fill">Nudge follow-ups after</span>
              {stepper}
            </div>
          </>
        )}
      </Card>
    </Group>
    <NotificationsGroup me={me} canEdit={canEdit} onRun={onRun} onNotify={onNotify} />
    </>
  );
}

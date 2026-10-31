import { useMemo } from 'react';
import { Card, Group, Stepper } from './SettingsParts.jsx';
import { SEND_TIMES, digestLabel, zoneLabel, zoneOptions } from '../../lib/zones.js';

export default function DigestSection({ data, wide, canEdit, onSave }) {
  const { household, me } = data;
  const zones = useMemo(() => zoneOptions(household.timeZone), [household.timeZone]);
  const times = useMemo(
    () => (SEND_TIMES.some((t) => t.value === me.digestTime) ? SEND_TIMES : [...SEND_TIMES, { value: me.digestTime, label: me.digestTime }].sort((a, b) => a.value.localeCompare(b.value))),
    [me.digestTime]
  );

  const timeSelect = (
    <select
      id="digest-time"
      className="rd-input settings-select"
      aria-label="Send time"
      value={me.digestTime}
      disabled={!canEdit}
      onChange={(e) => onSave({ digestTime: e.target.value }, 'Send time saved')}
    >
      {times.map((t) => (
        <option key={t.value} value={t.value}>
          {t.value === me.digestTime ? digestLabel(t.value, household.timeZone) : t.label}
        </option>
      ))}
    </select>
  );

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

  const onOff = (
    <input
      id="digest-enabled"
      type="checkbox"
      className="settings-check"
      checked={me.digestEnabled !== false}
      disabled={!canEdit}
      onChange={(e) => onSave({ digestEnabled: e.target.checked }, e.target.checked ? 'Daily email turned on' : 'Daily email turned off')}
    />
  );
  const noEmail = me.hasEmail === false;

  const stepper = (
    <Stepper
      label="Nudge Waiting items after"
      value={household.nudgeDays}
      min={1}
      max={60}
      unit="day"
      disabled={!canEdit}
      onCommit={(n) => onSave({ nudgeDays: n }, `Nudging after ${n} ${n === 1 ? 'day' : 'days'}`)}
    />
  );

  return (
    <Group
      title="Daily digest and nudges"
      note={
        noEmail
          ? 'There is no email address on your account yet, so no daily email can be sent. It is set by the owner in the server settings.'
          : 'One email a day at your send time, with what needs you. Waiting items that pass the nudge limit also show up as Needs attention on Home.'
      }
    >
      <Card>
        {wide ? (
          <div className="settings-pad settings-fields">
            <div className="settings-field">
              <label className="rd-t-secondary rd-muted" htmlFor="digest-enabled">
                Daily email
              </label>
              <span className="settings-check-line">
                {onOff}
                <span>{me.digestEnabled !== false ? 'On' : 'Off'}</span>
              </span>
            </div>
            <div className="settings-field">
              <label className="rd-t-secondary rd-muted" htmlFor="digest-time">
                Send time
              </label>
              {timeSelect}
            </div>
            <div className="settings-field">
              <label className="rd-t-secondary rd-muted" htmlFor="digest-zone">
                Time zone
              </label>
              {zoneSelect}
            </div>
            <div className="settings-field">
              <span className="rd-t-secondary rd-muted">Nudge Waiting items after</span>
              {stepper}
            </div>
          </div>
        ) : (
          <>
            <div className="settings-row">
              <label className="settings-row__label rd-fill" htmlFor="digest-enabled">
                Daily email
              </label>
              {onOff}
            </div>
            <div className="settings-row">
              <label className="settings-row__label rd-fill" htmlFor="digest-time">
                Send time
              </label>
              {timeSelect}
            </div>
            <div className="settings-row">
              <label className="settings-row__label rd-fill" htmlFor="digest-zone">
                Time zone
              </label>
              {zoneSelect}
            </div>
            <div className="settings-row">
              <span className="settings-row__label rd-fill">Nudge Waiting items after</span>
              {stepper}
            </div>
          </>
        )}
      </Card>
    </Group>
  );
}

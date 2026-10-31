import { useMemo } from 'react';
import { Card, Group, Stepper } from './SettingsParts.jsx';
import { SEND_TIMES, digestLabel, zoneLabel, zoneOptions } from '../../lib/zones.js';

const SLOTS = [
  { key: 'morning', label: 'Morning email', hint: 'Sent every day.' },
  { key: 'afternoon', label: 'Afternoon email', hint: 'Only if something needs you.' },
  { key: 'evening', label: 'Evening email', hint: 'Only if something needs you.' },
];

function timeChoices(current) {
  if (SEND_TIMES.some((t) => t.value === current)) return SEND_TIMES;
  return [...SEND_TIMES, { value: current, label: current }].sort((a, b) => a.value.localeCompare(b.value));
}

export default function DigestSection({ data, wide, canEdit, onSave }) {
  const { household, me } = data;
  const zones = useMemo(() => zoneOptions(household.timeZone), [household.timeZone]);
  const masterOn = me.digestEnabled !== false;
  const noEmail = me.hasEmail === false;
  const slots = me.digestSlots ?? { morning: { enabled: true, time: me.digestTime }, afternoon: { enabled: false, time: '14:00' }, evening: { enabled: false, time: '18:00' } };

  const saveSlot = (key, change, message) => onSave({ digestSlots: { [key]: change } }, message);

  const masterSwitch = (
    <input
      id="digest-enabled"
      type="checkbox"
      className="settings-check"
      checked={masterOn}
      disabled={!canEdit}
      onChange={(e) => onSave({ digestEnabled: e.target.checked }, e.target.checked ? 'Daily emails turned on' : 'Daily emails turned off')}
    />
  );

  const slotControls = (slot) => {
    const value = slots[slot.key];
    const lower = slot.label.toLowerCase();
    const off = !masterOn || !value.enabled;
    return {
      check: (
        <input
          id={`digest-${slot.key}-on`}
          type="checkbox"
          className="settings-check"
          aria-label={slot.label}
          checked={value.enabled}
          disabled={!canEdit || !masterOn}
          onChange={(e) => saveSlot(slot.key, { enabled: e.target.checked }, e.target.checked ? `${slot.label} turned on` : `${slot.label} turned off`)}
        />
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
      lower,
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
      label="Nudge Waiting items after"
      value={household.nudgeDays}
      min={1}
      max={60}
      unit="day"
      disabled={!canEdit}
      onCommit={(n) => onSave({ nudgeDays: n }, `Nudging after ${n} ${n === 1 ? 'day' : 'days'}`)}
    />
  );

  const note = noEmail
    ? 'There is no email address on your account yet, so no emails can be sent. It is set by the owner in the server settings.'
    : 'Choose which emails you get and when. The afternoon and evening emails are skipped on days nothing needs you. Waiting items that pass the nudge limit also show up as Needs attention on Home.';

  return (
    <Group title="Daily emails and nudges" note={note}>
      <Card>
        <div className="settings-row">
          <label className="settings-row__text rd-fill" htmlFor="digest-enabled">
            <span className="settings-row__label">Daily emails</span>
            <span className="rd-t-secondary rd-muted settings-row__hint">{masterOn ? 'On. Turn off to stop all three.' : 'Off. You will not get any of the three.'}</span>
          </label>
          {masterSwitch}
        </div>
        {SLOTS.map((slot) => {
          const c = slotControls(slot);
          return (
            <div key={slot.key} className={`settings-row digest-slot ${c.off ? 'digest-slot--off' : ''}`}>
              {c.check}
              <label className="settings-row__text rd-fill" htmlFor={`digest-${slot.key}-on`}>
                <span className="settings-row__label">{slot.label}</span>
                <span className="rd-t-secondary rd-muted settings-row__hint">{slot.hint}</span>
              </label>
              {c.time}
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
              <span className="rd-t-secondary rd-muted">Nudge Waiting items after</span>
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
              <span className="settings-row__label rd-fill">Nudge Waiting items after</span>
              {stepper}
            </div>
          </>
        )}
      </Card>
    </Group>
  );
}

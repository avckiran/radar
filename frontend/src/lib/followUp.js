import { followUpOptions } from './dates.js';

// Values for the "Following up with / Check back" fields, kept by the form that uses them
export const EMPTY_FOLLOW_UP = { waitingOn: '', choice: 'none', custom: '' };

export function followUpValues(value, today) {
  const options = followUpOptions(today);
  const checkBack = value.choice === 'pick' ? value.custom : (options.find((o) => o.key === value.choice)?.date ?? null);
  const invalid = value.choice === 'pick' && (!value.custom || value.custom < today);
  return { waitingOn: value.waitingOn.trim(), checkBack: checkBack || null, invalid };
}

// The note and the optional follow-up, as the server expects them for "done"
export function doneBody(note, followUp) {
  return {
    ...(note ? { note } : {}),
    ...(followUp ? { followUp: { waitingOn: followUp.waitingOn, checkBack: followUp.checkBack } } : {}),
  };
}

import { domainOf } from '../capture.js';
import { tagFor } from './itemView.js';

const OPEN = '\u0001';
const CLOSE = '\u0002';

export function toParts(marked) {
  const text = String(marked ?? '');
  const parts = [];
  let marking = false;
  let buffer = '';
  const flush = () => {
    if (buffer) parts.push({ text: buffer, mark: marking });
    buffer = '';
  };
  for (const char of text) {
    if (char === OPEN) {
      flush();
      marking = true;
    } else if (char === CLOSE) {
      flush();
      marking = false;
    } else buffer += char;
  }
  flush();
  return parts;
}

function plainExcerpt(text, max = 110) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

function squash(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function excerptLine(prefix, marked, source) {
  const parts = trimmed(toParts(marked));
  const plain = squash(parts.map((p) => p.text).join(''));
  const full = squash(source);
  return { prefix, parts, lead: !full.startsWith(plain), trail: !full.endsWith(plain) };
}

function trimmed(parts) {
  return parts.map((p) => ({ ...p, text: p.text.replace(/\s+/g, ' ') }));
}

export function buildSearchResult(row, { today, timeZone, eventDay }) {
  const hasTitle = row.in_title;
  const hasBody = row.in_body;
  const hasDescription = row.in_description;
  const hasHistory = Boolean(row.event_note);

  let matchedIn = 'link';
  if (hasTitle) matchedIn = 'title';
  else if (hasBody) matchedIn = 'notes';
  else if (hasDescription) matchedIn = 'description';
  else if (hasHistory) matchedIn = 'history';

  let line;
  if (hasBody) {
    line = excerptLine(hasTitle ? null : 'Matched in notes: ', row.body_marked, row.body);
  } else if (hasDescription) {
    line = excerptLine(hasTitle ? null : 'Matched in description: ', row.description_marked, row.description);
  } else if (hasTitle) {
    if (row.kind === 'link') line = { prefix: null, parts: [{ text: `Link · ${row.url ? domainOf(row.url) : ''}`, mark: false }] };
    else if (row.kind === 'note' && row.body) line = { prefix: null, parts: [{ text: plainExcerpt(row.body), mark: false }] };
    else line = { prefix: null, parts: [{ text: 'Matched in title', mark: false }] };
  } else if (hasHistory) {
    const by = row.event_by ? ` · ${row.event_by}` : '';
    line = { prefix: `History note, ${eventDay}${by}: “`, parts: trimmed(toParts(row.event_marked)), suffix: '”' };
  } else {
    line = { prefix: 'Matched in link: ', parts: [{ text: row.url ? domainOf(row.url) : '', mark: false }] };
  }

  let tag = tagFor(row, today, timeZone);
  if (!tag && row.kind === 'action') tag = { kind: 'later', label: 'Active' };

  return {
    id: row.id,
    kind: row.kind,
    state: row.state,
    title: toParts(row.title_marked).length ? toParts(row.title_marked) : [{ text: row.title, mark: false }],
    matchedIn,
    line,
    segment: row.segment_id ? { id: row.segment_id, name: row.segment_name, color: row.segment_color } : null,
    tag,
  };
}

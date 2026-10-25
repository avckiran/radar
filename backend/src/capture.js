import { withTransaction } from './db.js';
import { isValidYmd } from './dates.js';
import { HttpError, isUuid } from './lifecycle.js';

export const LIMITS = { title: 300, body: 20000, description: 1000, url: 2000 };
const KINDS = ['action', 'note', 'link'];

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeUrl(raw) {
  const value = text(raw);
  if (!value || /\s/.test(value)) return null;
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(value) && !/^https?:\/\//i.test(value)) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!url.hostname.includes('.')) return null;
  return url.toString().length <= LIMITS.url ? url.toString() : null;
}

export function domainOf(url) {
  return new URL(url).hostname.replace(/^www\./, '');
}

function titleFromBody(body) {
  const first = body.split('\n').find((line) => line.trim()) ?? '';
  return first.trim().slice(0, 80);
}

function tooLong(label, value, max) {
  if (value.length > max) throw new HttpError(400, `${label} is too long (${max} characters at most).`);
}

export function validateCapture(input) {
  const raw = input && typeof input === 'object' ? input : {};
  if (!isUuid(raw.id)) throw new HttpError(400, 'That request is missing an item ID.');
  if (!KINDS.includes(raw.kind)) throw new HttpError(400, 'Choose Action, Note or Link.');
  if (raw.segmentId != null && !isUuid(raw.segmentId)) throw new HttpError(400, 'That segment doesn’t exist.');

  const kind = raw.kind;
  let title = text(raw.title);
  const body = text(raw.body);
  const description = text(raw.description);
  let url = null;
  let dueDate = null;

  tooLong('The title', title, LIMITS.title);
  tooLong('The note', body, LIMITS.body);
  tooLong('The description', description, LIMITS.description);

  if (kind === 'action') {
    if (text(raw.url)) {
      url = normalizeUrl(raw.url);
      if (!url) throw new HttpError(400, 'That doesn’t look like a web address. Try something like example.com.');
    }
    if (!title) throw new HttpError(400, 'Add a title so you can find this later.');
    if (raw.dueDate != null && raw.dueDate !== '') {
      if (!isValidYmd(raw.dueDate) || raw.dueDate < '2000-01-01' || raw.dueDate > '2100-12-31') {
        throw new HttpError(400, 'That due date isn’t valid.');
      }
      dueDate = raw.dueDate;
    }
  }
  if (kind === 'note') {
    if (!title && !body) throw new HttpError(400, 'Write something in the note first.');
    if (!title) title = titleFromBody(body);
  }
  if (kind === 'link') {
    url = normalizeUrl(raw.url);
    if (!url) throw new HttpError(400, 'That doesn’t look like a web address. Try something like example.com.');
    if (!title) title = domainOf(url);
  }

  return {
    id: raw.id,
    kind,
    title,
    body: kind === 'note' && body ? body : null,
    url,
    description: kind === 'link' && description ? description : null,
    dueDate,
    segmentId: raw.segmentId ?? null,
  };
}

const SUMMARY = `id, kind, state, title, segment_id as "segmentId", due_date as "dueDate"`;

export async function createItem(db, { householdId, actorId }, input) {
  const item = validateCapture(input);
  return withTransaction(db, async (tx) => {
    let segment = null;
    if (item.segmentId) {
      const found = await tx.query(
        'select id, name, allowed_kinds from segments where id = $1 and household_id = $2 and deleted_at is null',
        [item.segmentId, householdId]
      );
      segment = found.rows[0];
      if (!segment) throw new HttpError(400, 'That segment doesn’t exist.');
      if (!segment.allowed_kinds.includes(item.kind)) {
        throw new HttpError(400, `${segment.name} doesn’t take ${item.kind === 'action' ? 'actions' : `${item.kind}s`}.`);
      }
    }
    const state = segment ? 'active' : 'inbox';
    const inserted = await tx.query(
      `insert into items (id, household_id, segment_id, kind, state, title, body, url, description, due_date, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (id) do nothing
       returning ${SUMMARY}`,
      [item.id, householdId, segment?.id ?? null, item.kind, state, item.title, item.body, item.url, item.description, item.dueDate, actorId]
    );
    if (inserted.rows[0]) {
      await tx.query(
        `insert into item_events (item_id, household_id, type, to_state, actor_id) values ($1, $2, 'created', $3, $4)`,
        [item.id, householdId, state, actorId]
      );
      return { created: true, item: inserted.rows[0], segmentName: segment?.name ?? null };
    }
    const existing = await tx.query(`select ${SUMMARY} from items where id = $1 and household_id = $2`, [item.id, householdId]);
    if (!existing.rows[0]) throw new HttpError(409, 'That item ID is already in use.');
    return { created: false, item: existing.rows[0], segmentName: null };
  });
}

import { todayInZone, monthDay } from './dates.js';
import { ITEM_COLUMNS, ITEM_JOINS } from './queries.js';
import { buildSearchResult } from './rules/searchView.js';

const LIMIT = 50;
export const MIN_LENGTH = 2;
export const MAX_QUERY = 100;

export function buildTsQuery(raw) {
  const words = String(raw ?? '')
    .slice(0, MAX_QUERY)
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu);
  if (!words) return '';
  const kept = words.length > 1 ? words.filter((w) => w.length > 1) : words;
  return kept
    .slice(0, 8)
    .map((w) => `${w}:*`)
    .join(' & ');
}

const MARKS = 'StartSel=\u0001, StopSel=\u0002';
const TITLE_OPTIONS = `${MARKS}, HighlightAll=true`;
const EXCERPT_OPTIONS = `${MARKS}, MaxWords=22, MinWords=8, ShortWord=2, MaxFragments=1`;

export async function runSearch(db, { householdId, timeZone }, rawQuery, now = new Date()) {
  const query = String(rawQuery ?? '').trim().slice(0, MAX_QUERY);
  const tsQuery = query.length >= MIN_LENGTH ? buildTsQuery(query) : '';
  const today = todayInZone(now, timeZone);
  if (!tsQuery) return { query, today, results: [], more: false };

  const found = await db.query(
    `with q as (select to_tsquery('english', $2::text) as query)
     select ${ITEM_COLUMNS},
            to_tsvector('english', i.title) @@ q.query as in_title,
            to_tsvector('english', coalesce(i.body, '')) @@ q.query as in_body,
            to_tsvector('english', coalesce(i.description, '')) @@ q.query as in_description,
            ts_headline('english', i.title, q.query, $3::text) as title_marked,
            case when i.body is not null then ts_headline('english', i.body, q.query, $4::text) end as body_marked,
            case when i.description is not null then ts_headline('english', i.description, q.query, $4::text) end as description_marked,
            ev.note as event_note, ev.at as event_at, ev.by as event_by, ev.marked as event_marked,
            ts_rank(i.search_vector, q.query) + case when ev.note is not null then 0.05 else 0 end as rank
       from q
       cross join items i
       ${ITEM_JOINS}
       left join lateral (
         select e.note, e.created_at as at, a.display_name as by,
                ts_headline('english', e.note, q.query, $4::text) as marked
           from item_events e
           left join users a on a.id = e.actor_id
          where e.item_id = i.id and e.type in ('follow_up', 'completed') and e.note_vector @@ q.query
          order by e.created_at desc
          limit 1
       ) ev on true
      where numnode(q.query) > 0
        and i.household_id = $1 and i.deleted_at is null
        and (i.search_vector @@ q.query or ev.note is not null)
      order by rank desc, i.updated_at desc, i.title
      limit ${LIMIT + 1}`,
    [householdId, tsQuery, TITLE_OPTIONS, EXCERPT_OPTIONS]
  );

  const rows = found.rows.slice(0, LIMIT);
  return {
    query,
    today,
    more: found.rows.length > LIMIT,
    results: rows.map((row) =>
      buildSearchResult(row, { today, timeZone, eventDay: row.event_at ? monthDay(todayInZone(row.event_at, timeZone)) : null })
    ),
  };
}

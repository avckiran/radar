-- Full-text search: one stored vector per item (title, notes, description, link, waiting on) and one per history note.
alter table items add column search_vector tsvector generated always as (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(body, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(description, '') || ' ' || coalesce(waiting_on, '') || ' ' || coalesce(url, '')), 'C')
) stored;
create index items_search_idx on items using gin (search_vector);

alter table item_events add column note_vector tsvector generated always as (
  to_tsvector('english', coalesce(note, ''))
) stored;
create index item_events_note_search_idx on item_events using gin (note_vector);

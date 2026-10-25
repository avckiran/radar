export const ITEM_COLUMNS = `i.id, i.kind, i.state, i.title, i.body, i.url, i.due_date, i.snoozed_until, i.follow_up_date,
       i.waiting_since, i.waiting_on, i.description, i.created_at, i.updated_at, i.completed_at, i.segment_id,
       s.name as segment_name, s.color as segment_color, u.display_name as creator`;

export const ITEM_JOINS = `left join segments s on s.id = i.segment_id
         left join users u on u.id = i.created_by`;

export const COMPLETED_BY = `left join lateral (
           select a.display_name
             from item_events e join users a on a.id = e.actor_id
            where e.item_id = i.id and e.type = 'completed'
            order by e.created_at desc limit 1
         ) doer on true`;

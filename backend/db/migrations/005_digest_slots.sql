-- Three daily emails per person (morning, afternoon, evening), each with its own on/off and time.
-- The existing digest_time becomes the morning time; digest_enabled stays as the master switch.
alter table users add column digest_morning_enabled   boolean not null default true;
alter table users add column digest_afternoon_enabled boolean not null default true;
alter table users add column digest_afternoon_time    time    not null default '14:00';
alter table users add column digest_evening_enabled   boolean not null default true;
alter table users add column digest_evening_time      time    not null default '18:00';

-- One log row per person, per local day, per slot. Rows from before this change are the morning emails.
alter table digest_log add column slot text not null default 'morning' check (slot in ('morning', 'afternoon', 'evening'));
alter table digest_log drop constraint digest_log_user_id_local_date_key;
alter table digest_log add constraint digest_log_user_day_slot_key unique (user_id, local_date, slot);

-- 'quiet' = the slot came up but nothing needed attention, so no email was sent (not retried)
alter table digest_log drop constraint digest_log_status_check;
alter table digest_log add constraint digest_log_status_check check (status in ('sending', 'sent', 'failed', 'skipped', 'quiet'));

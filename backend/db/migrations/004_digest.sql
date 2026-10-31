-- Digest on/off per person, and room in the log for the states the scheduler uses
alter table users add column digest_enabled boolean not null default true;

alter table digest_log drop constraint digest_log_status_check;
alter table digest_log add constraint digest_log_status_check check (status in ('sending', 'sent', 'failed', 'skipped'));
alter table digest_log add column claimed_at timestamptz not null default now();

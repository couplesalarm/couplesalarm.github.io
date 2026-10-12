-- Schedule as the existing postgres owner. No new login, key or grants.
-- pg_cron is available in the project but must be enabled for enforcement.
create extension if not exists pg_cron;
select cron.schedule(
  'couples-alarm-work-inquiry-retention',
  '17 * * * *',
  $$delete from public.couples_alarm_work_inquiries
    where last_contact_at <= now() - interval '90 days'$$
);

-- Work-with-us release schema. Uses existing project default server privileges.
-- No changes to existing tables, accounts, authentication or feedback policies.
create table public.couples_alarm_work_inquiries (
  id uuid primary key,
  created_at timestamptz not null default now(),
  last_contact_at timestamptz not null default now(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  email text not null check (char_length(email) between 3 and 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  category text not null check (category in ('partnership', 'creator')),
  channel_url text not null default '' check (char_length(channel_url) <= 500 and (channel_url = '' or channel_url ~ '^https?://')),
  audience text not null default '' check (char_length(audience) <= 300),
  idea text not null check (char_length(btrim(idea)) between 1 and 2000),
  notice_version text not null check (notice_version = 'work_inquiry_v1'),
  notification_reserved boolean not null default false
);
alter table public.couples_alarm_work_inquiries enable row level security;
revoke all on public.couples_alarm_work_inquiries from public, anon, authenticated;
-- Preserve only already-inherited server privileges; do not create new grants.
revoke update, delete, truncate, references, trigger, maintain on public.couples_alarm_work_inquiries from service_role;
do $$ begin
  if not has_table_privilege('service_role','public.couples_alarm_work_inquiries','SELECT')
     or not has_table_privilege('service_role','public.couples_alarm_work_inquiries','INSERT') then
    raise exception 'Existing server defaults are required; no new grants will be made';
  end if;
end $$;
comment on table public.couples_alarm_work_inquiries is 'Private partnership and creator inquiries; no public read policies or newsletter enrollment.';
create index work_inquiries_created_at on public.couples_alarm_work_inquiries (created_at);
create index work_inquiries_contact_time on public.couples_alarm_work_inquiries (lower(btrim(email)), created_at);

-- A single transaction admits the inquiry and reserves a bounded notification.
-- Origin, UUID changes and worker restarts cannot reset these durable limits.
-- SECURITY INVOKER: only the existing server role can call this or access rows.
create function public.submit_work_inquiry(submission jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  existing public.couples_alarm_work_inquiries%rowtype;
  received_at timestamptz;
  reference uuid := (submission->>'id')::uuid;
  notify boolean;
begin
  -- Serialize the count-and-insert across function instances and concurrent calls.
  perform pg_catalog.pg_advisory_xact_lock(191898, 20261012);
  received_at := pg_catalog.clock_timestamp();
  select * into existing from public.couples_alarm_work_inquiries where id = reference;
  if found then
    if (to_jsonb(existing) - 'created_at' - 'last_contact_at' - 'notification_reserved') = submission then
      return jsonb_build_object('outcome', 'duplicate', 'reference', reference, 'notify', false);
    end if;
    return jsonb_build_object('outcome', 'conflict');
  end if;

  if (select count(*) from public.couples_alarm_work_inquiries
      where created_at > received_at - interval '24 hours') >= 100 then
    return jsonb_build_object('outcome', 'limited', 'retryAfter', 86400);
  end if;
  if (select count(*) from public.couples_alarm_work_inquiries
      where lower(btrim(email)) = lower(btrim(submission->>'email'))
        and created_at > received_at - interval '1 hour') >= 5 then
    return jsonb_build_object('outcome', 'limited', 'retryAfter', 3600);
  end if;

  notify := (select count(*) from public.couples_alarm_work_inquiries
    where notification_reserved and created_at > received_at - interval '24 hours') < 25;
  insert into public.couples_alarm_work_inquiries
    (id, created_at, name, email, category, channel_url, audience, idea, notice_version, notification_reserved)
  values
    (reference, received_at, submission->>'name', submission->>'email', submission->>'category',
     submission->>'channel_url', submission->>'audience', submission->>'idea', submission->>'notice_version', notify);
  return jsonb_build_object('outcome', 'created', 'reference', reference, 'notify', notify);
end;
$$;
revoke all on function public.submit_work_inquiry(jsonb) from public, anon, authenticated;
do $$ begin
  if not has_function_privilege('service_role','public.submit_work_inquiry(jsonb)','EXECUTE') then
    raise exception 'Existing server execute default is required; no new grants will be made';
  end if;
end $$;

create index work_inquiries_retention on public.couples_alarm_work_inquiries(last_contact_at);
-- The existing project owner updates last_contact_at after a substantive reply.
-- Retries, notifications and viewing the row do not extend retention.
comment on column public.couples_alarm_work_inquiries.last_contact_at is
  'Submission initially; owner must record the timestamp of each subsequent substantive contact. Inquiries with 90 days of inactivity are automatically deleted.';
-- Schedule as the existing postgres owner. No new login, key or grants.
-- pg_cron is available in the project but must be enabled for enforcement.
create extension if not exists pg_cron;
select cron.schedule(
  'couples-alarm-work-inquiry-retention',
  '17 * * * *',
  $$delete from public.couples_alarm_work_inquiries
    where last_contact_at <= now() - interval '90 days'$$
);


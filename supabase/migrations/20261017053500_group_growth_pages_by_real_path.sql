-- Growth dashboard: group page visits by the real page instead of a hardcoded list.
--
-- Before: couples_alarm_growth_metrics() named nine pages and reported every
-- other page (opposite-shifts, vibrate-only, /beta/android/, the three guides
-- from PR #154, ...) as 'Other page'. Each new page needed a new migration.
--
-- After: a page is reported under its own normalized path when that path is in
-- public.couples_alarm_report_pages. The list is seeded below with every path
-- record-page-view accepts today, and new paths register themselves the first
-- time record-page-view stores a visit to them (trigger below), so a new guide
-- only needs the record-page-view allowlist change -- no further migration.
--
-- Why a list and not "any stored path": before 2026-10-10 record-page-view
-- stored any path, so older rows can hold arbitrary paths. Those are never
-- registered (the trigger only sees new inserts) and stay 'Other page', so no
-- arbitrary or private path is ever published. Paths that fail the shape check
-- (query strings, upper case, dots, '@', more than four levels, > 100 chars)
-- are never registered either.
--
-- Additive and safe to re-run: IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT
-- DO NOTHING only. No DROP, TRUNCATE or DELETE; existing tables, columns and
-- rows are unchanged. Output shape, QA exclusion and grants are unchanged.

-- 1. Normalize a stored path: strip query string, fragment and index.html, add
--    the trailing slash, and return null unless it is a plain lowercase page path.
create or replace function public.couples_alarm_normalize_page_path(raw_path text)
returns text language sql immutable parallel safe
set search_path = '' as $$
  select case when p ~ '^/([a-z0-9]+(-[a-z0-9]+)*/){0,4}$' and char_length(p) <= 100 then p end
  from (
    select case when s like '%/' then s else s || '/' end as p
    from (select regexp_replace(split_part(split_part(raw_path, '?', 1), '#', 1),
      'index\.html$', '') as s) stripped
  ) normalized;
$$;
revoke all on function public.couples_alarm_normalize_page_path(text) from public, anon, authenticated;
grant execute on function public.couples_alarm_normalize_page_path(text) to service_role;

-- 2. Small private list of pages the dashboard reports by name.
create table if not exists public.couples_alarm_report_pages (
  path text primary key,
  first_seen_at timestamptz not null default now(),
  constraint couples_alarm_report_pages_path_shape check (
    char_length(path) <= 100 and path ~ '^/([a-z0-9]+(-[a-z0-9]+)*/){0,4}$')
);
comment on table public.couples_alarm_report_pages is
  'Public website page paths the growth dashboard reports by name. Seeded from the record-page-view allowlist; new allowlisted paths self-register on first recorded visit.';
alter table public.couples_alarm_report_pages enable row level security;
revoke all privileges on table public.couples_alarm_report_pages from anon, authenticated;
grant all privileges on table public.couples_alarm_report_pages to service_role;

-- Every path record-page-view accepts as of PR #154 (commit 839470e).
insert into public.couples_alarm_report_pages (path) values
  ('/'), ('/compatibility/'), ('/different-wake-times/'), ('/download/'), ('/support/'),
  ('/privacy/'), ('/beta/android/'), ('/wake-up-without-waking-partner/'),
  ('/opposite-shifts-couples-alarm/'), ('/iphone-vibrate-only-alarm/'),
  ('/alarm-without-smartwatch/'), ('/vibration-alarm-app-alternative/'),
  ('/early-riser-alarm/'), ('/best-alarm-apps-for-couples/'),
  ('/alarm-tone-only-one-person-hears/')
on conflict (path) do nothing;

-- 3. Self-registration. record-page-view (the only writer, via service_role)
--    stores only allowlisted paths, so a new guide appears on its first visit.
--    Any error here is swallowed: page counting must never fail because of it.
create or replace function public.couples_alarm_register_report_page()
returns trigger language plpgsql security definer
set search_path = '' as $$
declare
  normalized text;
begin
  -- Normalization runs inside the exception block too, so a missing, renamed or
  -- failing normalize function can never fail the visit insert.
  begin
    normalized := public.couples_alarm_normalize_page_path(new.path);
    if normalized is not null then
      insert into public.couples_alarm_report_pages (path) values (normalized)
      on conflict (path) do nothing;
    end if;
  exception when others then
    null;
  end;
  return null;
end;
$$;
revoke all on function public.couples_alarm_register_report_page() from public, anon, authenticated;

create or replace trigger couples_alarm_register_report_page
  after insert on public.couples_alarm_page_views
  for each row execute function public.couples_alarm_register_report_page();

-- 4. Same report as its latest definition (20261016140552_add_coarse_website_diagnostics.sql,
--    including the diagnostics block); only the page label now comes from
--    couples_alarm_report_pages.
CREATE OR REPLACE FUNCTION public.couples_alarm_growth_metrics()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$
  with bounds as (
    select min(viewed_at) as first_recorded_at,
           (now() at time zone 'UTC')::date as today
    from public.couples_alarm_page_views where event_type in ('page_view','app_store_click')
  ), recorded as materialized (
    select (viewed_at at time zone 'UTC')::date as day, event_type, visitor_hash, diagnostics_version, device_class,
      (campaign = 'tracking_qa' or qa_reason is not null) is true as excluded,
      coalesce(rp.path, 'Other page') as page,
      coalesce(campaign, 'unattributed') as campaign,
      case
        when referrer_host is null then 'Direct / unknown'
        when referrer_host ~ '(^|\.)(facebook\.com|fb\.com)$' then 'Facebook'
        when referrer_host ~ '(^|\.)instagram\.com$' then 'Instagram'
        when referrer_host ~ '(^|\.)(tiktok\.com|tiktokv\.com)$' then 'TikTok'
        when referrer_host ~ '(^|\.)(youtube\.com|youtu\.be)$' then 'YouTube'
        when referrer_host ~ '(^|\.)(x\.com|twitter\.com|t\.co)$' then 'X'
        when referrer_host ~ '(^|\.)google\.[a-z.]+$' then 'Google'
        when referrer_host ~ '(^|\.)bing\.com$' then 'Bing'
        else 'Other referring websites' end as referrer
    from public.couples_alarm_page_views pv
    cross join bounds
    left join public.couples_alarm_report_pages rp
      on rp.path = public.couples_alarm_normalize_page_path(pv.path)
    where viewed_at >= ((today - 89)::timestamp at time zone 'UTC')
      and viewed_at <= now()
  ), events as materialized (
    select * from recorded where not excluded and event_type in ('page_view','app_store_click')
  ), excluded_counts as (
    select day as date, campaign as label,
      count(*) filter (where event_type = 'page_view') as "pageViews",
      count(*) filter (where event_type = 'app_store_click') as "appStoreClicks"
    from recorded where excluded and event_type in ('page_view','app_store_click') group by day, campaign
  ), diagnostic_counts as (
    select day as date, campaign, device_class as "deviceClass",
      count(*) filter (where event_type = 'page_view') as "pageViews",
      count(*) filter (where event_type = 'app_store_visible') as "appStoreVisible",
      count(*) filter (where event_type = 'foreground_10s') as "foreground10s"
    from recorded where not excluded and diagnostics_version = 1
      and event_type <> 'app_store_click'
    group by day, campaign, device_class
  ), days as (
    select generate_series(greatest(today - 89, (first_recorded_at at time zone 'UTC')::date)::timestamp,
      today::timestamp, interval '1 day')::date as day
    from bounds where first_recorded_at is not null
  ), visitors as (
    select day, visitor_hash, bool_or(event_type = 'page_view') as viewed,
      bool_or(event_type = 'app_store_click') as clicked
    from events group by day, visitor_hash
  ), daily as (
    select d.day as date,
      d.day = b.today or d.day = (b.first_recorded_at at time zone 'UTC')::date as partial,
      (select count(*) from visitors v where v.day = d.day and viewed) as visitors,
      (select count(*) from visitors v where v.day = d.day and viewed and clicked) as "visitorsWhoClicked",
      (select count(*) from events e where e.day = d.day and event_type = 'page_view') as "pageViews",
      (select count(*) from events e where e.day = d.day and event_type = 'app_store_click') as "appStoreClicks"
    from days d cross join bounds b
  ), page_counts as (
    select day as date, page as label,
      count(*) filter (where event_type = 'page_view') as "pageViews",
      count(*) filter (where event_type = 'app_store_click') as "appStoreClicks"
    from events group by day, page
  ), campaign_counts as (
    select day as date, campaign as label,
      count(*) filter (where event_type = 'page_view') as "pageViews",
      count(*) filter (where event_type = 'app_store_click') as "appStoreClicks"
    from events group by day, campaign
  ), referrer_counts as (
    select day as date, referrer as label, count(*) as "pageViews"
    from events where event_type = 'page_view' group by day, referrer
  )
  select jsonb_build_object(
    'schemaVersion', 1, 'generatedAt', now(), 'timezone', 'UTC',
    'firstRecordedAt', (select first_recorded_at from bounds),
    'diagnostics', jsonb_build_object('version', 1,
      'firstRecordedAt', (select min(viewed_at) from public.couples_alarm_page_views where diagnostics_version = 1),
      'rows', coalesce((select jsonb_agg(to_jsonb(x) order by date, campaign, "deviceClass") from diagnostic_counts x), '[]'::jsonb)),
    'daily', coalesce((select jsonb_agg(to_jsonb(d) order by date) from daily d), '[]'::jsonb),
    'excluded', coalesce((select jsonb_agg(to_jsonb(e) order by date, label) from excluded_counts e), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(to_jsonb(p) order by date, label) from page_counts p), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(c) order by date, label) from campaign_counts c), '[]'::jsonb),
    'referrers', coalesce((select jsonb_agg(to_jsonb(r) order by date, label) from referrer_counts r), '[]'::jsonb)
  );
$function$;
revoke all on function public.couples_alarm_growth_metrics() from public, anon, authenticated;
grant execute on function public.couples_alarm_growth_metrics() to service_role;

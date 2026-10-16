-- Count paid campaign traffic in every report. Only the explicit test tag
-- `tracking_qa` is filtered out. Rows previously classified with
-- qa_reason = 'operator_cta_check' (15 operator launch checks on Oct 11, tagged
-- with paid campaign labels) are no longer excluded; the column and rows are kept.

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
      (campaign = 'tracking_qa') is true as excluded,
      case when path in ('/', '/compatibility/', '/different-wake-times/', '/download/', '/support/', '/privacy/', '/wake-up-without-waking-partner/', '/best-alarm-apps-for-couples/', '/alarm-tone-only-one-person-hears/')
        then path else 'Other page' end as page,
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
    from public.couples_alarm_page_views, bounds
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

create or replace function public.couples_alarm_page_view_summary(
    range_start timestamptz, range_end timestamptz
)
returns jsonb language sql stable security definer set search_path = public as $$
    with window_views as (
        select * from public.couples_alarm_page_views
        where viewed_at >= range_start and viewed_at < range_end
          and event_type = 'page_view'
          and campaign is distinct from 'tracking_qa'
    )
    select jsonb_build_object(
        'views', (select count(*) from window_views),
        'visitors', (select count(distinct visitor_hash) from window_views),
        'top_pages', coalesce((select jsonb_agg(row_to_json(p)) from (
            select path, count(*) as views from window_views
            group by path order by count(*) desc, path limit 10
        ) p), '[]'::jsonb),
        'top_referrers', coalesce((select jsonb_agg(row_to_json(r)) from (
            select referrer_host, count(*) as views from window_views
            where referrer_host is not null
            group by referrer_host order by count(*) desc, referrer_host limit 10
        ) r), '[]'::jsonb)
    );
$$;

create or replace function public.couples_alarm_acquisition_summary(
    range_start timestamptz, range_end timestamptz
)
returns table(day date, event_type text, campaign text, referrer_host text, events bigint)
language sql stable security definer set search_path = public as $$
    select (viewed_at at time zone 'UTC')::date, event_type, campaign,
           referrer_host, count(*)
    from public.couples_alarm_page_views
    where viewed_at >= range_start and viewed_at < range_end
      and campaign is distinct from 'tracking_qa'
      and event_type in ('page_view','app_store_click')
    group by 1, 2, 3, 4 order by 1, 2, 3, 4;
$$;

revoke all on function public.couples_alarm_page_view_summary(timestamptz, timestamptz)
    from public, anon, authenticated;
revoke all on function public.couples_alarm_acquisition_summary(timestamptz, timestamptz)
    from public, anon, authenticated;
grant execute on function public.couples_alarm_page_view_summary(timestamptz, timestamptz)
    to service_role;
grant execute on function public.couples_alarm_acquisition_summary(timestamptz, timestamptz)
    to service_role;

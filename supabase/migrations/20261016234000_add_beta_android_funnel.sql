-- Android beta page funnel: page views of /beta/android/ plus clicks on its
-- three step buttons (tester group, Google Play opt-in, Google Play install).
-- Additive only: existing rows, reports and the main growth RPC are unchanged.
alter table public.couples_alarm_page_views
  drop constraint couples_alarm_page_views_event_type_check,
  add constraint couples_alarm_page_views_event_type_check
    check (event_type in ('page_view','app_store_click','app_store_visible','foreground_10s',
      'beta_group_click','beta_optin_click','beta_play_click')),
  drop constraint couples_alarm_diagnostic_shape,
  add constraint couples_alarm_diagnostic_shape check (
    (diagnostics_version is null and device_class is null
      or diagnostics_version is not distinct from 1 and device_class is not null)
    and not (diagnostic_key is not null and event_key is not null)
    and (event_type in ('page_view','app_store_click','beta_group_click','beta_optin_click','beta_play_click')
        and diagnostic_key is null
      or event_type in ('app_store_visible','foreground_10s')
        and diagnostics_version is not distinct from 1
        and (diagnostic_key is not null or event_key is not null)));

-- Aggregate counts only; only the explicit test tag tracking_qa is filtered out.
create or replace function public.couples_alarm_beta_android_metrics()
returns jsonb language sql stable
set search_path = '' set statement_timeout = '10s' as $$
  with recorded as (
    select (viewed_at at time zone 'UTC')::date as day, event_type
    from public.couples_alarm_page_views
    where path = '/beta/android/'
      and campaign is distinct from 'tracking_qa'
      and viewed_at >= (((now() at time zone 'UTC')::date - 89)::timestamp at time zone 'UTC')
      and viewed_at <= now()
      and event_type in ('page_view','beta_group_click','beta_optin_click','beta_play_click')
  ), daily as (
    select day as date,
      count(*) filter (where event_type = 'page_view') as "pageViews",
      count(*) filter (where event_type = 'beta_group_click') as "groupClicks",
      count(*) filter (where event_type = 'beta_optin_click') as "optInClicks",
      count(*) filter (where event_type = 'beta_play_click') as "playClicks"
    from recorded group by day
  )
  select jsonb_build_object('version', 1,
    'firstClickRecordedAt', (select min(viewed_at) from public.couples_alarm_page_views
      where event_type in ('beta_group_click','beta_optin_click','beta_play_click')),
    'daily', coalesce((select jsonb_agg(to_jsonb(d) order by date) from daily d), '[]'::jsonb));
$$;
revoke all on function public.couples_alarm_beta_android_metrics() from public, anon, authenticated;
grant execute on function public.couples_alarm_beta_android_metrics() to service_role;

-- Keep raw events private and distinguish navigation intent from installations.
alter table public.couples_alarm_page_views
    add column event_type text not null default 'page_view'
        check (event_type in ('page_view', 'app_store_click')),
    add column campaign text
        check (campaign is null or campaign in (
            'owned_website', 'paid_facebook_iphone', 'paid_instagram_iphone',
            'paid_youtube_iphone', 'tracking_qa'
        ));

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

create function public.couples_alarm_acquisition_summary(
    range_start timestamptz, range_end timestamptz
)
returns table(day date, event_type text, campaign text, referrer_host text, events bigint)
language sql stable security definer set search_path = public as $$
    select (viewed_at at time zone 'UTC')::date, event_type, campaign,
           referrer_host, count(*)
    from public.couples_alarm_page_views
    where viewed_at >= range_start and viewed_at < range_end
      and campaign is distinct from 'tracking_qa'
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

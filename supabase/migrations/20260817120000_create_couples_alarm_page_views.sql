-- Cookieless first-party page view counting for couplesalarm.com.
--
-- No cookie, no browser storage, and no IP address is ever stored. Unique
-- visitors are approximated with visitor_hash: a salted digest of IP and user
-- agent that the edge function recomputes from a salt rotating every UTC day.
-- Yesterday's hash for the same person is unrecoverable, so the table cannot
-- follow anyone across days.

create table public.couples_alarm_page_views (
    id uuid primary key default gen_random_uuid(),
    viewed_at timestamptz not null default now(),
    path text not null,
    referrer_host text,
    visitor_hash text not null,
    constraint couples_alarm_page_views_path_shape check (
        path like '/%' and char_length(path) <= 200
    ),
    constraint couples_alarm_page_views_referrer_length check (
        referrer_host is null or char_length(referrer_host) <= 200
    ),
    constraint couples_alarm_page_views_visitor_hash_length check (
        char_length(visitor_hash) = 32
    )
);

comment on table public.couples_alarm_page_views is
    'Cookieless page view counts for the Couples Alarm website. Stores no IP address and no cross-day identifier.';

create index couples_alarm_page_views_viewed_at_idx
    on public.couples_alarm_page_views (viewed_at desc);

alter table public.couples_alarm_page_views enable row level security;
revoke all privileges on table public.couples_alarm_page_views from anon, authenticated;
grant all privileges on table public.couples_alarm_page_views to service_role;

-- Monthly rollup used by the emailed report. Returns one JSON object so the
-- edge function does not have to stitch several PostgREST queries together.
create or replace function public.couples_alarm_page_view_summary(
    range_start timestamptz,
    range_end timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    with window_views as (
        select * from public.couples_alarm_page_views
        where viewed_at >= range_start and viewed_at < range_end
    )
    select jsonb_build_object(
        'views', (select count(*) from window_views),
        'visitors', (select count(distinct visitor_hash) from window_views),
        'top_pages', coalesce((
            select jsonb_agg(row_to_json(p))
            from (
                select path, count(*) as views
                from window_views
                group by path
                order by count(*) desc, path
                limit 10
            ) p
        ), '[]'::jsonb),
        'top_referrers', coalesce((
            select jsonb_agg(row_to_json(r))
            from (
                select referrer_host, count(*) as views
                from window_views
                where referrer_host is not null
                group by referrer_host
                order by count(*) desc, referrer_host
                limit 10
            ) r
        ), '[]'::jsonb)
    );
$$;

revoke all on function public.couples_alarm_page_view_summary(timestamptz, timestamptz) from anon, authenticated;
grant execute on function public.couples_alarm_page_view_summary(timestamptz, timestamptz) to service_role;

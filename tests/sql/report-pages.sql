-- Run only in an isolated scratch database, after 20261017053500_group_growth_pages_by_real_path.sql.
-- Verifies real-page grouping, self-registration of new allowlisted pages, junk and
-- pre-allowlist paths staying 'Other page', QA exclusion, and private access.
begin;
-- Pre-allowlist history: stored before self-registration existed.
alter table public.couples_alarm_page_views disable trigger user;
insert into public.couples_alarm_page_views (path, viewed_at, visitor_hash, event_type, campaign) values
('/historic-private-path/', now(), md5('hist'), 'page_view', null);
alter table public.couples_alarm_page_views enable trigger user;
set local role service_role;
-- Writes exactly as record-page-view does (service_role, normalized allowlisted paths).
insert into public.couples_alarm_page_views (path, viewed_at, visitor_hash, event_type, campaign)
select path, now(), md5('fixture'), event_type, 'owned_website'
from unnest(array['/opposite-shifts-couples-alarm/', '/iphone-vibrate-only-alarm/', '/beta/android/',
  '/alarm-without-smartwatch/', '/vibration-alarm-app-alternative/', '/early-riser-alarm/', '/future-guide/']) as path
cross join unnest(array['page_view', 'app_store_click']) as event_type;
insert into public.couples_alarm_page_views (path, viewed_at, visitor_hash, event_type, campaign) values
('/early-riser-alarm/', now(), md5('qa'), 'page_view', 'tracking_qa'),
('/Mixed-Case/', now(), md5('junk'), 'page_view', null),
('/me@example.com/', now(), md5('junk'), 'page_view', null),
('/a/b/c/d/e/', now(), md5('junk'), 'page_view', null);
do $$
declare report jsonb := public.couples_alarm_growth_metrics();
begin
  if (select count(*) from jsonb_array_elements(report->'pages') p
      where p->>'label' in ('/opposite-shifts-couples-alarm/', '/iphone-vibrate-only-alarm/', '/beta/android/',
        '/alarm-without-smartwatch/', '/vibration-alarm-app-alternative/', '/early-riser-alarm/', '/future-guide/')
      and (p->>'pageViews')::int = 1 and (p->>'appStoreClicks')::int = 1) <> 7 then
    raise exception 'Real page labels or counts incorrect (QA must be excluded): %', report->'pages';
  end if;
  if (select (p->>'pageViews')::int from jsonb_array_elements(report->'pages') p where p->>'label' = 'Other page') <> 4 then
    raise exception 'Junk and pre-allowlist paths must be Other page: %', report->'pages';
  end if;
  if report::text ~ ('(historic-private-path|Mixed-Case|example\.com|/a/b/c|' || md5('fixture') || ')') then
    raise exception 'Unvalidated path or visitor identifier leaked';
  end if;
  if not exists (select 1 from jsonb_array_elements(report->'excluded') e where e->>'label' = 'tracking_qa' and (e->>'pageViews')::int = 1) then
    raise exception 'QA probe not in exclusion ledger';
  end if;
  if public.couples_alarm_normalize_page_path('/download/index.html?utm=x#top') <> '/download/'
     or public.couples_alarm_normalize_page_path('/support') <> '/support/'
     or public.couples_alarm_normalize_page_path('/' || repeat('a', 120) || '/') is not null
     or public.couples_alarm_normalize_page_path(null) is not null then
    raise exception 'Path normalization incorrect';
  end if;
end $$;
reset role;
do $$
begin
  if has_function_privilege('anon', 'public.couples_alarm_growth_metrics()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.couples_alarm_growth_metrics()', 'EXECUTE')
     or has_table_privilege('anon', 'public.couples_alarm_report_pages', 'SELECT')
     or has_table_privilege('authenticated', 'public.couples_alarm_report_pages', 'INSERT')
     or has_function_privilege('anon', 'public.couples_alarm_register_report_page()', 'EXECUTE') then
    raise exception 'Public role can reach private reporting objects';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.couples_alarm_report_pages'::regclass) then
    raise exception 'RLS must be enabled on report pages';
  end if;
end $$;
rollback;

-- Run only in an isolated scratch database, after 20261017053500_group_growth_pages_by_real_path.sql.
-- Proves a visit insert still succeeds when path normalization raises or is missing.
begin;
create or replace function public.couples_alarm_normalize_page_path(raw_path text)
returns text language plpgsql set search_path = '' as $$
begin raise exception 'simulated normalize failure'; end; $$;
set local role service_role;
insert into public.couples_alarm_page_views (path, viewed_at, visitor_hash, event_type, campaign)
values ('/trigger-safety-raise/', now(), md5('safety1'), 'page_view', 'owned_website');
reset role;
drop function public.couples_alarm_normalize_page_path(text);
set local role service_role;
insert into public.couples_alarm_page_views (path, viewed_at, visitor_hash, event_type, campaign)
values ('/trigger-safety-missing/', now(), md5('safety2'), 'page_view', 'owned_website');
reset role;
do $$
begin
  if (select count(*) from public.couples_alarm_page_views
      where path in ('/trigger-safety-raise/', '/trigger-safety-missing/')) <> 2 then
    raise exception 'Visit insert must succeed when normalization fails';
  end if;
  if exists (select 1 from public.couples_alarm_report_pages where path like '/trigger-safety-%') then
    raise exception 'No page may register when normalization fails';
  end if;
end $$;
rollback;

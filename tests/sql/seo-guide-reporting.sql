-- Run only in an isolated scratch database, after the reporting migration.
-- Fixtures cover distinct guide labels, both events and QA/private-path boundaries.
begin;
insert into public.couples_alarm_page_views (path, viewed_at, visitor_hash, event_type, campaign)
select path, now(), 'seo-fixture', event_type, null
from unnest(array['/wake-up-without-waking-partner/', '/best-alarm-apps-for-couples/', '/alarm-tone-only-one-person-hears/']) as path
cross join unnest(array['page_view', 'app_store_click']) as event_type;
insert into public.couples_alarm_page_views (path, viewed_at, visitor_hash, event_type, campaign, qa_reason) values
('/best-alarm-apps-for-couples/', now(), 'qa', 'page_view', 'tracking_qa', null),
('/best-alarm-apps-for-couples/', now(), 'operator', 'app_store_click', 'paid_facebook_iphone', 'operator_cta_check'),
('/unlisted-private-path/', now(), 'private', 'page_view', null, null);
set local role service_role;
do $$
declare report jsonb := public.couples_alarm_growth_metrics();
begin
  if (select count(*) from jsonb_array_elements(report->'pages') p
      where p->>'label' in ('/wake-up-without-waking-partner/', '/best-alarm-apps-for-couples/', '/alarm-tone-only-one-person-hears/')
      and (p->>'pageViews')::int = 1 and (p->>'appStoreClicks')::int = 1) <> 3 then
    raise exception 'Guide labels or event counts incorrect: %', report->'pages';
  end if;
  if (select sum((e->>'pageViews')::int + (e->>'appStoreClicks')::int) from jsonb_array_elements(report->'excluded') e) <> 2 then
    raise exception 'QA events are not excluded';
  end if;
  if report::text like '%unlisted-private-path%' or report::text like '%seo-fixture%' then
    raise exception 'Private path or visitor identifier leaked';
  end if;
  if has_function_privilege('anon', 'public.couples_alarm_growth_metrics()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.couples_alarm_growth_metrics()', 'EXECUTE') then
    raise exception 'Public role can call private reporting RPC';
  end if;
end $$;
rollback;

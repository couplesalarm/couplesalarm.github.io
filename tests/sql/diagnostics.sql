\set ON_ERROR_STOP on
-- Inherits the local-only guard and the existing acquisition/privacy regression.
\i tests/sql/growth-metrics.sql
\i supabase/migrations/20261016022054_add_seo_guide_reporting.sql
\i supabase/migrations/20261016140552_add_coarse_website_diagnostics.sql
begin;
create temporary table prior_metrics as select public.couples_alarm_growth_metrics() r,
  public.couples_alarm_page_view_summary(current_date-90,current_date+1) monthly,
  (select jsonb_agg(to_jsonb(a)) from public.couples_alarm_acquisition_summary(current_date-90,current_date+1) a) acquisition;
insert into public.couples_alarm_page_views(path,visitor_hash,event_type,campaign,diagnostics_version,device_class,diagnostic_key) values
('/',repeat('f',32),'app_store_visible','paid_tiktok_iphone',1,'android',repeat('1',32)),
('/',repeat('f',32),'foreground_10s','paid_tiktok_iphone',1,'android',repeat('2',32)),
('/',repeat('e',32),'app_store_visible','tracking_qa',1,'desktop',repeat('3',32)),
('/',repeat('e',32),'foreground_10s','tracking_qa',1,'desktop',repeat('4',32));
insert into public.couples_alarm_page_views(path,visitor_hash,event_type,campaign,diagnostics_version,device_class,diagnostic_key,qa_reason) values
('/',repeat('e',32),'foreground_10s','paid_tiktok_iphone',1,'desktop',repeat('5',32),'operator_cta_check');
-- Same retry token is ignored; the original event remains intact.
insert into public.couples_alarm_page_views(path,visitor_hash,event_type,campaign,diagnostics_version,device_class,diagnostic_key) values
('/',repeat('f',32),'foreground_10s','paid_tiktok_iphone',1,'android',repeat('2',32)) on conflict(diagnostic_key) do nothing;
do $$ declare r jsonb; before jsonb; x jsonb; begin
 r := public.couples_alarm_growth_metrics(); select p.r into before from prior_metrics p;
 assert r - 'diagnostics' = before - 'diagnostics', 'diagnostic-only traffic must not alter any old metric, date or visitors';
 assert public.couples_alarm_page_view_summary(current_date-90,current_date+1) = (select monthly from prior_metrics), 'monthly view report unchanged';
 assert (select jsonb_agg(to_jsonb(a)) from public.couples_alarm_acquisition_summary(current_date-90,current_date+1) a) = (select acquisition from prior_metrics), 'old acquisition report unchanged';
 assert jsonb_array_length(r->'diagnostics'->'rows') = 1, 'tagged and classified QA must be excluded';
 x := r->'diagnostics'->'rows'->0;
 assert x->>'deviceClass' = 'android' and (x->>'pageViews')::int=0 and (x->>'appStoreVisible')::int=1 and (x->>'foreground10s')::int=1, 'only two unique diagnostic events, no implied pageview';
 assert (select count(*) from public.couples_alarm_page_views where diagnostic_key is not null)=5, 'all five original receipts retained';
 assert r::text not like '%diagnostic_key%' and r::text not like '%visitor_hash%', 'no private IDs in public projection';
 assert not has_table_privilege('anon','public.couples_alarm_page_views','INSERT'), 'no public insert';
 assert not has_table_privilege('authenticated','public.couples_alarm_page_views','SELECT'), 'no authenticated raw read';
 assert not has_function_privilege('anon','public.couples_alarm_acquisition_summary(timestamptz,timestamptz)','EXECUTE'), 'no public RPC';
 begin
  insert into public.couples_alarm_page_views(path,visitor_hash,event_type,diagnostic_key) values('/',repeat('n',32),'foreground_10s',repeat('6',32));
  raise exception 'accepted diagnostic without version/device';
 exception when check_violation then null; end;
 begin
  insert into public.couples_alarm_page_views(path,visitor_hash,event_type,diagnostics_version,device_class,diagnostic_key) values('/',repeat('n',32),'foreground_10s',1,'iPhone14',repeat('6',32));
  raise exception 'accepted detailed device';
 exception when check_violation then null; end;
end $$;
insert into public.couples_alarm_page_views(path,visitor_hash,event_type,campaign,diagnostics_version,device_class) values
('/',repeat('m',32),'page_view','paid_tiktok_iphone',1,'unknown'),
('/',repeat('m',32),'page_view','paid_tiktok_iphone',1,'unknown'),
('/',repeat('m',32),'app_store_click','paid_tiktok_iphone',1,'unknown');
do $$ declare r jsonb; x jsonb; before jsonb; after_day jsonb; begin
 r := public.couples_alarm_growth_metrics();
 select value into x from jsonb_array_elements(r->'diagnostics'->'rows') where value->>'deviceClass'='unknown';
 assert (x->>'pageViews')::int=2 and (x->>'foreground10s')::int=0, 'unknown hint preserved and clicks cannot enter diagnostic totals';
 select value into before from prior_metrics p, jsonb_array_elements(p.r->'daily') where value->>'date'=current_date::text;
 select value into after_day from jsonb_array_elements(r->'daily') where value->>'date'=current_date::text;
 assert (after_day->>'visitors')::int=(before->>'visitors')::int+1, 'repeat loads count one daily estimated visitor';
 assert (after_day->>'pageViews')::int=(before->>'pageViews')::int+2, 'new version keeps pageview behavior';
 assert (after_day->>'appStoreClicks')::int=(before->>'appStoreClicks')::int+1, 'new version keeps store-click behavior';
end $$;
set role service_role;
select jsonb_array_length(public.couples_alarm_growth_metrics()->'diagnostics'->'rows') as verified_diagnostic_groups;
reset role;
rollback;

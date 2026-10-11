\set ON_ERROR_STOP on
-- Destructive fixture setup is permitted only in the dedicated local test cluster.
select :'HOST' = '127.0.0.1' and :'PORT' = '55439' as safe_test_host \gset
\if :safe_test_host
\else
  \echo 'Refusing: use an isolated local PostgreSQL cluster on 127.0.0.1:55439.'
  \quit
\endif
set timezone = 'UTC';
create role anon;
create role authenticated;
create role service_role bypassrls;
\i supabase/migrations/20260817120000_create_couples_alarm_page_views.sql
\i supabase/migrations/20261010050104_add_acquisition_event_measurement.sql
\i supabase/migrations/20261011161552_allow_paid_tiktok_campaign.sql
\i supabase/migrations/20261011180935_add_growth_dashboard_metrics.sql
\i supabase/migrations/20261011204245_allow_snooze_war_v14_campaign.sql
insert into public.couples_alarm_page_views (viewed_at,path,visitor_hash,event_type,campaign,referrer_host) values
(date_trunc('day',now())-interval '3 days'+interval '5 hours','/private-email@example.com',repeat('a',32),'page_view',null,'private-person.example'),
(date_trunc('day',now())-interval '1 day'+interval '1 hour','/',repeat('a',32),'page_view',null,null),
(date_trunc('day',now())-interval '1 day'+interval '2 hours','/',repeat('a',32),'page_view',null,null),
(date_trunc('day',now())-interval '1 day'+interval '3 hours','/download/',repeat('b',32),'page_view','paid_tiktok_iphone','www.tiktok.com'),
(date_trunc('day',now())-interval '1 day'+interval '4 hours','/',repeat('a',32),'app_store_click','owned_website',null),
(date_trunc('day',now())-interval '1 day'+interval '5 hours','/',repeat('a',32),'app_store_click','owned_website',null),
(date_trunc('day',now())-interval '1 day'+interval '6 hours','/',repeat('q',32),'page_view','tracking_qa',null),
(date_trunc('day',now())-interval '1 day'+interval '7 hours','/',repeat('q',32),'app_store_click','tracking_qa',null),
(now()-interval '2 seconds','/',repeat('c',32),'app_store_click','owned_website',null),
(now()-interval '1 second','/',repeat('d',32),'page_view',null,null),
(now()-interval '1 second','/',repeat('d',32),'app_store_click','owned_website',null);
do $$
declare r jsonb; yesterday jsonb; zero_day jsonb;
begin
 r := public.couples_alarm_growth_metrics();
 select value into yesterday from jsonb_array_elements(r->'daily') where value->>'date' = (current_date-1)::text;
 select value into zero_day from jsonb_array_elements(r->'daily') where value->>'date' = (current_date-2)::text;
 assert jsonb_array_length(r->'daily') = 4, 'pre-collection days must not be fabricated';
 assert (yesterday->>'visitors')::int = 2, 'repeat views must not inflate daily unique estimate';
 assert (yesterday->>'pageViews')::int = 3, 'clicks and QA excluded from views';
 assert (yesterday->>'appStoreClicks')::int = 2, 'QA excluded from clicks';
 assert (yesterday->>'visitorsWhoClicked')::int = 1, 'intersection must count visitors with page view';
 assert (zero_day->>'visitors')::int = 0, 'days with no events after collection starts must be zero';
 assert r::text not like '%private-email%' and r::text not like '%private-person%' and r::text not like '%visitor_hash%', 'no private fields';
 assert not has_table_privilege('anon','public.couples_alarm_page_views','SELECT'), 'anon cannot read raw rows';
 assert not has_function_privilege('anon','public.couples_alarm_growth_metrics()','EXECUTE'), 'anon cannot invoke RPC';
 assert not has_function_privilege('authenticated','public.couples_alarm_growth_metrics()','EXECUTE'), 'authenticated cannot invoke RPC';
 assert has_function_privilege('service_role','public.couples_alarm_growth_metrics()','EXECUTE'), 'server can invoke RPC';
end $$;
set role service_role;
select jsonb_array_length(public.couples_alarm_growth_metrics()->'daily') as verified_server_read_days;

reset role;
begin;
insert into public.couples_alarm_page_views (path,visitor_hash,event_type,campaign) values
('/',repeat('v',32),'page_view','paid_instagram_snooze_v14'),
('/',repeat('v',32),'app_store_click','paid_instagram_snooze_v14');
do $$
declare r jsonb;
begin
 select value into r from jsonb_array_elements(public.couples_alarm_growth_metrics()->'campaigns')
 where value->>'label' = 'paid_instagram_snooze_v14';
 assert r is not null and (r->>'pageViews')::int = 1 and (r->>'appStoreClicks')::int = 1,
   'V14 must retain its own campaign counts';
 begin
   insert into public.couples_alarm_page_views (path,visitor_hash,campaign)
   values ('/',repeat('x',32),'unapproved@example.com');
   raise exception 'unexpectedly accepted arbitrary campaign';
 exception when check_violation then null;
 end;
end $$;
rollback;

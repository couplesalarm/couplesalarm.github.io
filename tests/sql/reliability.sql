\set ON_ERROR_STOP on
-- Inherits the fixture's 127.0.0.1:55439 guard. NEVER run on a hosted project.
\i tests/sql/diagnostics.sql
\i supabase/migrations/20261016194400_add_event_delivery_idempotency.sql
begin;
insert into public.couples_alarm_page_views(path,visitor_hash,event_type,campaign,diagnostics_version,device_class,event_key)
select '/',repeat('e',32),event_type,'tracking_qa',1,'unknown',md5(event_type)
from unnest(array['page_view','app_store_click','app_store_visible','foreground_10s']) event_type;
insert into public.couples_alarm_page_views(path,visitor_hash,event_type,campaign,diagnostics_version,device_class,event_key)
select '/',repeat('e',32),event_type,'tracking_qa',1,'unknown',md5(event_type)
from unnest(array['page_view','app_store_click','app_store_visible','foreground_10s']) event_type
on conflict(event_key) do nothing;
do $$ begin
 assert (select count(*) from public.couples_alarm_page_views where event_key is not null)=4, 'replays must not duplicate any event type';
 assert not has_table_privilege('anon','public.couples_alarm_page_views','SELECT'), 'raw rows stay private';
 assert not has_table_privilege('authenticated','public.couples_alarm_page_views','INSERT'), 'no public writes';
 assert not has_function_privilege('anon','public.couples_alarm_growth_metrics()','EXECUTE'), 'RPC stays private';
 begin
  insert into public.couples_alarm_page_views(path,visitor_hash,event_type,event_key) values('/',repeat('x',32),'foreground_10s',repeat('0',32));
  raise exception 'accepted invalid diagnostic shape';
 exception when check_violation then null; end;
 begin
  insert into public.couples_alarm_page_views(path,visitor_hash,event_type,event_key) values('/',repeat('x',32),'page_view','unapproved@example.com');
  raise exception 'accepted arbitrary key';
 exception when check_violation then null; end;
end $$;
rollback;

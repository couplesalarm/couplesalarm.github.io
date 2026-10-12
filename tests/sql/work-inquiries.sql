\set ON_ERROR_STOP on
-- Run only against an isolated scratch database, never production.
do $$ begin
  if not exists (select from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
-- Mirror read-only verified production defaults in this SCRATCH database only.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
\i supabase/functions/submit-work-inquiry/schema.sql
set role service_role;
insert into public.couples_alarm_work_inquiries(id,name,email,category,idea,notice_version)
values ('ad187b6d-7777-4000-8000-16b8c7531534','Example','example@example.com','creator','A conversation','work_inquiry_v1');
insert into public.couples_alarm_work_inquiries(id,name,email,category,idea,notice_version)
values ('ad187b6d-7777-4000-8000-16b8c7531534','Other','other@example.com','creator','Different','work_inquiry_v1') on conflict(id) do nothing;
do $$ begin
  assert (select count(*) from public.couples_alarm_work_inquiries) = 1, 'retry must not duplicate';
  assert (select name from public.couples_alarm_work_inquiries) = 'Example', 'retry must not overwrite';
  begin
    insert into public.couples_alarm_work_inquiries(id,name,email,category,idea,notice_version)
    values (gen_random_uuid(),repeat('x',101),'example@example.com','creator','Idea','work_inquiry_v1');
    raise exception 'length constraint did not reject';
  exception when check_violation then null; end;
  begin
    insert into public.couples_alarm_work_inquiries(id,name,email,category,idea,notice_version)
    values (gen_random_uuid(),'Example','bad email','creator','Idea','work_inquiry_v1');
    raise exception 'email constraint did not reject';
  exception when check_violation then null; end;
end $$;
reset role;
do $$ declare r text; op text; begin
  assert (select relrowsecurity from pg_class where oid='public.couples_alarm_work_inquiries'::regclass), 'RLS required';
  assert not exists (select from pg_policies where tablename='couples_alarm_work_inquiries'), 'no public read policy';
  foreach r in array array['anon','authenticated'] loop
    foreach op in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      assert not has_table_privilege(r,'public.couples_alarm_work_inquiries',op), 'public role must have no table access';
    end loop;
  end loop;
  assert has_table_privilege('service_role','public.couples_alarm_work_inquiries','SELECT,INSERT');
  assert not has_table_privilege('service_role','public.couples_alarm_work_inquiries','UPDATE');
  assert not has_table_privilege('service_role','public.couples_alarm_work_inquiries','DELETE');
end $$;
set role anon;
do $$ begin
  begin perform * from public.couples_alarm_work_inquiries; raise exception 'anon read allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.couples_alarm_work_inquiries default values; raise exception 'anon insert allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role authenticated;
do $$ begin
  begin perform * from public.couples_alarm_work_inquiries; raise exception 'authenticated read allowed'; exception when insufficient_privilege then null; end;
  begin delete from public.couples_alarm_work_inquiries; raise exception 'authenticated delete allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'inquiry storage, idempotency, constraints and denied public access verified' as result;

-- Test the exact atomic admission RPC, including retries and fresh UUIDs.
truncate public.couples_alarm_work_inquiries;
set role service_role;
do $$ declare payload jsonb; first_payload jsonb; result jsonb; i integer; begin
  payload := jsonb_build_object('id',gen_random_uuid(),'name','Example','email',' Same@Example.com ',
    'category','creator','channel_url','','audience','','idea','Test','notice_version','work_inquiry_v1');
  -- Edge validation trims email before the RPC; case variants must share limits.
  payload := jsonb_set(payload,'{email}','"Same@Example.com"');
  first_payload := payload;
  for i in 1..5 loop
    if i > 1 then payload := payload || jsonb_build_object('id',gen_random_uuid(),'email','same@example.com'); end if;
    result := public.submit_work_inquiry(payload);
    assert result->>'outcome' = 'created', 'first five are accepted';
  end loop;
  result := public.submit_work_inquiry(payload || jsonb_build_object('id',gen_random_uuid(),'email','SAME@example.com'));
  assert result->>'outcome' = 'limited', 'fresh UUID and email case cannot evade hourly quota';
  assert (result->>'retryAfter')::int = 3600;
  result := public.submit_work_inquiry(first_payload);
  assert result->>'outcome' = 'duplicate' and not (result->>'notify')::boolean, 'stored retry works even at quota';
  result := public.submit_work_inquiry(first_payload || '{"idea":"Changed"}'::jsonb);
  assert result->>'outcome' = 'conflict', 'cannot overwrite';
  assert (select count(*) from public.couples_alarm_work_inquiries) = 5;
end $$;
reset role;
truncate public.couples_alarm_work_inquiries;
set role service_role;
do $$ declare payload jsonb; result jsonb; i integer; notifications integer := 0; begin
  for i in 1..101 loop
    payload := jsonb_build_object('id',gen_random_uuid(),'name','Example','email','fresh-'||i||'@example.com',
      'category','creator','channel_url','','audience','','idea','Test','notice_version','work_inquiry_v1');
    result := public.submit_work_inquiry(payload);
    if i <= 100 then
      assert result->>'outcome' = 'created', 'notification cap must not reject storage';
      if (result->>'notify')::boolean then notifications := notifications + 1; end if;
    else
      assert result->>'outcome' = 'limited', 'new contact and UUID cannot bypass global quota';
      assert (result->>'retryAfter')::int = 86400;
    end if;
  end loop;
  assert notifications = 25, 'bounded global notification reservations';
  assert (select count(*) from public.couples_alarm_work_inquiries) = 100, 'all admitted rows durable';
end $$;
reset role;
update public.couples_alarm_work_inquiries set created_at=now()-interval '25 hours';
set role service_role;
do $$ declare result jsonb; begin
  result := public.submit_work_inquiry(jsonb_build_object('id',gen_random_uuid(),'name','Example','email','fresh-1@example.com',
    'category','partnership','channel_url','','audience','','idea','Test','notice_version','work_inquiry_v1'));
  assert result->>'outcome' = 'created' and (result->>'notify')::boolean, 'rolling windows expire';
end $$;
reset role;
do $$ begin
  assert not has_function_privilege('anon','public.submit_work_inquiry(jsonb)','EXECUTE');
  assert not has_function_privilege('authenticated','public.submit_work_inquiry(jsonb)','EXECUTE');
  assert has_function_privilege('service_role','public.submit_work_inquiry(jsonb)','EXECUTE');
  assert not (select prosecdef from pg_proc where oid='public.submit_work_inquiry(jsonb)'::regprocedure), 'no definer bypass';
end $$;
select 'atomic quotas, notification cap, retry, expiry and RPC grants verified' as result;

-- Retention: old inactive records expire; recent substantive contact preserves.
reset role;
truncate public.couples_alarm_work_inquiries;
insert into public.couples_alarm_work_inquiries(id,name,email,category,idea,notice_version,created_at,last_contact_at)
values
('ad187b6d-7777-4000-8000-16b8c7531534','Synthetic expired','expired@example.com','creator','Retention test','work_inquiry_v1',now()-interval '100 days',now()-interval '91 days'),
('ad187b6d-7777-4000-8000-16b8c7531535','Synthetic contacted','contacted@example.com','creator','Retention test','work_inquiry_v1',now()-interval '100 days',now()-interval '1 day'),
('ad187b6d-7777-4000-8000-16b8c7531536','Synthetic new','new@example.com','creator','Retention test','work_inquiry_v1',now(),now());
delete from public.couples_alarm_work_inquiries where last_contact_at <= now()-interval '90 days';
do $$ begin
  assert (select count(*) from public.couples_alarm_work_inquiries)=2;
  assert not exists (select from public.couples_alarm_work_inquiries where email='expired@example.com');
  assert exists (select from public.couples_alarm_work_inquiries where email='contacted@example.com');
end $$;
select '90-day inactivity deletion and substantive-contact extension verified' as result;

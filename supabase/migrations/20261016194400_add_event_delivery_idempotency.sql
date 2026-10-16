-- Expand atomic retry protection to every event without changing old rows,
-- reports, grants or the legacy diagnostic deduplication protocol.
alter table public.couples_alarm_page_views
  add column event_key text unique check (event_key ~ '^[0-9a-f]{32}$'),
  drop constraint couples_alarm_diagnostic_shape,
  add constraint couples_alarm_diagnostic_shape check (
    (diagnostics_version is null and device_class is null
      or diagnostics_version is not distinct from 1 and device_class is not null)
    and not (diagnostic_key is not null and event_key is not null)
    and (event_type in ('page_view','app_store_click') and diagnostic_key is null
      or event_type in ('app_store_visible','foreground_10s')
        and diagnostics_version is not distinct from 1
        and (diagnostic_key is not null or event_key is not null)));
comment on column public.couples_alarm_page_views.event_key is
  'HMAC of an independent one-event token, type and immutable event UTC day. Atomic duplicate-delivery protection across midnight; not a visitor/session ID. Raw token/day not stored.';

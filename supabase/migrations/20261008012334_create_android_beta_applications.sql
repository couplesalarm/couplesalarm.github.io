create table public.couples_alarm_android_beta_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  play_email text not null unique
    check (play_email = lower(btrim(play_email)) and length(play_email) between 3 and 254
      and play_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  phone_model text not null check (length(btrim(phone_model)) between 1 and 120),
  android_version text not null check (length(btrim(android_version)) between 1 and 40),
  adult_confirmed boolean not null check (adult_confirmed),
  contact_consent boolean not null check (contact_consent),
  can_test_14_days boolean not null,
  interests text[] not null default '{}'::text[]
    check (cardinality(interests) <= 4 and interests <@ array[
      'different_wake_times', 'sharing_a_room', 'trying_a_new_alarm', 'helping_improve_the_app'
    ]::text[]),
  consent_version text not null default 'android_beta_website_v1',
  source text not null default 'website_android_beta_v1'
);

alter table public.couples_alarm_android_beta_applications enable row level security;

-- Only the server and the existing project owner can manage applications.
-- The public form never reads applications or writes directly to the Data API.
revoke all on public.couples_alarm_android_beta_applications from public, anon, authenticated;
grant select, insert, delete on public.couples_alarm_android_beta_applications to service_role;

create index android_beta_applications_submission_order
  on public.couples_alarm_android_beta_applications (created_at, id);

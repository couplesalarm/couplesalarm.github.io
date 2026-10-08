-- Keep existing applications intact. New signups collect only the Play email;
-- unasked device, age, consent-checkbox and testing-commitment fields stay null.
alter table public.couples_alarm_android_beta_applications
  alter column phone_model drop not null,
  alter column android_version drop not null,
  alter column adult_confirmed drop not null,
  alter column contact_consent drop not null,
  alter column can_test_14_days drop not null;

-- RLS and all role grants are unchanged. Non-null legacy values still retain
-- their existing checks; no age or commitment is inferred for email signups.

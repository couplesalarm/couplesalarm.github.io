create table public.couples_alarm_beta_feedback (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    build text,
    tested text[] not null default '{}'::text[],
    roles text not null,
    waking_role text not null,
    result_clarity text not null,
    alarm text not null,
    confidence text not null,
    unclear text,
    improvement text,
    source text not null default 'feedback_page_v1',
    constraint couples_alarm_beta_feedback_build_length check (build is null or char_length(build) <= 20),
    constraint couples_alarm_beta_feedback_tested_values check (
        tested <@ array[
            'Welcome and setup',
            'Listening test and result',
            'Creating or editing an alarm',
            'Waiting for an alarm to go off',
            'Purchase or restore'
        ]::text[]
    ),
    constraint couples_alarm_beta_feedback_roles_values check (
        roles = any (array['Yes, completely', 'Mostly', 'No', 'I did not reach this step']::text[])
    ),
    constraint couples_alarm_beta_feedback_waking_role_values check (
        waking_role = any (array['Yes', 'No', 'I am not sure', 'I did not reach this step']::text[])
    ),
    constraint couples_alarm_beta_feedback_result_clarity_values check (
        result_clarity = any (array['Yes', 'Partly', 'No', 'I did not reach this step']::text[])
    ),
    constraint couples_alarm_beta_feedback_alarm_values check (
        alarm = any (array['It went off as expected', 'I had a problem', 'I did not test an alarm']::text[])
    ),
    constraint couples_alarm_beta_feedback_confidence_values check (
        confidence = any (array['1 — Not confident', '2', '3', '4', '5 — Very confident', 'Not sure yet']::text[])
    ),
    constraint couples_alarm_beta_feedback_unclear_length check (unclear is null or char_length(unclear) <= 700),
    constraint couples_alarm_beta_feedback_improvement_length check (improvement is null or char_length(improvement) <= 700),
    constraint couples_alarm_beta_feedback_source_value check (source = 'feedback_page_v1')
);

comment on table public.couples_alarm_beta_feedback is
    'Voluntary responses submitted through the Couples Alarm beta feedback website.';

alter table public.couples_alarm_beta_feedback enable row level security;
revoke all privileges on table public.couples_alarm_beta_feedback from anon, authenticated;
grant all privileges on table public.couples_alarm_beta_feedback to service_role;

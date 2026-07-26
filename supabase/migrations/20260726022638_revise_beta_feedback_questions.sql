alter table public.couples_alarm_beta_feedback
    alter column roles drop not null,
    alter column waking_role drop not null,
    alter column result_clarity drop not null,
    alter column confidence drop not null,
    add column experience_clarity text,
    add column alarm_loud_enough text,
    add column sound_annoyance text,
    add column sound_dealbreaker text,
    add column rating smallint,
    add column expected_missing text,
    add column additional_comments text;

alter table public.couples_alarm_beta_feedback
    drop constraint couples_alarm_beta_feedback_alarm_values,
    drop constraint couples_alarm_beta_feedback_source_value,
    add constraint couples_alarm_beta_feedback_alarm_values check (
        alarm = any (array[
            'It went off as expected',
            'I had a problem',
            'I did not test an alarm',
            'Yes, it went off when expected',
            'No, it was early, late, or did not go off',
            'I did not test a scheduled alarm'
        ]::text[])
    ),
    add constraint couples_alarm_feedback_experience_clarity check (
        experience_clarity is null
        or experience_clarity = any (array['Yes, completely', 'Mostly', 'No']::text[])
    ),
    add constraint couples_alarm_feedback_alarm_loud_enough check (
        alarm_loud_enough is null
        or alarm_loud_enough = any (array['Yes', 'No', 'I am not sure yet', 'I did not test a real alarm']::text[])
    ),
    add constraint couples_alarm_feedback_sound_annoyance check (
        sound_annoyance is null
        or sound_annoyance = any (array['Not at all', 'A little', 'Moderately', 'Very', 'I did not hear the alarm sound']::text[])
    ),
    add constraint couples_alarm_feedback_sound_dealbreaker check (
        sound_dealbreaker is null
        or sound_dealbreaker = any (array['Yes', 'No', 'I am not sure yet', 'I did not hear the alarm sound']::text[])
    ),
    add constraint couples_alarm_feedback_rating check (
        rating is null or rating between 1 and 10
    ),
    add constraint couples_alarm_feedback_expected_missing_length check (
        expected_missing is null or char_length(expected_missing) <= 700
    ),
    add constraint couples_alarm_feedback_additional_comments_length check (
        additional_comments is null or char_length(additional_comments) <= 700
    ),
    add constraint couples_alarm_beta_feedback_source_value check (
        source in ('feedback_page_v1', 'feedback_page_v2', 'feedback_page_v3')
    );

alter table public.couples_alarm_beta_feedback
    add column app_version text,
    add column ios_version text,
    add column entry_point text,
    add constraint couples_alarm_feedback_app_version_length
        check (app_version is null or char_length(app_version) <= 20),
    add constraint couples_alarm_feedback_ios_version_length
        check (ios_version is null or char_length(ios_version) <= 20),
    add constraint couples_alarm_feedback_entry_point
        check (entry_point is null or entry_point = 'question_mark');

alter table public.couples_alarm_beta_feedback
    drop constraint couples_alarm_beta_feedback_source_value,
    add constraint couples_alarm_beta_feedback_source_value
        check (source in ('feedback_page_v1', 'feedback_page_v2'));

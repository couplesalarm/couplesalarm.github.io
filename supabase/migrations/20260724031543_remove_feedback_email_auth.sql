drop policy if exists "Support admin can read beta feedback"
on public.couples_alarm_beta_feedback;

revoke select on table public.couples_alarm_beta_feedback from authenticated;

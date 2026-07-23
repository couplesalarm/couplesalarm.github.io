grant select on table public.couples_alarm_beta_feedback to authenticated;

create policy "Support admin can read beta feedback"
on public.couples_alarm_beta_feedback
for select
to authenticated
using (
    (select lower(auth.jwt() ->> 'email')) = 'couplesalarm.support@gmail.com'
);

alter policy "Support admin can read beta feedback"
on public.couples_alarm_beta_feedback
using (
    lower((select auth.jwt()) ->> 'email') = 'couplesalarm.support@gmail.com'
);

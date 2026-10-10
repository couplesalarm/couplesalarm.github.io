# Website acquisition measurement

The public website records page views and App Store clicks separately. Neither
event is an installation. App Store Connect first-time downloads and campaign
reports remain the installation sources; campaign metrics below Apple's minimum
threshold of five are unavailable, not zero.

## Deployment

The target is Supabase project `xqdqgsbkapvlskcldmpe`, database `postgres`, host
`db.xqdqgsbkapvlskcldmpe.supabase.co`. Confirm that target before changing it.

Apply the recorded `create_couples_alarm_page_views` migration followed by
`add_acquisition_event_measurement`. The former was present in source but absent
from the project when checked on October 10, 2026. The page-view and acquisition
summary functions and the raw table are available only to the server role.

Deploy `supabase/functions/record-page-view/index.ts`. The function validates a
project publishable API key and the website origin itself; `verify_jwt = false`
is required for Supabase's modern publishable keys, which are not JWTs. Only the
publishable key belongs in `assets/analytics.js`. The function uses server-only
Supabase credentials from its environment to insert the validated record.

`PAGE_VIEW_SALT` is optional. Without it, a domain-separated HMAC uses the
server-only API key. Including the UTC date prevents linking visitor digests
across days. No IP, user-agent string, full referring URL, arbitrary query value,
or listening answer is stored. Do Not Track disables event requests and campaign
tagging. Browser navigation does not depend on the recorder succeeding.

## Verification and reporting

Run `node --test tests/*.test.mjs`. Replay both migrations in local PostgreSQL
with `anon`, `authenticated`, and `service_role` roles; verify that public roles
cannot read or insert events or call either summary function. Check that click
events and QA events do not inflate page-view totals.

For a live smoke check, open a public page with `?ct=tracking_qa`, click the
Couples Alarm App Store badge, verify the destination, then read back a
`page_view` and an `app_store_click` with campaign `tracking_qa`. Keep those
records for diagnostics; both summary functions exclude them.

Use `couples_alarm_acquisition_summary(range_start, range_end)` for daily UTC
totals by event, campaign and referring host. Count events, not unique people or
installs. The daily visitor digest is approximate and should not be joined to
advertising identifiers. The prior monthly-email workflow is separate from this
repair; this deployment does not send email or assert that monthly email delivery
is configured.

Website App Store badges use `owned_website`. The iPhone ad test reserves
`paid_facebook_iphone`, `paid_instagram_iphone`, and `paid_youtube_iphone`, using
the existing Apple provider token. Direct-to-store ad visits bypass the website
counter; inspect platform clicks and Apple's campaign reports for those visits.

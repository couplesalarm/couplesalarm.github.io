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
`paid_facebook_iphone`, `paid_instagram_iphone`, `paid_youtube_iphone`, and
`paid_tiktok_iphone`, using
the existing Apple provider token. Direct-to-store ad visits bypass the website
counter; inspect platform clicks and Apple's campaign reports for those visits.

An allowlisted `ct` value is also carried through same-host acquisition links,
including the listening-result link that changes at runtime. Other query values
are never copied to another page. Existing destination tokens are retained;
Do Not Track disables this behavior as well as event requests. The partner-share
feature always shares the clean public download URL, with no campaign or personal
data. The static desktop QR opens the canonical App Store listing directly and
does not identify the scanning person or preserve the desktop visitor's campaign.

The exact TikTok ad query `utm_source=tiktok&utm_medium=paid_social&utm_campaign=website_link_test_20261011` is an alias for `paid_tiktok_iphone`.
Only that approved tuple is recognized; arbitrary UTM values are neither stored
nor carried to internal links. An explicit allowlisted `ct` takes priority,
including `ct=tracking_qa` for test visits. Apply the recorded
`allow_paid_tiktok_campaign` migration before deploying the updated recorder and
frontend. Historical unlabeled events are not retroactively reclassified.

## Snooze War V14

The approved $80 Instagram Reel uses `ct=paid_instagram_snooze_v14`. This
fixed label remains separate from older `paid_instagram_iphone` traffic and is
carried through the website to Apple's App Store campaign URL. Apply
`allow_snooze_war_v14_campaign`, update both `get-growth-metrics` and
`record-page-view`, then publish the frontend before enabling the ad.

Apple campaign reports are delayed and privacy-thresholded. An unavailable
campaign count is not zero; downloads are not paid unlocks. The website label
reports events, not verified sponsored impressions. Operator checks must be
identified separately. Use `ct=tracking_qa` for routine smoke checks.

## Growth dashboard

The existing public page at `https://couplesalarm.com/growth-dashboard/` reads a
bounded aggregate report from `get-growth-metrics` when opened or refreshed.
The handler checks the project publishable key and approved browser origins,
then calls the service-role-only `couples_alarm_growth_metrics()` function.
Only that fixed RPC is available; no date/query input, raw rows, visitor hashes,
arbitrary paths or arbitrary referring domains are published. Unknown referring
hosts are grouped as Other. The raw table and SQL RPC remain inaccessible to
`anon` and `authenticated`.

Collection was first observed at **2026-10-10 05:14:53 UTC**. No earlier website
history is available in this counter. The dashboard provides the latest 90 UTC
days; 7/30/90-day controls affect the website chart, detail table, CSV, pages,
referrers, campaigns and period totals together. Days before collection are
unavailable, not zero. The first day and current day are marked partial.

- **Estimated visitors:** distinct daily visitor digests on page-view events.
  Multiple page views on one UTC day count once. These estimates cannot identify
  people across days; never sum them and label the sum unique people.
- **Page views:** recorded public marketing-page loads. Reloads count. Beta,
  feedback, admin, and the growth dashboard are not tagged.
- **App Store outbound clicks:** recorded clicks, not installs or unique people.
  Repeated clicks count. Store attribution uses Apple's separate campaign reports.
- **Campaign breakdown:** the event's approved link tag, not a verified paid-ad
  impression or installation. Untagged page views use No campaign tag; untagged
  outbound badges use Website default. These two groups are not a funnel.
- **Referrers:** referring-host groups on page views. Direct / unknown includes
  absent referrers, internal navigation, and apps that omit them; it does not
  mean every view was a direct visitor acquisition.
- **Exclusions and limits:** `tracking_qa` is excluded. Untagged operator checks
  and bots may remain. Do Not Track and blocked requests create undercounting.
  These are observed website events, not an audited customer count.

The existing daily GitHub Actions job also stores a website snapshot. If live
reporting fails, the dashboard uses that snapshot with its original timestamp
and a visible warning. Apple and social refreshes are independent of website
reporting; a source failure retains its last successful timestamp.

Apple totals are cumulative received Sales & Trends daily reports from August
12, 2026. The refresh now retains daily rows, unavailable-report dates, the
requested cutoff, and the last report actually received. HTTP 404 reports are
unavailable, not fabricated zeroes, and cannot advance the received-report date.
Apple's reporting dates and website UTC dates must not be treated as a joined
attribution funnel. USD-only proceeds exclude other currencies, and rating counts
come from the US public catalog.

The old four launch-post checks remain as explicitly historical, individually
dated rows. They do not report all current social posts or paid campaigns.
Product-page conversion, attributed campaign downloads, current paid-platform
reports, Android installations, and retention/crash/deletion metrics remain
unconnected and are identified on the page with their authoritative sources.

### Validation and release

Run `node --test tests/*.test.mjs`. Replay the page-view, acquisition, TikTok and
growth-metrics migrations in an isolated local PostgreSQL database; the fixture
in `tests/sql/growth-metrics.sql` verifies repeated visits, clicks, QA exclusion,
zero-event days, privacy projection, and role permissions. Never run that fixture
against the hosted project. Deploy the recorded migration and the
`get-growth-metrics` function to the verified project above, merge the website
PR, dispatch the existing daily refresh, and verify both live counts and the
published Apple report in the actual dashboard.

## Four-couple Snooze War test

The shared $80 Instagram campaign keeps the young V14 label and adds
`paid_ig_snooze_asian_v15`, `paid_ig_snooze_white_v15`, and
`paid_ig_snooze_black_v15`. Each fixed label carries through the website to
App Store badges. Apply `allow_snooze_war_v15_casts` and deploy both handlers
before publishing the frontend and enabling these creatives. Tags distinguish
creative traffic; they do not verify an ad impression, install, or paid unlock.
Record operator CTA checks separately from acquired traffic.

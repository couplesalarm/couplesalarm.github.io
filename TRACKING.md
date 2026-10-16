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

Website App Store badges use `owned_website` only when no specific approved source is available. The iPhone ad test reserves
`paid_facebook_iphone`, `paid_instagram_iphone`, `paid_youtube_iphone`, and
`paid_tiktok_iphone`, using
the existing Apple provider token. Direct-to-store ad visits bypass the website
counter; inspect platform clicks and Apple's campaign reports for those visits.

An allowlisted `ct` value is also carried through same-host acquisition links,
including the listening-result link that changes at runtime. Other query values
are never copied to another page. Specific approved destination tokens are retained; generic defaults cannot overwrite a known source;
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
Product-page conversion, website-campaign-attributed downloads, Android
installations, and retention/crash/deletion metrics remain unconnected and are
identified on the page with their authoritative sources. Meta uses a live API;
Apple Ads and Android membership connection status is documented below.

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

## Dashboard review — October 11, 2026

The four-couple comparison is now the first dashboard section. It uses the
same website period as the chart, other traffic, excluded-test details and CSV.
The approved $80 is a shared campaign cap, not measured spend or remaining
budget. The Meta link is the source for current delivery and spend; the
dashboard does not compute cost per download without attributed installs.
Website reports reload every five minutes while the page is visible. Apple
period changes apply to both the totals and the daily chart; the separate
since-launch line preserves lifetime context. Missing reports remain unavailable.

`exclude_confirmed_dashboard_tests` adds nullable `qa_reason` to the private raw
table. The only allowed value is `operator_cta_check`. All three reporting RPCs
exclude these events and `tracking_qa`; original event times, tags and rows are
retained. Only the service role can classify tests. The event recorder never
accepts this field from browsers. The public growth endpoint adds bounded
`excluded` groups containing only date, approved campaign label and event counts.
Saved reports without that field explicitly show test separation as unavailable.

Fifteen individually verified October 11 operator events (11 page views and 4
App Store clicks) were classified using the V14 and four-couple launch receipts.
The events are matched by ID, exact timestamp, campaign and type; the maintenance
update requires all fifteen to match. No time-window or visitor-wide deletion or
reclassification is used. Other prelaunch/preview traffic is still unclassified
and must not be asserted to be customer acquisition. Routine future smoke checks
should continue to use `ct=tracking_qa`.

### Automatic API sources

- Website: `get-growth-metrics` reads fresh aggregate database counts on load,
  manual refresh and every five minutes while the dashboard is visible.
- Apple: the existing GitHub Actions collector calls the official Sales &
  Trends API and US catalog API daily using its existing encrypted report-only
  credentials. The browser reloads the latest API-derived import automatically;
  Apple's downloads are next-day reports, not real-time installations. The saved
  JSON is a published API cache, never a manually entered performance figure.
- Meta: `get-meta-metrics` calls the official Graph Marketing API using
  server-only `META_ADS_READ_TOKEN` and an explicit `META_GRAPH_VERSION`.
  Configure a token with `ads_read` for account `856701151737561` after the
  owner's Meta terms/access approval. Do not request ad-management permission.
  The handler accepts no arbitrary account, campaign, date or field parameters
  and has no write operations. It projects only the four known Snooze War ads
  from campaign `120252400023250695`, caching reads for five minutes per worker.
  Ad counts use the account's time zone; website counts use UTC. Failed refreshes
  retain their last successful source timestamp. Missing authorization is
  explicitly `not_connected`, never zero spend. No token belongs in the browser,
  the repository, evidence screenshots or application logs.

The owner approved Meta's terms and read-only reporting access on October 11,
2026. **Couples Alarm Reporting** (app `1532997575222605`) belongs to the Couples
Alarm business portfolio. Its token has `ads_read` plus Meta's automatic
`public_profile` scope; it has no ad-management permission. The encrypted
Supabase function secrets store the token and Graph API version `v26.0`.
An authenticated read at `2026-10-11T23:57:39Z` confirmed the $80 lifetime budget,
the active campaign and all four active ads. Meta returned no insights rows at
that check; active status is not evidence of impressions or paid acquisition.

Meta's debugger verified that this user token expires on December 10, 2026 at
23:53:46 UTC. `META_ADS_TOKEN_EXPIRES_AT` records that non-secret metadata. The
dashboard shows the renewal date and emphasizes it during the final seven
days. Renew the read-only token through the same app's Marketing API Tools,
update the encrypted token and its expiration metadata, then verify a real
report. This connection does not silently renew its own authorization.

## Apple Ads and Android beta dashboard sources

The App Store ads panel is separate from Sales & Trends: Apple Ads attributed
installs can include redownloads, are not paid unlocks, and overlap all-source
App Store downloads. Cost per install is spend divided by attributed installs;
zero installs means unavailable cost, never $0. Reports use the current calendar
month in UTC, independently of the website and Sales & Trends controls.

`get-apple-ads-metrics` is a fixed, read-only Apple Ads Platform API v1 query for
campaign `2144815187`, app `6792771975`. It validates account/app/campaign IDs,
USD, report completeness, and count types before returning aggregate metrics.
The API adapter is deployed but authorization is **not connected**. The checked
browser report from October 11, 2026 at 8:24 p.m. Eastern is retained in
`growth-dashboard/data.json` as `mode: manual`, with its exact UTC source time,
period and URL. It must not be described as automatic API data. The badge turns
stale after 24 hours; page refreshes never advance that verification timestamp.

To connect automatic Apple Ads, authorize an API Account Read Only user while
preserving the owner's Account Admin access. Register its public key and store
only encrypted server-side secrets: `APPLE_ADS_PRIVATE_KEY` (PKCS#8 PEM),
`APPLE_ADS_KEY_ID`, `APPLE_ADS_TEAM_ID`, `APPLE_ADS_CLIENT_ID`, and
`APPLE_ADS_ACCOUNT_ID`. Discover and verify the ad account using Apple's `/v1/acls`
response; the UI account number is not assumed to be the Platform API account ID.
The handler signs short-lived client credentials in memory and calls only
Apple's OAuth token endpoint and `/v1/reports/apps/campaigns/query`. The API role
and exact report must be verified before claiming the connection is live.
See [Apple OAuth](https://developer.apple.com/documentation/apple-ads-platform-api/implementing-oauth-for-the-apple-ads-platform-api)
and [campaign reports](https://developer.apple.com/documentation/apple-ads-platform-api/get-app-campaign-reports).

`get-beta-metrics` reads an exact HEAD count of the existing private
`couples_alarm_android_beta_applications` table. Its response contains no rows,
emails or application answers. This legacy website application count is live;
it is not the current enrollment route and is never added to group membership.
The application table's RLS and grants are unchanged.

Current signups join the consumer Google Group directly. The group panel retains
the verified October 11, 2026 8:20 p.m. Eastern browser check until its API bridge
is authorized. It counts members excluding owners separately from all members.
No group count establishes a Google Play opt-in, install or 14-day testing period.
Historical Google Form responses remain unconnected; browser access was blocked.

The reviewed, read-only Google bridge is in
`scripts/android-beta-group-report/Code.gs`, with its explicit Groups scope in
`appsscript.json`. It uses Google's [Groups service](https://developers.google.com/apps-script/reference/groups/group),
filters out banned/invited/pending roles, and emits counts only. Google accounts
without a direct membership are not enumerated. The complete pending queue is
not available through this API and is returned as null. Authorize the script
as the existing group owner, store a new random `REPORT_TOKEN` in private Script
Properties, and deploy its web app to execute as that owner. The handler rejects
requests without that token before accessing the group. Store the same token and
deployment URL in encrypted Supabase secrets `ANDROID_BETA_GROUP_REPORT_TOKEN`
and `ANDROID_BETA_GROUP_REPORT_URL`. No raw membership or email leaves Google.

Both read endpoints require the existing publishable key, validate allowed
origins, reject caller-supplied query parameters and mutations, and cache for five
minutes. Each beta source can fail independently. The browser retains the newest
successful evidence on failure without changing its timestamp. Missing access is
never zero. Complete authorization and verify real source responses before
labeling either pending connection as live.

## October 13, 2026 source-preservation repair

The client previously skipped support/privacy routes, left generic `owned_website`
destination tokens untouched, and captured outbound URLs at page load. These are
reproducible attribution gaps, not proof of which sources generated the historical
35 default-tagged clicks in the October 13 assessment. Those events cannot be
repaired retrospectively; no raw-event backfill or inferred channel assignment runs.

The client now carries allowlisted labels across public marketing routes and both
production hostnames. An approved label on a same-site public-page referrer can
recover a handoff through an uninstrumented public page; external referrer labels
are never trusted. Specific incoming labels take priority over a prior label;
`tracking_qa` on either page wins. Specific destination labels remain explicit,
while default/invalid labels yield to the incoming source. Outbound destination
and event label are resolved together at activation, including new/dynamic links.
The shared `assets/campaign-links.js` helper also runs on the inquiry and Android
beta pages to carry links even when a browser omits its referrer. It makes no
requests and never reads form fields. The analytics recorder is not added there. Listening answers and arbitrary incoming query
values are never copied, stored or transmitted.

There are no cookies, local/session storage, new identity fields or new services.
Attribution lasts only along these URL/referrer handoffs, not a persistent session.
A clean/bookmarked URL, suppressed referrer, untagged external link or static QR
can still lose the source. Do Not Track and nonproduction-host suppression remain.
QA always overrides paid/default destination labels so test activations stay excluded.
No database, RLS, permissions, server handler or daily-digest behavior changed.

Dashboard stage definitions separate site page views, outbound clicks,
platform-reported visits, attributed installs and first-time downloads. The manual
YouTube/TikTok/X coverage table comes from the October 13 acquisition assessment:
https://chatgpt.com/space/page_639caf93d8188191b261c604851e37af
Each public row links to its underlying platform and retains its own date,
report period, unknown timezone and missing-data caveats. It is not a live feed,
is not changed by filters, and is not summed with connected reports. Meta coverage
is four known Snooze War ads, not the entire account. Website source tags cannot
supply campaign-attributed downloads while Apple's campaign report is unavailable.

The Apple Ads manual snapshot was refreshed from the authorized October 13,
12:45–12:51 UTC read: October 6–12 UTC, $2.03 / 47 impressions / 3 taps /
2 new downloads / 0 redownloads. Its narrower October 10–12 comparison is retained
in source metadata ($0.69 / 15 / 1 / 1 / 0). Campaign settings were Running,
$2/day, ending October 14 at 23:59 America/New_York (October 15 at 03:59 UTC).
These are dated observations, not campaign edits or a new automatic connection.

## Coarse website diagnostics — October 16, 2026

Approved scope: coarse device hints, App Store link exposure and ten seconds of
foreground page activity. No homepage copy/design, ads, budgets or Android
onboarding changes are part of this release. `diagnostics_version = 1` marks
supported loads. Older rows and unsupported browsers remain unmeasured; there is
no historical backfill or deletion. All existing campaign handoffs, click counts,
page-view counts and `ct=tracking_qa` exclusions remain in force.

### Exact definitions

- **Device hint:** the recorder maps the ordinary request user-agent to
  `apple_mobile`, `android`, `desktop` or `unknown`, only for version-1 events.
  It stores no raw agent, model, OS version, screen dimensions, client hints or
  location. Apple mobile is a browser-family hint, not iOS compatibility or
  App Store eligibility. Desktop-mode iPads, disguised agents and bots can be
  misclassified. Empty, unrecognized and recognized bot agents use unknown.
- **`app_store_visible`:** the first observation in a document where at least
  50% of any HTTPS Couples Alarm App Store link's area intersects the viewport,
  the document is visible (not prerendered or suspended), and the link/ancestors
  are rendered without `display:none`, hidden visibility or zero opacity.
  Intersection Observer accounts for clipping; a current viewport rectangle and
  CSS checks reject stale/offscreen/hidden links. This is one qualifying snapshot,
  with no minimum dwell. Covering elements, filters and browser UI occlusion are
  not reliably detected. Multiple badges, scrolling and BFCache returns do not
  add another event. There is no negative “hidden CTA” event: absence is unknown.
- **`foreground_10s`:** one event after at least 10,000 accumulated milliseconds
  while `document.visibilityState === "visible"`. A 250ms timer uses a monotonic
  clock, pauses while hidden/page-hidden, and resumes the same document after
  BFCache. The final fraction under 250ms before each pause may be discarded.
  Scheduling gaps over 1,000ms are discarded to avoid counting sleep/freeze or
  long stalls. Prerender time is excluded. Visible does not mean keyboard focus,
  interaction, reading, attention or motivation. No input/activity stream is read.

Diagnostics require Intersection Observer, Mutation Observer, Page Visibility,
`performance.now` and `crypto.randomUUID`. Unsupported browsers still record old
page-view/click events but have no diagnostic capability marker. No polyfill,
third-party tracker, cookie or browser storage is introduced. A document-level
initialization guard prevents duplicate script setup. Timers and observers stop
while hidden/page-hidden; exposure observers disconnect permanently after the
first exposure. No unload handler, unload flush, navigation delay or retry loop
is used. Requests retain `keepalive`, omitted credentials and failure isolation.

Each diagnostic request generates an independent random event token in memory.
The recorder stores only a daily HMAC in `diagnostic_key`; uniqueness plus an
ignore-duplicate insert makes same-day request replay idempotent. Tokens are not
shared between the two signals, persisted in a browser, or used to join events.
They cannot create a cross-day or cross-event visitor ID. A replay on a different
UTC day has a different key; the client does not retry or resend on restore.
Existing daily visitor hashing remains unchanged. Diagnostics never count as
page views, store clicks or estimated visitors, even with no corresponding view.
The legacy acquisition and monthly summary contracts still include only their
original event types. Raw diagnostics remain behind existing RLS/service access.

### Reporting and interpretation

`couples_alarm_growth_metrics()` and `get-growth-metrics` retain schemaVersion 1
and add an optional `diagnostics` object, version 1. It exposes only bounded daily
UTC totals by approved page-source campaign and device hint: measured page views,
App Store visible events and foreground-10s events. QA tags and individually
classified test rows are excluded. The first diagnostic receipt time includes QA
so rollout coverage is visible even before organic traffic arrives.

The existing dashboard period filter controls a small diagnostic table in the
daily website section. Unmeasured page views are shown separately. Old snapshots
without the object show unavailable; they do not imply zero. Saved fallback data
retains its actual timestamp. The existing daily CSV remains page views/clicks.

These are **unjoined event totals**, not a visitor funnel, conversion rate or
proof of why paid visitors leave. A page's source labels both diagnostics; a
badge's `owned_website` default can still label its click differently. The server
uses receipt dates, so a long-lived page crossing midnight or a failed request
can separate a view from its signal. Blocking, DNT, unsupported browsers, short
visits, rendering limits and delivery loss all produce undercounting. No signal
establishes an install or exact device eligibility.

### Privacy/consent review

The release remains limited to the three approved first-party statistical
signals, through the existing Supabase processor and private event table. There
are no new services, agreements, access grants, ad identifiers, profiling,
cross-site joins, persistent identifiers, session replay, form data or location.
The privacy notice now discloses the exact signals and limits. Do Not Track still
suppresses all browser counting/tagging; the recorder also honors a DNT header.
The old “no cookies, therefore no banner” implication was removed: absence of
cookies alone does not establish a universal consent exemption.

Reviewed [ICO storage/access guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/): statistical exceptions have purpose, disclosure and objection conditions; this engineering review does not certify every jurisdiction. The implementation retains the existing DNT approach and the owner-approved statistical purpose. Any later identity joining, ad personalization, persistent storage or broader collection needs a separate decision before release.

### Verification and safe release

1. Run `node --test tests/*.test.mjs`. For the isolated local PostgreSQL cluster
   ONLY on `127.0.0.1:55439`, run `psql -h 127.0.0.1 -p 55439 -d diagnostics_test
   -f tests/sql/diagnostics.sql` on a fresh database. It includes legacy reporting,
   role/privacy checks, same-day deduplication, QA exclusions and diagnostic-only
   traffic that must leave every old metric unchanged. Never run this fixture on
   the hosted project.
2. Run `PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node
   tests/browser/diagnostics.mjs`. It serves source through intercepted browser
   requests and mocks the recorder: no production traffic. It checks actual CTA
   rendering, 10 seconds, DNT, duplicate initialization, navigation and old/new
   dashboard states. Unit tests cover background timing, prerender/BFCache,
   long stalls, dynamic/hidden CTA, device fallback and failed requests.
3. Confirm main/concurrent PRs and project `xqdqgsbkapvlskcldmpe` again. Apply
   `20261016140552_add_coarse_website_diagnostics.sql`, then deploy both
   `record-page-view` and `get-growth-metrics` with existing API-key authentication
   and `verify_jwt=false`. These are compatible with the old website.
4. Merge the reviewed website PR, verify the GitHub Pages commit/build and public
   asset version `20261016-diagnostics-1`, dispatch the existing snapshot workflow,
   then use only `?ct=tracking_qa` for live visible/10s/click checks. Read back raw
   QA receipts and verify they remain excluded. Preserve the receipts.

Rollback: revert this release's frontend/reporting commit through a PR (or stop
loading this diagnostic script version) to stop the new signals. Keep additive
columns, constraints and all stored events. The extended recorder/report accepts
old clients. If an edge rollback is necessary, redeploy the captured pre-release
function sources after the frontend rollback; old reporters explicitly filter
page views and clicks. Do not reverse the schema by dropping populated columns
or deleting diagnostics. Record exact deployed versions, commit, UTC times and
QA receipts in the release evidence.

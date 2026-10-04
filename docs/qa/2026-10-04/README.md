# Website fit, offer and privacy candidate — October 4, 2026

This is a reviewed draft candidate, not a production release. GitHub Pages uses
`main:/`; merging the PR publishes the website. Obtain the applicable owner
approval before merging, then verify the exact deployed tree and live asset bytes.

## Implemented behavior

- Homepage states iPhone/iOS 26 eligibility, free setup and bedside fit check,
  one calendar month after setup, and the $9.99 U.S. one-time lifetime offer.
  The free-download SoftwareApplication offer remains USD 0, with no rating data.
- Homepage explains the intended waking direction, bedside confirmation,
  variability, trusted-alarm fallback, lack of a wake/sleep guarantee, and
  non-medical limits. It distinguishes local app data from website page counting.
- Browser preview names the partner for a possible range, conditionally explains
  which waking direction it could fit, and links directly to free iPhone setup.
  Close, missing, empty or reversed ranges remain inconclusive. An empty range
  is no longer displayed at the lower sweep boundary. No listening answers leave
  the browser and no result tracking was added.
- Analytics transmits only HTTP(S) scheme plus hostname as the existing `referrer`
  URL field, removing credentials, port, path, query and fragment. The request
  also uses `referrerPolicy: no-referrer`. The unchanged server still extracts
  hostname and discards same-site referrals. All six public cache keys changed.
- Existing images have same-dimension WebP alternatives; PNG fallbacks and actual
  aspect ratios are retained. Canonicals, robots and sitemap were preserved.

## Product and media sources

[Apple's U.S. listing](https://apps.apple.com/us/app/couples-alarm/id6792771975)
was checked on October 4: free download, iOS 26.0 or later, and Lifetime Full
Access $9.99. It also describes free setup, the calendar month after setup,
partner confirmation, and continued scheduled alarms at expiry.

Copy was checked against the native repository's `docs/claims-matrix.md`.
Media was checked against `docs/asset-rights-register.md`, `docs/media-kit.md`
and the current build 73 source documented in `docs/launch-kit.md`.

The former homepage video matched the creative master that the rights register
marks publication-blocked:
`9179a48958edc110a7983250aae5eb7c65ddd79d6f7d83ef8f5c26909ea1ea3f`.
Its poster also used an unsupported outcome claim. Both are replaced in this
candidate. The new MP4 is a byte-for-byte copy of the documented, captured-app
preview, with neutral captions and sample names:
`0dfd3287a2c9a640b24bf7e2fb56a7e6270ecf7b2266acdecff72ba0fe63115e`.
It is 25.333 seconds, 886 × 1920, 30 fps H.264/AAC; full decode passed.
The rights register retains an older preview hash; the current capture is
identified in the launch/media records above. The poster is a real frame at
6 seconds, with JPEG SHA-256
`8fd3ac56ff628d33877f085da10f7b9070952d169225bd663cda2ae5dd9fd9a2`.
The replacement MP4 is 34,106,942 bytes versus the retired 23,467,235-byte file;
video preload remains metadata-only. No new artwork or creative claims were added.

| Image | Dimensions | Existing format bytes | WebP bytes |
| --- | --- | ---: | ---: |
| Setup screenshot | 603 × 1311 | 414,275 | 48,792 |
| Couple illustration | 1536 × 1024 | 1,633,626 | 77,984 |
| New captured poster | 886 × 1920 | 143,338 | 79,632 |

## Verification

- `node --test tests/*.test.mjs` on Node 26.9.0: **84/84 pass**, including the current Android
  privacy/support tests from remote main. Analytics regressions execute the
  actual server source with stub environment/database calls and synthetic
  sensitive URLs; there were no production analytics test requests.
- `node --check assets/analytics.js`, `node --check compatibility/compatibility.js`
  and `git diff --check`: pass.
- Independent read-only source/privacy/product review: no findings.
- Actual rendered Chromium homepage at 1440 × 1000, 390 × 844, 320 × 568 and
  844 × 390: no horizontal overflow and no axe WCAG 2 A/AA or 2.1 AA violations.
- Actual rendered Chromium preview: Ready → Listen → Handoff → Result; both
  possible partner directions, equal/close responses, neither-heard, restart,
  skip link and heading focus. Result at 390 × 844, 320 × 568 and 844 × 390, plus desktop,
  passed the same automated accessibility checks. The short landscape result
  scrolls below the progress row rather than overlapping it. No cookies or browser storage
  were created. The local production-host guard suppressed analytics requests.
- Audio timing in the browser flow was accelerated with the browser clock.
  These are rendered UI/flow checks, not acoustic, wakefulness, physical-iPhone,
  assistive-technology, or real bedside fit evidence. Automated accessibility
  checks do not establish complete accessibility conformance.
- Current Playwright's expected WebKit revision was unavailable. An older
  installed WebKit launch stalled and was stopped. No browser was installed;
  Safari/physical iPhone validation remains unobserved.
- Mobile owner cleared local website checks: no build or publisher mutex held
  by that task. The native and social checkout was not modified.

## Review screenshots

[Homepage desktop](home-desktop.png) · [Homepage mobile](home-mobile.png) ·
[320px homepage](home-narrow.png) · [Landscape homepage](home-landscape.png)

[Preview ready, mobile](preview-ready-mobile.png) ·
[Listening turn](preview-listen-mobile.png) · [Partner handoff](preview-handoff-mobile.png) ·
[Partner One result](preview-partner-one-mobile.png) ·
[Partner Two result](preview-partner-two-mobile.png) ·
[Inconclusive 320px result](preview-no-range-narrow.png) ·
[320px ready](preview-ready-narrow.png) ·
[Desktop ready](preview-ready-desktop.png) ·
[Desktop result](preview-partner-one-desktop.png) ·
[Landscape result](preview-result-landscape.png)

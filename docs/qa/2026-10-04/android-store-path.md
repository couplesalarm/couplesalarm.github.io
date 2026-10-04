# Android store path and WebKit QA — October 4, 2026

This draft is stacked on website PR #88 at exact commit
`2b593b7083310c7cb799d9d5438edb759467413f`. Neither branch is a
production website release. GitHub Pages publishes from `main:/`; merging
requires the applicable owner approval and deployed-byte verification.

## Store availability

- The public iPhone app keeps its verified App Store URL and Apple's unaltered
  official download badge. The `/download/` page now uses the same official
  badge, at 56 CSS pixels high, with one badge on that page.
- Android is described as **private testing** on the homepage and download
  page. The `data-google-play-download="unavailable"` sections contain no
  anchor, button, store URL, or badge. There is no public download path today.
  The Play Console app is a draft with no signed bundle or public production
  listing; a private test build is not a public Google Play release.
- After a verified public production listing exists, replace the passive
  status with its exact public URL and the current official **Get it on Google
  Play** badge. Recheck the live listing and Google badge rules at that time.
  Do not construct a link from the package ID or display a store badge that
  suggests the app is downloadable beforehand. Apple's badge guidelines say
  to put its preferred black badge first when other store badges are shown;
  Google's guidelines require the download badge rather than a Play logo
  lockup, no artwork changes, and a badge at least as large as other stores'.

Sources: [Apple App Store marketing guidelines](https://developer.apple.com/app-store/marketing/guidelines/),
[Google Play badges and lockups](https://partnermarketinghub.withgoogle.com/brands/google-play/google-play/lockups-icons-badges/),
and the private Android readiness record in the task workspace.

## Validation

- Current website candidate: `node --test tests/*.test.mjs` passed **85/85**.
  The new regression checks ensure a visible Android status without a Play
  link or interactive download control, and the official Apple badge on
  `/download/`. The iOS-only SoftwareApplication schema and USD 0
  free-download offer remain unchanged.
- Playwright **WebKit 26.6 engine on macOS** was installed from its official
  browser package after Brian approved the tool action. In a separate named
  session, an archive of exact PR #88 commit was served only at
  `127.0.0.1:9027`. At 390 × 844 the homepage rendered with its Apple badge
  loaded and no horizontal overflow. The preview reached a Partner One range
  with the direct App Store CTA, a Partner Two range, and the neither-heard
  inconclusive result. At 844 × 390 the result scrolled to its CTA without
  horizontal overflow; at 320 × 568 the inconclusive result fit horizontally.
  The same engine's iPhone emulation displayed iPhone-specific intro copy and
  entered the Playing UI state. These are browser behavior checks, not an
  acoustic test.
- The separate Android draft was served only at `127.0.0.1:9028`. WebKit at
  390 × 844 rendered both homepage and `/download/` with official Apple badges
  loaded, visible Android testing status, zero Google Play links, and no
  horizontal overflow. `/download/` also had no overflow at 320 × 568. The
  checked states had zero axe WCAG 2 A/AA or 2.1 AA violations. Automated
  checks do not establish complete accessibility conformance.
- **Native Safari was not page-tested.** Its app-control entry point returned
  only the Start Page after a long delay. Playwright WebKit uses the WebKit
  engine, but is not the macOS Safari app. iPhone emulation is not iOS Safari
  or a physical iPhone; no real speaker, bedside fit, or alarm reliability
  result is claimed. No Safari security setting, owner browser session, or
  physical phone was changed.

Screenshots from exact PR #88:
[WebKit homepage mobile](pr88-webkit-home-mobile.png) ·
[Partner One result mobile](pr88-webkit-preview-result-mobile.png) ·
[result landscape](pr88-webkit-preview-result-landscape.png) ·
[neither-heard 320px](pr88-webkit-no-range-narrow.png).

Screenshots from this Android draft:
[homepage mobile](android-home-webkit-mobile.png) ·
[download page mobile](android-download-webkit-mobile.png).

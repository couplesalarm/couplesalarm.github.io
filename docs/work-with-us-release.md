# Work with us — operations and verification

The inquiry-only page accepts partnership and creator ideas. Submitting does not enroll anyone in an affiliate program or establish pricing, discounts, commission or payment terms. Public contact remains couplesalarm.support@gmail.com.

## Data handling

Required fields: name (100), email (254), category, idea (2000). Optional: HTTP(S) channel URL (500) and audience (300). No uploads, health/client information requests, payments, analytics or browser storage. Failed submissions preserve entered values. Same-page unchanged retries reuse a UUID; success confirms durable storage only.

RLS and explicit revocations prohibit public table/RPC access. The handler validates the existing public project key, origin, JSON, lengths and a 16 KiB body limit. Only existing server privileges access storage. The transactional admission RPC serializes limits and idempotency: 5 accepted inquiries per normalized email per rolling hour, 100 globally per rolling day, and 25 notification reservations per rolling day. Identical retries return the same reference without resending; changed details with a reused UUID conflict. Notifications are best effort and may be suppressed by limits or provider failure. Check the private inquiry table routinely. These limits do not prevent all gateway execution abuse.

## Notifications

The owner approved bmarko@gmail.com as the internal fallback recipient because the existing Resend test sender rejects the public support inbox. The deployed default uses that approved recipient with the existing key and sender. WORK_INQUIRY_NOTIFICATION_TO can override to one of the already allowed addresses, but support must not be selected until a suitable verified sender is available. Existing feedback routing is unchanged. Email contains only a random reference and private dashboard link. Do not reply to it as though it contains the inquirer's address; review privately and use the public support address for substantive replies.

Actual Inbox receipt was verified on 12 October 2026 at 18:26 UTC, subject “New Couples Alarm collaboration inquiry”, for synthetic reference 9d1c7c90-e7b5-4e65-a5f0-ec842f7c978a. API acceptance alone is not delivery evidence. Temporary diagnostics were removed. No credentials or access grants were created.

## Retention and controls

Migration 20261012181219 creates the private table/RPC and hourly retention job (minute 17). Rows are deleted 90 days after last_contact_at. The existing owner must update this timestamp after substantive contact using the private Supabase table editor. Viewing, notification, and retries do not extend it. Backup expiration is not promised. Successful collaborations need separately agreed handling of business records. The first live cron run succeeded at 18:17 UTC on 12 October 2026.

Set WORK_INQUIRIES_ENABLED=false to stop new submissions. To disable the frontend, clear inquiryEndpoint; the form then reports nothing was sent and offers support email. No-JavaScript controls stay disabled rather than transmitting a native form request.

## Verification

Run `WORK_INQUIRY_PG_TEST=1 node --test tests/*.test.mjs` with the explicitly isolated local PostgreSQL fixture. Tests cover validation, public auth, true/false storage responses, notification suppression, accessible form states, retry idempotency and real PostgreSQL concurrency/quotas/retention. Live synthetic checks verified storage, duplicate 200 after initial 201, public read/RPC denial and internal notification receipt. Desktop/mobile browser checks cover selection, errors, preserved values, successful reset and layout. Full screen-reader and live quota-flood tests were not run. Compatibility partner-sharing work is excluded from this release.

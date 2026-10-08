# Android beta applications

The public form at `/beta/android/#application` saves through this endpoint with the project's public anon JWT. Gateway JWT verification stays enabled; the handler checks the site origin, required fields, adult confirmation and contact consent. It never accepts applicant reads or tester admission requests. A valid public JWT is not compared byte-for-byte with the runtime's generated anon token, which can represent the same project with different token timestamps.

Applications are stored in `public.couples_alarm_android_beta_applications` in the existing Couples Alarm project `xqdqgsbkapvlskcldmpe`, database `postgres`, host `db.xqdqgsbkapvlskcldmpe.supabase.co`. RLS is enabled with no public policies; `anon` and `authenticated` have no table privileges. Server-only credentials write the validated payload. No applicant information is included in a response or logged.

The existing Supabase project owner can review applications in the project's Table Editor, ordered by `created_at, id`. Duplicate normalized emails retain the original application and consent. This endpoint does not send emails, select or invite testers, add Google Group members, or create purchases. Admission remains a separate organizer action after the existing beta gates. The previous Google Form and its responses are untouched.

The prepared Google Forms admission worker has not been activated and does not read this new source. Use the private table for website applications; do not assume that worker processes them. Application storage and website signup availability do not establish downloadable Google Play beta access.

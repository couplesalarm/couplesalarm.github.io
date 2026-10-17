# Couples Alarm website: Supabase update (about 5 minutes)

**What this does:** three small changes to the Couples Alarm Supabase project so visits to every page get counted and show up as their own lines on the growth dashboard.
1. Redeploy `record-page-view`. It counts visits. Until it's redeployed, visits to the 3 new guides from PR #154 are turned away and not counted.
2. Redeploy `get-growth-metrics`. It feeds the growth dashboard. The new copy accepts any real page name, so new guides need no further change here.
3. Run one database update (the migration from PR **#155**, see below). The dashboard then lists each page by name: opposite-shifts, vibrate-only, /beta/android/ and the 3 new guides. Before this update they were lumped together as "Other page". Future guides appear on their own after their first visit, with no extra database step.

**Before you start:** PR #155 ("Growth dashboard: group visits by the real page") must be **merged into `main` first**. Everything below uses the code on `main`.

**Where things are:**
- Repo: `couplesalarm/couplesalarm.github.io`, branch `main`
- Function code: `supabase/functions/record-page-view/index.ts` and `supabase/functions/get-growth-metrics/index.ts`. Each is one file and imports nothing else.
- Database update: `supabase/migrations/20261017053500_group_growth_pages_by_real_path.sql`. It only adds things: one small list of page names, a helper, and an updated dashboard report. It deletes nothing and changes no existing visit data, and it is safe to run twice.
- Supabase project: **`xqdqgsbkapvlskcldmpe`**, signed in as **bmarko@hotmail.com**
- Both functions run with JWT verification **off** (`verify_jwt = false` in `supabase/config.toml`). Keep it off. The site sends a publishable key, which isn't a JWT, so turning verification on would break page counting and the dashboard.
- No secrets are needed.

**Order matters:** deploy the two functions first, then run the database update. The dashboard function that is live today only knows a fixed list of page names, so updating the database first could briefly make the dashboard show an error.

---

## Option A: Terminal (recommended)

Paste into Terminal on your Mac:

```bash
# 1. Get the latest site code (skip the clone if you already have the repo)
cd ~ && [ -d couplesalarm.github.io ] || gh repo clone couplesalarm/couplesalarm.github.io
cd ~/couplesalarm.github.io && git checkout main && git pull

# 2. Supabase CLI (skip if `supabase --version` already works)
brew install supabase/tap/supabase

# 3. Log in. A browser opens; sign in with bmarko@hotmail.com
supabase login

# 4. Deploy both functions to the Couples Alarm project, JWT check off
supabase functions deploy record-page-view   --project-ref xqdqgsbkapvlskcldmpe --no-verify-jwt
supabase functions deploy get-growth-metrics --project-ref xqdqgsbkapvlskcldmpe --no-verify-jwt

# 5. Connect this folder to the project (it may ask for the database password; it's in the dashboard under Project Settings > Database)
supabase link --project-ref xqdqgsbkapvlskcldmpe

# 6. Preview the database update. This changes nothing.
supabase db push --dry-run

# 7. Apply it
supabase db push
```

- Each function deploy should end with "Deployed Functions on project xqdqgsbkapvlskcldmpe". If Docker isn't running, the CLI may warn but still deploys. If you see a Docker error, add `--use-api` to the end of the deploy line and run it again.
- **Step 6 should list only one file:** `20261017053500_group_growth_pages_by_real_path.sql`. If it lists other files too, **don't run step 7**. Use Option B, step 7 (SQL Editor) for just this one file instead, and tell Garry which other files were listed.
- When step 7 asks "Do you want to push these migrations?", type `Y`. It should finish with "Finished supabase db push."

## Option B: Supabase dashboard (no Terminal)

**Functions** (both are single files, so they can be updated in the browser):
1. Go to https://supabase.com/dashboard/project/xqdqgsbkapvlskcldmpe/functions (signed in as bmarko@hotmail.com).
2. Click **record-page-view**, then the **Code** tab.
3. Open https://github.com/couplesalarm/couplesalarm.github.io/blob/main/supabase/functions/record-page-view/index.ts, click **Raw**, select all and copy.
4. In the dashboard editor, select all, paste over the old code, and click **Deploy** (some versions label it **Deploy updates**).
5. In that function's **Details**/settings, make sure **Verify JWT** (or "Enforce JWT verification") is **off**.
6. Repeat steps 2–5 for **get-growth-metrics**, using https://github.com/couplesalarm/couplesalarm.github.io/blob/main/supabase/functions/get-growth-metrics/index.ts.

**Database update** (do this after the functions):

7. Open https://github.com/couplesalarm/couplesalarm.github.io/blob/main/supabase/migrations/20261017053500_group_growth_pages_by_real_path.sql, click **Raw**, select all and copy.
8. Go to https://supabase.com/dashboard/project/xqdqgsbkapvlskcldmpe/sql/new, paste, and click **Run**. Expect "Success. No rows returned." It's safe to run again if you're unsure whether it worked.

   *Note:* this way doesn't record the update in Supabase's migration history. That's harmless: the file is safe to run twice, so a later `supabase db push` that runs it again changes nothing.

---

## Check that it worked (read-only, one line each)

**Page counting.** This sends one test visit tagged `tracking_qa`, the site's official test label, which the dashboard leaves out of its totals. Expect **204**. **400** means the old `record-page-view` is still live:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://xqdqgsbkapvlskcldmpe.supabase.co/functions/v1/record-page-view -H "Origin: https://couplesalarm.com" -H "apikey: sb_publishable_aHZQlUwb3hUVeyYyVi5wGg_IryIbCVH" -H "Content-Type: application/json" -d '{"path":"/early-riser-alarm/","event_type":"page_view","campaign":"tracking_qa"}'
```
(This key is the public "publishable" key already in the site's `assets/analytics.js`, not a secret.)

**Dashboard page names.** Read-only. It prints the page names the dashboard now reports:
```bash
curl -s https://xqdqgsbkapvlskcldmpe.supabase.co/functions/v1/get-growth-metrics -H "Origin: https://couplesalarm.com" -H "apikey: sb_publishable_aHZQlUwb3hUVeyYyVi5wGg_IryIbCVH" | python3 -c "import json,sys; print(sorted({p['label'] for p in json.load(sys.stdin)['pages']}))"
```
- **Good:** you see page names such as `/opposite-shifts-couples-alarm/`, `/iphone-vibrate-only-alarm/` or `/beta/android/`. A page only appears once it has had a real visit in the last 90 days, so the 3 new guides show up after their first real visit. Test visits don't count.
- **Not yet:** only the old nine names plus "Other page". The database update didn't run, so repeat step 7 (Option A) or step 8 (Option B).
- **Error text instead of a list:** the dashboard function failed. Check that both functions were deployed from `main` after PR #155 was merged.

**Optional: the same check in the SQL Editor.** Read-only:
```sql
select path from public.couples_alarm_report_pages order by path;
```
This should list the 15 site pages, including `/early-riser-alarm/`, `/alarm-without-smartwatch/` and `/vibration-alarm-app-alternative/`.

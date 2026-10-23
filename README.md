# 🃏 UNO Club — Office Leaderboard

A complete **static website** for GitHub Pages, backed by **Supabase**. No React, server, or npm build is necessary to deploy.

![Scoring](https://img.shields.io/badge/1st-%2B3_pts-e94639) ![Scoring](https://img.shields.io/badge/2nd-%2B2_pts-4277d1) ![Scoring](https://img.shields.io/badge/3rd-%2B1_pt-f7bb42) ![Scoring](https://img.shields.io/badge/most_cards--1_point-192636)

## What it does

- Public **weekly and all-time rankings** matching the original Excel layout, including first-, second-, third-place finishes, most-card penalties and points.
- Enter each game by choosing a date, **three different finishers**, and **one or more** players with the most cards. The site automatically applies +3 / +2 / +1 and distributes **one negative point across all tied most-card players**. Example: 2 tied = −0.5 each; 3 tied = −⅓ each.
- Add players; view individual new games; authorized scorekeepers can **delete an incorrect match** and re-enter it.
- Recreates the **18 players and Week 42 + Week 43 aggregates** from the Excel spreadsheet, with **124 total points**. Week 44 was empty and is left empty.
- Visitors can view without signing in. Only emails placed in Supabase's `editors` allowlist can add players or submit/delete games.
- Automatically chooses the current ISO week (Monday–Sunday), with week navigation, and refreshes scores periodically.
- Open the page **without Supabase configuration** for an immediately usable, read-only preview of the spreadsheet data.

> **Privacy:** GitHub Pages is public and this project intentionally lets the public read player names and scores. Do not use names/data that must remain private. If you want a private leaderboard, the read policies and sign-in flow need to be changed.

## Setup (about 5 steps)

### 1. Create a Supabase project

- At [Supabase](https://supabase.com/dashboard), create a project.
- Open **SQL Editor → New query**. Paste and run **`supabase/schema.sql`** in its entirety. This creates the database, protected score-entry functions, and row-level security policies.
- To import existing scores, open another SQL query and run **`supabase/seed_from_excel.sql`**. You can skip this only if you want to start with an empty leaderboard.

**The historical import is aggregated.** The workbook contains total counts per player for Weeks 42 and 43, not individual game records. Old per-game details can't be reconstructed; the new site logs individual games from now on. The `seed_from_excel.sql` file can be rerun safely; it updates historical totals rather than duplicating them.

### 2. Authorize scorekeepers

In Supabase **SQL Editor**, execute this once for **each** colleague allowed to record matches, substituting real email addresses:

```sql
insert into public.editors (email)
values ('your.name@work.com'), ('coworker@work.com')
on conflict do nothing;
```

You can add more editors later by executing another `insert`. To revoke editing permissions:

```sql
delete from public.editors where email = 'former.scorekeeper@work.com';
```

**No database password or secret key goes into the website.** The SQL functions verify the signed-in user's email against the allowlist on every write. Everybody else has read-only access.

### 3. Configure the website

Find your project's **Project URL** and **Publishable key** under Supabase **Project Settings → API Keys** (on some dashboards, this appears under **Connect / Data API**).

Edit `config.js`:

```js
export const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_...';
```

A legacy `anon` key also works. A **publishable** or **anon** key is designed to live in a frontend with RLS; **never use your `service_role`, `sb_secret_...`, or database password** in `config.js`.

### 4. Publish on GitHub Pages

1. Create a new GitHub repository, e.g. `uno-club`.
2. Upload the **contents** of this folder to the **root** of your repository (`index.html` must be at the top level). Include `config.js`, `app.js`, `scoring.js`, `preview-data.js`, `styles.css`, the `supabase/` folder, and `.nojekyll`. You can upload via GitHub's web UI or Git.
3. On GitHub open **Settings → Pages → Build and deployment**.
4. Choose **Deploy from a branch**, then **`main` → `/ (root)`**, and click **Save**.
5. Your URL will look like `https://YOUR-USERNAME.github.io/uno-club/`.

No build step or GitHub Actions workflow is required. The `.nojekyll` file tells GitHub Pages to serve the static project as-is.

### 5. Enable email sign-in redirects

In Supabase, go to **Authentication → URL Configuration**.

- **Site URL:** set to the exact GitHub Pages URL, e.g. `https://YOUR-USERNAME.github.io/uno-club/`.
- **Redirect URLs:** add that same URL (include the final `/`). If testing locally, add `http://localhost:8000/` too.
- Under **Authentication → Providers → Email**, make sure email sign-in is enabled. The site uses `signInWithOtp`, which sends an email magic link with the standard Supabase email template. Default hosted email sending can have rate limits; if multiple coworkers use the site frequently, configure custom SMTP in Supabase.

Now open the deployed site, enter an email from `editors`, click the sign-in email link, and record a match. Other visitors can see the live leaderboard without signing in.

## Run and test locally

Serve the files over HTTP instead of opening `index.html` as `file://`:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/` in your browser. With placeholder configuration, you'll see the Excel preview; with valid Supabase config, you'll see the live data.

To run the pure scoring unit tests (requires Node.js, no install step):

```bash
node --test tests/*.test.mjs
```

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Web page and input form |
| `styles.css` | Responsive UNO-themed styling |
| `app.js` | Supabase integration, sign-in, score submissions, leaderboards |
| `scoring.js` | Scoring math, ISO-week grouping, standings aggregation |
| `preview-data.js` | Historical Excel data for local/demo preview |
| `config.js` | Your **public** Supabase project URL and publishable key |
| `supabase/schema.sql` | Secure tables, RLS and validated score-entry functions |
| `supabase/seed_from_excel.sql` | Original weekly records from Excel |
| `tests/scoring.test.mjs` | Scoring and historical-import tests |

## Scoring notes

- The **penalties** column is the **number of penalty points** the player accumulated, rather than a count of games where they held the most cards. For example, one shared two-way penalty adds `0.5` to this column.
- If someone appears as both a finisher and one of the most-card players, the app combines the podium points and penalty. This is allowed for flexibility; scoring is always the sum of the contributions you submit.
- When there is a 3-way tie, each person loses **exactly 1/3**, not a prematurely rounded `0.33`. The UI displays up to three decimal digits. The leaderboard keeps full calculation precision.
- No historical match count is available for the Excel weeks, so the **New matches logged** tile counts games saved through this website only.
- A scorekeeper can fix a newly added match by clicking `×` in **Recent matches** and saving a corrected version. Imported Excel totals can be adjusted manually through the SQL Editor if needed.

## Security model

- Tables have **Row Level Security enabled**.
- `players`, `matches` and `legacy_weekly_scores` grant only public **SELECT**; direct client writes are disabled.
- `editors` is neither selectable nor editable by the anonymous/authenticated browser roles.
- `record_match`, `add_player` and `delete_match` run on the database, verify `can_edit_scores()` and validate inputs before writing. Each score submission is atomic.
- `record_match` validates unique podium places, unique loser IDs, active player references, note length and match dates. A game always has a full −1 penalty total, split among all selected most-card players.
- Anyone with a valid email can potentially create a Supabase Auth account, but **cannot modify any score** unless their email is explicitly allowlisted.

## Sources

- [Supabase: securing your data and RLS](https://supabase.com/docs/guides/database/secure-data)
- [Supabase: passwordless email sign-in](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [GitHub Pages: deploy from a branch](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

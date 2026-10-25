# Task 0: Hello world (connection test)

Proves that the page, the API, and the Supabase database can talk to each other, and that the
GitHub Pages deploy works. It is throwaway scaffolding: Task 1 replaces the page and drops the
`hello_world` table.

## What was built

- `backend/`: Express API with `GET /health`. It runs a trivial query and reads one row from `hello_world`.
- `backend/scripts/hello-table.js` (`npm run db:hello`): creates `hello_world` with row-level security ON and no policies. Safe to run twice. `npm run db:hello -- --drop` removes it.
- `frontend/`: a Vite + React page showing three rows (Page, API, Database), with loading, error and offline states.
- `.github/workflows/pages.yml`: builds the frontend and publishes it to GitHub Pages.
- 5 automated tests for the API (`npm test`).

## Run it

```
npm install                 # once, from the repo root
cp backend/.env.example backend/.env    # then edit backend/.env and paste your Session pooler string
npm run db:hello            # creates the test table
npm run dev                 # API on :3001, page on :5173
```

## Success criteria and how to check each

| # | Criterion | How to check | Expected |
|---|-----------|--------------|----------|
| 1 | Install works | `npm install` | Finishes without errors |
| 2 | Tests pass | `npm test` | `# pass 5`, `# fail 0` |
| 3 | Database reachable and table created | `npm run db:hello` | `hello_world is ready.` / `Row-level security: ON; policies: 0` / a line naming the role you connected as |
| 4 | Safe to run twice | `npm run db:hello` again | Same output, no error, still one row |
| 5 | API health | open http://localhost:3001/health | `{"status":"ok", "database":{"ok":true,"message":"Hello from Supabase", ...}}` |
| 6 | Page shows all three layers | open http://localhost:5173 | Page, API and Database all show "✓ Working" |
| 7 | Failure is visible | stop the API (Ctrl+C), click "Check again" | API shows "✕ Problem", Database shows "– Unknown" |
| 8 | Bad config is explained | put a wrong password in `backend/.env`, restart, reload | Database shows a plain-language hint, not a crash |
| 9 | Secrets are safe | `git status` | `backend/.env` is NOT listed |
| 10 | Supabase's public API can't read the table (optional) | see below | Empty result or an error, never the "Hello" row |
| 11 | Pages deploy (see below) | push to GitHub | Site loads; API row shows a problem (expected) |

### Check 10: the public API reads nothing

In Supabase, Project Settings > API shows your project URL and the `anon` key (this key is meant to be public). Then:

```
curl "https://<project-ref>.supabase.co/rest/v1/hello_world?select=*" -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>"
```

Expected: `[]`, or an error. If the Data API is turned off you get an error. You must NOT see `Hello from Supabase`.

### Check 11: GitHub Pages

1. Push the code to GitHub (`main`).
2. GitHub repo > Settings > Pages > Build and deployment > Source: **GitHub Actions**.
3. Settings > Secrets and variables > Actions > Variables: add `PAGES_BASE` = `/radar/` if the repo is still named `radar` (site at `avckiran.github.io/radar/`), or leave it unset for a repo named `avckiran.github.io` (site at the root).
4. Actions tab: the "Deploy frontend to GitHub Pages" run should go green; open the site.
5. The API row will say it can't reach the API, because no public API exists until Task 11, and a hosted page can't be expected to call your laptop. This is correct for now.

## Known limits and notes

- The database connection is encrypted but the server's certificate is not verified yet (Supabase's CA file is needed). Set `DB_SSL_CA_PATH` before go-live (Task 11).
- Dependencies were installed on Linux for testing; run `npm install` on your own machine.

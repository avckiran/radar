# RADAR

A shared household web app that keeps the things you must not forget in one place.

- `frontend/` React + Vite (plain JavaScript), published to GitHub Pages
- `backend/` Node + Express API, talks to Supabase Postgres
- `docs/` notes per task, setup guides, and `WORKLOG.md` (daily log)

## Run it (development)

1. Install Node 20 or newer (22 recommended; `.nvmrc` says 22).
2. `npm install` (once, from this folder; installs both apps).
3. `cp backend/.env.example backend/.env`, then put your Supabase connection string in `backend/.env`.
4. `npm run db:hello` (creates the tiny test table), then `npm run dev`.
5. Open http://localhost:5173

Secrets live only in `backend/.env`, which Git ignores. The repo is public, so never put secrets, passwords or personal data in any committed file, including `docs/`.

Current step: see `docs/tasks/` and `docs/WORKLOG.md`.

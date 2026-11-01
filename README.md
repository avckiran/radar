# RADAR

A shared household web app that keeps the things you must not forget in one place.

- `frontend/` React + Vite (plain JavaScript), published to GitHub Pages
- `backend/` Node + Express API, talks to Supabase Postgres (`backend/db/migrations` holds the schema)

## Run it (development)

1. Install Node 20 or newer (22 recommended; `.nvmrc` says 22).
2. `npm install` (once, from this folder; installs both apps).
3. `cp backend/.env.example backend/.env`, then put your Supabase Session pooler connection string in `backend/.env`.
4. `npm run db:migrate` (creates the tables) and `npm run db:seed` (loads sample data). Both are safe to run again.
5. Sign-in: in `backend/.env` set `JWT_SECRET` (long and random, see the comment in `.env.example`) and the two passwords `RADAR_PASSWORD_AVCKIRAN` and `RADAR_PASSWORD_KOARORA6` (at least 10 characters each). Then run `npm run auth:sync -w backend`. Run it again whenever you change a password; it also signs that person out everywhere.
6. `npm run dev`, then open http://localhost:5173 and sign in.
7. `npm test` runs the tests for both apps.

Secrets live only in `backend/.env`, which Git ignores. The repo is public, so never put secrets, passwords or personal data in any committed file.

## Putting it on the server

`deploy/` holds the server's service files and the backup, restore and update scripts. They contain no secrets. The step-by-step setup guide is kept outside Git.

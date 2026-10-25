# Supabase setup notes

- Connection: project > **Connect** > **Session pooler**. Username looks like `postgres.<project-ref>`. Use this on IPv4-only networks (most home networks and the Google VM); the direct connection is IPv6-only on the free plan.
- The string goes only in `backend/.env` as `DATABASE_URL`. Never paste it into chat, issues or commits.
- Percent-encode special characters in the password (`@` becomes `%40`), or reset the password to letters and numbers.
- Every table gets row-level security ON with no policies, so Supabase's own public API can read nothing. Our backend connects as a database role that is allowed past that.
- Optional extra safety: Data API settings > turn off **Enable Data API**.
- Free projects pause after about a week without activity; use **Restore** in the dashboard if that happens.

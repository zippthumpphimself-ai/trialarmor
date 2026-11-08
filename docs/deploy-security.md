# Deploy runbook: security + accounts (branch improvements-nov7)

Order matters: database first, then the app. The app degrades gracefully either way,
but the security fix only lands when the migration runs.

## 1. Run the SQL migration (requires Supabase dashboard access)
- Supabase Studio > project ojxhqbtozjxurzztqxpb > SQL Editor > New query.
- Paste the whole of migrations/2026-11-08_security.sql and run it.
- It is safe to run twice (everything is guarded).
- Effects: RLS on cards/charges, owner columns, stored PANs truncated to last-4 and
  CVVs wiped on existing rows, demo flag on existing rows, insert-only waitlist table,
  supporting indexes.

## 2. Update the charge-card Edge Function
- Studio > Edge Functions > charge-card: replace the code with
  docs/edge-function-charge-card.js and deploy.
- After this, the endpoint requires a signed-in user, rejects cards the caller does
  not own, and honors x-ta-idempotency-key.

## 3. Deploy the app
- Merge improvements-nov7 into main (GitHub Pages serves main automatically).
- Verify https://trialarmor.de/app/ loads; create an account; create a card; check
  only the last 4 digits are stored.

## 4. Verify with public-role probes (after step 1)
- Anonymous GET https://...supabase.co/rest/v1/cards must return ONLY is_demo rows,
  and charges only demo-card rows.
- Anonymous POST to cards must be rejected (401/403).
- The waitlist accepts inserts from anyone and returns nothing on GET.

## Blocked without dashboard access
Steps 1 and 2 cannot be done by the agent until the Supabase sign-in works
(saved password was rejected with "Invalid login credentials"; a re-save link was
sent to the user). Everything else on the branch is ready.

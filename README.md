# Trial Armor

Single-use cards that close themselves after their first successful charge, so a free trial never turns into a surprise renewal. A product of Bad Esse Inc., Guelph, Ontario, Canada.

## Live

- Landing page: https://trialarmor.de/ (this repo's `index.html`, served by GitHub Pages from `main`)
- App: https://trialarmor.de/app/ (`app/index.html`, `app/style.css`, `app/app.js`)
- Legal and contact: `/terms.html`, `/privacy.html`, `/contact.html`

## Status

The app is a working demo in mock mode. Cards, charges and fees are simulated: no real cards are issued and no real money moves. The Terms of Service say the same thing.

## How the demo works

- `app.js` talks straight to a Supabase project using its public anon key: `cards` and `charges` tables, plus an edge function `charge-card` that approves one positive charge on an active card and auto-closes it.
- The Trial Armor fee is recorded as a `charges` row labeled "Trial Armor fee — card $X, plan Y"; the dashboard recovers each card's amount and plan from that label.
- Plans (Casual / Plus $4.99/mo / Pro $9.99/mo) live in browser localStorage. There is no accounts or plans table yet, so a plan does not follow a user across devices.

## Pricing

Per-card fee by trial size: up to $25 = $1; $26 to $50 = $2; $51 to $100 = $3; $101 to $250 = $5; $251 to $500 = $8; $501 to $1,000 = $12; over $1,000 = $15.
Plus ($4.99/mo): flat $1 per card at any amount. Pro ($9.99/mo): no per-card fee up to $500, half the tiered fee above that.

## Deploy

GitHub Pages deploys `main` automatically (Deploy from a branch, root). The `CNAME` file pins the custom domain trialarmor.de; DNS lives at Spaceship (apex A record + www CNAME), email forwards via ImprovMX.

## Known issues (audit Nov 7, 2026)

1. No row security. The anon key ships in `app.js` and the `cards` and `charges` tables have no row-level security or per-user scoping, so anyone with the key (which is public, it is in the shipped JS) can read every demo card's full number, expiry and CVV, delete any card, and call `charge-card` on it. Acceptable only while every row is mock data. Before any real card data exists: enable row-level security, add per-user accounts, and stop storing full numbers and CVV in the demo store.
2. No login. Anyone who opens /app/ sees the shared demo card store, including other visitors' test cards.
3. Plans are browser-local (localStorage), not tied to an account.
4. The old Bolt prototype (trial-armor-subscrip-llo7.bolt.host) is still publicly reachable and predates the pricing build; the site no longer points at it, but it is discoverable.
5. GitHub Pages "Enforce HTTPS" is still off in the repo's Pages settings.


## Accounts and security (Nov 8, branch work)
- RLS migration in `migrations/2026-11-08_security.sql`: per-user ownership on cards
  and charges, demo rows read-only for anonymous visitors, stored PANs truncated to
  last-4 and CVVs wiped, insert-only waitlist table.
- `app/` is now account-aware: email+password sign in, private cards per user, demo
  data readable but not chargeable or deletable. Card numbers are stored last-4 only.
- `app/issuing.js`: provider-agnostic issuing adapter (sandbox mode), HMAC webhook
  verification, idempotency keys, single-use lifecycle. No real issuer contacted.
- `tests/test.js`: 15 unit tests (pricing, formatting, sandbox lifecycle, webhook
  signatures). Run with Node.
- Deployment order and public-role verification: see `docs/deploy-security.md`.
- Canadian issuing landscape and program model: `docs/issuing-providers-canada.md`.

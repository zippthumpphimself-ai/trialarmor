# Card issuing in Canada: providers and the required program model
Researched Nov 7-8, 2026. Sources are named inline; read before relying on any figure.
No application has been filed, no terms accepted, no sandbox credentials obtained.

## The program model (why there is no direct "sign up and issue" API)
Trial Armor would be a **program manager**: we own the customer relationship, the app,
the fee schedule and the UX. The actual card sits on a **sponsor bank's BIN** and runs
through an **issuer processor's** authorization platform, clearing on Visa or Mastercard
rails. Before a real card can be issued, the stack needs, at minimum:

1. A sponsor bank / BIN sponsor willing to underwrite the program (in Canada this is
   effectively Peoples Group or a handful of others).
2. An issuer processor (the API layer that mints cards, runs authorizations, and takes
   the network connection).
3. A compliance/KYC partner and an AML program (required before the bank will approve).
4. PCI-DSS scope containment: our systems must never store PANs or CVVs (see migration
   2026-11-08_security.sql; the app already stores last-4 only).
5. The company must be able to fund/settle the prepaid balances behind issued cards.

## Canadian issuing providers verified this pass
- **Peoples Group** (Vancouver). BIN sponsor since 2004; reports 30M+ prepaid cards
  issued across 750+ programs; customers include KOHO, Wealthsimple, Float, Loop, Mogo,
  Brim and Wise's Canadian operations. This is the sponsor bank tier.
  (Fintech Observer, "Prepaid and Virtual Cards in Canada", Apr 17 2026;
  peoplesgroup.com/fintech/solutions/payments)
- **KOHO Enterprise** (Canada, est. 2014). The embedded-finance/BaaS arm of KOHO;
  modular card issuing, payments, lending. Consumer-program experience at scale.
  (openbankingtracker.com/embedded-finance/koho-ca, Jul 28 2026)
- **i2c** (global processor with Canadian footprint). Card issuing, core banking,
  digital wallets. Known for config-driven programs and sandbox-first onboarding.
  (openbankingtracker.com; dashdevs.com issuing-platform comparison, Oct 22 2026)
- **Marqeta** (global). Modern card-issuing API; enterprise tier; supports Canadian
  programs. Pricing is enterprise-scale, likely above a launch-stage budget.
  (marqeta.com; openbankingtracker.com Marqeta alternatives page)
- **Berkeley Payments** (Toronto) and **EML Payments**: virtual-card processors with
  Canadian programs; both named in the same Fintech Observer roster. Also mentioned:
  Galileo (SoFi), Fiserv, Digital Commerce Group.

## Practical shortlist for Trial Armor
1. **KOHO Enterprise + Peoples Group BIN** - Canadian-native, consumer-friendly, and
   both tiers exist off-the-shelf. First conversation to have.
2. **i2c** - best developer surface for the adapter design in this repo; ask for a
   Canadian BIN option and sandbox access during the first call.
3. **Marqeta** - capable but enterprise-priced; revisit at scale.

## What the adapter in app/issuing.js already covers
Provider-agnostic interface (issueCard / getCard / closeCard / authorize /
listAuthorizations), HMAC-SHA256 webhook verification with replay window,
idempotency keys on issuance and authorizations, and the single-use state machine
(active -> closed on first approval). A real adapter implements the same class; no
app rewrite needed. A live integration additionally requires: server-side secrets
(never in the browser), a server context for authorizations (edge function), and the
sponsor bank's signed program agreement, which we do not have and have not applied for.

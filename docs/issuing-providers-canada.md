# Card issuing in Canada: providers and the required program model
Researched Nov 7-8, 2026; provider pages re-verified live Nov 8. Sources named inline.
No application has been filed, no terms accepted, no sandbox credentials obtained,
no costs incurred.

## Sandbox readiness vs a signed program (read this first)
What Trial Armor HAS today is technical sandbox readiness only:
- `app/issuing.js` simulates the full single-use card lifecycle end to end with the
  exact adapter shape a real provider integration will use (issue/get/close/authorize,
  webhook signature verification, idempotency keys, reveal-once PAN handling).
- The app is card-issuing-ready in software terms; it issues no real cards.
What a signed program is, and none of it exists yet:
- A sponsor bank agreement on a BIN (Peoples Group or equivalent),
- an issuer-processor contract (i2c/KOHO Enterprise/etc.),
- a KYC/AML program the sponsor bank approves, and funding for settlement.
Nothing in this repo should be presented to anyone as live card issuing.

## The program model (why there is no direct "sign up and issue" API)
Trial Armor would be a **program manager**: we own the customer relationship, the app,
the fee schedule and the UX. The actual card sits on a **sponsor bank's BIN** and runs
through an **issuer processor's** authorization platform, clearing on Visa or Mastercard
rails. Before a real card can be issued, the stack needs, at minimum:

1. A sponsor bank / BIN sponsor willing to underwrite the program.
2. An issuer processor (the API layer that mints cards, runs authorizations, and takes
   the network connection).
3. A compliance/KYC partner and an AML program (required before the bank will approve).
4. PCI-DSS scope containment: our systems must never store PANs or CVVs (see migration
   2026-11-08_security.sql; the app already stores last-4 only).
5. The company must be able to fund/settle the balances behind issued cards.

## Canadian issuing providers verified this pass
- **Peoples Group** (Vancouver). BIN sponsor since 2004; reports 30M+ prepaid cards
  issued across 750+ programs; customers include KOHO, Wealthsimple, Float, Loop, Mogo,
  Brim and Wise's Canadian operations. This is the sponsor bank tier.
  (Fintech Observer, "Prepaid and Virtual Cards in Canada", Apr 17 2026;
  peoplesgroup.com/fintech/solutions/payments)
- **KOHO Enterprise** (Canada). Page verified live Nov 8: koho.ca/enterprise offers
  "co-branded or white-label fully customizable prepaid cards", a payments ecosystem
  (Interac e-Transfer, direct deposit, P2P), credit building, and dedicated technical
  and program-management resources from scoping to steady state. Mastercard-prepaid
  cards issued by KOHO Financial Inc. Engagement path: their Enterprise page and
  koho.ca/contact. This is the most Canadian-native, consumer-ready candidate.
- **i2c** (global processor). Page verified live Nov 8: issuer processing for credit,
  debit and prepaid, core banking, money movement, fraud risk management; public
  developer API library at apis.i2cinc.com; client portal at tracking.i2cinc.com.
  Known for config-driven programs and sandbox-first onboarding. Ask for a Canadian
  BIN option during the first conversation.
- **Marqeta** (global). Modern card-issuing API; enterprise tier; supports Canadian
  programs. Pricing is enterprise-scale, likely above a launch-stage budget.
- **Berkeley Payments** (Toronto) and **EML Payments**: virtual-card processors with
  Canadian programs (Fintech Observer roster). Also named: Galileo (SoFi), Fiserv,
  Digital Commerce Group.

## Practical shortlist for Trial Armor
1. **KOHO Enterprise** - Canadian-native, consumer-friendly, white-label card programs,
   page verified live. First conversation to have.
2. **i2c** - best public developer surface for the adapter in this repo; ask for a
   Canadian BIN option and sandbox access.
3. **Peoples Group** - the BIN sponsor tier; often reached directly or via KOHO.
4. **Marqeta** - capable but enterprise-priced; revisit at scale.

## What the adapter in app/issuing.js already covers
Provider-agnostic interface (issueCard / getCard / closeCard / authorize /
listAuthorizations), HMAC-SHA256 webhook verification with replay window,
idempotency keys on issuance and authorizations, and the single-use state machine
(active -> closed on first approval). A real adapter implements the same class; no
app rewrite needed. A live integration additionally requires: server-side secrets
(never in the browser), a server context for authorizations (edge function), and the
sponsor bank's signed program agreement, which we do not have and have not applied for.

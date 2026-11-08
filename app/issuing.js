// Trial Armor issuing adapter layer — SANDBOX ONLY.
// Nothing in this file contacts a real issuer, stores a real card number,
// or moves real money. The sandbox adapter simulates the whole card lifecycle
// in memory so the product can be built and tested end to end before a
// sponsor-bank program exists. The banner text is part of the contract:
// anything produced here must be presented as simulated.
//
// Adapter contract (implement this class to plug in a real provider later):
//   issueCard({cardholderId, spendCents, currency, idempotencyKey})
//       -> {ok, card:{providerCardId, token, last4, expMonth, expYear, status}, revealOnce}
//   getCard(providerCardId)      -> {ok, card}
//   closeCard(providerCardId)    -> {ok}
//   authorize({providerCardId, amountCents, idempotencyKey})
//       -> {ok, decision:"approved"|"declined", reason?, authorizationId?}
// Adapters MUST NOT return or persist a full PAN after the initial reveal.
(function (root) {
  const MODE = "sandbox";

  function isSandbox() { return MODE === "sandbox"; }

  function makeIdemKey(seed) {
    const base = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : "idem-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    return seed ? seed + "-" + base : base;
  }

  // Single-use card lifecycle. `active` is the only state that can be charged;
  // `closed` and `failed` are terminal.
  const STATES = { CREATED: "created", ACTIVE: "active", CLOSED: "closed", FAILED: "failed" };
  function canCharge(status) { return status === STATES.ACTIVE; }

  function SandboxAdapter() {
    this.cards = new Map();      // providerCardId -> card record (no full PAN kept)
    this.authz = new Map();      // providerCardId -> [authorization]
    this.idem = new Map();       // idempotencyKey  -> decision
    this.seq = 0;
  }
  SandboxAdapter.prototype._newCardNumber = function () {
    // Luhn-valid-looking Visa test number. Generated, shown once, never stored.
    let digits = "424242424242" + String(1000 + (this.seq++) % 9000);
    let sum = 0, dbl = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = Number(digits[i]);
      if (dbl) { d *= 2; if (d > 9) d -= 9; }
      sum += d; dbl = !dbl;
    }
    if (sum % 10 !== 0) digits = digits.slice(0, -1) + String((10 - (sum * 10) % 10) % 10);
    return digits;
  };
  SandboxAdapter.prototype.issueCard = function (req) {
    req = req || {};
    const idemKey = req.idempotencyKey || makeIdemKey("issue");
    if (this.idem.has(idemKey)) return { ok: true, card: this.idem.get(idemKey).card };
    const pan = this._newCardNumber();
    const now = new Date();
    const card = {
      providerCardId: "sbx_" + now.getTime() + "_" + Math.random().toString(16).slice(2, 8),
      token: makeIdemKey("tok"),
      last4: pan.slice(-4),
      expMonth: String(1 + Math.floor(Math.random() * 12)).padStart(2, "0"),
      expYear: String(new Date().getFullYear() + 2),
      currency: req.currency || "CAD",
      spendCents: req.spendCents || null,
      status: STATES.ACTIVE,
      createdAt: now.toISOString(),
      program: "sandbox-single-use"
    };
    this.cards.set(card.providerCardId, card);
    this.authz.set(card.providerCardId, []);
    this.idem.set(idemKey, { card: card });
    return { ok: true, card: card, revealOnce: pan, sandbox: true };
  };
  SandboxAdapter.prototype.getCard = function (id) {
    const card = this.cards.get(id);
    return card ? { ok: true, card: card } : { ok: false, error: "not_found" };
  };
  SandboxAdapter.prototype.closeCard = function (id) {
    const card = this.cards.get(id);
    if (!card) return { ok: false, error: "not_found" };
    card.status = STATES.CLOSED;
    return { ok: true, card: card };
  };
  SandboxAdapter.prototype.authorize = function (req) {
    req = req || {};
    const card = this.cards.get(req.providerCardId);
    if (!card) return { ok: true, decision: "declined", reason: "card_not_found" };
    const idemKey = req.idempotencyKey || makeIdemKey("auth");
    if (this.idem.has(idemKey)) return this.idem.get(idemKey);
    let decision;
    if (!canCharge(card.status)) {
      decision = { ok: true, decision: "declined", reason: "card_closed", sandbox: true };
    } else if (card.spendCents != null && req.amountCents > card.spendCents) {
      decision = { ok: true, decision: "declined", reason: "amount_exceeds_limit", sandbox: true };
    } else {
      decision = {
        ok: true, decision: "approved", sandbox: true,
        authorizationId: "sbxa_" + Date.now() + "_" + Math.random().toString(16).slice(2, 8),
        amountCents: req.amountCents
      };
      card.status = STATES.CLOSED; // single-use: first approval closes the card
    }
    const list = this.authz.get(req.providerCardId) || [];
    list.push({ id: decision.authorizationId || null, amountCents: req.amountCents, status: decision.decision, at: new Date().toISOString() });
    this.authz.set(req.providerCardId, list);
    this.idem.set(idemKey, decision);
    return decision;
  };
  SandboxAdapter.prototype.listAuthorizations = function (id) {
    return this.authz.get(id) || [];
  };

  // Webhook signature verification, shared by every adapter:
  // HMAC-SHA256 over `${timestamp}.${rawBody}`, hex, compared in constant time,
  // with a replay window (default 5 minutes). Pass the RAW body bytes/lines, never
  // a re-serialized object.
  async function verifyWebhookSignature(rawBody, headers, secret, opts) {
    opts = opts || {};
    const get = (k) => (typeof headers.get === "function" ? headers.get(k) : headers[k]);
    const sig = String(get(opts.signatureHeader || "x-ta-signature") || "").replace(/^sha256=/, "");
    const ts = Number(get(opts.timestampHeader || "x-ta-timestamp") || 0);
    if (!sig || !ts || !secret) return false;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, enc.encode(ts + "." + rawBody));
    const expected = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, "0")).join("");
    if (expected.length !== sig.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    if (diff !== 0) return false;
    return Math.abs(Date.now() - ts * 1000) <= ((opts.maxAgeSec || 300) * 1000);
  }

  const TA = {
    MODE: MODE, isSandbox: isSandbox, makeIdemKey: makeIdemKey,
    STATES: STATES, canCharge: canCharge,
    SandboxAdapter: SandboxAdapter,
    verifyWebhookSignature: verifyWebhookSignature,
    adapter: new SandboxAdapter()
  };
  if (typeof module !== "undefined" && module.exports) module.exports = TA;
  else root.TAIssuing = TA;
})(typeof window !== "undefined" ? window : globalThis);

// Trial Armor unit tests. Runs under Node or any CommonJS-capable runtime.
const assert = require("assert");
const path = require("path");
const core = require(path.join(__dirname, "..", "app", "core.js"));
const issuing = require(path.join(__dirname, "..", "app", "issuing.js"));
let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { failed++; console.log("FAIL  " + name + " -> " + e.message); }
}

console.log("core: pricing");
t("tier fees match the published tiers", () => {
  assert.equal(core.tierFee(10), 1); assert.equal(core.tierFee(25), 1);
  assert.equal(core.tierFee(26), 2); assert.equal(core.tierFee(50), 2);
  assert.equal(core.tierFee(51), 3); assert.equal(core.tierFee(100), 3);
  assert.equal(core.tierFee(101), 5); assert.equal(core.tierFee(250), 5);
  assert.equal(core.tierFee(251), 8); assert.equal(core.tierFee(500), 8);
  assert.equal(core.tierFee(501), 12); assert.equal(core.tierFee(1000), 12);
  assert.equal(core.tierFee(1001), 15); assert.equal(core.tierFee(5000), 15);
});
t("plan fees: plus is flat $1", () => {
  assert.equal(core.feeFor(25, "plus"), 1); assert.equal(core.feeFor(1000, "plus"), 1);
});
t("plan fees: pro free to $500, half fee above", () => {
  assert.equal(core.feeFor(500, "pro"), 0);
  assert.equal(core.feeFor(501, "pro"), 6);
  assert.equal(core.feeFor(1000, "pro"), 6);
  assert.equal(core.feeFor(1001, "pro"), 7.5);
});
t("plan fees: casual equals tier fee", () => {
  assert.equal(core.feeFor(30), 2); assert.equal(core.feeFor(600), 12);
});
t("money formats integers and decimals", () => {
  assert.equal(core.money(5), "$5"); assert.equal(core.money(4.99), "$4.99");
});

console.log("core: formatting");
t("mask hides a spaced full number, keeps last group", () => {
  assert.equal(core.mask("4242 3638 2326 1875"), "\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 1875");
});
t("mask handles last-4-only storage", () => {
  assert.equal(core.mask("1875"), "\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 1875");
  assert.equal(core.mask(""), "\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 ");
});
t("fee row parsing reads plan and amount", () => {
  assert.equal(core.parsePlan({ decline_reason: "Trial Armor fee — card $9.99, plan plus" }), "plus");
  assert.equal(core.parseAmt({ decline_reason: "Trial Armor fee — card $9.99, plan plus" }), 9.99);
  assert.equal(core.parseAmt({}), null);
});

console.log("issuing: sandbox adapter");
t("mode is sandbox and says so", () => {
  assert.equal(issuing.MODE, "sandbox"); assert.equal(issuing.isSandbox(), true);
});
t("issue returns a reveal-once PAN and stores only last4", () => {
  const a = new issuing.SandboxAdapter();
  const r = a.issueCard({ cardholderId: "u1", spendCents: 999 });
  assert.equal(r.ok, true); assert.ok(r.revealOnce, "revealOnce present");
  assert.equal(r.card.last4, r.revealOnce.slice(-4));
  const g = a.getCard(r.card.providerCardId);
  assert.equal(g.ok, true);
  assert.ok(!JSON.stringify(g.card).includes(r.revealOnce), "full PAN is not stored");
  assert.equal(g.card.status, issuing.STATES.ACTIVE);
});
t("issue honors an idempotency key", () => {
  const a = new issuing.SandboxAdapter();
  const r1 = a.issueCard({ idempotencyKey: "k1" });
  const r2 = a.issueCard({ idempotencyKey: "k1" });
  assert.equal(r1.card.providerCardId, r2.card.providerCardId);
});
t("first approval closes the card, second declines", () => {
  const a = new issuing.SandboxAdapter();
  const c = a.issueCard({}).card;
  const d1 = a.authorize({ providerCardId: c.providerCardId, amountCents: 500 });
  assert.equal(d1.decision, "approved");
  const g = a.getCard(c.providerCardId).card;
  assert.equal(g.status, issuing.STATES.CLOSED);
  const d2 = a.authorize({ providerCardId: c.providerCardId, amountCents: 500, idempotencyKey: "z" });
  assert.equal(d2.decision, "declined");
  assert.equal(d2.reason, "card_closed");
});
t("spend cap declines over-limit amounts without closing the card", () => {
  const a = new issuing.SandboxAdapter();
  const c = a.issueCard({ spendCents: 1000 }).card;
  const d = a.authorize({ providerCardId: c.providerCardId, amountCents: 1500 });
  assert.equal(d.decision, "declined");
  assert.equal(d.reason, "amount_exceeds_limit");
  assert.equal(a.getCard(c.providerCardId).card.status, issuing.STATES.ACTIVE);
});
t("idempotent authorize returns the same decision", () => {
  const a = new issuing.SandboxAdapter();
  const c = a.issueCard({}).card;
  const d1 = a.authorize({ providerCardId: c.providerCardId, amountCents: 100, idempotencyKey: "k" });
  const d2 = a.authorize({ providerCardId: c.providerCardId, amountCents: 100, idempotencyKey: "k" });
  assert.equal(d1.decision, d2.decision);
  assert.equal(a.listAuthorizations(c.providerCardId).length, 1, "no duplicate authorization row");
});
t("canCharge is true only for active cards", () => {
  assert.equal(issuing.canCharge(issuing.STATES.ACTIVE), true);
  assert.equal(issuing.canCharge(issuing.STATES.CLOSED), false);
  assert.equal(issuing.canCharge(issuing.STATES.FAILED), false);
});

console.log("issuing: webhook signature (async)");
(async () => {
  const enc = new TextEncoder();
  const secret = "whsec_test_123";
  const body = JSON.stringify({ type: "card.closed", at: 1 });
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const ts = String(Math.floor(Date.now() / 1000));
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(ts + "." + body));
  const hex = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, "0")).join("");
  const ok = await issuing.verifyWebhookSignature(body, { "x-ta-signature": "sha256=" + hex, "x-ta-timestamp": ts }, secret);
  const bad = await issuing.verifyWebhookSignature(body + " ", { "x-ta-signature": "sha256=" + hex, "x-ta-timestamp": ts }, secret);
  const replay = await issuing.verifyWebhookSignature(body, { "x-ta-signature": "sha256=" + hex, "x-ta-timestamp": String(Math.floor(Date.now() / 1000) - 30) }, secret, { maxAgeSec: 5 });
  const stale = await issuing.verifyWebhookSignature(body, { "x-ta-signature": "sha256=" + hex, "x-ta-timestamp": String(Math.floor(Date.now() / 1000) - 600) }, secret, { maxAgeSec: 5 });
  console.log((ok && !bad && !stale ? "  ok  " : "FAIL  ") + "signature: valid ok=" + ok + " tampered=" + bad + " stale=" + stale);
  console.log((replay ? "FAIL" : "  ok  ") + " signature: out-of-window ts rejected inside 5s window");
  if (!(ok && !bad && !stale && !replay)) failed++;
  console.log("\n" + passed + " passed, " + failed + " failed");
  if (typeof process !== "undefined" && process.exit) process.exit(failed ? 1 : 0);
})();

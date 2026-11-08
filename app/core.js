// Trial Armor core: pure pricing, formatting and parsing helpers.
// Shared by the app and the test suite; no DOM, no network.
(function (root) {
  function tierFee(a) {
    a = Number(a);
    if (!(a > 0)) return 0;
    if (a <= 25) return 1;
    if (a <= 50) return 2;
    if (a <= 100) return 3;
    if (a <= 250) return 5;
    if (a <= 500) return 8;
    if (a <= 1000) return 12;
    return 15;
  }
  function feeFor(a, plan) {
    plan = plan || "casual";
    if (plan === "plus") return 1;
    if (plan === "pro") return a <= 500 ? 0 : tierFee(a) / 2;
    return tierFee(a);
  }
  function money(f) {
    f = Number(f);
    return "$" + (Number.isInteger(f) ? f : f.toFixed(2));
  }
  function mask(n) {
    const s = String(n || "");
    if (s.includes(" ")) {
      const p = s.split(" ");
      return p.slice(0, p.length - 1).map(function () { return "\u2022\u2022\u2022\u2022"; }).join(" ") + " " + p[p.length - 1];
    }
    return "\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 " + s;
  }
  function parsePlan(fr) {
    const m = /plan (\w+)/i.exec((fr && fr.decline_reason) || "");
    return m ? m[1].toLowerCase() : "casual";
  }
  function parseAmt(fr) {
    const m = /card \$([\d.]+)/i.exec((fr && fr.decline_reason) || "");
    return m ? parseFloat(m[1]) : null;
  }
  const TA = { tierFee: tierFee, feeFor: feeFor, money: money, mask: mask, parsePlan: parsePlan, parseAmt: parseAmt };
  if (typeof module !== "undefined" && module.exports) module.exports = TA;
  else root.TACore = TA;
})(typeof window !== "undefined" ? window : globalThis);

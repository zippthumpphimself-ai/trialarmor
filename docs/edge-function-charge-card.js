// Trial Armor - replacement charge-card Edge Function (sandbox mode)
// Deploy: Supabase Studio > Edge Functions > charge-card > paste over the code > Deploy.
// Behavior matches the current mock: first successful charge closes the card.
// Changes vs the live version:
//   1. Verifies the caller is a signed-in user (never trusts the anon key).
//   2. Rejects charges on cards the caller does not own (demo cards are not chargeable).
//   3. Honors an idempotency key (x-ta-idempotency-key header) so a retried tap
//      cannot double-charge.
// No real issuer is contacted; nothing here moves real money.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ta-idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const idemKey = (req.headers.get("x-ta-idempotency-key") || "").slice(0, 100) || null;
    const { cardId, amount } = await req.json();
    if (!cardId || !(amount > 0)) return json({ error: "cardId and a positive amount are required" }, 400);

    const url = Deno.env.get("SUPABASE_URL");
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

    // 1. Who is calling? The anon key must never be accepted as a charge authority.
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    const user = userData?.user;
    if (userErr || !user) return json({ error: "Sign in to run charges." }, 401);

    // 2. Idempotency: same key returns the original result, no second charge.
    if (idemKey) {
      const { data: existing } = await admin
        .from("charges").select("*").eq("idempotency_key", idemKey).maybeSingle();
      if (existing) return json(existing, 200);
    }

    // 3. Ownership + state checks
    const { data: card } = await admin
      .from("cards").select("id,owner,status,is_demo").eq("id", cardId).maybeSingle();
    if (!card) return json({ error: "Card not found" }, 404);
    if (card.is_demo || card.owner !== user.id)
      return json({ error: "You do not own this card." }, 403);
    if (card.status !== "active")
      return json({ status: "declined", reason: "Card is closed — single-use card already spent" }, 200);

    // 4. Sandbox charge + auto-close (the whole point of a single-use card)
    const { data: charge, error } = await admin
      .from("charges")
      .insert({ card_id: cardId, amount, status: "succeeded", owner: user.id, idempotency_key: idemKey })
      .select()
      .single();
    if (error) return json({ error: error.message }, 500);
    await admin.from("cards").update({ status: "dead" }).eq("id", cardId);
    return json(charge, 200);
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

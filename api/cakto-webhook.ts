import { createClient } from "@supabase/supabase-js";

interface ApiRequest {
  method?: string;
  body?: unknown;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

interface CaktoPayload {
  secret?: string;
  event?: string;
  data?: {
    id?: string;
    customer?: { email?: string };
    offer?: { id?: string; price?: number };
    product?: { id?: string };
    checkout?: string | number;
    checkoutUrl?: string;
    amount?: number;
    paidAt?: string;
    subscription_period?: number;
  };
}

const ACTIVE_EVENTS = new Set(["purchase_approved", "subscription_created", "subscription_renewed"]);
const REVOKE_EVENTS = new Set(["refund", "chargeback", "subscription_canceled"]);
const PRO_CHECKOUT = "https://pay.cakto.com.br/9875ykt_1099216";
const ELITE_CHECKOUT = "https://pay.cakto.com.br/vuq4djx";

function safeEqual(received: string, expected: string) {
  if (received.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < received.length; index += 1) difference |= received.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

function planFrom(payload: CaktoPayload): "pro" | "elite" | null {
  const data = payload.data;
  const offerId = String(data?.offer?.id || "");
  const checkoutUrl = String(data?.checkoutUrl || "").replace(/\/$/, "");
  const price = Number(data?.offer?.price);
  if ((process.env.CAKTO_ELITE_OFFER_ID && offerId === process.env.CAKTO_ELITE_OFFER_ID) || checkoutUrl === ELITE_CHECKOUT || price === 67) return "elite";
  if ((process.env.CAKTO_PRO_OFFER_ID && offerId === process.env.CAKTO_PRO_OFFER_ID) || checkoutUrl === PRO_CHECKOUT || price === 27) return "pro";
  return null;
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") return response.status(405).json({ error: "method_not_allowed" });

  const payload = request.body as CaktoPayload;
  const webhookSecret = process.env.CAKTO_WEBHOOK_SECRET || "";
  if (!webhookSecret || !payload?.secret || !safeEqual(payload.secret, webhookSecret)) return response.status(401).json({ error: "invalid_secret" });

  const event = String(payload.event || "");
  if (!ACTIVE_EVENTS.has(event) && !REVOKE_EVENTS.has(event)) return response.status(200).json({ received: true, ignored: true });

  const eventId = String(payload.data?.id || "");
  const email = String(payload.data?.customer?.email || "").trim().toLowerCase();
  const plan = planFrom(payload);
  if (!eventId || !email) return response.status(400).json({ error: "missing_order_or_customer" });
  // A Cakto envia uma oferta fictícia nos testes do painel. Confirmamos o
  // recebimento sem conceder acesso quando a oferta não é Pro nem Elite.
  if (ACTIVE_EVENTS.has(event) && !plan) return response.status(200).json({ received: true, ignored: true, reason: "unknown_offer" });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return response.status(500).json({ error: "server_not_configured" });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.rpc("process_cakto_webhook", {
    p_event_id: eventId,
    p_event: event,
    p_email: email,
    p_plan: plan || "free",
    p_offer_id: String(payload.data?.offer?.id || "") || null,
    p_product_id: String(payload.data?.product?.id || "") || null,
    p_checkout_id: String(payload.data?.checkout || "") || null,
    p_amount: Number(payload.data?.amount || 0),
    p_period_months: Math.min(24, Math.max(1, Number(payload.data?.subscription_period || 1))),
    p_occurred_at: payload.data?.paidAt || new Date().toISOString(),
  });

  if (error) {
    console.error("[cakto-webhook]", error.code, error.message);
    return response.status(500).json({ error: "processing_failed" });
  }
  return response.status(200).json({ received: true, result: data });
}

import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://bqxdfnovkbxbveahlyjl.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fWzvPT8rPm_9K6VC1Glh8A_LsuBe7RG";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_SUPABASE_URL;
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

// Whether Supabase is properly configured (used to show friendly errors instead of crashing).
export const supabaseConfigured = Boolean(url && anonKey);

if (!supabaseConfigured) {
  // Don't crash the whole app (white screen) — log a clear message instead.
  console.error(
    "[Supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ausentes. " +
      "Configure as variáveis de ambiente (Vercel: Settings → Environment Variables) e faça redeploy."
  );
}

export const supabase = createClient(
  url,
  anonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // implícito → o callback do OAuth (Google) e do recovery volta os tokens
      // no fragmento (#access_token=...), que o App.tsx processa manualmente.
      flowType: "pkce"
    }
  }
);

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Whether Supabase is properly configured (used to show friendly errors instead of crashing).
export const supabaseConfigured = Boolean(url && anonKey);

if (!supabaseConfigured) {
  // Don't crash the whole app (white screen) — log a clear message instead.
  console.error(
    "[Supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ausentes. " +
      "Configure as variáveis de ambiente (Vercel: Settings → Environment Variables) e faça redeploy."
  );
}

// Fallback placeholders keep createClient from throwing at import time when env is missing.
// Auth/DB calls will fail gracefully (and are caught) until the real env is configured.
export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  anonKey || "placeholder-anon-key",
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

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import ClipShop from "./components/clipshop";
import LandingPage from "./components/landing/LandingPage";
import AuthPage from "./components/auth/AuthPage";
import { supabase, supabaseConfigured } from "./lib/supabase";

type AccountProfile = {
  name?: string | null;
  email?: string | null;
  plan: string;
  isAdmin: boolean;
};

async function loadAccountProfile(session: Session): Promise<AccountProfile> {
  const [{ data: profile, error: profileError }, { data: usage, error: usageError }] = await Promise.all([
    supabase.from("profiles").select("name,email,plan,is_admin").eq("id", session.user.id).single(),
    supabase.rpc("get_clip_shop_usage"),
  ]);

  const usageRow = Array.isArray(usage) ? usage[0] : usage;
  if (profileError && usageError) throw profileError;
  const storedPlan = String(profile?.plan || "free").trim().toLowerCase();
  const effectivePlan = usageError ? storedPlan : String(usageRow?.plan || storedPlan).trim().toLowerCase();

  return {
    name: profile?.name,
    email: profile?.email,
    plan: effectivePlan,
    isAdmin: Boolean(profile?.is_admin) || effectivePlan === "admin",
  };
}

function route() {
  const hash = window.location.hash.toLowerCase();
  if (hash.startsWith("#/clipshop")) return "app";
  if (hash.startsWith("#/auth")) return "auth";
  return "landing";
}

export default function App() {
  const [currentRoute, setCurrentRoute] = useState(route());
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);

  useEffect(() => {
    const onHash = () => setCurrentRoute(route());
    window.addEventListener("hashchange", onHash);
    if (supabaseConfigured) {
      supabase.auth.getSession().then(({ data }) => setSession(data.session));
      const { data } = supabase.auth.onAuthStateChange((_event, next) => {
        setProfile(null);
        setSession(next);
      });
      return () => { window.removeEventListener("hashchange", onHash); data.subscription.unsubscribe(); };
    }
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!session || !supabaseConfigured) {
      setProfile(null);
      return;
    }

    let active = true;
    loadAccountProfile(session)
      .then((nextProfile) => { if (active) setProfile(nextProfile); })
      .catch((error) => {
        console.error("[Supabase] Não foi possível carregar o perfil da conta.", error);
        if (active) setProfile({
          name: session.user.user_metadata?.name,
          email: session.user.email,
          plan: String(session.user.user_metadata?.plan || "free"),
          isAdmin: false,
        });
      });
    return () => { active = false; };
  }, [session?.access_token, session?.user.id]);

  if (currentRoute === "auth") {
    if (session) { window.location.hash = "#/clipshop"; return null; }
    return <AuthPage />;
  }

  if (currentRoute === "app") {
    if (supabaseConfigured && !session) { window.location.hash = "#/auth?mode=login"; return null; }
    if (supabaseConfigured && session && !profile) return null;
    const user = session?.user;
    return <ClipShop
      currentUser={{
        id: user?.id,
        name: String(profile?.name || user?.user_metadata?.name || user?.email?.split("@")[0] || "Visitante"),
        email: profile?.email || user?.email || "demo@umbra.app",
        plan: profile?.plan || "free",
        isAdmin: profile?.isAdmin || false,
      }}
      onExitToApp={() => { window.location.hash = ""; }}
      onLogout={() => { void supabase.auth.signOut(); window.location.hash = ""; }}
      onUpgrade={() => { window.location.hash = "#precos"; }}
    />;
  }

  return <LandingPage session={session} />;
}

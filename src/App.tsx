import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
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

function fallbackProfile(session: Session): AccountProfile {
  return {
    name: session.user.user_metadata?.name,
    email: session.user.email,
    plan: String(session.user.user_metadata?.plan || "free"),
    isAdmin: false,
  };
}

function LoadingScreen({ message = "Carregando sua conta..." }: { message?: string }) {
  return <main className="grid min-h-screen place-items-center bg-[#070707] text-zinc-200"><div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-400" /><p className="mt-4 text-xs font-bold text-zinc-500">{message}</p></div></main>;
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
  const [authLoading, setAuthLoading] = useState(supabaseConfigured);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    const onHash = () => setCurrentRoute(route());
    window.addEventListener("hashchange", onHash);
    if (supabaseConfigured) {
      supabase.auth.getSession()
        .then(({ data }) => setSession(data.session))
        .catch((error) => console.error("[Supabase] Não foi possível restaurar a sessão.", error))
        .finally(() => setAuthLoading(false));
      const { data } = supabase.auth.onAuthStateChange((event, next) => {
        if (event === "SIGNED_OUT") setProfile(null);
        setSession(next);
        setAuthLoading(false);
      });
      return () => { window.removeEventListener("hashchange", onHash); data.subscription.unsubscribe(); };
    }
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!session || !supabaseConfigured) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    let active = true;
    setProfileLoading(true);
    const timeout = window.setTimeout(() => {
      if (active) {
        setProfile((current) => current || fallbackProfile(session));
        setProfileLoading(false);
      }
    }, 6000);
    loadAccountProfile(session)
      .then((nextProfile) => { if (active) setProfile(nextProfile); })
      .catch((error) => {
        console.error("[Supabase] Não foi possível carregar o perfil da conta.", error);
        if (active) setProfile(fallbackProfile(session));
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setProfileLoading(false);
      });
    return () => { active = false; window.clearTimeout(timeout); };
  }, [session?.user.id]);

  useEffect(() => {
    if (authLoading) return;
    if (currentRoute === "auth" && session) window.location.hash = "#/clipshop";
    if (currentRoute === "app" && supabaseConfigured && !session) window.location.hash = "#/auth?mode=login";
  }, [authLoading, currentRoute, session]);

  if (authLoading) return <LoadingScreen message="Restaurando sua sessão..." />;

  if (currentRoute === "auth") {
    if (session) return <LoadingScreen />;
    return <AuthPage />;
  }

  if (currentRoute === "app") {
    if (supabaseConfigured && !session) return <LoadingScreen message="Abrindo o login..." />;
    if (supabaseConfigured && session && profileLoading && !profile) return <LoadingScreen />;
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

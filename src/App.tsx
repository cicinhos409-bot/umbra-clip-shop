import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import ClipShop from "./components/clipshop";
import LandingPage from "./components/landing/LandingPage";
import AuthPage from "./components/auth/AuthPage";
import { supabase, supabaseConfigured } from "./lib/supabase";

function route() {
  const hash = window.location.hash.toLowerCase();
  if (hash.startsWith("#/clipshop")) return "app";
  if (hash.startsWith("#/auth")) return "auth";
  return "landing";
}

export default function App() {
  const [currentRoute, setCurrentRoute] = useState(route());
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const onHash = () => setCurrentRoute(route());
    window.addEventListener("hashchange", onHash);
    if (supabaseConfigured) {
      supabase.auth.getSession().then(({ data }) => setSession(data.session));
      const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
      return () => { window.removeEventListener("hashchange", onHash); data.subscription.unsubscribe(); };
    }
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (currentRoute === "auth") {
    if (session) { window.location.hash = "#/clipshop"; return null; }
    return <AuthPage />;
  }

  if (currentRoute === "app") {
    if (supabaseConfigured && !session) { window.location.hash = "#/auth?mode=login"; return null; }
    const user = session?.user;
    return <ClipShop
      currentUser={{
        id: user?.id,
        name: String(user?.user_metadata?.name || user?.email?.split("@")[0] || "Visitante"),
        email: user?.email || "demo@umbra.app",
        plan: String(user?.user_metadata?.plan || "free"),
      }}
      onExitToApp={() => { window.location.hash = ""; }}
      onLogout={() => { void supabase.auth.signOut(); window.location.hash = ""; }}
      onUpgrade={() => { window.location.hash = "#precos"; }}
    />;
  }

  return <LandingPage session={session} />;
}

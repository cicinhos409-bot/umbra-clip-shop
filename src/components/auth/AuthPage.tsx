import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Loader2, LockKeyhole, Mail, User } from "lucide-react";
import Logo from "../Logo";
import { supabase, supabaseConfigured } from "../../lib/supabase";

type AuthMode = "login" | "signup";

export default function AuthPage() {
  const initialMode: AuthMode = new URLSearchParams(window.location.hash.split("?")[1] || "").get("mode") === "login" ? "login" : "signup";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const changeMode = (next: AuthMode) => {
    setMode(next);
    setMessage("");
    setIsError(false);
    window.history.replaceState(null, "", `#/auth?mode=${next}`);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    setIsError(false);
    if (!supabaseConfigured) {
      setIsError(true);
      setMessage("O Supabase ainda não foi configurado neste ambiente.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const siteUrl = (import.meta.env.VITE_SITE_URL as string | undefined) || window.location.origin;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name, plan: "free" }, emailRedirectTo: `${siteUrl.replace(/\/$/, "")}/#/clipshop` },
        });
        if (error) throw error;
        if (data.session) window.location.hash = "#/clipshop";
        else setMessage("Conta criada! Confirme seu e-mail para acessar o Clip Shop.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.hash = "#/clipshop";
      }
    } catch (cause) {
      setIsError(true);
      setMessage(cause instanceof Error ? cause.message : "Não foi possível concluir o acesso.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="auth-page">
    <section className="auth-brand-panel">
      <a className="brand" href="#"><Logo size={42}/><span>UMBRA <b>CLIP SHOP</b></span></a>
      <div className="auth-pitch">
        <span>CRIATIVOS EM ESCALA</span>
        <h1>Grave as peças.<br/><em>Multiplique os resultados.</em></h1>
        <p>Combine seus ganchos, corpos e CTAs para testar mais ideias no TikTok Shop.</p>
        <ul><li><Check/>Até 27 combinações únicas</li><li><Check/>Processamento local e privado</li><li><Check/>Comece com 3 vídeos grátis</li></ul>
      </div>
      <small>© {new Date().getFullYear()} UMBRA</small>
    </section>

    <section className="auth-form-panel">
      <div className="auth-card">
        <button className="auth-back" onClick={() => { window.location.hash = ""; }}><ArrowLeft/> Voltar para o site</button>
        <div className="auth-mobile-logo"><Logo size={38}/><b>UMBRA CLIP SHOP</b></div>
        <div className="auth-tabs" role="tablist">
          <button className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}>Entrar</button>
          <button className={mode === "signup" ? "active" : ""} onClick={() => changeMode("signup")}>Criar conta</button>
        </div>
        <header><span>{mode === "signup" ? "COMECE GRATUITAMENTE" : "BEM-VINDO DE VOLTA"}</span><h2>{mode === "signup" ? "Crie sua conta" : "Entre na sua conta"}</h2><p>{mode === "signup" ? "Você não precisa de cartão de crédito." : "Continue de onde você parou."}</p></header>
        <form onSubmit={submit}>
          {mode === "signup" && <label><span>Seu nome</span><div><User/><input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Como podemos chamar você?" autoComplete="name"/></div></label>}
          <label><span>E-mail</span><div><Mail/><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="voce@exemplo.com" autoComplete="email"/></div></label>
          <label><span>Senha</span><div><LockKeyhole/><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} placeholder="Mínimo de 6 caracteres" autoComplete={mode === "signup" ? "new-password" : "current-password"}/><button type="button" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff/> : <Eye/>}</button></div></label>
          {message && <p className={`auth-message ${isError ? "error" : "success"}`}>{message}</p>}
          <button className="auth-submit" disabled={busy}>{busy ? <Loader2 className="spin"/> : <>{mode === "signup" ? "Criar conta grátis" : "Entrar no Clip Shop"}<ArrowRight/></>}</button>
        </form>
        <p className="auth-switch">{mode === "signup" ? "Já possui uma conta?" : "Ainda não possui uma conta?"} <button onClick={() => changeMode(mode === "signup" ? "login" : "signup")}>{mode === "signup" ? "Entrar" : "Criar conta grátis"}</button></p>
      </div>
    </section>
  </main>;
}

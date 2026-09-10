import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowRight, Check, ChevronDown, Clapperboard, Layers3, LockKeyhole, Menu, Play, Sparkles, WandSparkles, X, Zap } from "lucide-react";
import Logo from "../Logo";
import { supabase, supabaseConfigured } from "../../lib/supabase";

const plans = [
  { name: "Free", price: "R$ 0", text: "Para testar o fluxo completo.", features: ["3 vídeos por mês", "1 vídeo por lote", "Processamento local"] },
  { name: "Pro", price: "R$ 49", text: "Para publicar toda semana.", featured: true, features: ["270 vídeos por mês", "5 vídeos por lote", "27 combinações", "Audio Shuffle"] },
  { name: "Elite", price: "R$ 97", text: "Para operações em escala.", features: ["470 vídeos por mês", "27 vídeos por lote", "27 combinações", "Prioridade em novidades"] },
];

const steps = [
  ["01", "Prepare seus criativos", "Grave diferentes ganchos, corpos e chamadas para ação para o mesmo produto."],
  ["02", "Envie para o Umbra", "Organize cada trecho na categoria certa, sem montar cada vídeo em uma timeline."],
  ["03", "Escolha as combinações", "Veja as possibilidades criadas a partir dos seus próprios trechos."],
  ["04", "Gere seus vídeos", "Selecione as combinações e deixe a ferramenta montar os criativos."],
  ["05", "Baixe, poste e teste", "Publique no TikTok Shop e descubra quais estruturas realmente vendem."],
];

const faqs = [
  ["Meus vídeos são enviados para algum servidor?", "Não. A combinação e a renderização acontecem no seu navegador. O Supabase registra apenas sua conta, plano e consumo."],
  ["Preciso instalar algum programa?", "Não. O Clip Shop funciona direto no navegador, sem plugins ou editores pesados."],
  ["Quantos clipes preciso enviar?", "Você começa com 1 gancho, 1 corpo e 1 CTA. Com 3 de cada, libera 27 combinações únicas."],
  ["Posso cancelar quando quiser?", "Sim. Você mantém o acesso até o fim do período contratado e pode continuar no plano gratuito."],
];

export default function LandingPage({ session }: { session: Session | null }) {
  const [menu, setMenu] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const start = () => { window.location.hash = "#/clipshop"; };
  const subscribe = (plan: string) => {
    const checkout = plan === "Pro" ? import.meta.env.VITE_CHECKOUT_PRO_URL : import.meta.env.VITE_CHECKOUT_ELITE_URL;
    if (checkout) { window.location.href = checkout; return; }
    document.getElementById("acesso")?.scrollIntoView({ behavior: "smooth" });
    setMessage(`Informe seu e-mail para começar. O checkout do plano ${plan} será liberado em seguida.`);
  };
  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabaseConfigured) { setMessage("Modo demonstração ativo. Abrindo seu workspace..."); setTimeout(start, 500); return; }
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + "/#/clipshop" } });
    setMessage(error ? error.message : "Link de acesso enviado. Confira seu e-mail.");
  };

  return <main className="sales-page">
    <nav className="nav shell">
      <a className="brand" href="#top"><Logo size={38} /><span>UMBRA <b>CLIP SHOP</b></span></a>
      <div className="nav-links"><a href="#como-funciona">Como funciona</a><a href="#recursos">Recursos</a><a href="#precos">Preços</a><a href="#faq">Dúvidas</a></div>
      <button className="nav-cta" onClick={start}>{session ? "Abrir workspace" : "Começar grátis"}<ArrowRight size={16} /></button>
      <button className="menu-button" aria-label="Abrir menu" onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</button>
      {menu && <div className="mobile-menu"><a href="#como-funciona">Como funciona</a><a href="#recursos">Recursos</a><a href="#precos">Preços</a><button onClick={start}>Começar grátis</button></div>}
    </nav>

    <section className="hero shell" id="top">
      <div className="hero-copy">
        <div className="eyebrow"><Sparkles size={14} /> Criativos em escala para TikTok Shop</div>
        <h1>Grave poucos trechos.<br/><em>Transforme em dezenas de criativos.</em></h1>
        <p>Combine automaticamente seus <b>Ganchos + Corpos + CTAs</b> e transforme poucas gravações em várias versões do mesmo criativo.</p>
        <form className="hero-form" id="acesso" onSubmit={login}>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Seu melhor e-mail" aria-label="Seu e-mail" />
          <button>Começar grátis <ArrowRight size={18} /></button>
        </form>
        {message && <span className="form-message">{message}</span>}
        <div className="hero-proof"><span><Check size={14}/> Menos tempo editando</span><span><Check size={14}/> Mais criativos para testar</span><span><LockKeyhole size={14}/> Arquivos privados</span></div>
      </div>
      <div className="product-stage">
        <div className="glow" />
        <div className="browser-card">
          <div className="browser-bar"><i/><i/><i/><span>app.umbraclip.shop</span></div>
          <div className="mock-content">
            <div className="mock-top"><span>MEU PROJETO</span><b>Campanha Black Friday</b></div>
            <div className="clip-columns">
              {[["01","GANCHOS","PARE DE ROLAR"],["02","CORPOS","OFERTA PRINCIPAL"],["03","CTAs","COMPRE AGORA"]].map(([n,t,c]) => <div className="clip-column" key={n}><small>{n} · {t}</small><div className="video-tile"><Play size={18}/><span>{c}</span></div><div className="mini-tile"/><div className="mini-tile"/></div>)}
            </div>
            <div className="generate-row"><span><Layers3 size={17}/> 27 combinações prontas</span><button>Gerar criativos <WandSparkles size={15}/></button></div>
          </div>
        </div>
        <div className="floating-badge badge-one"><Zap size={18}/><span><b>27 vídeos</b> em poucos cliques</span></div>
        <div className="floating-badge badge-two"><LockKeyhole size={18}/><span><b>100% local</b> seus arquivos seguros</span></div>
      </div>
    </section>

    <section className="trust-strip"><div className="shell"><span>FEITO PARA QUEM VENDE NO TIKTOK SHOP</span><b>Afiliados</b><b>Creators</b><b>Social media</b><b>Produtores</b><b>Agências</b></div></section>

    <section className="section shell formula-section">
      <div className="section-heading"><span>UM PRODUTO. VÁRIAS FORMAS DE VENDER.</span><h2>Você grava as partes.<br/>O Umbra faz as combinações.</h2><p>Separe seu criativo em três peças. Troque uma delas e você já tem uma nova hipótese para testar.</p></div>
      <div className="formula-grid">
        {[['GANCHO','Prenda a atenção nos primeiros segundos.'],['CORPO','Apresente o produto, o problema, o benefício ou a demonstração.'],['CTA','Dê o motivo para a pessoa clicar e comprar.']].map(([title,text], index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{text}</p></article>)}
      </div>
      <div className="formula-result"><b>GANCHO</b><i>+</i><b>CORPO</b><i>+</i><b>CTA</b><i>=</i><strong>NOVOS CRIATIVOS</strong></div>
      <p className="formula-note">Você não precisa adivinhar qual combinação vai funcionar antes de postar. <b>Crie as variações e deixe os resultados mostrarem qual delas vende.</b></p>
    </section>

    <section className="section shell" id="como-funciona">
      <div className="section-heading"><span>COMO FUNCIONA</span><h2>Da gravação ao teste<br/>em cinco passos.</h2></div>
      <div className="steps five-steps">{steps.map(([n,t,d]) => <article key={n}><span>{n}</span><div className="step-icon">{n === "01" ? <Clapperboard/> : n === "05" ? <Zap/> : <Layers3/>}</div><h3>{t}</h3><p>{d}</p></article>)}</div>
    </section>

    <section className="section pain-section"><div className="shell pain-grid">
      <div><div className="section-heading"><span>PARE DE CRIAR UM CRIATIVO POR VEZ</span><h2>Talvez falte apenas a combinação certa.</h2></div><p>O problema não é necessariamente o seu produto. Você talvez ainda não tenha encontrado o Gancho + Corpo + CTA que conecta com o público.</p></div>
      <div className="comparison"><div className="comparison-old"><small>SEM O UMBRA</small>{['Gravar o vídeo inteiro novamente','Editar cada versão manualmente','Testar apenas um gancho','Apostar tudo em um criativo'].map(x => <p key={x}><X size={16}/>{x}</p>)}</div><div className="comparison-new"><small>COM O UMBRA</small><h3>Você cria as peças uma vez.</h3><h3>A ferramenta multiplica as combinações.</h3><p>Mais variações. Mais dados. Mais chances de encontrar o vídeo que vende.</p></div></div>
    </div></section>

    <section className="section dark-band" id="recursos"><div className="shell">
      <div className="section-heading"><span>NÃO EDITE 27 VEZES</span><h2>Crie as peças uma vez.<br/>Teste o que realmente importa.</h2><p>Qual gancho prende mais? Qual demonstração segura a atenção? Qual CTA gera mais cliques? O Umbra ajuda você a descobrir.</p></div>
      <div className="feature-grid">{[
        ["27×", "Combinações únicas", "Misture 3 ganchos, 3 corpos e 3 CTAs sem repetir trios."],
        ["LOCAL", "Privacidade por padrão", "Seus vídeos não sobem para nossos servidores."],
        ["ZIP", "Exportação em lote", "Baixe vídeos e manifesto organizados em um único pacote."],
        ["AUDIO", "Audio Shuffle", "Crie sequências sonoras exclusivas para cada variação."],
      ].map(([tag,t,d]) => <article key={tag}><strong>{tag}</strong><h3>{t}</h3><p>{d}</p></article>)}</div>
    </div></section>

    <section className="section shell" id="precos">
      <div className="section-heading centered"><span>PLANOS SEM COMPLICAÇÃO</span><h2>Comece grátis. Escale quando quiser.</h2></div>
      <div className="pricing">{plans.map((plan) => <article className={plan.featured ? "featured" : ""} key={plan.name}>{plan.featured && <div className="popular">MAIS ESCOLHIDO</div>}<h3>{plan.name}</h3><p>{plan.text}</p><div className="price">{plan.price}<small>{plan.price !== "R$ 0" && "/mês"}</small></div><ul>{plan.features.map((item) => <li key={item}><Check size={16}/>{item}</li>)}</ul><button onClick={() => plan.name === "Free" ? start() : subscribe(plan.name)}>{plan.name === "Free" ? "Começar grátis" : `Assinar ${plan.name}`}<ArrowRight size={16}/></button></article>)}</div>
    </section>

    <section className="section shell faq" id="faq"><div className="section-heading"><span>PERGUNTAS FREQUENTES</span><h2>Antes de apertar o play.</h2></div><div>{faqs.map(([q,a]) => <details key={q}><summary>{q}<ChevronDown/></summary><p>{a}</p></details>)}</div></section>

    <section className="final-cta shell"><div><span>UMBRA CLIP SHOP</span><h2>Menos edição.<br/>Mais variações. Mais testes.</h2><p>Transforme seus trechos em uma máquina de criativos para TikTok Shop.</p><button onClick={start}>Quero acessar o Umbra Clip Shop <ArrowRight/></button></div></section>
    <footer className="shell"><a className="brand" href="#top"><Logo size={32}/><span>UMBRA <b>CLIP SHOP</b></span></a><p>© {new Date().getFullYear()} UMBRA. Criativos em escala, sem perder a essência.</p><div><a href="#faq">Ajuda</a><a href="#precos">Planos</a></div></footer>
  </main>;
}

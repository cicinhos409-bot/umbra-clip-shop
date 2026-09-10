# UMBRA CLIP SHOP
## Especificação de Produto, UX e Implementação

**Versão:** 1.0
**Status:** Modo Variações e Audio Shuffle em produção; Entregas 1 a 12 implementadas com biblioteca local, múltiplas sequências persistentes, calculadora e limite de cortes por fonte, fila recuperável, timeline avançada e métricas; validação manual ampliada com mídias reais ainda pendente
**Produto:** UMBRA Clip Shop  
**Ecossistema:** UMBRA  
**Rota oficial em produção:** `https://umbracopywriter.com/#/clipshop`  
**Objetivo:** criar uma ferramenta de geração de variações de criativos para TikTok Shop, integrada à conta e aos planos já existentes da UMBRA, com processamento de vídeo realizado localmente no navegador do usuário.

---

# 0. Estado da implementação

Este arquivo registra a visão de produto, o caminho técnico e o estado da implementação. O início do Modo Variações foi expressamente autorizado em 08/08/2026.

Escopo autorizado:

- implementar o Modo Variações;
- integrar a rota `#/clipshop`;
- criar componentes, domínio, Worker, armazenamento e testes;
- criar as RPCs transacionais dos limites mensais Free, Pro e Elite;
- validar o build e preparar publicação;
- preservar alterações preexistentes do repositório;
- não usar nem persistir tokens expostos em conversa;
- manter o Modo Remix fora desta implementação inicial.

O primeiro caminho técnico foi validado com Mediabunny, Web Worker, remux rápido e normalização por WebCodecs quando necessária. O build de produção passou com o Worker emitido como chunk separado.

Este documento passa a separar claramente:

1. **especificação do produto**;
2. **prova técnica obrigatória**;
3. **MVP do Modo Variações**;
4. **persistência e robustez**;
5. **Modo Remix futuro, fora do MVP inicial**.

---

# 1. Visão do Produto

O **UMBRA Clip Shop** será um módulo independente dentro do ecossistema UMBRA, porém totalmente integrado à conta, autenticação, permissões, planos e experiência visual da plataforma principal.

A proposta central é permitir que o usuário transforme um conjunto pequeno de trechos de vídeo já prontos em múltiplos criativos diferentes, sem precisar editar cada vídeo manualmente.

O usuário fornecerá trechos divididos em três categorias:

- **Ganchos**
- **Corpos**
- **CTAs**

A ferramenta será responsável por organizar, combinar, pré-visualizar, selecionar, processar e exportar novas variações.

A primeira versão do produto trabalhará com:

- **9 clipes de entrada**
- **3 Ganchos**
- **3 Corpos**
- **3 CTAs**
- **27 variações possíveis**
- geração individual ou em lote
- processamento local
- armazenamento local
- integração com o plano UMBRA
- limite de uso para usuários Free

### Proposta de valor

O UMBRA Clip Shop deve entregar uma experiência simples:

> **Envie seus clipes uma vez e transforme-os em múltiplos criativos prontos para testar.**

A ferramenta deverá reduzir o trabalho repetitivo de:

1. abrir um editor;
2. importar os mesmos vídeos;
3. trocar manualmente o gancho;
4. trocar o corpo;
5. trocar o CTA;
6. renderizar;
7. repetir o processo dezenas de vezes.

No UMBRA Clip Shop, o fluxo será:

```text
Adicionar até 9 clipes
        ↓
Organizar em Gancho + Corpo + CTA
        ↓
Gerar automaticamente até 27 variações
        ↓
Pré-visualizar combinações
        ↓
Selecionar quais deseja criar
        ↓
Processar localmente
        ↓
Baixar os vídeos finais
```

### Princípio central

O produto deve seguir esta regra:

> **A UMBRA controla a experiência, a conta, o plano e as permissões. O computador do usuário processa os vídeos.**

Isso mantém os custos de infraestrutura reduzidos e evita que vídeos grandes precisem ser enviados para Supabase ou servidores externos.

---

# 2. Posicionamento dentro da UMBRA

O UMBRA Clip Shop será um produto separado em termos de navegação e interface, mas não terá sistema independente de assinatura.

O usuário utiliza:

- a mesma conta UMBRA;
- o mesmo login;
- o mesmo plano;
- as mesmas regras de acesso;
- o mesmo sistema de cobrança;
- a mesma identidade visual.

Exemplo:

```text
UMBRA
├── Dashboard
├── Copywriter
├── Editor
├── Automação
├── Outras ferramentas
└── UMBRA Clip Shop
```

O Clip Shop possuirá a seguinte rota oficial no sistema atual de navegação por hash:

```text
https://umbracopywriter.com/#/clipshop
```

Identificador interno planejado:

```ts
type AppView = /* views existentes */ | "clipshop";
```

Não planejar `/app/clip-shop` ou `/tools/clip-shop` enquanto a aplicação continuar utilizando `AppView`, `activeView` e rotas por `window.location.hash`.

A futura integração deverá preservar acesso direto, atualização da página, botão voltar, título do documento, menu e retorno ao Dashboard.

O nome exibido deve ser sempre:

# UMBRA Clip Shop

Nunca usar “Uber Clip Shop”, “Uber Crip Shop” ou qualquer outra variação.

---

# 3. Público e caso de uso principal

O usuário principal do MVP será:

> **Afiliado de TikTok Shop que já possui pequenos clipes verticais e precisa gerar várias combinações rapidamente.**

O produto é pensado prioritariamente para esse afiliado, sem impedir evoluções futuras para outros usuários que criam vídeos de venda e precisam testar várias versões rapidamente.

Principais casos de uso:

- TikTok Shop;
- vídeos de produto;
- afiliados;
- UGC;
- criativos de performance;
- demonstrações;
- anúncios curtos;
- variações para testes de hook;
- variações de CTA;
- reaproveitamento de cenas já produzidas.

O foco inicial da interface e da copy será TikTok Shop.

## 3.1. Objetivo de negócio mensurável

O objetivo operacional principal do MVP será:

```text
Permitir que o usuário transforme 9 clipes em pelo menos
10 criativos exportados em menos de 15 minutos.
```

Esse tempo deverá ser medido em um dispositivo de referência definido após o spike técnico. O documento não deve prometer o mesmo tempo para qualquer computador, codec, resolução ou navegador.

Métricas relacionadas:

- tempo até a primeira combinação disponível;
- tempo até o primeiro vídeo de teste;
- tempo até o primeiro download;
- percentual de usuários que concluem a preparação dos clipes;
- percentual de lotes com pelo menos 10 resultados exportados;
- taxa de falha por navegador, codec e perfil de qualidade.

---

# 4. Modelo de Entrada — até 9 Clipes

A versão em produção possui **9 slots principais**, mas o usuário pode começar com menos arquivos.

Regra mínima para liberar combinações:

```text
1 Gancho + 1 Corpo + 1 CTA
```

Configuração recomendada para obter maior variedade:

```text
3 Ganchos + 3 Corpos + 3 CTAs = 9 clipes
```

A interface incentiva o preenchimento dos 9 slots sem bloquear o usuário que já possui pelo menos um clipe válido em cada categoria.

Quantidade de resultados:

- se o total de combinações possíveis for menor que 27, liberar somente as combinações únicas possíveis;
- com 3 Ganchos, 3 Corpos e 3 CTAs, mostrar as 27 combinações determinísticas;
- as 27 posições permanecem visíveis na mesa e ficam bloqueadas enquanto faltarem os clipes correspondentes;
- nunca criar combinações duplicadas;
- o progresso `9/9` indica a configuração completa, não o único estado capaz de gerar;
- cada geração permite selecionar no máximo 5 combinações.

## 4.1. Ganchos

O usuário poderá adicionar:

- Gancho 1
- Gancho 2
- Gancho 3

Objetivo:

> prender a atenção nos primeiros segundos.

Exemplos de conteúdo esperado:

- abertura impactante;
- dor;
- curiosidade;
- pergunta;
- demonstração rápida;
- antes e depois;
- quebra de padrão.

---

## 4.2. Corpos

O usuário poderá adicionar:

- Corpo 1
- Corpo 2
- Corpo 3

Objetivo:

> demonstrar o produto, explicar o benefício ou desenvolver a principal ideia do vídeo.

O corpo pode conter:

- demonstração;
- aplicação;
- benefício;
- prova visual;
- explicação;
- uso real;
- transformação;
- comparação.

---

## 4.3. CTAs

O usuário poderá adicionar:

- CTA 1
- CTA 2
- CTA 3

Objetivo:

> finalizar o criativo direcionando o usuário para a ação desejada.

Exemplos:

- veja a oferta;
- confira no carrinho;
- aproveite antes que acabe;
- clique para conhecer;
- peça agora;
- confira o preço.

---

# 5. Regras dos arquivos de entrada

Formatos inicialmente aceitos:

- MP4
- MOV

A arquitetura deverá permitir extensão futura para:

- WebM
- M4V

Configuração inicial recomendada:

- até 30 segundos por clipe;
- preferência por formato vertical;
- resolução recomendada 1080 × 1920;
- proporção recomendada 9:16.

Limites técnicos planejados:

```text
Máximo por clipe: 30 segundos
Máximo por arquivo: 500 MB
Máximo total do projeto: 1,5 GB em arquivos de origem
Máximo de duração do resultado: 90 segundos
Máximo de projetos locais: conforme armazenamento disponível
Concorrência inicial: 1 job por vez
```

Os limites são validados antes da ingestão e antes da reserva do lote. A geração mantém uma margem local mínima de 200 MB além do tamanho estimado do lote.

O sistema deverá aceitar arquivos fora do padrão e normalizá-los quando necessário.

Cada slot deverá apresentar:

- nome do arquivo;
- nome semântico editável;
- miniatura;
- duração;
- resolução;
- tamanho;
- estado de validação;
- botão de preview;
- substituir;
- remover.

Exemplos de identificação semântica:

```text
Gancho 1 — Dor
Gancho 2 — Curiosidade
Gancho 3 — Demonstração
Corpo 1 — Benefício principal
CTA 1 — Urgência
```

O nome semântico deverá ajudar na seleção, no preview, na identificação dos resultados e na nomenclatura de exportação. Ele não substitui o identificador técnico permanente do clipe.

Estados:

```text
Vazio
Selecionando arquivo
Carregando metadados
Validando
Pronto
Aviso
Erro
```

---

# 6. Progresso dos 9 clipes

O sistema exibirá permanentemente o progresso da preparação.

Exemplos:

```text
0/9 clipes
5/9 clipes
9/9 clipes
```

A barra de progresso deve refletir os arquivos válidos, e não apenas arquivos escolhidos.

Quando atingir 9/9:

```text
✓ Todos os clipes estão prontos
27 variações disponíveis
```

Antes de atingir 9/9, se houver pelo menos 1 Gancho, 1 Corpo e 1 CTA válidos, o sistema deverá mostrar:

```text
Projeto pronto para combinar
X combinações únicas disponíveis
Complete os 9 slots para liberar as 27 combinações
```

---

# 7. Sistema de 27 Variações

Matematicamente:

```text
3 Ganchos × 3 Corpos × 3 CTAs = 27 combinações possíveis
```

O UMBRA Clip Shop mostra uma **mesa determinística com as 27 combinações**, na ordem de `G1+C1+CTA1` até `G3+C3+CTA3`.

Objetivos:

- facilitar a seleção;
- manter a ordem previsível;
- usar os 9 clipes;
- impedir combinações duplicadas;
- limitar cada lote a 5 seleções;
- criar uma estrutura própria do UMBRA Clip Shop.

---

# 8. Regras do motor de 27 combinações

O algoritmo deverá garantir:

1. exatamente 27 combinações quando os 9 slots estiverem preenchidos;
2. nenhuma combinação idêntica;
3. participação dos 3 ganchos;
4. participação dos 3 corpos;
5. participação dos 3 CTAs;
6. cada clipe aparece exatamente 9 vezes no conjunto completo;
7. ordem estável e determinística;
8. lote máximo conforme o plano: Free 1, Pro 5 e Elite 27;
9. não repetir excessivamente a mesma dupla Corpo + CTA;
10. resultados previsíveis e reproduzíveis dentro do mesmo projeto.

Exemplo conceitual:

```text
01 G1 + C1 + CTA1
02 G1 + C1 + CTA3
03 G1 + C2 + CTA2
04 G1 + C3 + CTA4
05 G1 + C4 + CTA1
06 G1 + C4 + CTA3

07 G2 + C1 + CTA2
08 G2 + C1 + CTA4
...
24 G4 + C4 + CTA4
```

A lista final exata deverá ser definida pelo algoritmo e testada.

---

# 9. Futuro modo avançado

A arquitetura deve permitir futuramente:

```text
Modo Essencial
27 variações

Modo Completo
64 variações

Modo Personalizado
Usuário escolhe quantidade
```

O MVP pode esconder esses modos e operar apenas com 24.

---

# 10. Estrutura Geral da Página

A página será organizada em blocos claros.

```text
HEADER
↓
HERO / VISÃO DO PROJETO
↓
CONTADOR DE USO
↓
PREPARAÇÃO / IA
↓
12 CLIPES
↓
MESA DE VARIAÇÕES
↓
SELEÇÃO
↓
GERAÇÃO
↓
RESULTADOS
↓
ARMAZENAMENTO LOCAL
```

---

# 11. Header

O cabeçalho deverá conter:

- logo UMBRA;
- nome “UMBRA Clip Shop”;
- breadcrumb opcional;
- plano do usuário;
- contador mensal de vídeos do plano;
- avatar;
- menu do usuário;
- botão para voltar à UMBRA.

Exemplo:

```text
UMBRA | Clip Shop

Plano Pro
João
```

Para usuário Free:

```text
Plano Free
2 de 3 vídeos restantes no mês
```

---

# 12. Hero

Título principal sugerido:

# Um produto. 27 maneiras de vender.

Subtítulo:

> Combine ganchos, corpos e CTAs e transforme seus trechos em novos criativos para TikTok Shop.

Elementos do Hero:

- título;
- explicação curta;
- benefício;
- progresso geral;
- status do projeto;
- indicação de processamento local.

Exemplo:

```text
CRIATIVOS EM ESCALA

Um produto.
27 maneiras de vender.

Transforme 9 clipes em múltiplos criativos prontos
para testar.

0/9 clipes adicionados
```

---

# 13. Bloco de Preparação com IA

A página poderá apresentar um bloco antes dos uploads.

Título:

## Prepare seus trechos

Texto:

> Crie ideias de Gancho, Corpo e CTA antes de produzir seus clipes.

O agente de IA poderá futuramente criar:

- 4 prompts de Gancho;
- 4 prompts de Corpo;
- 4 prompts de CTA.

Total:

```text
12 prompts
```

Esse recurso deve ser separado da renderização local.

A IA pode consumir créditos ou possuir regras específicas, enquanto a montagem local não precisa consumir processamento de servidor.

---

# 14. Workspace de Clipes

A área será dividida visualmente em 3 colunas.

## Ganchos

```text
Gancho 1
Gancho 2
Gancho 3
Gancho 4
```

## Corpos

```text
Corpo 1
Corpo 2
Corpo 3
Corpo 4
```

## CTAs

```text
CTA 1
CTA 2
CTA 3
CTA 4
```

Cada slot deve funcionar por:

- clique;
- drag and drop.

Ao receber arquivo:

```text
[thumbnail]

Gancho 1
gancho-produto.mp4

00:05
1080x1920

▶ Preview
Trocar
Excluir
```

---

# 15. Mesa de Variações

Título:

# Suas combinações

Descrição:

> Adicione pelo menos 1 Gancho, 1 Corpo e 1 CTA. Complete os 9 slots para liberar as 27 combinações.

Enquanto não houver o mínimo de uma peça válida em cada categoria:

```text
Combinações bloqueadas
Adicione pelo menos 1 Gancho, 1 Corpo e 1 CTA
```

Quando houver o mínimo necessário:

```text
X combinações únicas disponíveis
```

Quando os 9 slots estiverem preenchidos, o motor deverá disponibilizar as 27 combinações determinísticas.

Cada linha/card:

```text
☐ 01 | G1 | C1 | CTA1 | ▶
```

ou visualmente:

```text
[☐] [01] [G1] [C1] [CTA1] [▶]
```

---

# 16. Filtros e seleção

A interface deverá possuir:

- selecionar o lote máximo permitido pelo plano;
- limpar seleção;
- seleção manual limitada ao plano;
- indicador de saldo mensal antes da confirmação.

Indicador:

```text
0 selecionadas
1 selecionada no Free
5 selecionadas no Pro
10 selecionadas no Elite
```

O botão Gerar ficará bloqueado se:

```text
selecionadas = 0
```

Além da seleção manual, o motor poderá oferecer estratégias orientadas ao objetivo do teste:

```text
Balanceado
Priorizar testes de Gancho
Priorizar testes de Corpo
Priorizar testes de CTA
```

No modo Balanceado, os elementos devem respeitar a distribuição definida pelo algoritmo. Nos modos de prioridade, a categoria escolhida deverá variar mais, enquanto as demais permanecem relativamente estáveis para facilitar a leitura do teste.

Se houver menos de 27 combinações únicas possíveis, os botões de seleção deverão se adaptar à quantidade realmente disponível, sempre respeitando o lote máximo do plano: Free 1, Pro 5 e Elite 27.

---

# 17. Preview das combinações

O usuário poderá visualizar a sequência antes de gerar.

Ao clicar em:

```text
▶
```

abrir modal ou painel lateral:

```text
Variação 07

Gancho 2
↓
Corpo 1
↓
CTA 4
```

O preview pode inicialmente tocar os três clipes em sequência sem gerar um MP4 definitivo.

Isso economiza processamento.

---

# 18. Barra de Geração

Depois de selecionar:

```text
10 variações selecionadas
```

Botão:

# GERAR VÍDEOS

Antes de iniciar, realizar:

1. validação dos arquivos;
2. verificação do espaço local;
3. verificação do plano;
4. verificação do limite Free;
5. criação da fila;
6. preparação dos arquivos.

---

# 19. Limites mensais por vídeos concluídos

Política oficial do Clip Shop:

| Plano | Vídeos por mês | Máximo por lote |
|---|---:|---:|
| Free | 3 | 1 |
| Pro | 270 | 5 |
| Elite | 470 | 27 |

Definição oficial:

> Uma unidade de uso corresponde a um vídeo concluído com sucesso. Reserva, validação, revisão, vídeo de teste e falha de processamento não consomem o limite mensal.

Exemplos:

```text
Usuário Free conclui 1 vídeo
= 1 vídeo consumido

Usuário Pro seleciona 5 e apenas 4 concluem
= 4 vídeos consumidos

Usuário Elite reserva 27 e cancela antes do primeiro job
= 0 vídeos consumidos; a reserva é liberada
```

O cliente reserva antecipadamente a quantidade selecionada. Ao finalizar, apenas os resultados concluídos permanecem consumidos e a diferença é liberada.

---

# 20. Estados dos limites mensais

Exemplo inicial:

```text
3 de 3 disponíveis
```

Após um uso:

```text
2 de 3 disponíveis
```

Após três:

```text
0 de 3 disponíveis
```

Mensagem:

> Você utilizou os 3 vídeos mensais do plano Free no UMBRA Clip Shop.

CTA:

# Fazer upgrade

O botão leva ao sistema de planos já existente da UMBRA.

---

# 21. Integração com os planos UMBRA

O UMBRA Clip Shop não terá assinatura isolada.

Fluxo:

```text
Usuário
↓
Conta UMBRA
↓
Plano atual
↓
Entitlements
↓
UMBRA Clip Shop
```

Aplicar a política definida pela conta UMBRA:

```text
plan = free  → 3 vídeos/mês, 1 por lote
plan = pro   → 270 vídeos/mês, 5 por lote
plan = elite → 470 vídeos/mês, 10 por lote
```

A ferramenta deve consultar a mesma fonte de verdade dos planos já usada pelo restante da plataforma.

---

# 22. Controle seguro do limite

Não armazenar o contador mensal de vídeos apenas no navegador.

Motivo:

O usuário poderia:

- limpar localStorage;
- limpar IndexedDB;
- trocar de navegador;
- utilizar outro computador.

O controle deverá existir no backend/Supabase.

Exemplo:

```text
feature_usage

id
user_id
feature_key
free_generations_used
last_generation_at
created_at
updated_at
```

Feature:

```text
umbra_clip_shop
```

---

# 23. Reserva de geração

Para evitar problemas, o sistema poderá utilizar uma lógica de reserva.

Fluxo:

```text
Usuário clica Gerar
↓
Backend valida plano
↓
Free?
↓
Verifica saldo
↓
Reserva 1 geração
↓
Autoriza processamento local
↓
Cliente inicia a fila
```

O comportamento em caso de falha deverá ser definido.

Recomendação:

- se nenhum vídeo chegou a iniciar por erro técnico, devolver a geração;
- se a fila já iniciou e produziu resultados, manter consumo.

---

# 24. Processamento Local

O processamento deverá acontecer no navegador.

Arquitetura:

```text
UI React
    ↓
Gerenciador de Projeto
    ↓
IndexedDB / OPFS
    ↓
Web Worker
    ↓
Motor de Vídeo
    ↓
Fila
    ↓
Arquivos finais
```

Sem:

```text
upload dos vídeos → Supabase
render → Vercel
render → servidor externo
```

---

# 25. Armazenamento

## localStorage

Somente dados pequenos:

- preferências;
- último projeto aberto;
- filtros;
- configurações de interface;
- opções do usuário.

Nunca utilizar para arquivos de vídeo.

---

## IndexedDB

Usar para:

- banco local de projetos;
- informações dos clipes;
- metadados;
- filas;
- status;
- configurações locais;
- referências.

---

## OPFS

Usar para:

- vídeos originais temporários;
- versões normalizadas;
- arquivos intermediários;
- vídeos finais;
- cache local de processamento.

---

# 26. Estrutura de projeto local

Exemplo conceitual:

```text
/clip-shop/
  /projects/
    /project-uuid/
      project.json

      /source/
        G1.mp4
        G2.mp4
        G3.mp4
        G4.mp4

        C1.mp4
        C2.mp4
        C3.mp4
        C4.mp4

        CTA1.mp4
        CTA2.mp4
        CTA3.mp4
        CTA4.mp4

      /normalized/

      /output/
        variation-01.mp4
        variation-02.mp4
        ...
```

---

# 27. Persistência

Quando possível, o projeto deverá sobreviver a:

- refresh;
- fechamento da aba;
- retorno posterior.

Ao reabrir:

```text
Projeto encontrado

9/9 clipes
8 vídeos já gerados
16 pendentes
```

A persistência dependerá das permissões e políticas do navegador.

---

# 28. Gestão de armazenamento

> **Estado no código:** implementado como Central de armazenamento aberta a partir da tela de projetos salvos.

Criar painel:

# Armazenamento local

Mostrar:

- espaço utilizado;
- estimativa disponível;
- quantidade de arquivos;
- projetos;
- arquivos temporários.
- tamanho individual das fontes e resultados de cada projeto;
- quantidade de resultados por projeto;
- espaço total utilizado e disponível informado pelo navegador.

Ações:

- Limpar temporários
- Excluir resultados
- Excluir projeto
- Limpar tudo do Clip Shop
- Excluir resultados com mais de 30 dias
- Solicitar armazenamento persistente ao navegador

Projetos, outputs e filas ficam no IndexedDB; fontes e resultados usam OPFS quando disponível. A limpeza total remove somente dados controlados pelo Clip Shop, nunca os arquivos originais do computador.

---

# 29. Normalização

Antes da geração, os arquivos deverão ser analisados.

Padrão interno recomendado:

```text
1080 × 1920
9:16
30 FPS
H.264
AAC
```

O sistema deverá evitar normalizar novamente arquivos que já estejam compatíveis.

---

# 30. Estratégia de performance

A prioridade será reduzir recodificação.

Fluxo:

```text
9 arquivos
↓
analisar
↓
normalizar apenas os incompatíveis
↓
reutilizar os arquivos normalizados
↓
montar as 27 combinações
```

Quando todos os segmentos de uma combinação forem compatíveis, utilizar concatenação rápida sempre que tecnicamente possível.

---

# 31. Web Workers

Processamento pesado deve ocorrer fora da thread principal.

Estrutura:

```text
Main Thread
├── UI
├── estado
├── preview
└── controles

Worker
├── preparação
├── FFmpeg
├── concatenação
├── render
└── exportação
```

A interface não deverá congelar durante o processamento.

---

# 32. Motor de vídeo

Tecnologias previstas:

- FFmpeg.wasm
- WebCodecs quando vantajoso

A implementação pode usar uma combinação das duas.

Responsabilidades:

- leitura dos arquivos;
- inspeção;
- normalização;
- concatenação;
- áudio;
- geração final;
- thumbnails;
- duração.

---

# 33. Fila de Processamento

Não processar 24 vídeos simultaneamente.

Exemplo:

```text
01 ✓ concluído
02 ✓ concluído
03 76% gerando
04 aguardando
05 aguardando
...
24 aguardando
```

Controles:

- pausar, se suportado;
- cancelar;
- tentar novamente;
- remover item;
- continuar após erro.

---

# 34. Concorrência

A quantidade de jobs simultâneos deverá ser limitada.

Inicialmente:

```text
1 ou 2 renders simultâneos
```

O sistema poderá consultar:

```javascript
navigator.hardwareConcurrency
```

para ajudar na escolha.

Nunca assumir que mais núcleos significa que dezenas de renders podem ocorrer ao mesmo tempo.

---

# 35. Tela de Resultado

Após conclusão:

# Seus criativos estão prontos

Cada item:

```text
Variação 01
G1 + C1 + CTA1

[▶]
[Baixar]
[Excluir]
```

Ações gerais:

- baixar selecionados;
- baixar todos;
- excluir selecionados;
- criar novas combinações;
- novo projeto.

---

# 36. Download

> **Estado em produção:** download individual e download de todos os resultados em um ZIP local. O ZIP inclui os MP4 gerados e o manifesto CSV, sem upload para servidor.

MVP:

- download individual;
- múltiplos downloads;
- ZIP local implementado sem compressão destrutiva, contendo todos os MP4 e o manifesto CSV.

Nomenclatura:

```text
produto-G1-C1-CTA1.mp4
produto-G2-C3-CTA4.mp4
```

Também pode usar:

```text
umbra-clip-01.mp4
```

---

# 37. Projetos

Estrutura mínima:

```text
Nome do projeto
Produto
Data
9 clipes
27 combinações
Resultados
```

Criar:

- Novo projeto
- Renomear
- Excluir
- Continuar projeto

Os projetos com mídia poderão permanecer apenas localmente.

No Supabase pode ser salvo apenas o necessário para conta e histórico leve.

---

# 38. Estados de Erro

O produto deve possuir mensagens específicas.

### Arquivo incompatível

> Este arquivo não pôde ser processado.

### Espaço insuficiente

> Não há espaço local suficiente para concluir esta geração.

### Navegador incompatível

> Seu navegador não oferece suporte completo ao processamento local necessário.

### Falha na renderização

> Não foi possível gerar esta variação. Você pode tentar novamente.

### Arquivo removido

> Um dos clipes deste projeto não está mais disponível.

### Limite atingido

> Seu limite mensal de vídeos foi utilizado.

---

# 39. Privacidade

Mensagem de destaque:

# Seus vídeos ficam no seu dispositivo

> O UMBRA Clip Shop processa os arquivos localmente sempre que possível. Seus vídeos não precisam ser enviados ao Supabase ou a um servidor de renderização.

Não prometer algo diferente da arquitetura realmente implementada.

---

# 40. Visual da UMBRA

O produto deverá seguir a identidade oficial da UMBRA.

Direção:

- fundo preto profundo;
- visual dark premium;
- âmbar/dourado;
- textos brancos;
- informações secundárias em cinza;
- glow dourado controlado;
- bordas sutis;
- cards com contraste;
- ações principais em dourado;
- erros em cor de alerta;
- sucesso claramente identificável.

Paleta:

A implementação deve preferencialmente reutilizar os tokens já existentes no projeto principal.

Exemplo de referência visual:

```text
Background principal: #0a0a0a
Destaque principal: âmbar/dourado UMBRA
Texto: branco
Superfícies: preto/cinza muito escuro
```

Não criar uma segunda identidade visual desconectada da UMBRA.

---

# 41. Direção de Interface

O Clip Shop deve parecer:

- profissional;
- premium;
- simples;
- rápido;
- focado em produtividade;
- orientado à geração em escala.

Evitar:

- excesso de textos;
- aparência genérica;
- elementos muito coloridos;
- copiar visualmente a plataforma de referência.

A referência serve para o **fluxo funcional**, não para reprodução visual.

---

# 42. Componentes Frontend

O módulo deverá seguir o mesmo padrão de isolamento já utilizado por:

```text
src/components/umbramente/
src/components/umbra-voice/
src/components/contas/
```

Isso significa manter o produto em uma pasta própria, com componente raiz, telas internas, tipos, API e utilitários do domínio. O `App.tsx` deverá apenas integrar rota, sessão, plano e renderização do módulo, sem receber a lógica de vídeo.

Estrutura planejada, sujeita à validação do spike técnico:

```text
src/components/clipshop/
│
├── index.ts
├── ClipShop.tsx
├── ClipShopWorkspace.tsx
├── ClipShopProjects.tsx
├── ClipShopResults.tsx
├── ClipShopUsage.tsx
├── ClipShopUpgradeModal.tsx
├── api.ts
├── types.ts
├── routes.ts
├── _shared.tsx
│
├── components/
│   ├── ClipShopHeader.tsx
│   ├── ClipShopHero.tsx
│   ├── FreeUsageBadge.tsx
│   ├── ClipWorkspace.tsx
│   ├── ClipColumn.tsx
│   ├── ClipSlot.tsx
│   ├── UploadDropzone.tsx
│   ├── ClipPreview.tsx
│   ├── VariationGrid.tsx
│   ├── VariationRow.tsx
│   ├── SelectionToolbar.tsx
│   ├── VariationPreview.tsx
│   ├── GenerationBar.tsx
│   ├── RenderQueue.tsx
│   ├── RenderQueueItem.tsx
│   ├── ResultsGrid.tsx
│   ├── ResultCard.tsx
│   ├── StoragePanel.tsx
│   └── CompatibilityWarning.tsx
│
├── services/
└── workers/
```

Os nomes finais poderão ser simplificados durante a implementação. Não criar arquivos vazios apenas para reproduzir esta árvore.

---

# 43. Serviços e domínio

```text
src/components/clipshop/
│
├── services/
│   ├── clip-validator.ts
│   ├── clip-metadata.ts
│   ├── project-storage.ts
│   ├── indexeddb.ts
│   ├── opfs.ts
│   ├── variation-engine.ts
│   ├── video-normalizer.ts
│   ├── render-engine.ts
│   ├── render-queue.ts
│   ├── export-manager.ts
│   ├── storage-manager.ts
│   └── entitlement-service.ts
```

---

# 44. Tipos principais

Exemplo conceitual:

```ts
type ClipCategory = "hook" | "body" | "cta";

interface ClipAsset {
  id: string;
  category: ClipCategory;
  slot: number;
  name: string;
  duration: number;
  width: number;
  height: number;
  size: number;
  localPath?: string;
  status: "empty" | "validating" | "ready" | "error";
}

interface Variation {
  id: string;
  number: number;
  hookId: string;
  bodyId: string;
  ctaId: string;
  selected: boolean;
  status:
    | "idle"
    | "queued"
    | "processing"
    | "completed"
    | "error";
}
```

---

# 45. Fluxo completo do usuário

```text
1. Usuário abre UMBRA Clip Shop

2. Sistema valida sessão

3. Sistema carrega plano UMBRA

4. Sistema verifica:
   Free, Pro ou Elite e o saldo mensal

5. Usuário cria/abre projeto

6. Adiciona 3 Ganchos

7. Adiciona 3 Corpos

8. Adiciona 3 CTAs

9. Sistema valida o mínimo de 1 Gancho + 1 Corpo + 1 CTA

10. Motor cria todas as combinações únicas até o máximo de 27

11. Usuário visualiza

12. Usuário seleciona

13. Clica Gerar

14. Backend valida acesso

15. Backend reserva a quantidade selecionada conforme saldo e plano

16. Sistema verifica espaço local

17. Normaliza os clipes necessários

18. Cria fila

19. Worker processa

20. UI acompanha progresso

21. Resultados são salvos localmente

22. Usuário baixa

23. Projeto pode permanecer local
```

---

# 46. O que não deve acontecer

Não implementar:

```text
upload obrigatório de todos os vídeos para Supabase
```

Não implementar:

```text
renderização de vídeo em Vercel Functions
```

Não armazenar vídeos em:

```text
localStorage
```

Não controlar os limites mensais apenas no cliente.

Não criar um segundo sistema de plano exclusivo para o Clip Shop.

---

# 47. O que o Supabase deve cuidar

O Supabase poderá guardar:

- usuário;
- plano;
- permissões;
- feature flags;
- limite mensal, reservas e consumo por vídeos concluídos;
- eventos mínimos de uso;
- histórico leve;
- configuração do produto.

Não precisa guardar:

- 12 vídeos;
- arquivos normalizados;
- vídeos finais;
- cache de renderização.

---

# 48. Eventos úteis

Eventos analíticos:

```text
clip_shop_opened
clip_added
clip_removed
all_clips_ready
variations_generated
variation_previewed
generation_requested
generation_started
generation_completed
generation_failed
free_limit_reached
upgrade_clicked
result_downloaded
project_cleared
```

Sem enviar conteúdo do vídeo.

---

# 49. Métricas do Produto

Medir:

- usuários que abriram;
- usuários que adicionaram 9 clipes;
- usuários que chegaram às 27 variações;
- média de variações selecionadas;
- taxa de geração concluída;
- tempo médio;
- falhas;
- upgrades após 3 usos;
- quantidade de downloads.

---

# 50. MVP — Escopo obrigatório

O primeiro MVP implementável será somente o **Modo Variações**. O Modo Remix não faz parte deste MVP.

Antes do MVP deverá existir um spike técnico aprovado. Depois dessa aprovação, o MVP deverá possuir:

- integração com conta UMBRA;
- integração com plano UMBRA;
- 3 vídeos mensais no Free, 270 no Pro e 470 no Elite;
- 9 slots;
- 3 Ganchos;
- 3 Corpos;
- 3 CTAs;
- validação;
- preview dos clipes;
- 27 combinações determinísticas;
- seleção por lote limitada a 1 no Free, 5 no Pro e 10 no Elite;
- seleção;
- preview de sequência;
- processamento local;
- Web Worker;
- motor de vídeo escolhido depois de benchmark;
- normalização mínima necessária;
- fila sequencial, inicialmente com 1 job por vez;
- progresso;
- tratamento de erro;
- resultados;
- download individual;
- ZIP com todos os resultados e manifesto CSV;
- modelo configurável para nomes de exportação;
- onboarding guiado em três passos;
- visual UMBRA.

OPFS, restauração de projetos e ZIP já fazem parte da versão em produção. Concorrência adaptativa e recuperação avançada permanecem para etapa posterior.

Não fazem parte do MVP inicial:

- transcrição;
- detecção automática de cenas;
- timeline de edição;
- classificação automática Gancho/Corpo/CTA;
- substituição de cenas de um vídeo de referência;
- Modo Remix;
- suporte garantido a todos os navegadores;
- pausa no meio de uma transcodificação;
- mais de 27 variações no Modo Variações atual;
- geração textual por IA.

---

# 51. Fase 2

Após o MVP:

- IndexedDB e OPFS completos;
- restauração de projetos após fechar a aba;
- limpeza e gestão avançada de armazenamento;
- recuperação de fila interrompida;
- concorrência adaptativa;
- otimizações futuras de memória para ZIPs excepcionalmente grandes;
- agente de prompts;
- geração automática de ideias;
- presets;
- textos na tela;
- legendas;
- música;
- transições;
- templates;
- mais combinações;
- 64 variações;
- quantidade personalizada;
- randomização;
- novos formatos;
- histórico avançado;
- exportação em lote otimizada;
- integração com outras áreas da UMBRA.

O Modo Remix terá planejamento e aprovação próprios e não deverá ser iniciado automaticamente como parte desta Fase 2.

---

# 52. Critérios de Aceite do MVP

O MVP só deve ser considerado concluído quando:

- [x] usuário UMBRA consegue abrir a ferramenta;
- [x] acesso direto funciona em `https://umbracopywriter.com/#/clipshop`;
- [x] plano é identificado corretamente;
- [x] Free recebe exatamente 3 vídeos mensais;
- [x] Pro recebe exatamente 270 vídeos mensais;
- [x] Elite recebe exatamente 470 vídeos mensais;
- [x] contador não pode ser resetado apagando dados locais;
- [x] 9 arquivos podem ser adicionados;
- [x] todos podem ser visualizados;
- [x] arquivos inválidos são bloqueados;
- [x] 27 combinações são criadas no conjunto 3×3×3;
- [x] não existem combinações duplicadas;
- [x] cada Gancho, Corpo e CTA aparece exatamente 9 vezes;
- [x] usuário consegue selecionar no máximo 1/5/27 combinações por lote conforme Free/Pro/Elite;
- [x] preview funciona;
- [x] geração ocorre localmente;
- [x] a UI não trava durante o processamento;
- [x] progresso é exibido;
- [x] resultados podem ser baixados individualmente ou em ZIP;
- [x] arquivos não precisam ser enviados ao Supabase;
- [x] armazenamento local pode ser limpo;
- [x] erros são apresentados de forma clara;
- [x] interface utiliza identidade visual UMBRA;
- [x] usuário pago reutiliza o plano principal da plataforma.

---

# 53. Regra final de arquitetura

```text
UMBRA
│
├── Login / Plano / Permissão / Contador
│        ↓
│     Supabase
│
└── UMBRA Clip Shop
         │
         ├── 9 clipes
         ├── IndexedDB
         ├── OPFS
         ├── Web Worker
         ├── FFmpeg/WebCodecs
         ├── 27 variações
         └── arquivos finais
                ↓
         Computador do usuário
```

## Resumo

**UMBRA Clip Shop = 9 clipes → 27 variações → lotes Free 1, Pro 5 e Elite 27 → processamento local → download individual ou ZIP.**

O produto deve ser simples na frente, robusto por trás e economicamente eficiente para a UMBRA.

---

---

# 54. Modo Remix — Vídeo de Referência

> **Status desta seção:** visão futura, fora do MVP do Modo Variações e sem autorização de implementação.

O **Modo Remix** poderá ser o segundo fluxo principal do UMBRA Clip Shop depois que o motor do Modo Variações estiver validado em produção e houver aprovação específica para iniciar esta fase.

Enquanto o modo tradicional parte de até 9 clipes separados, o Modo Remix parte de **um vídeo de referência completo** e transforma sua estrutura em uma nova base de criação.

A finalidade não é simplesmente duplicar um arquivo. O sistema deverá analisar a estrutura comercial do vídeo, extrair seus elementos, permitir ajustes e criar uma nova versão com identidade própria.

Fluxo:

```text
1 vídeo de referência
        ↓
análise local
        ↓
transcrição
        ↓
detecção de cenas/cortes
        ↓
separação lógica
        ↓
Gancho + Corpo + CTA
        ↓
nova estrutura
        ↓
novos segmentos
        ↓
variações
        ↓
renderização local
```

O Modo Remix deverá aparecer como uma alternativa clara na entrada do Clip Shop:

```text
Como você quer começar?

[ CRIAR COM 12 CLIPES ]
Monte 27 variações com seus próprios trechos.

[ REMIXAR UM VÍDEO ]
Use um vídeo como referência para criar uma nova versão.
```

---

# 55. Objetivo do Modo Remix

O usuário poderá utilizar um criativo de referência para entender e reaproveitar características como:

- estrutura de venda;
- sequência Gancho → Corpo → CTA;
- duração aproximada;
- ritmo;
- quantidade de cenas;
- posição aproximada dos cortes;
- ideia central do Gancho;
- tipo de demonstração;
- tipo de CTA;
- distribuição temporal da mensagem.

O produto deve ser orientado a **criar uma nova peça inspirada na estrutura**, e não depender de copiar literalmente elementos protegidos ou distintivos de terceiros.

---

# 56. Entrada do Modo Remix

Área inicial:

```text
REMIX DE REFERÊNCIA

Adicione um vídeo para analisar sua estrutura.

[ + Adicionar vídeo ]

MP4 ou MOV
```

Após seleção, mostrar:

- thumbnail;
- nome;
- duração;
- resolução;
- proporção;
- tamanho;
- codec quando disponível;
- botão de reprodução;
- substituir;
- remover.

O arquivo deverá permanecer local sempre que a arquitetura permitir.

---

# 57. Etapa de Análise

Após o upload local:

```text
ANALISANDO VÍDEO

✓ Arquivo validado
✓ Áudio identificado
✓ Duração identificada
○ Transcrevendo
○ Detectando cenas
○ Estruturando roteiro
```

A análise deverá ser dividida em tarefas independentes para que a interface mostre progresso real.

---

# 58. Extração de Áudio

O motor deverá conseguir extrair a faixa de áudio do vídeo localmente.

Fluxo:

```text
video.mp4
   ↓
extrair áudio
   ↓
áudio temporário
   ↓
transcrição local
```

O áudio temporário deverá ser removido quando não for mais necessário.

---

# 59. Transcrição Local

A meta do projeto é permitir transcrição sem cobrança por minuto de API.

A implementação poderá utilizar um modelo de reconhecimento de fala executado localmente, desde que o desempenho seja aceitável no navegador/dispositivo.

A interface deverá mostrar:

```text
TRANSCRIÇÃO

00:00 - 00:04
Texto identificado...

00:04 - 00:12
Texto identificado...

00:12 - 00:21
Texto identificado...
```

O usuário deverá poder editar manualmente a transcrição antes de continuar.

Isso é importante porque nenhuma transcrição automática deve ser tratada como perfeita.

---

# 60. Detecção de Cenas e Cortes

O sistema deverá analisar mudanças visuais para sugerir os pontos de corte.

Resultado conceitual:

```text
Cena 01
00:00 → 00:03.8

Cena 02
00:03.8 → 00:08.4

Cena 03
00:08.4 → 00:14.2

Cena 04
00:14.2 → 00:20.1
```

O usuário poderá:

- aceitar;
- ajustar início;
- ajustar fim;
- juntar cenas;
- dividir cena;
- ignorar corte sugerido.

---

# 61. Timeline do Remix

Após análise, exibir uma timeline simples:

```text
| GANCHO |------ CORPO ------| CTA |
0s       4s                 18s   23s
```

A timeline deverá permitir visualizar:

- cenas;
- transcrição;
- áudio;
- classificação Gancho/Corpo/CTA;
- duração de cada parte.

Não é necessário transformar o Clip Shop em um editor completo no MVP.

A timeline deve ser focada em **estrutura de criativo**.

---

# 62. Classificação Gancho / Corpo / CTA

O sistema deverá tentar organizar o vídeo em:

```text
GANCHO
Início responsável por chamar atenção.

CORPO
Demonstração, explicação, benefício ou desenvolvimento.

CTA
Fechamento e chamada para ação.
```

Quando a detecção automática não for confiável, o usuário poderá definir manualmente os limites.

Exemplo:

```text
Gancho
00:00 → 00:04

Corpo
00:04 → 00:18

CTA
00:18 → 00:23
```

---

# 63. Painel “Estrutura encontrada”

Após análise:

```text
ESTRUTURA ENCONTRADA

Duração total: 23s
Cenas: 7
Gancho: 4s
Corpo: 14s
CTA: 5s

Ritmo: rápido
Formato: 9:16
```

Esse painel serve para o usuário entender por que aquele vídeo funciona como estrutura.

---

# 64. Roteiro de Referência

Exibir o roteiro separado:

```text
GANCHO
[transcrição]

CORPO
[transcrição]

CTA
[transcrição]
```

Cada bloco deverá ter:

- copiar;
- editar;
- marcar como aprovado;
- duração;
- reproduzir trecho correspondente.

---

# 65. Modos de Remix

Criar três opções conceituais:

## A. Manter estrutura

Preserva:

- ordem;
- duração aproximada;
- quantidade de blocos;
- ritmo geral.

O usuário substitui o conteúdo pelos próprios clipes.

## B. Criar variação

Mantém a lógica comercial, mas permite reescrever e reorganizar o conteúdo para gerar uma peça nova.

## C. Extrair estrutura

Não gera vídeo imediatamente.

Apenas transforma o vídeo em um modelo:

```text
Gancho: 0-4s
Demonstração: 4-10s
Benefício: 10-17s
CTA: 17-23s
```

Esse modelo poderá ser reutilizado em outro produto.

---

# 66. Reescrita do Roteiro

Quando houver um recurso de IA disponível na UMBRA, o Modo Remix poderá oferecer:

```text
[ Criar nova versão do Gancho ]
[ Criar nova versão do Corpo ]
[ Criar nova versão do CTA ]
[ Reescrever tudo ]
```

Objetivo:

- manter intenção;
- preservar o mecanismo de venda;
- alterar redação;
- adaptar ao produto;
- criar conteúdo novo.

A geração textual por IA deverá respeitar as regras de créditos/plano da UMBRA.

A renderização de vídeo continua sendo local.

---

# 67. Modo sem IA paga

O Modo Remix deverá continuar útil mesmo sem geração textual por IA.

Nesse modo:

1. vídeo é analisado;
2. áudio é transcrito localmente;
3. cenas são detectadas;
4. Gancho/Corpo/CTA são separados;
5. usuário edita manualmente o texto;
6. usuário adiciona seus próprios clipes;
7. sistema monta a nova versão.

Assim, o núcleo não depende obrigatoriamente de uma API paga.

---

# 68. Transformação do Remix em 12 segmentos

Uma evolução importante será converter a estrutura aprovada em material para o motor principal:

```text
VÍDEO DE REFERÊNCIA
        ↓
estrutura aprovada
        ↓
3 Ganchos
3 Corpos
3 CTAs
        ↓
12 segmentos
        ↓
27 variações
```

Os 12 segmentos poderão vir de:

- arquivos adicionados pelo usuário;
- cortes criados pelo usuário;
- novas gravações;
- vídeos gerados externamente;
- conteúdos produzidos por ferramentas da UMBRA.

---

# 69. Integração entre os dois modos

Arquitetura:

```text
                 UMBRA CLIP SHOP
                        │
          ┌─────────────┴─────────────┐
          │                           │
     MODO 12 CLIPES              MODO REMIX
          │                           │
3 Ganchos + 3 Corpos + 3 CTAs    1 vídeo referência
          │                           │
          │                     análise estrutural
          │                           │
          └─────────────┬─────────────┘
                        ↓
                 MOTOR DE VARIAÇÕES
                        ↓
                  27 combinações
                        ↓
                     preview
                        ↓
                      fila
                        ↓
               processamento local
                        ↓
                    resultados
```

---

# 70. Substituição de Cenas

No Remix, cada cena identificada poderá receber um arquivo substituto.

Exemplo:

```text
Cena original 01
Gancho
00:00–00:03

[ SUBSTITUIR CENA ]
```

O usuário adiciona seu próprio clipe.

Depois:

```text
Cena 01 ✓ substituída
Cena 02 ✓ substituída
Cena 03 pendente
...
```

Isso permite reconstruir a estrutura com mídia nova.

---

# 71. Mapa de Cenas

Criar uma visualização:

```text
01 | Gancho        | 3.2s | Substituído ✓
02 | Produto       | 2.8s | Substituído ✓
03 | Demonstração  | 4.1s | Pendente
04 | Benefício     | 3.5s | Pendente
05 | Prova         | 3.0s | Substituído ✓
06 | CTA           | 4.2s | Substituído ✓
```

O usuário deverá saber exatamente o que falta para montar o novo vídeo.

---

# 72. Ajuste automático de duração

Quando o novo clipe tiver duração diferente da cena de referência, oferecer estratégias:

```text
Ajustar ao espaço
Cortar final
Cortar início
Cortar centro
Manter duração original do novo clipe
```

Não acelerar/desacelerar automaticamente sem informar o usuário.

---

# 73. Áudio no Remix

Opções:

```text
Áudio do novo vídeo
Nova narração
Sem narração
Música/áudio adicionado posteriormente
```

Não assumir que o áudio original de um vídeo de terceiro pode ser reutilizado livremente.

O produto deverá priorizar áudio novo ou fornecido pelo próprio usuário.

---

# 74. Preview antes do Render

Antes de gerar:

```text
PREVIEW DO REMIX

Cena 01 → novo Gancho
Cena 02 → demonstração A
Cena 03 → demonstração B
Cena 04 → benefício
Cena 05 → CTA

Duração estimada: 22.8s
```

O preview deverá permitir revisar a sequência sem consumir o limite mensal.

---

# 75. Consumo do plano no Modo Remix

Somente analisar o vídeo não deve necessariamente consumir uma geração de vídeo.

Recomendação:

```text
Upload              = não consome
Análise local        = não consome
Transcrição local    = não consome
Detectar cenas       = não consome
Editar estrutura     = não consome
Preview lógico       = não consome

CONCLUIR VÍDEO FINAL = consome 1 vídeo do limite mensal
```

Assim, o usuário pode preparar tudo antes de consumir qualquer vídeo do limite mensal.

---

# 76. Remix + 27 variações e consumo

Se uma única execução gerar várias variações:

```text
Selecionar 10 variações
↓
Gerar
↓
1 execução
↓
quantidade de vídeos concluídos
```

Isso mantém a mesma regra definida para o modo tradicional.

---

# 77. Projetos Remix

Adicionar tipo de projeto:

```ts
type ClipShopProjectType = "variations" | "remix";
```

Projeto Remix deverá guardar localmente:

- referência;
- transcrição;
- cortes;
- estrutura;
- classificação;
- clipes substitutos;
- configurações;
- outputs;
- estado da fila.

---

# 78. Estrutura local do Remix

Exemplo:

```text
/clip-shop/projects/project-uuid/
│
├── project.json
│
├── /reference/
│   └── reference.mp4
│
├── /analysis/
│   ├── transcript.json
│   ├── scenes.json
│   └── structure.json
│
├── /replacements/
│   ├── scene-01.mp4
│   ├── scene-02.mp4
│   └── ...
│
├── /normalized/
│
└── /output/
    ├── remix-01.mp4
    └── ...
```

---

# 79. Estados do Modo Remix

Estados obrigatórios:

```text
empty
loading_reference
validating
extracting_audio
transcribing
detecting_scenes
building_structure
review_required
ready
preparing
queued
rendering
completed
error
```

A UI deverá traduzir esses estados para mensagens simples.

---

# 80. Erros específicos do Remix

### Sem áudio

> Não encontramos uma faixa de áudio. Você ainda pode usar a análise visual e definir a estrutura manualmente.

### Transcrição incompleta

> Parte da fala não pôde ser identificada. Revise a transcrição antes de continuar.

### Poucos cortes

> O vídeo possui poucos cortes detectáveis. Você pode criar divisões manualmente.

### Análise local indisponível

> Este dispositivo não conseguiu executar esta etapa localmente.

### Arquivo muito pesado

> Este vídeo pode exigir mais memória do que o navegador possui disponível.

---

# 81. Privacidade no Remix

Como o vídeo de referência pode ser sensível, a interface deverá destacar:

> **Análise local:** sempre que possível, o vídeo, áudio, transcrição e cenas permanecem no dispositivo.

Nenhum conteúdo deverá ser enviado ao Supabase apenas para executar a análise estrutural local.

O backend recebe apenas o mínimo necessário para:

- autenticação;
- plano;
- permissões;
- contador de geração;
- telemetria não sensível, quando aplicável.

---

# 82. Diretriz de conteúdo do Remix

O produto deve ser construído como ferramenta de **remix, referência e criação de variações**, e não como mecanismo de clonagem literal de criativos de terceiros.

A experiência deve incentivar:

```text
estrutura semelhante
+
mídia própria
+
roteiro próprio ou adaptado
+
nova narração
=
novo criativo
```

Evitar recursos cujo objetivo explícito seja copiar marcas d'água, identidade de terceiros ou reproduzir deliberadamente um criativo protegido de forma indistinguível.

---

# 83. Interface do Modo Remix

Estrutura sugerida:

```text
REMIX DE REFERÊNCIA

[1] VÍDEO
Adicionar referência

        ↓

[2] ANÁLISE
Transcrição
Cenas
Estrutura

        ↓

[3] REVISÃO
Gancho
Corpo
CTA
Timeline

        ↓

[4] SUBSTITUIÇÃO
Adicionar mídia nova

        ↓

[5] VARIAÇÕES
Selecionar versões

        ↓

[6] GERAR
Processamento local

        ↓

[7] RESULTADOS
Preview + download
```

---

# 84. Componentes adicionais do Remix

```text
components/remix/
├── RemixStartCard
├── ReferenceUploader
├── ReferencePlayer
├── AnalysisProgress
├── TranscriptEditor
├── SceneDetectorView
├── SceneTimeline
├── StructureSummary
├── ScriptSection
├── RemixModeSelector
├── SceneMap
├── SceneReplacementSlot
├── DurationStrategySelector
├── RemixPreview
└── RemixResults
```

---

# 85. Serviços adicionais do Remix

```text
services/remix/
├── audio-extractor.ts
├── local-transcription.ts
├── scene-detector.ts
├── structure-analyzer.ts
├── transcript-segmenter.ts
├── scene-replacement.ts
├── duration-matcher.ts
├── remix-builder.ts
└── remix-project-storage.ts
```

---

# 86. Primeira versão futura do Modo Remix

Esta seção não pertence ao MVP inicial do Clip Shop. Quando o Remix for autorizado, sua primeira versão deverá priorizar:

- upload local de 1 referência;
- player;
- extração de áudio;
- transcrição local quando suportada;
- edição manual da transcrição;
- detecção básica de cenas;
- ajuste manual de cortes;
- separação Gancho/Corpo/CTA;
- timeline;
- substituição de cenas;
- preview da sequência;
- renderização local;
- download;
- integração com os limites mensais Free, Pro e Elite;
- mesma conta e plano UMBRA.

Recursos mais sofisticados de compreensão semântica podem entrar depois.

---

# 87. Critérios de aceite do Modo Remix

- [ ] usuário consegue iniciar um projeto Remix;
- [ ] vídeo de referência permanece local no fluxo local;
- [ ] arquivo é validado;
- [ ] player funciona;
- [ ] áudio pode ser extraído;
- [ ] transcrição pode ser revisada;
- [ ] cenas podem ser detectadas ou definidas manualmente;
- [ ] usuário consegue definir Gancho/Corpo/CTA;
- [ ] timeline mostra a estrutura;
- [ ] cenas podem receber mídia substituta;
- [ ] preview pode ser realizado antes da renderização final;
- [ ] análise não consome o limite mensal;
- [ ] geração final respeita o limite mensal do plano;
- [ ] renderização ocorre localmente;
- [ ] resultado pode ser baixado;
- [ ] erros não destroem o projeto;
- [ ] usuário consegue continuar o projeto posteriormente quando a persistência local estiver disponível.

---

# 88. Visão consolidada do UMBRA Clip Shop

O produto passa a possuir dois pilares:

```text
UMBRA CLIP SHOP
│
├── 1. VARIAÇÕES
│      9 clipes
│      ↓
│      27 combinações
│
└── 2. REMIX
       1 vídeo referência
       ↓
       análise estrutural
       ↓
       nova versão / novos segmentos
       ↓
       variações
```

Os dois modos compartilham:

- conta;
- plano;
- limites mensais Free, Pro e Elite;
- armazenamento local;
- OPFS;
- IndexedDB;
- motor de vídeo;
- Web Workers;
- fila;
- preview;
- resultados;
- downloads;
- identidade visual UMBRA.

A meta é transformar o UMBRA Clip Shop em um estúdio de **reaproveitamento, remix e criação em escala**, mantendo o processamento pesado no dispositivo do usuário.

---

# 89. Prova técnica obrigatória antes do desenvolvimento

Quando houver autorização para começar, a primeira entrega não será a interface completa. Deverá ser criado um spike técnico isolado para responder, com medições reais, se o processamento local é viável.

O spike deverá:

1. carregar três clipes reais;
2. identificar contêiner, codecs, duração, resolução, rotação e áudio;
3. concatenar Gancho + Corpo + CTA;
4. normalizar apenas quando necessário;
5. gerar um MP4 reproduzível e baixável;
6. executar o trabalho pesado fora da thread principal;
7. medir tempo, memória aproximada e tamanho do resultado;
8. testar arquivos compatíveis e incompatíveis;
9. testar no build web e decidir separadamente sobre Electron;
10. registrar os resultados em uma decisão arquitetural.

Tecnologias candidatas a comparar:

- APIs nativas de vídeo e canvas;
- Mediabunny, já presente no projeto;
- FFmpeg.wasm;
- WebCodecs;
- recursos de Remotion já presentes, quando forem adequados ao navegador.

Não escolher FFmpeg.wasm ou WebCodecs apenas porque aparecem neste documento. A decisão deverá considerar compatibilidade, memória, tamanho do bundle, tempo de inicialização, codecs, qualidade, suporte em Worker e necessidade de isolamento por COOP/COEP ou `SharedArrayBuffer`.

Critério de saída do spike:

> O MVP só poderá avançar quando existir pelo menos um caminho comprovado para validar, normalizar quando necessário, concatenar e exportar vídeo localmente sem congelar a interface.

---

# 90. Compatibilidade e formatos do MVP

MP4 e MOV são contêineres. A extensão do arquivo não garante que o navegador consiga decodificar os codecs internos.

Política inicial recomendada:

```text
Contêiner preferencial: MP4
Vídeo preferencial: H.264
Áudio preferencial: AAC
MOV: aceito somente quando os codecs forem suportados ou puderem ser normalizados
HEVC, ProRes e codecs não comprovados: sem garantia no MVP
```

Antes da implementação deverá ser definida uma matriz oficial de suporte para:

- Chrome desktop;
- Edge desktop;
- Firefox;
- Safari desktop;
- navegadores móveis;
- aplicação Electron da UMBRA.

A recomendação inicial é validar primeiro Chrome e Edge desktop. Outros ambientes só deverão ser anunciados como suportados depois de testes reais.

O diagnóstico de compatibilidade deverá ocorrer antes da preparação de uma fila e verificar, conforme a arquitetura escolhida:

- WebAssembly;
- Web Worker;
- IndexedDB;
- OPFS;
- WebCodecs;
- codecs disponíveis;
- estimativa de armazenamento;
- isolamento de origem, caso seja necessário.

---

# 91. Perfil interno de vídeo e normalização

> **Estado no código:** os dois perfis são selecionáveis e persistidos por projeto.

O padrão `1080 × 1920, 30 FPS, H.264 e AAC` é uma meta de qualidade, mas poderá ser pesado em dispositivos modestos. O spike deverá comparar pelo menos:

```text
Performance: 720 × 1280, 30 FPS
Qualidade: 1080 × 1920, 30 FPS, H.264 a 8 Mbps
```

O perfil Performance usa H.264 a 4 Mbps. A interface apresenta estimativas relativas de tamanho e tempo e informa a disponibilidade de WebCodecs no dispositivo.

Antes da implementação deverão ser decididos:

- bitrate de vídeo;
- bitrate e sample rate de áudio;
- pixel format;
- crop, fit ou preenchimento para mídia fora de 9:16;
- leitura da rotação armazenada em metadados;
- comportamento para clipes sem áudio;
- normalização de volume;
- frame rate variável;
- resolução e timebase incompatíveis.

A regra de performance permanece:

> Não recodificar um clipe que já seja compatível com o perfil interno escolhido.

---

# 92. Contrato testável do motor de 27 variações

O motor deverá ser determinístico e versionado. Para 24 resultados usando quatro itens de cada categoria, as regras mínimas serão:

```text
24 trios únicos
cada Gancho aparece exatamente 9 vezes
cada Corpo aparece exatamente 9 vezes
cada CTA aparece exatamente 9 vezes
cada dupla Gancho/Corpo aparece no máximo 2 vezes
cada dupla Gancho/CTA aparece no máximo 2 vezes
cada dupla Corpo/CTA aparece no máximo 2 vezes
mesma entrada + mesma versão = mesma saída
```

Todo projeto deverá guardar:

```ts
algorithmVersion: number;
```

Assim, mudanças futuras no algoritmo não modificarão silenciosamente combinações de projetos existentes.

O algoritmo deverá possuir testes unitários independentes da interface.

---

# 93. Limites mensais, reserva e idempotência

A regra comercial implementada é:

```text
Free  = 3 vídeos/mês, lote máximo 1
Pro   = 270 vídeos/mês, lote máximo 5
Elite = 470 vídeos/mês, lote máximo 27
```

Cada vídeo concluído consome uma unidade. A quantidade selecionada é reservada antes do lote, mas falhas e itens não concluídos são liberados na finalização.

O controle não poderá ser um simples contador atualizado pelo navegador. O Supabase deverá oferecer operações atômicas e idempotentes equivalentes a:

```text
get_clip_shop_usage()
reserve_clip_shop_generation(request_id, requested_count)
start_clip_shop_generation(reservation_id)
finish_clip_shop_generation(reservation_id, result_count)
release_clip_shop_generation(reservation_id, reason)
```

Estados recomendados:

```text
reserved
started
completed
released
expired
```

Cada reserva deverá ter, no mínimo:

- identificador único de requisição;
- usuário;
- feature `umbra_clip_shop`;
- plano capturado no momento da reserva;
- competência mensal;
- quantidade solicitada;
- estado;
- datas de reserva, início, conclusão e expiração;
- quantidade de resultados concluídos;
- motivo de liberação, quando houver.

Regras recomendadas:

- duas abas ou dois dispositivos não podem ultrapassar o saldo;
- repetir a mesma requisição não pode criar duas reservas;
- somente vídeos concluídos permanecem consumidos;
- a parte reservada e não concluída volta ao saldo;
- retries dentro da mesma fila usam a mesma reserva;
- reservas abandonadas e nunca iniciadas expiram por reconciliação;
- o plano efetivo deve reutilizar `profiles.plan`, expiração, trial, administração e a hierarquia Free/Pro/Elite já existentes na UMBRA.

---

# 94. Modelo local e recuperação

Quando a etapa de persistência for autorizada, o modelo local deverá separar:

```text
Project
ClipAsset
NormalizedAsset
Variation
RenderBatch
RenderJob
OutputAsset
StorageManifest
```

O IndexedDB deverá guardar entidades, metadados, versões de schema e estados. O OPFS deverá guardar fontes, normalizados, temporários e resultados.

Nos tipos TypeScript, preferir:

```ts
storageKey?: string;
opfsPath?: string;
```

em vez de tratar `localPath` como um caminho de filesystem Node.

Também deverão ser definidos:

- versão e migração do banco local;
- política de retenção;
- limpeza de temporários após falha;
- restauração depois de refresh ou fechamento da aba;
- invalidação de normalizados quando uma fonte mudar;
- revogação de URLs criadas com `URL.createObjectURL`;
- tratamento de projeto criado por uma versão antiga do aplicativo.

---

# 95. Semântica da fila e dos controles

No primeiro MVP:

```text
Concorrência: 1 job por vez
Pausar fila: concluir o job atual e não iniciar o próximo
Cancelar job atual: encerrar o Worker e descartar temporários incompletos
Retry: repetir o item dentro da mesma reserva
Erro em um item: não destruir os demais resultados nem o projeto
```

Processar dois jobs simultaneamente só deverá ser liberado depois de benchmark. `navigator.hardwareConcurrency` pode ajudar na decisão, mas não é prova de memória disponível nem autorização para iniciar vários encoders.

---

# 96. Preview, privacidade e telemetria

O preview de uma variação será inicialmente lógico: os três clipes serão reproduzidos em sequência sem gerar o MP4 final. Esse preview não garante equivalência frame a frame com o render.

O player deverá tratar interrupção, troca de clipe, autoplay, volume, arquivos sem áudio, substituição de slot e liberação de URLs temporárias.

Mensagem de privacidade recomendada para o fluxo totalmente local:

> Os arquivos de vídeo não são enviados aos servidores da UMBRA durante o processamento local.

Se algum fallback remoto for criado no futuro, ele deverá exigir consentimento explícito antes do upload. Não usar uma promessa vaga como “sempre que possível” para esconder comportamentos diferentes.

A telemetria não deverá enviar:

- vídeo ou áudio;
- thumbnails;
- transcrição;
- nome original do arquivo;
- caminho local;
- título livre do projeto;
- qualquer conteúdo extraído da mídia.

---

# 97. Fases oficiais quando houver autorização

```text
FASE 0 — planejamento
Concluída; implementação autorizada em 08/08/2026.

FASE 1 — spike técnico
Três clipes, análise, normalização, concatenação, Worker e benchmark.

FASE 2 — MVP Variações
9 slots, 27 combinações, lotes de 1/5/27 conforme o plano, preview, fila sequencial e download.

FASE 3 — conta e consumo
Rota #/clipshop, sessão UMBRA, plano efetivo e reserva mensal atômica por quantidade.

FASE 4 — persistência e robustez
IndexedDB, OPFS, restauração, limpeza, recovery e testes de estresse.

FASE 5 — evolução
Concorrência adaptativa, recuperação avançada e demais melhorias. ZIP e presets de nomes já foram implementados.

PROJETO FUTURO — Remix
Transcrição, cenas, timeline e substituição de mídia, mediante nova aprovação.
```

Cada fase deverá ter seus próprios testes e critério de saída. Não iniciar a fase seguinte apenas porque a interface da anterior parece pronta.

---

# 98. Decisões consolidadas

- A rota planejada é `https://umbracopywriter.com/#/clipshop`.
- O identificador interno planejado é `clipshop`.
- O módulo seguirá o padrão de `umbramente`, `umbra-voice` e `contas`.
- O código do domínio ficará isolado em `src/components/clipshop/`.
- O `App.tsx` fará somente a integração necessária com navegação, sessão e plano.
- A implementação do Modo Variações foi autorizada; expansões materiais continuam exigindo decisão explícita.
- O motor de vídeo será escolhido por prova técnica e benchmark.
- O MVP inicial conterá apenas o Modo Variações.
- O Remix permanece documentado como visão futura separada.
- A mídia permanecerá local no fluxo local; o backend cuidará de conta, plano, reserva e telemetria mínima.

---

# 99. Composição de mídia fora de 9:16

O formato recomendado continuará sendo vertical 9:16. Arquivos horizontais, quadrados ou com outra proporção deverão mostrar uma prévia do enquadramento antes da geração.

Estratégias que a arquitetura deverá permitir:

```text
Preencher e cortar
Ajustar com bordas
Usar fundo desfocado
Manter proporção original
```

> **Estado no código:** implementado e persistido por projeto.

O padrão inicial é **Ajustar com bordas**. A interface oferece as quatro estratégias e mostra uma prévia antes da geração. “Manter proporção” usa as dimensões pares do primeiro clipe da sequência como perfil do resultado.

---

# 100. Revisão obrigatória antes da geração

> **Estado no código:** implementada com validações bloqueantes e lista exata das combinações.

Antes de reservar parte do limite mensal, exibir um resumo semelhante a:

```text
REVISÃO DA GERAÇÃO

10 variações selecionadas
Duração estimada: 18–31 segundos
Espaço estimado: 420 MB
Qualidade: Performance
Tempo estimado: aproximadamente 8 minutos
Reserva do lote: X vídeos
Consumo final: somente vídeos concluídos
```

Ações:

```text
Voltar e revisar
Gerar vídeo de teste
Confirmar geração
```

As estimativas deverão ser apresentadas como estimativas, pois o tempo depende do dispositivo, codec e perfil de exportação.

Validações obrigatórias antes da confirmação:

- arquivos ainda acessíveis;
- clipes válidos;
- compatibilidade do motor;
- armazenamento estimado suficiente;
- nenhuma combinação duplicada;
- pelo menos uma variação selecionada;
- sessão e plano consultáveis.
- perfil de qualidade e resolução;
- composição selecionada;
- política de áudio e loudness alvo;
- saldo mensal previsto depois do lote;
- tempo estimado;
- lista das IDs que serão processadas.

---

# 101. Geração de vídeo de teste

Antes do lote completo, o usuário poderá gerar uma variação de teste para validar:

- enquadramento;
- qualidade;
- emendas;
- áudio e volume;
- duração;
- compatibilidade do resultado.

O teste deverá usar uma das combinações selecionadas e as mesmas configurações previstas para o lote. Depois do preview, o usuário poderá aprovar, ajustar configurações ou cancelar.

A política comercial está aprovada e implementada: o vídeo de teste é temporário, não é salvo como resultado e não consome nem reserva unidades do limite mensal.

---

# 102. Política de áudio

O áudio faz parte do critério de qualidade do resultado e não poderá ser tratado apenas como uma faixa anexada ao vídeo.

> **Estado no código:** implementado como política configurável por projeto.

O motor prevê:

- detecção de clipe sem áudio;
- preservação do áudio original por padrão;
- opção de silenciar um clipe;
- normalização de volume entre Gancho, Corpo e CTA;
- prevenção de clipping;
- tratamento de sample rates incompatíveis;
- transição curta de áudio quando necessária para evitar estalos;
- comportamento previsível quando apenas alguns segmentos possuem áudio.

Configuração padrão:

- política `Normalizar`, com alternativas `Preservar` e `Sem áudio`;
- alvo aproximado de `-14 dB` por RMS, configurável entre `-24` e `-8 dB`;
- teto de pico `-1 dB`, configurável entre `-6` e `0 dB`;
- fade de `12 ms`, configurável entre `0` e `100 ms`;
- AAC, 128 kbps, 48 kHz e dois canais;
- silêncio sintético para clipes sem faixa ou silenciados quando o restante da sequência possui áudio.

O alvo no navegador é uma aproximação RMS, não uma certificação LUFS broadcast. O teto de pico limita amostras para prevenir clipping digital.

O corte seco continuará sendo o padrão visual do MVP. Transições visuais mais elaboradas permanecem fora do escopo inicial.

---

# 103. Nomes de exportação e identidade permanente

> **Estado em produção:** implementado. Cada projeto salva um modelo configurável, aplicado às próximas renderizações e ao manifesto CSV.

Variáveis disponíveis:

```text
{project}
{variationId}
{gancho}
{corpo}
{cta}
```

Modelos oferecidos pela interface:

```text
{project}-{variationId}
{project}-{gancho}-{corpo}-{cta}
{project}-{gancho}-{cta}
```

Cada variação deverá possuir identidade técnica estável e independente do nome exibido pelo usuário.

Formato conceitual:

```text
CS-V1-G02-C04-T01
```

Onde:

- `CS` identifica o Clip Shop;
- `V1` identifica a versão do algoritmo ou manifesto;
- `G02` identifica o Gancho;
- `C04` identifica o Corpo;
- `T01` identifica o CTA.

O ID permanente deverá ser salvo no projeto e poderá ser utilizado em arquivos, manifestos, integrações e análise futura de desempenho.

O usuário poderá configurar o padrão do nome exportado, por exemplo:

```text
{projeto}-{variationId}.mp4
{projeto}-{gancho}-{corpo}-{cta}.mp4
{produto}-G{gancho}-C{corpo}-CTA{cta}.mp4
```

Exemplo:

```text
escova-eletrica-CS-V1-G02-C04-T01.mp4
```

Os nomes deverão ser sanitizados para evitar caracteres inválidos e colisões. Quando dois arquivos receberem o mesmo nome, o sistema deverá acrescentar um sufixo seguro sem alterar o ID da variação.

Exportação futura de manifesto:

```csv
variation_id,arquivo,gancho,corpo,cta,duracao
CS-V1-G02-C04-T01,escova-G02-C04-CTA01.mp4,Dor,Beneficio,Urgencia,22.4
```

---

# 104. Integração futura com resultados do TikTok

Sem fazer parte do MVP, o modelo deverá permitir relacionar uma variação exportada a dados futuros de publicação e desempenho:

- conta TikTok;
- publicação;
- data;
- visualizações;
- retenção;
- cliques;
- vendas;
- comissão;
- status da coleta;
- origem manual ou integração autorizada.

Essa integração deverá reutilizar os mecanismos oficiais e autorizados do ecossistema UMBRA. Não depender de scraping não autorizado nem armazenar credenciais inseguras.

O ID permanente da variação será a chave para relacionar o criativo aos elementos usados em sua composição.

---

# 105. Ciclo futuro de aprendizado criativo

Visão de evolução:

```text
Gerar variações
        ↓
Publicar
        ↓
Importar resultados autorizados
        ↓
Relacionar desempenho a Gancho, Corpo e CTA
        ↓
Identificar componentes vencedores
        ↓
Sugerir o próximo lote
```

Exemplos de conclusões futuras:

```text
Gancho 3 apareceu em 4 dos 5 melhores vídeos.
CTA 1 apresentou mais cliques.
Corpo 2 apresentou maior retenção.
```

Essas conclusões deverão ser apresentadas como associações observadas, não como causalidade garantida. Será necessário considerar tamanho da amostra, período, conta, produto e diferenças de distribuição.

---

# 106. Momento exato do consumo mensal

Validação, preparação e revisão não consomem vídeos do limite mensal.

Fluxo oficial planejado:

```text
Validar arquivos              = não consome
Verificar compatibilidade     = não consome
Estimar espaço e tempo        = não consome
Montar combinações            = não consome
Preview lógico                = não consome
Abrir revisão                 = não consome
Reservar quantidade do lote   = bloqueio temporário, ainda reversível
Iniciar o primeiro job        = mantém a reserva ativa
Concluir um resultado         = consome 1 vídeo
Falhar ou não iniciar         = libera a quantidade correspondente
```

A reserva só poderá ser marcada como iniciada depois que:

- todos os arquivos necessários estiverem disponíveis;
- o motor estiver carregado;
- houver armazenamento estimado suficiente;
- a fila estiver persistida e pronta;
- o primeiro job realmente começar.

Se nenhuma renderização começar, a reserva deverá ser liberada. O vídeo de teste é temporário e não consome o limite mensal.

---

# 107. Proteção contra fechamento acidental

> **Estado no código:** proteção e recuperação implementadas. A fila é gravada no IndexedDB antes de cada job e reconciliada com os outputs já salvos ao reabrir o projeto.

Durante uma fila ativa, a interface deverá alertar:

> Há vídeos sendo processados. Se você sair agora, a tarefa atual poderá ser interrompida.

Comportamentos esperados:

- alerta antes de fechar ou recarregar quando tecnicamente permitido;
- estado da fila persistido antes de cada job;
- outputs concluídos preservados;
- temporários incompletos identificados para limpeza;
- recuperação do projeto na próxima abertura;
- explicação clara sobre quais itens foram concluídos, interrompidos ou precisam de retry.

O alerta não substitui persistência. Navegadores podem ignorar ou limitar mensagens personalizadas no fechamento da página.

Na próxima abertura, o usuário recebe as ações **Continuar geração**, **Tentar novamente nos erros** e **Descartar fila**. A continuação reutiliza a reserva original, não repete vídeos já encontrados e mantém retries separados somente para variações em erro. Temporários incompletos podem ser removidos pela Central de armazenamento.

---

# 108. Onboarding em três passos

> **Estado em produção:** implementado como guia modal reabrível. Ele aparece automaticamente no primeiro acesso ao workspace e registra localmente sua conclusão.

Passos atuais:

1. enviar até 3 Ganchos, 3 Corpos e 3 CTAs;
2. escolher até 1/5/27 entre as 27 combinações, conforme o plano Free/Pro/Elite;
3. gerar localmente e exportar individualmente ou em ZIP.

A experiência principal deverá apresentar progressivamente:

```text
1. Adicione seus clipes
2. Escolha as combinações
3. Gere e baixe
```

O usuário não precisa visualizar fila, resultados e armazenamento avançado antes de chegar a essas etapas. As seções futuras poderão permanecer recolhidas ou bloqueadas com orientação simples.

O onboarding deverá explicar:

- mínimo de 1 Gancho + 1 Corpo + 1 CTA;
- recomendação de 3 + 3 + 3;
- processamento local;
- tempo dependente do dispositivo;
- reserva do lote e consumo somente por vídeo concluído;
- local onde o projeto será armazenado.

---

# 109. Upload em lote e classificação

> **Estado no código:** implementado com drag-and-drop por coluna, upload geral, classificação manual, mudança de categoria, mudança de slot e confirmação antes de substituir um slot ocupado.

Além do upload individual por slot, o usuário poderá selecionar vários arquivos em uma única ação.

Fluxo sugerido:

```text
Selecionar arquivos
        ↓
Carregar metadados e validar
        ↓
Classificar como Gancho, Corpo ou CTA
        ↓
Arrastar e ordenar dentro de cada categoria
        ↓
Confirmar preparação
```

O sistema não deverá tentar classificar semanticamente os arquivos por IA no MVP. Poderá sugerir uma distribuição apenas pela ordem de seleção, deixando a confirmação explícita com o usuário.

Arquivos excedentes aos 9 slots deverão permanecer fora do projeto ou exigir substituição consciente; nunca substituir silenciosamente um clipe existente.

A tela de classificação sugere a distribuição pela ordem dos arquivos, destaca categorias com mais de três itens e bloqueia a confirmação até que os excedentes sejam redistribuídos ou removidos.

---

# 109.1 Estratégias de seleção e mensagens operacionais

> **Estado no código:** implementado no workspace.

O seletor explica e persiste quatro estratégias:

- **Balanceado:** maximiza a diversidade entre as três categorias;
- **Priorizar Ganchos:** varia primeiro as aberturas;
- **Priorizar Corpos:** varia primeiro demonstrações e benefícios;
- **Priorizar CTAs:** varia primeiro chamadas para ação e ofertas.

Ao mudar a estratégia, a mesa é recalculada pelo motor determinístico do projeto.

Erros são classificados em categorias visíveis e acionáveis:

- arquivo grande demais;
- espaço insuficiente;
- codec incompatível;
- faixa de áudio ausente;
- navegador sem WebCodecs;
- arquivo local removido;
- projeto corrompido;
- saldo insuficiente para o lote;
- falha temporária recuperável;
- falha definitiva.

Somente variações com estado de erro recebem a ação **Tentar novamente**. Um arquivo local ausente permanece visível no slot como erro, em vez de desaparecer silenciosamente do projeto.

---

# 110. Diferença entre remover e excluir

Os termos da interface deverão ter significados consistentes:

```text
Remover do slot
Desvincula o clipe daquele slot. Não apaga o arquivo original do computador.

Excluir resultado local
Remove a cópia gerada e armazenada pelo Clip Shop no dispositivo.

Excluir projeto
Remove metadados, mídias copiadas, temporários e resultados locais daquele projeto.

Limpar temporários
Remove somente arquivos intermediários que podem ser recriados.

Limpar tudo do Clip Shop
Remove todos os projetos e arquivos locais controlados pelo módulo.
```

A interface deverá solicitar confirmação para exclusão de projeto e limpeza total. Em nenhum caso o Clip Shop deverá apagar o arquivo original escolhido pelo usuário fora do armazenamento controlado pelo produto.

---

# 111. Glossário oficial

| Termo | Definição |
|---|---|
| Clipe | Arquivo ou segmento de vídeo usado como entrada. |
| Slot | Posição do projeto destinada a um Gancho, Corpo ou CTA. |
| Gancho | Segmento inicial destinado a capturar atenção. |
| Corpo | Segmento central que apresenta demonstração, benefício ou argumento. |
| CTA | Segmento final com chamada para ação. |
| Combinação | Trio formado por um Gancho, um Corpo e um CTA. |
| Variação | Representação identificada de uma combinação pronta para preview ou render. |
| Geração | Execução local de uma fila; não é mais a unidade comercial de consumo. |
| Lote | Conjunto de variações selecionadas, limitado a 1/5/27 conforme Free/Pro/Elite. |
| Job | Unidade individual de processamento de uma variação dentro da fila. |
| Render | Produção do arquivo final de uma variação. |
| Normalização | Conversão de mídia incompatível para o perfil interno escolhido. |
| Projeto | Conjunto local de clipes, configurações, variações, fila e resultados. |
| Resultado | Arquivo final gerado por um job concluído. |
| Reserva | Bloqueio transacional temporário da quantidade de vídeos selecionada antes do processamento. |
| Preview lógico | Reprodução sequencial dos clipes sem criar o arquivo final. |
| Vídeo de teste | Render de uma variação usado para validar as configurações antes do lote. |
| Manifesto | Arquivo que relaciona IDs, nomes e componentes das variações exportadas. |

---

# 112. Registro de decisões

| Decisão | Estado | Motivo ou condição |
|---|---|---|
| Usuário principal: afiliado de TikTok Shop com clipes verticais | Aprovada | Direciona o MVP para um caso de uso claro. |
| Rota `#/clipshop` | Aprovada | Compatível com a navegação atual da UMBRA. |
| Módulo em `src/components/clipshop/` | Aprovada | Segue o padrão de `umbramente`, `umbra-voice` e `contas`. |
| Até 9 slots, com mínimo de 1 + 1 + 1 | Aprovada e implementada | Reduz abandono sem perder a experiência recomendada. |
| Meta de 10 criativos em menos de 15 minutos | Aprovada como objetivo | Exige dispositivo de referência e validação no benchmark. |
| Máximo de 30 segundos por clipe | Aprovada | Limite inicial do produto. |
| Máximo de 90 segundos por resultado | Aprovada | Limite inicial do produto. |
| Concorrência inicial igual a 1 | Aprovada | Reduz risco de memória e travamento. |
| 27 variações determinísticas no conjunto 3×3×3 | Aprovada e implementada | Mantém ordem previsível e cobre todas as combinações. |
| FFmpeg.wasm, WebCodecs ou outro motor | Pendente | Depende do spike técnico. |
| 500 MB por arquivo e 1,5 GB de fontes por projeto | Aprovada e implementada | Mantém margem compatível com processamento local. |
| Reserva local de 200 MB antes da geração | Aprovada e implementada | Reduz falhas por armazenamento insuficiente. |
| Até 10 projetos antes de sugerir limpeza | Aprovada e implementada | Orienta manutenção sem impor exclusão automática. |
| Ajustar com bordas como padrão fora de 9:16 | Aprovada e implementada | Preserva toda a imagem; cover, blur e proporção original permanecem selecionáveis. |
| Áudio normalizado em AAC 48 kHz estéreo | Aprovada e implementada | Uniformiza segmentos, adiciona silêncio e evita incompatibilidade na concatenação. |
| Vídeo de teste temporário sem consumo | Aprovada e implementada | Permite validar mídia antes do lote sem descontar o limite. |
| Limites mensais Free 3, Pro 270 e Elite 470 | Aprovada e implementada no código | A unidade comercial passa a ser cada vídeo concluído. |
| Lotes Free 1, Pro 5 e Elite 27 | Aprovada e implementada | O Elite pode processar todas as combinações em uma fila sequencial. |
| Reserva mensal por quantidade | Aprovada e implementada no SQL | Impede duas abas de ultrapassarem o saldo. |
| Expiração: 30 min antes do início e 2 h após iniciar | Aprovada e implementada no SQL | Libera reservas abandonadas sem interromper lotes normais. |
| Remix fora do MVP | Aprovada | Reduz risco e permite validar primeiro o motor principal. |
| Integração de resultados do TikTok | Futuro | Depende de integração autorizada e modelo de dados. |

---

# 113. UMBRA Audio Shuffle

O UMBRA Audio Shuffle passa a fazer parte do roadmap oficial do Clip Shop como um **Audio Diversity Engine** local-first. A especificação detalhada está em:

```text
docs/UMBRA-AUDIO-SHUFFLE-PLANO-DE-IMPLEMENTACAO.md
```

## 113.1 Duas superfícies, um único motor

O recurso terá:

1. aba dedicada em `#/clipshop/audio-shuffle`;
2. seção dentro de cada projeto em `#/clipshop/{projectId}/audio`.

As duas superfícies reutilizarão o mesmo domínio, algoritmo, armazenamento, análise acústica e Workers. Não serão criados randomizadores independentes.

## 113.2 Áudio exclusivo por variação

Este requisito pertence à primeira entrega:

```text
Variação 01 → sequência exclusiva 01
Variação 02 → sequência exclusiva 02
...
Variação 27 → sequência exclusiva 27
```

Cada sequência será ajustada à duração real de Gancho + Corpo + CTA. O histórico do lote reduzirá repetição entre as 27 sequências, enquanto o histórico do projeto influenciará lotes posteriores.

## 113.3 Modos

- **Misturar como fundo:** preserva o áudio dos clipes, com volume e ducking;
- **Substituir áudio:** utiliza somente a sequência do Shuffle;
- **Exportar separadamente:** gera áudio sem modificar o vídeo.

O padrão será **Misturar como fundo**.

## 113.4 Motor mínimo aprovado

- PRNG determinístico por seed;
- seed principal e seed derivada por variação;
- zonas automáticas;
- ciclos sem repetição de zona enquanto houver alternativas;
- distância mínima;
- cooldown por quantidade de cortes;
- centralização;
- histórico do lote, projeto e fonte global opcional;
- regiões proibidas e prioritárias;
- ajuste por silêncio, energia e zero crossing;
- pausas, fades e crossfades;
- regeneração e bloqueio seletivos;
- medidor de diversidade;
- timeline de calor e matriz das variações.

## 113.5 Persistência

Fontes longas terão tipo próprio e não usarão `ClipAsset`, que permanece limitado a 30 segundos. Mídia e análises ficarão no OPFS; configurações, seeds, históricos e manifestos ficarão no IndexedDB.

Projetos receberão cópia independente da fonte escolhida na biblioteca. Excluir uma fonte global não quebrará projetos existentes.

Nenhum arquivo, waveform, PCM, trecho, seed, intervalo de corte, análise acústica, transcrição ou nome de mídia será enviado ao Supabase, Vercel ou Shop Factory. Esses dados permanecem exclusivamente no navegador do usuário.

## 113.5.1 Biblioteca e controle de cortes

A aba dedicada preserva todas as sequências geradas para a fonte. Uma nova geração é acrescentada à lista, sem substituir as anteriores, e cada item mantém reprodução, exportação WAV e regeneração de corte independentes. Ao reabrir a fonte, as sequências são restauradas do IndexedDB em ordem de criação.

A calculadora de rendimento usa a duração real do áudio e uma duração de corte informada pelo usuário para exibir cortes completos, sobra e total de trechos aproveitáveis. Esse cálculo é informativo e permanece separado da geração determinística.

A configuração `Quantidade máxima de cortes por áudio` estabelece um limite acumulado para todas as sequências da fonte:

- sequências já persistidas contam como cortes utilizados;
- a interface mostra o total usado e o saldo disponível;
- a geração seguinte é ajustada para não ultrapassar o saldo;
- ao esgotar o limite, novas gerações são bloqueadas;
- regenerar um corte existente não aumenta o consumo.

A exclusão de uma fonte usa um modal próprio, informa o nome do arquivo e os dados locais vinculados, exige confirmação explícita e mostra progresso durante a remoção.

## 113.6 Renderização e consumo

O pipeline local deverá cortar, corrigir timestamps, inserir pausas, aplicar transições, fazer mix/substituição e muxar a sequência exclusiva no vídeo correspondente.

Previews não consomem limite. O consumo permanece por vídeo final concluído; cortes individuais não são unidade comercial.

## 113.7 Marcos

1. spike de decode, análise, corte, concatenação e mixagem;
2. domínio determinístico e testes;
3. persistência e biblioteca;
4. aba dedicada;
5. integração por projeto e 27 sequências;
6. render final, recuperação e exportação;
7. validação com música, voz, fontes longas e dispositivos reais.

## 113.8 Critério de integração

O Audio Shuffle só estará integrado quando cada resultado puder ser rastreado até sua variação, sequência, seed, fingerprint da fonte e lista de cortes, preservando privacidade e recuperação local.

## 113.9 Estado técnico atual

As Entregas 1 a 12 estão implementadas em `src/components/clipshop/audio-shuffle/`:

- tipos e presets;
- validações;
- fingerprint local;
- PRNG e seeds derivadas;
- motor de zonas, cooldown, distância e históricos;
- geração determinística de até 27 sequências;
- API pública `generateAudioSequences()` baseada somente em intervalos matemáticos;
- versão do algoritmo, fingerprint da fonte e seed derivados registrados no resultado;
- regiões proibidas e prioritárias, ciclos, cooldown, distância mínima, históricos de lote/projeto e relaxamento seguro;
- bloqueio e regeneração seletiva;
- integração opcional ao modelo de projeto;
- testes unitários do domínio.
- testes pesados de determinismo, limites, cooldown, distância, fontes curtas e regras impossíveis;
- análise acústica PCM em janelas com waveform, RMS, energia, silêncio, zero crossings, transientes e voz aproximada;
- Worker acústico dedicado e ajuste opcional dos limites temporais sem alterar a duração final.
- IndexedDB próprio com fontes, análises, presets, sequências e históricos;
- mídia no OPFS sem duplicação, fallback IndexedDB e detecção de fonte ausente;
- exclusão vinculada e cópia física independente para projetos;
- rota `#/clipshop/audio-shuffle` com upload, waveform, configurações, seeds, geração e reprodução;
- regeneração individual de corte, presets e exportação WAV.
- lista acumulativa de sequências, restaurada do IndexedDB sem substituir gerações anteriores;
- reprodução, exportação e regeneração independentes por sequência salva;
- calculadora de cortes completos, trecho restante e aproveitamento total da fonte;
- limite máximo acumulado de cortes por áudio, com contador e bloqueio ao esgotar o saldo;
- confirmação personalizada para exclusão da fonte e dos dados locais vinculados;
- seção interna por projeto com upload ou cópia independente da biblioteca;
- cálculo da duração de cada variação e matriz comparativa com até 27 sequências;
- relação persistida `variationId → sequenceId`, bloqueio e regeneração;
- WAV exclusivo por resultado, fallback local e inclusão no ZIP;
- modos exportar separadamente, substituir, misturar como fundo e ducking;
- Worker de mux que preserva o vídeo e produz a faixa final AAC.
- snapshot imutável do Audio Shuffle persistido junto à fila antes do processamento;
- recuperação sem recalcular sequências ou alterar seeds;
- execução sequencial dos Workers, cancelamento e retry individual;
- timeline avançada com heatmap e regiões manuais de bloqueio/prioridade;
- limites ajustáveis, cobertura, repetição, diversidade e histórico de lotes;
- comparação A/B entre duas sequências da matriz de até 27 variações.

As etapas técnicas estão integradas ao pipeline local. Falta executar a matriz de validação manual com MP3/WAV/M4A e vídeos reais com e sem áudio nos navegadores e dispositivos oficialmente suportados.

---

# 114. Perguntas abertas

Antes do início de cada fase, responder apenas às perguntas que bloqueiam aquela fase:

1. Qual computador e conjunto de arquivos formarão o benchmark oficial da meta de 15 minutos?
2. Chrome e Edge serão os únicos navegadores oficialmente suportados no MVP?
3. A versão Electron fará parte do MVP ou será validada depois?
4. O usuário poderá definir uma retenção automática diferente dos 30 dias oferecidos pela Central?
5. Quais dados de desempenho do TikTok poderão ser obtidos por integração oficial?
6. Quais eventos de telemetria serão necessários para medir a meta de negócio sem coletar conteúdo?



**Documento oficial atualizado — UMBRA Clip Shop**

## Registro de implementação — atualizado em 23/08/2026

Implementado no repositório local:

- [x] rota autenticada `#/clipshop` e retorno pós-login;
- [x] workspace isolado em `src/components/clipshop/`;
- [x] projetos locais;
- [x] upload individual e em lote;
- [x] 3 Ganchos, 3 Corpos e 3 CTAs, totalizando 9 slots;
- [x] mínimo flexível de 1 + 1 + 1;
- [x] metadados, thumbnails, validação e nomes semânticos;
- [x] motor determinístico e versionado com até 27 combinações;
- [x] mesa permanente de `G1+C1+CTA1` até `G3+C3+CTA3`;
- [x] limites mensais de 3/270/470 vídeos para Free/Pro/Elite;
- [x] lotes máximos de 1/5/27 para Free/Pro/Elite;
- [x] reserva transacional por quantidade, usuário e competência mensal;
- [x] consumo somente dos vídeos concluídos e liberação do restante;
- [x] preview lógico sequencial;
- [x] revisão antes da geração;
- [x] vídeo temporário de teste sem consumo;
- [x] fila sequencial com pausa entre jobs e cancelamento;
- [x] renderização em Web Worker;
- [x] caminho rápido por remux;
- [x] normalização 720×1280/H.264/AAC quando necessária;
- [x] silêncio automático para segmentos sem áudio e botão de mute por clipe;
- [x] política de áudio configurável com alvo RMS, teto de pico e fades;
- [x] composição por projeto: cover, contain, fundo desfocado e proporção original;
- [x] prévia visual do enquadramento;
- [x] limites de 500 MB por arquivo e 1,5 GB de fontes por projeto;
- [x] central de armazenamento, margem de 200 MB e alerta após 10 projetos;
- [x] espaço usado/disponível, tamanho e quantidade de resultados por projeto;
- [x] limpeza de temporários, resultados antigos, resultados por projeto e todos os dados locais;
- [x] solicitação de armazenamento persistente ao navegador;
- [x] persistência em IndexedDB e OPFS com fallback;
- [x] fila persistida antes de cada job, detecção de interrupção e reconciliação com outputs concluídos;
- [x] continuar geração, tentar novamente somente nos erros e descartar fila;
- [x] drag-and-drop por coluna, upload geral e classificação manual;
- [x] mover clipes entre categorias e slots com confirmação de substituição;
- [x] tratamento visual e bloqueio de arquivos excedentes na classificação;
- [x] seletor explicado de Balanceado/Priorizar Ganchos/Corpos/CTAs;
- [x] perfis Performance 720×1280 e Qualidade 1080×1920 funcionais;
- [x] revisão ampliada de armazenamento, arquivos, qualidade, composição, áudio, saldo, tempo e combinações;
- [x] classificação específica de erros recuperáveis e definitivos;
- [x] resultados, download individual e manifesto CSV;
- [x] ZIP local com todos os MP4 e o manifesto CSV;
- [x] modelo de nome de exportação configurável e persistido por projeto;
- [x] onboarding guiado, reabrível e persistido em três passos;
- [x] IDs permanentes de variação;
- [x] reserva mensal transacional e idempotente para Free, Pro e Elite no SQL do Supabase;
- [x] proteção contra fechamento durante processamento;
- [x] testes unitários do domínio, rotas, exportação e estrutura ZIP;
- [x] build de produção com Worker ES separado;
- [x] typecheck e build de produção aprovados após a recuperação de fila e Central de armazenamento;
- [x] 29 testes do Clip Shop aprovados, incluindo recuperação de fila e classificação de erros.
- [x] aba dedicada do Audio Shuffle publicada e integrada à navegação do Clip Shop;
- [x] múltiplas sequências da mesma fonte preservadas e restauradas localmente;
- [x] calculadora de rendimento por duração de corte;
- [x] limite acumulado configurável de cortes por fonte;
- [x] confirmação personalizada antes da exclusão de áudio;
- [x] 38 testes do Audio Shuffle e typecheck aprovados após as melhorias da biblioteca.

Estado de publicação e validação externa:

- [x] aplicar a versão atualizada de `supabase/clip-shop.sql` no projeto Supabase;
- [x] versão atual publicada em `https://umbracopywriter.com/#/clipshop`;
- [x] Audio Shuffle publicado em `https://umbracopywriter.com/#/clipshop/audio-shuffle`;
- [ ] reautenticar GitHub CLI com credencial nova e não exposta;
- [ ] reautenticar Vercel CLI com credencial nova e não exposta;
- [ ] executar teste manual com vídeos reais em Chrome/Edge;
- [ ] validar uma sequência real com clipes com áudio, sem áudio e silenciados;
- [ ] validar os quatro modos de enquadramento com vídeos verticais e horizontais;

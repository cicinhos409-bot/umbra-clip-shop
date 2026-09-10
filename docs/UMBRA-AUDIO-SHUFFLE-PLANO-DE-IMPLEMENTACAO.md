# UMBRA Audio Shuffle

## Especificação de Produto, UX e Implementação no UMBRA Clip Shop

**Versão:** 1.2  
**Status:** Entregas 1 a 12 implementadas — biblioteca local, múltiplas sequências persistentes, calculadora de cortes, limite acumulado por fonte, fila recuperável, timeline avançada e métricas; validação manual com mídias reais ainda pendente  
**Produto pai:** UMBRA Clip Shop  
**Processamento:** local-first no navegador  
**Documento mestre relacionado:** `docs/UMBRA-CLIP-SHOP-PLANO-DE-IMPLEMENTACAO-v2.md`

---

# 0. Registro da implementação

Implementado em `src/components/clipshop/audio-shuffle/`:

- [x] domínio separado de `ClipAsset`;
- [x] configurações e cinco presets iniciais;
- [x] validação de fonte, lote, cortes, pausas, zonas e regiões;
- [x] fingerprint SHA-256 amostrado, calculado localmente;
- [x] PRNG determinístico e seed derivada por variação/revisão;
- [x] divisão automática ou manual em zonas;
- [x] ciclo de zonas, cooldown e distância mínima;
- [x] regiões proibidas e prioritárias;
- [x] memória compartilhada entre até 27 variações;
- [x] histórico de lote, projeto e global opcional no contrato;
- [x] relaxamento progressivo de restrições sem relaxar regiões proibidas;
- [x] preservação de sequências bloqueadas;
- [x] regeneração isolada por variação;
- [x] score inicial de diversidade e cobertura;
- [x] estado opcional `audioShuffle` integrado ao `ClipShopProject`;
- [x] migração em memória para projetos antigos sem o novo estado;
- [x] testes de determinismo, 27 sequências, limites, bloqueios, ciclos, relaxamento e regeneração.
- [x] contrato público `generateAudioSequences()` para gerar intervalos matemáticos sem decodificar áudio;
- [x] versão do algoritmo e fingerprint da fonte incorporados ao resultado reproduzível.
- [x] testes pesados de lotes Elite, fontes curtas, distância, cooldown, bloqueios e regras impossíveis;
- [x] análise PCM por janelas com waveform, RMS, energia, silêncio, zero crossings, transientes e presença aproximada de voz;
- [x] Worker acústico separado do Worker de vídeo;
- [x] ajuste acústico opcional dos limites preservando a duração matemática do corte;
- [x] banco próprio `umbra-audio-shuffle` com fontes, análises, presets, sequências e históricos;
- [x] fontes no OPFS sem duplicação no IndexedDB e fallback local quando OPFS não está disponível;
- [x] restauração, detecção de fonte ausente, exclusão vinculada e cópia física independente para projetos;
- [x] rota funcional `#/clipshop/audio-shuffle`;
- [x] upload, metadados, waveform, configurações, seed, geração, reprodução e regeneração de corte;
- [x] presets próprios e exportação WAV local.
- [x] novas gerações são acrescentadas à lista sem substituir as sequências anteriores;
- [x] todas as sequências da fonte são restauradas do IndexedDB e permanecem disponíveis para ouvir, exportar e regenerar individualmente;
- [x] calculadora de rendimento baseada na duração real da fonte e na duração informada por corte;
- [x] cálculo de cortes completos, trecho restante e total de trechos aproveitando a fonte inteira;
- [x] opção `Quantidade máxima de cortes por áudio`, com contador de usados/disponíveis e bloqueio de novas gerações ao atingir o limite;
- [x] confirmação visual própria antes de excluir uma fonte, com nome do arquivo, impacto da remoção e estado de progresso;
- [x] seção `Clipes → Audio Shuffle → Combinações → Geração` dentro de cada projeto;
- [x] upload direto ou cópia independente da biblioteca para o projeto;
- [x] duração real calculada por variação e matriz comparativa de até 27 sequências;
- [x] persistência `variationId → sequenceId`, bloqueio e regeneração seletiva;
- [x] WAV exclusivo salvo junto ao resultado e incluído no ZIP quando disponível;
- [x] pipeline separado, substituição, mixagem de fundo e ducking aproximado;
- [x] Worker dedicado para mux H.264/AAC sem recodificar a faixa de vídeo.
- [x] snapshot imutável da fila com fonte, versão, configurações, seeds, vínculos e sequências;
- [x] persistência das sequências antes da reserva e retomada sem regenerar áudio;
- [x] cancelamento, recuperação e retries individuais preservando o consumo somente por vídeo concluído;
- [x] timeline avançada com waveform, heatmap e regiões proibidas/prioritárias;
- [x] ajuste dos limites manuais por controles arrastáveis;
- [x] métricas de cobertura, repetição e diversidade;
- [x] histórico dos últimos 50 lotes e comparação A/B entre sequências.

Entregas consolidadas adicionais:

- [x] upload e cópia da fonte no OPFS;
- [x] núcleo de análise acústica e waveform em Worker;
- [x] decodificação/upload da fonte conectado à interface;
- [x] tela dedicada;
- [x] seção visual dentro do projeto;
- [x] preview e exportação WAV de áudio;
- [x] mixagem, substituição, ducking e mux final.

Esta etapa não cria requests de rede. O motor recebe apenas números, configurações e históricos mantidos no navegador.

Contrato implementado:

```ts
generateAudioSequences({
  sourceDuration,
  targetDurations,
  settings,
  seed,
  history,
  sourceFingerprint,
});
```

`targetDurations` aceita uma lista simples de durações, criando automaticamente `V01` até `V27`, ou objetos com identificadores explícitos. O resultado contém `algorithmVersion`, `sourceFingerprint`, seeds derivadas, intervalos, histórico atualizado e indicação das sequências que precisaram de relaxamento.

---

# 1. Visão do produto

O **UMBRA Audio Shuffle** será o motor de diversidade de áudio do UMBRA Clip Shop. A proposta não é criar um randomizador simples, mas um sistema determinístico que monte sequências de cortes distribuídas pelo áudio inteiro, evitando repetição excessiva e respeitando limites acústicos sempre que possível.

O produto terá duas superfícies usando o mesmo motor e o mesmo modelo de dados:

1. uma aba dedicada para preparar, analisar, ouvir e exportar áudios;
2. uma seção dentro de cada projeto do Clip Shop para aplicar áudio exclusivo a cada variação de vídeo.

Não serão construídos dois motores separados. Biblioteca, projeto, preview, exportação e renderização consumirão um único **Audio Diversity Engine** versionado.

---

# 2. Requisito central da primeira versão

**Áudio diferente para cada variação faz parte da primeira entrega e não é funcionalidade futura.**

Cada variação selecionada terá uma sequência exclusiva, calculada para sua duração real:

```text
Variação 01 → sequência de áudio 01
Variação 02 → sequência de áudio 02
Variação 03 → sequência de áudio 03
...
Variação 27 → sequência de áudio 27
```

No plano Elite, um lote completo poderá preparar e renderizar até 27 sequências diferentes de uma vez. O histórico compartilhado do lote fará as variações posteriores priorizarem regiões menos utilizadas pelas anteriores.

Exemplo:

```text
V01 → zonas 7, 2 e 9
V02 → zonas 4, 10 e 1
V03 → zonas 6, 3 e 8
```

---

# 3. Entradas no produto

## 3.1 Aba dedicada

Rota planejada:

```text
#/clipshop/audio-shuffle
```

A aba funcionará como central de preparação e gerenciamento:

- enviar e analisar um áudio longo;
- configurar cortes, pausas, diversidade e transições;
- visualizar waveform e timeline de calor;
- gerar e ouvir sequências;
- regenerar sequência ou corte individual;
- salvar fontes e presets na biblioteca;
- exportar uma sequência;
- exportar várias sequências em ZIP;
- enviar uma configuração ou sequência para um projeto.

## 3.2 Dentro de cada projeto

Rota planejada:

```text
#/clipshop/{projectId}/audio
```

Fluxo sugerido do projeto:

```text
Visão geral → Clipes → Audio Shuffle → Combinações → Geração → Resultados
```

O projeto permitirá:

- enviar uma fonte exclusiva;
- escolher uma fonte da biblioteca;
- copiar uma configuração de outro projeto;
- selecionar o modo de aplicação;
- preparar uma sequência diferente por variação;
- bloquear sequências aprovadas;
- regenerar apenas uma variação;
- aplicar o áudio ao vídeo final;
- exportar os áudios separadamente.

Resumo recolhido esperado:

```text
Audio Shuffle ativo
Fonte: audio-principal.mp3
Modo: Misturar como fundo
Diversidade: Alta
27 sequências preparadas
```

---

# 4. Relação entre biblioteca e projetos

A aba dedicada manterá uma biblioteca de fontes e presets:

```text
Biblioteca Audio Shuffle
├── Fontes de áudio
├── Análises acústicas
├── Presets
├── Seeds
├── Histórico global por fonte
└── Sequências salvas
```

Ao usar uma fonte da biblioteca, o projeto manterá configurações, seeds, sequências e histórico próprios:

```text
Fonte da biblioteca
├── Projeto A: configuração e histórico próprios
├── Projeto B: configuração e histórico próprios
└── Projeto C: configuração e histórico próprios
```

Para evitar projetos quebrados, a primeira versão deverá criar uma cópia controlada da fonte dentro do projeto. Excluir a fonte global não apagará a cópia já vinculada ao projeto.

---

# 5. Modos de aplicação

Cada projeto oferecerá três modos:

| Modo | Comportamento |
|---|---|
| Misturar como fundo | Preserva o áudio dos clipes e adiciona a sequência em volume controlado. |
| Substituir áudio | Remove o áudio original e usa somente a sequência do Shuffle. |
| Exportar separadamente | Produz o áudio sem modificar o vídeo. |

O padrão recomendado será **Misturar como fundo**.

Configurações de mixagem:

- volume da trilha;
- ducking quando houver voz;
- intensidade do ducking;
- teto de pico;
- fade inicial e final;
- normalização aproximada por segmento.

---

# 6. Tipos de material

O usuário poderá definir:

```text
Tipo do áudio
[ Automático ]
[ Música ]
[ Voz ]
[ Música + voz ]
```

Modos de corte:

- **Livre:** respeita diversidade temporal, mas aceita qualquer limite válido;
- **Acústico:** procura silêncio, baixa energia e zero crossing;
- **Fala:** prioriza blocos de fala e limites de frases quando houver análise disponível;
- **Musical:** prioriza batidas, transientes e estrutura rítmica quando detectáveis.

A primeira versão deverá suportar todos na interface. O fallback obrigatório será o modo acústico local, sem depender de servidor.

---

# 7. Configuração dos cortes

Valores padrão recomendados:

```text
Duração mínima:          4s
Duração máxima:         12s
Máximo por fonte:       100 cortes
Pausa mínima:            1s
Pausa máxima:            1s
Diversidade:            Alta
Distância mínima:        30s
Cooldown da região:       5 cortes
Centralizar corte:      Ativo
Distribuição:     Todo o áudio
```

Validações obrigatórias:

- mínimo maior que zero;
- máximo maior ou igual ao mínimo;
- quantidade máxima por fonte inteira e maior que zero;
- pausa não negativa;
- duração útil suficiente;
- cortes contidos na fonte;
- regiões proibidas nunca selecionadas;
- último corte ajustado à duração-alvo;
- nenhuma sequência excede a duração do vídeo correspondente.

## 7.1 Limite acumulado de cortes por fonte

`Duração mínima` e `Duração máxima` continuam representando segundos de cada trecho. A opção separada `Quantidade máxima de cortes por áudio` controla quantos cortes a fonte pode acumular somando todas as sequências salvas.

O comportamento implementado é:

- sequências existentes contam no total utilizado;
- a interface mostra cortes utilizados e disponíveis;
- a próxima geração adapta a duração mínima necessária para não ultrapassar o saldo restante;
- ao atingir o limite, o botão muda para `Limite atingido` e novas gerações ficam bloqueadas;
- regenerar um corte existente substitui esse corte e não aumenta o contador;
- excluir a fonte remove também o contador, pois as sequências vinculadas são apagadas.

## 7.2 Calculadora de rendimento

A aba dedicada contém uma calculadora independente das regras aleatórias. Ela divide a duração real da fonte pela duração informada e apresenta:

- quantidade de cortes completos;
- duração do trecho restante;
- total de trechos caso a sobra seja aproveitada.

Exemplo: uma fonte de `3:48` possui 228 segundos. Com cortes consecutivos de 10 segundos, o resultado é `22 cortes completos + 8 segundos restantes = 23 trechos`.

---

# 8. Motor de diversidade

## 8.1 Divisão em zonas

Regra automática inicial:

| Duração da fonte | Zonas sugeridas |
|---|---:|
| Até 5 minutos | 5 |
| 5 a 15 minutos | 8 |
| Acima de 15 minutos | 10 a 12 |

O modo avançado poderá permitir número manual de zonas.

## 8.2 Ciclos sem repetição

Uma zona não volta ao sorteio enquanto houver outras zonas elegíveis. Depois do uso das zonas disponíveis, inicia-se um novo ciclo respeitando cooldown, distância e regiões bloqueadas.

## 8.3 Distância mínima

Após selecionar um corte, o intervalo bloqueado será:

```text
bloqueioInicial = corte.start - distânciaMínima
bloqueioFinal   = corte.end + distânciaMínima
```

## 8.4 Cooldown

Se uma zona for usada com cooldown igual a cinco, ela ficará inelegível nos cinco cortes seguintes.

## 8.5 Centralização

O ponto sorteado será tratado como centro do corte sempre que houver margem:

```text
início = centro - duração / 2
fim    = centro + duração / 2
```

Próximo às extremidades, o intervalo será deslocado sem ultrapassar a fonte.

## 8.6 Pontuação ponderada

O motor não usará `Math.random()` diretamente. Cada candidato receberá pontuação baseada em:

```text
peso =
  disponibilidade da zona
  × diversidade temporal
  × distância dos cortes recentes
  × tempo desde o último uso
  × penalidade por uso no lote
  × penalidade por uso no projeto
  × penalidade por uso global
  × preferência acústica
```

Quando as regras forem incompatíveis com a duração disponível, o motor deverá relaxá-las progressivamente e registrar quais restrições foram reduzidas. Nunca poderá entrar em loop infinito.

---

# 9. Inteligência acústica

Depois de escolher a região temporal, o motor procurará limites melhores em uma janela próxima:

- silêncio ou baixa energia;
- zero crossing;
- final de bloco sonoro;
- mudança de intensidade;
- transiente ou batida;
- limite de fala quando disponível.

Isso reduz:

- estalos;
- palavras cortadas;
- emendas abruptas;
- cortes no meio de uma batida;
- sequências com silêncio excessivo.

O manifesto deverá informar se o limite foi escolhido por regra temporal, acústica, musical ou de fala.

---

# 10. Regiões manuais

Na timeline, o usuário poderá marcar regiões como:

- não usar;
- prioridade alta;
- introdução;
- refrão;
- encerramento;
- voz;
- instrumental;
- favorita.

Também poderá configurar:

```text
Ignorar os primeiros: 15s
Ignorar os últimos:   10s
```

Regiões `não usar` serão uma restrição rígida. Regiões prioritárias alterarão a pontuação, sem obrigar repetição.

---

# 11. Seeds e reprodutibilidade

Cada lote terá uma seed principal:

```text
Seed do lote: 813291
```

Cada variação terá seed derivada determinística:

```text
V01 → 813291:variation-01
V02 → 813291:variation-02
V03 → 813291:variation-03
```

Uma sequência será reproduzível quando permanecerem iguais:

- fingerprint da fonte;
- versão do algoritmo;
- seed;
- configuração;
- duração-alvo;
- regiões manuais;
- snapshot do histórico considerado.

O manifesto sempre registrará `algorithmVersion` e `sourceFingerprint`.

---

# 12. Histórico em três níveis

## 12.1 Histórico do lote

Impede repetição excessiva entre as variações geradas na mesma operação.

## 12.2 Histórico do projeto

Evita que lotes futuros do projeto reutilizem sempre as mesmas regiões.

## 12.3 Histórico global da fonte

Permite distribuir o uso da mesma fonte entre projetos diferentes. Será opcional e não substituirá o histórico do projeto.

Configuração:

```text
Memória de diversidade
[ Somente este lote ]
[ Este projeto ]
[ Todos os projetos ]
```

O padrão será **Este projeto**.

Cada registro poderá armazenar:

- zona;
- início e fim;
- duração usada;
- quantidade de usos;
- último lote;
- última sequência;
- último índice de corte;
- timestamp de atualização.

---

# 13. Duração individual por variação

O motor calculará a duração de Gancho + Corpo + CTA e preencherá exatamente o alvo:

```text
V01: 23,4s → sequência final de 23,4s
V02: 28,7s → sequência final de 28,7s
V03: 19,2s → sequência final de 19,2s
```

Exemplo de preenchimento:

```text
Corte A: 7s
Pausa:   1s
Corte B: 10s
Pausa:   1s
Corte C: 8s
Total:   27s
```

O último corte poderá ser encurtado. O motor não deverá alongar artificialmente a mídia nem repetir silenciosamente um trecho para preencher espaço.

---

# 14. Estrutura da sequência

Perfis de progressão:

- crescente;
- decrescente;
- impacto inicial;
- impacto final;
- alternado;
- aleatório controlado.

Esses perfis usarão energia e densidade sonora quando a análise estiver disponível. No fallback, usarão somente posição, duração e diversidade.

---

# 15. Transições e pausas

Transições disponíveis:

- corte seco;
- fade;
- crossfade;
- pausa;
- automático.

Controles:

```text
Transição: Crossfade
Duração:   120ms
```

Pausas poderão usar:

- silêncio;
- ambiente extraído da fonte;
- duração fixa;
- intervalo aleatório entre mínimo e máximo;
- nenhuma pausa.

Para voz, o padrão será pausa curta com fades. Para música, crossfade curto ou corte musical quando possível.

---

# 16. Presets

Presets iniciais:

| Preset | Características |
|---|---|
| Viral rápido | 2–6s, pouca pausa, diversidade alta e mudanças frequentes. |
| Natural | 5–12s, transições suaves e diversidade equilibrada. |
| Cinematográfico | Cortes longos, fades maiores e menos mudanças. |
| Voz completa | Prioriza blocos de fala e pausas naturais. |
| Música dinâmica | Prioriza batidas e regiões de maior energia. |

O usuário poderá salvar presets próprios e reutilizá-los na aba dedicada ou em projetos.

---

# 17. Timeline e revisão

A timeline deverá exibir:

- waveform;
- zonas;
- cortes da sequência atual;
- regiões disponíveis;
- regiões já utilizadas;
- regiões em cooldown;
- regiões bloqueadas e prioritárias;
- intensidade do histórico de uso.

Legenda inicial:

- cinza: nunca utilizado;
- verde: disponível;
- amarelo: já utilizado;
- vermelho: bloqueado ou em cooldown;
- âmbar: selecionado na sequência atual.

Ações:

- reproduzir trecho;
- reproduzir sequência;
- arrastar início e fim;
- excluir corte;
- regenerar corte;
- bloquear corte;
- bloquear sequência;
- criar região manual.

---

# 18. Matriz das variações

Após preparar o lote:

| Variação | Duração | Zonas | Repetição | Diversidade | Estado |
|---|---:|---|---:|---:|---|
| V01 | 23s | 2, 7, 9 | 4% | 96 | Pronta |
| V02 | 28s | 1, 5, 8 | 7% | 91 | Pronta |
| V03 | 19s | 3, 6, 10 | 2% | 98 | Revisar |

O usuário poderá ouvir, abrir cortes, bloquear ou regenerar qualquer linha sem alterar as demais.

---

# 19. Regeneração seletiva

Ao regenerar somente a V07:

- as outras 26 sequências permanecem intactas;
- a V07 recebe uma nova seed derivada ou revisão da seed;
- o histórico do lote continua considerando as sequências bloqueadas;
- apenas o resultado afetado precisa ser renderizado novamente;
- a relação entre variação, sequência e output é atualizada.

Regenerar um único corte seguirá a mesma regra, preservando os demais cortes da sequência.

---

# 20. Medidor de diversidade

Métricas do lote:

```text
Cobertura da fonte:       78%
Repetição entre vídeos:    6%
Diversidade média:        92/100
Regiões nunca utilizadas: 3
```

O sistema deverá alertar quando a fonte ou as restrições não permitirem diversidade suficiente:

> O áudio é curto demais para produzir 27 sequências realmente diferentes com estas configurações.

A pontuação será explicável e versionada. Não deverá prometer ausência total de repetição quando matematicamente impossível.

---

# 21. Previews sem consumo

Antes de renderizar vídeos:

- preview somente do áudio;
- preview de uma variação;
- preview curto;
- comparação A/B entre seeds;
- reprodução direta na timeline.

Previews de áudio e vídeo de teste não consumirão o limite mensal. O consumo continuará acontecendo somente por vídeo final concluído.

---

# 22. Exportações

## 22.1 Aba dedicada

- sequência individual em M4A ou WAV;
- várias sequências em ZIP;
- manifesto JSON/CSV;
- salvar na biblioteca;
- enviar para projeto.

## 22.2 Projeto

- aplicar no MP4 final;
- exportar áudio separadamente;
- incluir áudios no ZIP do lote;
- relacionar sequência ao manifesto da variação.

Manifesto conceitual:

```json
{
  "algorithmVersion": 1,
  "seed": 813291,
  "variationId": "CS-V1-G02-C04-T01",
  "sourceFingerprint": "sha256:...",
  "targetDuration": 23.4,
  "cuts": [
    { "zone": 2, "start": 201.2, "end": 207.8, "boundary": "acoustic" },
    { "zone": 7, "start": 942.1, "end": 950.4, "boundary": "zero-crossing" }
  ]
}
```

---

# 23. Modelo de dados conceitual

```ts
type AudioShuffleMode = "mix" | "replace" | "audio-only";
type AudioMaterialType = "auto" | "music" | "voice" | "mixed";
type AudioBoundaryMode = "free" | "acoustic" | "speech" | "musical";
type AudioDiversity = "low" | "medium" | "high";

interface AudioShuffleAsset {
  id: string;
  fileName: string;
  duration: number;
  size: number;
  mimeType: string;
  fingerprint: string;
  storageKey: string;
  analysisStorageKey?: string;
  createdAt: string;
}

interface AudioShuffleCut {
  id: string;
  zone: number;
  start: number;
  end: number;
  duration: number;
  boundary: "temporal" | "acoustic" | "zero-crossing" | "speech" | "beat";
  locked: boolean;
}

interface AudioShuffleSequence {
  id: string;
  variationId?: string;
  seed: string;
  targetDuration: number;
  cuts: AudioShuffleCut[];
  diversityScore: number;
  coverage: number;
  locked: boolean;
  status: "draft" | "ready" | "rendering" | "completed" | "error";
  outputId?: string;
}

interface AudioShuffleSettings {
  enabled: boolean;
  mode: AudioShuffleMode;
  materialType: AudioMaterialType;
  boundaryMode: AudioBoundaryMode;
  minCutSeconds: number;
  maxCutSeconds: number;
  minPauseSeconds: number;
  maxPauseSeconds: number;
  minimumDistanceSeconds: number;
  zoneCooldownCuts: number;
  diversity: AudioDiversity;
  centerCuts: boolean;
  backgroundVolume: number;
  duckingEnabled: boolean;
  transition: "cut" | "fade" | "crossfade" | "pause" | "auto";
  transitionMs: number;
  seed: string;
}

interface AudioShuffleProjectState {
  source: AudioShuffleAsset | null;
  settings: AudioShuffleSettings;
  sequences: AudioShuffleSequence[];
  usageHistory: AudioRegionUsage[];
  blockedRegions: AudioMarkedRegion[];
  algorithmVersion: number;
}
```

---

# 24. Persistência local

O áudio longo não será um `ClipAsset`, pois fontes do Shuffle podem ultrapassar 30 segundos.

Estrutura OPFS sugerida:

```text
clipshop/audio-library/{assetId}/source
clipshop/audio-library/{assetId}/analysis
clipshop/projects/{projectId}/audio-shuffle/source
clipshop/projects/{projectId}/audio-shuffle/analysis
clipshop/projects/{projectId}/audio-shuffle/preview/{sequenceId}
clipshop/projects/{projectId}/audio-shuffle/output/{sequenceId}
```

IndexedDB armazenará:

- metadados da fonte;
- configurações;
- regiões marcadas;
- histórico;
- sequências;
- seeds;
- estados de renderização;
- referências OPFS.

Quando OPFS funcionar, blobs não serão duplicados no IndexedDB. O fallback seguirá o padrão já adotado pelo Clip Shop.

Se a fonte desaparecer, o projeto continuará abrindo e mostrará **Fonte de áudio não encontrada**, preservando configurações e manifestos.

---

# 25. Arquitetura técnica

Estrutura sugerida:

```text
src/components/clipshop/audio-shuffle/
├── AudioShufflePage.tsx
├── ProjectAudioShuffle.tsx
├── types.ts
├── routes.ts
├── presets.ts
├── hooks/
│   ├── useAudioLibrary.ts
│   ├── useAudioShuffleProject.ts
│   └── useAudioPreview.ts
├── services/
│   ├── diversity-engine.ts
│   ├── seeded-random.ts
│   ├── acoustic-analysis.ts
│   ├── sequence-builder.ts
│   ├── diversity-score.ts
│   ├── audio-storage.ts
│   ├── audio-manifest.ts
│   └── validation.ts
├── workers/
│   ├── audio-analysis.worker.ts
│   └── audio-render.worker.ts
└── components/
    ├── AudioSourcePanel.tsx
    ├── AudioSettingsPanel.tsx
    ├── AudioHeatTimeline.tsx
    ├── AudioSequenceMatrix.tsx
    ├── AudioSequenceEditor.tsx
    └── AudioExportPanel.tsx
```

O motor de diversidade será uma função pura e testável, separada da leitura, análise e renderização de áudio.

---

# 26. Pipeline local

```text
Upload da fonte
      ↓
Validação e fingerprint
      ↓
Análise acústica em Worker
      ↓
Waveform, energia, silêncio e zero crossings
      ↓
Configuração e regiões manuais
      ↓
Geração determinística das sequências
      ↓
Preview sem consumo
      ↓
Reserva do lote de vídeos
      ↓
Render de uma variação por vez
      ↓
Mix/substituição/mux do áudio exclusivo
      ↓
Persistência do output e histórico
      ↓
Exportação individual ou ZIP
```

O Worker atual de vídeo poderá receber a sequência pronta, mas análise e montagem de áudio devem permanecer em módulos próprios para evitar ampliar excessivamente `render.worker.ts`.

---

# 27. Compatibilidade e limites iniciais

Formatos de entrada planejados:

- MP3;
- WAV;
- M4A;
- AAC;
- áudio compatível dentro de MP4/MOV, quando suportado pelo Mediabunny.

Regras iniciais a validar por spike:

- duração máxima da fonte;
- tamanho máximo por fonte;
- memória necessária para análise;
- comportamento em dispositivos sem WebCodecs completo;
- custo da waveform e análise de fontes longas;
- codecs de exportação realmente disponíveis por navegador.

A análise deverá trabalhar em janelas/streaming, sem carregar PCM integral de fontes longas na memória.

---

# 28. Planos e consumo

Proposta inicial:

| Plano | Audio Shuffle |
|---|---|
| Free | Uma sequência de teste com limites reduzidos. |
| Pro | Sequência exclusiva para cada item permitido no lote Pro. |
| Elite | Até 27 sequências exclusivas em um único lote e histórico global opcional. |

Não haverá cobrança por corte. O consumo continuará sendo por vídeo final concluído.

Exportar somente áudio na aba dedicada foi implementado como operação local sem consumo de vídeo. O consumo comercial continua associado somente ao vídeo final concluído.

---

# 29. Privacidade e segurança

- fontes e outputs permanecerão no dispositivo;
- Supabase não receberá o conteúdo dos áudios;
- arquivo, waveform, PCM, cortes, seeds, intervalos, análise acústica, transcrição e nomes de arquivos não sairão do navegador;
- telemetria não incluirá waveform, transcrição ou nomes de arquivos;
- eventos poderão registrar apenas modo, duração, quantidade e estado;
- nenhum dado de voz será enviado para IA sem consentimento explícito;
- exclusão de projeto removerá suas cópias, análises, previews e outputs controlados;
- excluir uma fonte global não removerá cópias independentes dos projetos.

---

# 30. Recuperação e cancelamento

Antes de cada sequência/render:

- persistir estado da fila;
- persistir seeds e manifestos;
- registrar sequências concluídas;
- não regenerar automaticamente sequências bloqueadas;
- preservar outputs concluídos;
- remover temporários incompletos no cancelamento.

Ao reabrir:

- reconciliar sequências e outputs;
- continuar somente itens pendentes;
- oferecer retry dos erros;
- manter a mesma seed;
- renovar a reserva do lote conforme as regras do Clip Shop.

---

# 31. Critérios de aceite da primeira entrega

## Produto

- [x] existe uma aba dedicada em `#/clipshop/audio-shuffle`;
- [x] cada projeto possui uma seção Audio Shuffle;
- [x] a mesma fonte pode ser preparada na aba e copiada com arquivo independente para projeto;
- [x] excluir fonte global não quebra cópias independentes dos projetos;
- [x] até 27 variações Elite recebem sequências distintas no mesmo lote;
- [x] cada sequência respeita a duração-alvo recebida;
- [x] o usuário pode escolher misturar, substituir ou exportar separadamente;
- [x] é possível regenerar uma sequência ou corte isolado;
- [x] gerar novamente acrescenta uma sequência e preserva todas as anteriores;
- [x] sequências persistidas reaparecem após recarregar e mantêm reprodução/exportação independentes;
- [x] a calculadora informa cortes completos, sobra e total aproveitável;
- [x] o limite máximo acumulado por fonte impede novas gerações após esgotar o saldo de cortes;
- [ ] sequências e cortes podem ser bloqueados;
- [ ] previews não consomem o limite mensal.

## Motor

- [x] mesma entrada e seed produzem a mesma sequência;
- [x] zonas não se repetem enquanto existirem alternativas elegíveis;
- [x] cooldown e distância mínima são respeitados;
- [x] regiões proibidas nunca são usadas;
- [x] o motor termina mesmo quando precisa relaxar restrições;
- [x] histórico do lote influencia as 27 sequências;
- [x] histórico do projeto influencia lotes posteriores;
- [x] limites são ajustados por análise acústica quando disponível;
- [x] diversidade, cobertura e repetição são calculadas e exibidas.

## Persistência e render

- [x] fonte, análise, histórico e sequências sobrevivem à recarga;
- [x] blobs não são duplicados entre OPFS e IndexedDB;
- [x] arquivos vinculados à fonte são removidos na exclusão;
- [x] a exclusão exige confirmação personalizada e informa todos os dados locais afetados;
- [x] object URLs de previews e downloads são revogadas;
- [ ] uma falha não apaga resultados concluídos;
- [x] o vídeo final recebe a sequência vinculada à sua variação;
- [ ] o manifesto CSV inclui seed e lista completa de cortes;
- [x] exportação individual WAV funciona;
- [x] exportação ZIP inclui MP4 e WAV disponível.

## Qualidade

- [x] nenhum corte ultrapassa a fonte;
- [ ] não há timestamps regressivos;
- [ ] não há estalos perceptíveis nos limites aprovados;
- [ ] ducking não produz clipping;
- [x] testes cobrem determinismo, distância, cooldown, relaxamento e 27 sequências;
- [x] typecheck, testes e build de produção passam nesta entrega.

---

# 32. Fases de implementação

## Fase AS-0 — spike técnico

- validar decode de MP3/WAV/M4A/AAC;
- gerar waveform em streaming;
- detectar silêncio, energia e zero crossings;
- cortar e concatenar áudio com timestamps corretos;
- mixar com áudio de vídeo;
- medir memória e tempo com fontes longas.

**Saída:** relatório técnico e limites oficiais.

## Fase AS-1 — domínio e motor determinístico

- tipos e validações;
- PRNG por seed;
- zonas, cooldown e distância;
- histórico em três níveis;
- construção por duração-alvo;
- score de diversidade;
- testes unitários e propriedades.

## Fase AS-2 — persistência e biblioteca

- stores IndexedDB;
- caminhos OPFS;
- fingerprint;
- fontes globais;
- cópia segura para projetos;
- presets;
- limpeza e recuperação.

## Fase AS-3 — aba dedicada

- rota;
- upload;
- análise;
- timeline;
- editor de regiões;
- preview;
- matriz de sequências;
- exportação de áudio e manifesto.

## Fase AS-4 — integração por projeto

- seção interna;
- duração por variação;
- 27 sequências exclusivas;
- bloqueio e regeneração seletiva;
- revisão antes do lote;
- persistência no projeto.

## Fase AS-5 — renderização final

- corte e montagem em Worker;
- pausas e transições;
- mix, replace e audio-only;
- ducking;
- mux no MP4;
- outputs e ZIP;
- recuperação da fila.

## Fase AS-6 — validação de produção

- Chrome e Edge;
- dispositivos de referência;
- fontes curtas e longas;
- música, voz e conteúdo misto;
- 1, 5 e 27 variações;
- teste de interrupção;
- armazenamento insuficiente;
- codecs incompatíveis;
- medição de qualidade e desempenho.

---

# 33. Decisões aprovadas

| Decisão | Estado |
|---|---|
| Aba dedicada e seção dentro do projeto | Aprovada |
| Um único Audio Diversity Engine | Aprovada |
| Áudio exclusivo por variação desde a primeira entrega | Aprovada |
| Até 27 sequências em lote Elite | Aprovada |
| Processamento local-first | Aprovada |
| Conteúdo, análise, cortes e seeds somente no navegador | Aprovada |
| Fonte própria, sem reutilizar `ClipAsset` | Aprovada |
| Seeds e algoritmo versionado | Aprovada |
| Histórico do lote e projeto | Aprovada |
| Histórico global opcional | Aprovada |
| Modos mix, replace e audio-only | Aprovada |
| Misturar como fundo como padrão | Aprovada |
| Cópia independente da fonte dentro do projeto | Aprovada |
| Preservar e exibir todas as sequências da fonte | Aprovada e implementada |
| Calculadora local de rendimento da fonte | Aprovada e implementada |
| Limite acumulado configurável de cortes por áudio | Aprovada e implementada |
| Confirmação personalizada antes de excluir fonte | Aprovada e implementada |
| Preview sem consumo | Aprovada |
| Consumo por vídeo final concluído | Aprovada |

---

# 34. Decisões ainda abertas

1. Qual será o limite de duração e tamanho de uma fonte?
2. Exportações somente de áudio usarão cota própria, serão benefício do plano ou serão ilimitadas localmente?
3. Qual formato será padrão: M4A/AAC, WAV ou ambos conforme o destino?
4. Qual intensidade de ducking será padrão?
5. O modo `Fala` da primeira entrega usará apenas VAD/pausas ou também transcrição?
6. Qual janela de análise será usada para ajustar limites acústicos?
7. Waveforms serão persistidas integralmente ou regeneradas sob demanda?
8. Quais navegadores e dispositivos formarão o benchmark oficial?

---

# 35. Definição final da entrega

O UMBRA Audio Shuffle será considerado entregue quando o usuário conseguir:

1. abrir a aba dedicada ou a seção de um projeto;
2. enviar ou escolher uma fonte;
3. configurar diversidade e aplicação;
4. gerar até 27 sequências exclusivas e reproduzíveis;
5. manter todas as sequências geradas visíveis e restaurá-las após recarregar;
6. calcular o rendimento da fonte e limitar a quantidade acumulada de cortes;
7. revisar e regenerar seletivamente;
8. aplicar cada sequência à variação correspondente;
9. concluir o lote sem enviar áudio ao servidor;
10. fechar, reabrir e recuperar o projeto;
11. exportar vídeos, áudios e manifestos com relações corretas.

**Resumo oficial:** uma fonte longa → diversidade controlada → uma sequência exclusiva por variação → até 27 vídeos com áudio diferente no mesmo projeto.

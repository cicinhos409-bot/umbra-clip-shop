# UMBRA Clip Shop

Workspace autenticado em `#/clipshop` para combinar Ganchos, Corpos e CTAs com processamento local.

## Arquitetura

- `ClipShop.tsx`: projetos, ingestão, combinações, preview, revisão, fila e resultados.
- `services/variation-engine.ts`: motor determinístico e versionado de até 150 variações.
- `services/clip-metadata.ts`: inspeção e thumbnail via Mediabunny.
- `workers/render.worker.ts`: remux rápido e normalização 720×1280/H.264/AAC.
- `services/render-engine.ts`: contrato e cancelamento do Worker.
- `services/project-storage.ts`: metadados em IndexedDB e mídia em OPFS com fallback.
- `api.ts`: RPCs idempotentes dos limites mensais Free, Pro e Elite.
- `supabase/clip-shop.sql`: tabela, RLS e ciclo transacional das reservas.

## Fluxo de renderização

1. Clipes compatíveis seguem por remux, sem perda por recodificação.
2. Diferenças de codec, resolução, rotação ou áudio acionam normalização local.
3. A normalização vertical usa 720×1280, 30 FPS, H.264 e AAC.
4. Segmentos sem áudio ou silenciados recebem silêncio quando o restante do lote possui áudio.
5. A política configurável permite preservar, normalizar ou remover o áudio; uma primeira passagem analisa o RMS aproximado do segmento inteiro e a segunda aplica ganho estável, teto de pico e fades curtos. Não é uma medição LUFS.
6. A composição permite preencher/cortar, ajustar com bordas, fundo desfocado ou manter a proporção do primeiro clipe.
7. A fila executa um job por vez, pode pausar entre jobs e cancelar o Worker atual.

## Limites locais

- 30 segundos e 500 MB por clipe;
- 1,5 GB em arquivos de origem por projeto;
- reserva de segurança de 200 MB antes da geração;
- recomendação de até 10 projetos locais;
- temporários do Worker são descartados ao concluir ou cancelar.

## Operação local e recuperação

- A Central de armazenamento mostra uso, disponibilidade, fontes e resultados por projeto e oferece limpezas segmentadas ou total.
- A fila é persistida antes de cada job e reconciliada com os outputs salvos depois de uma interrupção.
- O workspace oferece continuar a reserva original, tentar novamente somente variações em erro e descartar a fila.
- Upload aceita drag-and-drop por coluna e uma classificação geral manual, com mudança de categoria e slot.
- Estratégias Balanceado/Ganchos/Corpos/CTAs e perfis Performance 720p/Qualidade 1080p são persistidos no projeto.

## Segurança de uso dos planos

- validação e preview não consomem;
- a reserva é atômica e idempotente;
- somente vídeos concluídos permanecem consumidos;
- duas abas são serializadas por advisory lock no PostgreSQL;
- reservas nunca iniciadas expiram em 30 minutos;
- os arquivos de vídeo não são enviados ao Supabase.

## Validação

```powershell
npm.cmd test
npm.cmd run build
```

O `tsc --noEmit`, os testes do Clip Shop e o build de produção devem passar antes da publicação.

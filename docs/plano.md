# Ryker — plano de construção da etapa Discussão Global

Data: 2026-10-23. Fonte de verdade: `C:\Users\Administrator\.pi\agent\ryker\novo-metodo\discussao-global.html` (desenho + 21 decisões) e `docs/riscos-api.md` (4 riscos provados). Onde o desenho conflita com uma decisão, vale a decisão: a linha "teto de perguntas e uma pergunta por chamada" da tabela "o que o código garante" foi substituída pelas decisões 1 (sem teto) e 6 (até 4 por chamada, mostradas uma por vez).

## 1. Arquitetura

### Fatos de API conferidos (não são suposições)
- `types.d.ts` de 1.2.0 (pi-web), 1.3.0 e 1.4.0 são **idênticos** (diff vazio); `model-registry.d.ts` também. Qualquer API abaixo vale nas três.
- `ToolDefinition` (types:453-514): `defaultActive?: boolean` (registrada fica inativa até `setActiveTools`), `executionMode`, `promptGuidelines`, `promptSnippet`. `execute(id, params, signal, onUpdate, ctx)`; `throw` = resultado de erro; `terminate: true` pula o follow-up.
- `before_agent_start` (types:718-740): `systemPromptOptions` é mutável (`sections: Record<tag,string>`, `promptGuidelines`); a doc prefere mutar seções a devolver `systemPrompt`.
- `BoundaryState` (types:786-791) traz `outcome: "completed"|"aborted"|"error"` (:752) e `context.canContinue` (:784).
- `ctx.modelRegistry.complete(model, {systemPrompt?, messages}, opts)` (`dist/core/model-registry.d.ts:40`) chama o modelo dentro do processo com a autenticação do pi (exemplo real: `examples/extensions/summarize.ts:163-188`).
- O rpiv 2.14.2 **readiciona** `ask_user_question` ao conjunto ativo em todo `before_agent_start` quando `ctx.hasUI` (`C:\Users\Administrator\.pi\agent\npm\node_modules\@juicesharp\rpiv-ask-user-question\reconcile.ts:26-38`). Tirar a ferramenta com `setActiveTools` é só melhor esforço (depende da ordem de carga); a garantia é o bloqueio em `tool_call` (prova (c)).
- `examples/extensions/subagent/index.ts:247-260` acha o CLI do pi por `process.argv[1]`; no pi-web `argv[1]` é o `pi-web.js`, então um `pi -p` filho não funcionaria lá.
- Node do pi: v22.23.3 (o pi exige >=22.19). Type stripping de TS vem ligado por padrão desde 22.18. typebox do host = 1.3.27 nas três versões.
- `.github/workflows/release.yml` roda `npm publish` em **todo push na main**; o npm já tem 0.0.0-stage, 0.0.0 e 0.0.1. Existe a branch `origin/dev`.
- Isolado: `settings.json` tem `defaultTools: ["read"]`; `agent/extensions/` tem `d-ui.ts` e `rpiv-wrap.ts` (reexporta o rpiv real), e o pi-web isolado carrega os dois. `rpc-driver.js` usa `--no-session`, uma única `RPC_ANSWER` para todos os select e timeout fixo de 120 s.

### Módulos
```
src/index.ts              default export (pi): só liga as peças abaixo
src/pi/                   fino, sem lógica de decisão; verificado só por E2E manual
  comando.ts              /ryker
  ferramentas.ts          schemas TypeBox + execute que chama o core e a UI
  eventos.ts              session_start, before_agent_start, tool_call, agent_start,
                          agent_before_settle, agent_settled, model_select
  persistencia.ts         ler/gravar .ryker/discussao.json (tmp + rename) + pi.appendEntry
  revisor.ts              ctx.modelRegistry.complete com Opus
  ui.ts                   laços de ui.select / ui.input / ui.confirm
src/core/                 puro: sem pi, sem fs, sem typebox, sem relógio (agora entra por parâmetro)
  temas.ts                lista base, ids, seção do documento, transições de status
  estado.ts               criar, fases, aplicar operações, reabrir, aprovar
  perguntas.ts            validar lote, opções do select, interpretar escolha, registrar resposta
  documento.ts            render HTML + texto para o revisor a partir do estado; completude
  revisao.ts              pedido ao revisor, parse dos achados, validar resoluções
  guarda.ts               detectaPerguntaLivre, decidirContinuacao
  prompt.ts               seção de system prompt da etapa (regras + snapshot)
  ferramentasAtivas.ts    conjunto da etapa e restauração
  modelo.ts               escolher Opus entre os disponíveis
  serializacao.ts         versão, ida e volta, erros
  restauracao.ts          o que fazer no session_start (arquivo x sessão)
  i18n.ts                 rótulos pt/en
  status.ts               texto do setStatus
src/core/*.test.ts        node:test
```

### Estado (`<projeto>/.ryker/discussao.json`, `versao: 1`)
```
{ versao, fase: "descoberta"|"documento"|"aprovacao"|"aprovada", pedido, idioma: "pt"|"en", criadoEm,
  temas: [{ id, titulo, secao: 1..8, criadoPor: "base"|"modelo",
            status: "aberto"|"decidido"|"suposto"|"adiado",
            texto?, motivo?, quando?,
            origem?: {tipo:"usuario", perguntaId} | {tipo:"fonte", ref} | {tipo:"agente"},
            revisa?: temaId, reabertura?: {nota, em}, historico: [fechamentos anteriores] }],
  perguntas: [{ id, tema, pergunta, opcoes, recomendada, resposta?, livre, em, cancelada? }],
  revisao?: { em, achados: [{ id, bloqueante, texto, tema?, exigeDecisaoMacro, resolucao? }] },
  documento?: { caminho: ".ryker/visao.html", geradoEm },
  anterior: { modelo?: {provider, id}, ferramentas: string[] }, modeloEtapa?: {provider, id},
  pausado: boolean, aprovadoEm? }
```
"Inativa" = arquivo ausente ou `fase: "aprovada"`. Temas base (id → seção): problema-job→1, para-quem→1, resultado→2, apetite→3, entra→4, fora→5, restricoes→6, integracoes→6, escolhas-caras→7, riscos→8. As seções 9 (suposições), 10 (adiados) e 11 (registro) são derivadas.
Sessão: `pi.appendEntry("ryker-discussao", estado)` a cada mutação (snapshot completo). O arquivo é a fonte de verdade.

### Ferramentas (todas `defaultActive: false`, `executionMode: "sequential"`)
- `ryker_temas`: `{ itens: Array<{ acao: "fonte"|"supor"|"adiar"|"criar", tema?, titulo?, secao?: integer 1..8, texto?, origem?, motivo?, quando?, revisa? }> (1..20), idioma?: "pt"|"en" }`. Validação no core, lote tudo-ou-nada: `fonte` exige tema aberto + texto + origem (caminho ou trecho citado); `supor` exige texto (o padrão) + motivo (por que não perguntou); `adiar` exige texto + quando; `criar` exige titulo + secao, gera id único e aceita `revisa` (tema decidido que um achado do revisor obriga a rever). Tema com `reabertura` (reaberto por Davy) **só fecha por pergunta**. Não há ação de reabrir (decisão 10). Retorna os temas ainda abertos.
- `ryker_perguntar`: `{ perguntas: Array<{ tema, pergunta, opcoes: string[] (2..5), recomendada: integer (índice) }> (1..4), idioma? }`. O core valida: tema existe e está aberto, dois itens não podem ter o mesmo tema, opções não vazias e distintas, recomendada no intervalo, nenhuma opção igual a "Outra resposta…", fase = descoberta. Inválido → `throw` com o motivo (o modelo recebe o erro e corrige). Execução: uma pergunta por vez com `ui.select("[i/n] <tema>: <pergunta>", [recomendada + " (recomendada)", ...demais, "Outra resposta…"])`; "Outra resposta…" abre `ui.input`. Cada resposta é gravada (arquivo + sessão) na hora e fecha o tema. `undefined` (Esc) para o lote, mantém as já respondidas e marca `pausado = true`. Sem `ctx.hasUI` → erro.
- `ryker_documento`: `{ titulo, sinteses: Array<{ secao: integer 1..8, texto }>, resolucoes?: Array<{ achado, tipo: "tema"|"sintese", tema?, como }>, idioma? }`. Bloqueada com tema aberto. Dentro do execute: render → (só na 1ª vez) revisor → se há bloqueante sem resolução, devolve os achados sem abrir nada → senão grava `.ryker/visao.html`, abre (`pi.exec("cmd",["/c","start","",abs])` no win32) e mostra `ui.select` "Aprovar" / "Corrigir pontos". Aprovar: fase aprovada, `setActiveTools(anterior)`, `setModel(anterior)`, notify, `terminate: true`. Corrigir: laço de reabertura (abaixo) e devolve ao modelo os temas reabertos com as notas.

### Comando e eventos
- `/ryker <pedido>` sem discussão ativa: se houver uma aprovada, `ui.confirm` para arquivá-la em `.ryker/arquivo/<data>-<slug>/`; cria o estado; salva modelo e ferramentas atuais; `setModel(Opus)` (nenhum Opus → `ui.confirm` para seguir no modelo atual; vários → `ui.select`); `setActiveTools(read, grep, find, ls + 3 ferramentas Ryker)`; grava; `setStatus`; `pi.sendUserMessage(pedido)`.
- `/ryker` sem argumento com etapa ativa: mostra o status e, se `fase = aprovacao`, reabre o diálogo de aprovação. `/ryker reabrir`: o mesmo laço do "Corrigir pontos" (decisão 10).
- `before_agent_start`: etapa ativa → `systemPromptOptions.sections["ryker_discussao"] = secaoPrompt(estado)`; tira `ask_user_question` do conjunto ativo (melhor esforço); zera `pausado` quando `messageType === "user"`.
- `tool_call`: etapa ativa e `toolName === "ask_user_question"` → `{block: true, reason: "Durante a Discussão Global use ryker_perguntar."}`.
- `agent_start`: zera os contadores da guarda. `agent_before_settle`: `decidirContinuacao` → `{continue: true, entries: [{type: "custom_message", customType: "ryker-correcao", content, display: true}]}`.
- `agent_settled`: plano B da restauração do modelo, caso o `setModel` dentro do execute dê problema (ver F2).
- `session_start`: `decidirRestauracao(arquivo, entradas de getBranch())`. Arquivo ativo + sessão com entradas Ryker → reaplica ferramentas, modelo e status. Arquivo ativo + sessão sem entradas → só `notify` ("discussão ativa; /ryker para retomar"), sem mexer em modelo nem ferramentas. Arquivo ausente + entradas → recria o arquivo pelo último snapshot. Arquivo corrompido → não sobrescreve e avisa.
- `model_select`: se o usuário troca o modelo à mão durante a etapa, a troca é respeitada (só atualiza o status).

### package.json e toolchain
```
"type": "module", "keywords": ["pi-package"], "engines": { "node": ">=22.19" },
"pi": { "extensions": ["./src/index.ts"] },
"files": ["src", "!src/**/*.test.ts", "README.md"],
"peerDependencies": { "@earendil-works/pi-coding-agent": "*", "typebox": "*" },
"devDependencies": { "@earendil-works/pi-coding-agent": "1.2.0", "typebox": "1.3.27",
                     "typescript": "^5.9", "@types/node": "^22", "@biomejs/biome": "^2" },
"scripts": { "test": "node --test \"src/**/*.test.ts\"", "typecheck": "tsc --noEmit",
             "lint": "biome check src", "check": "npm run lint && npm run typecheck && npm test" }
```
tsconfig: `strict`, `noEmit`, `module`/`moduleResolution: nodenext`, `allowImportingTsExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax`. O pi carrega `.ts` via jiti, sem build; os testes rodam `.ts` direto no Node 22.23. Em `release.yml`, `npm ci && npm run check` antes do `npm publish`.
## 2. Suposições (decisões de "como", uma linha cada)
1. Testes com `node:test` + type stripping nativo: zero dependência; o core é puro e não precisa de mock; vitest só traria deps e config.
2. Biome para lint: uma dependência, sem configurar plugins.
3. devDependency do pi fixada em 1.2.0 (a mais velha em uso); os tipos das três versões são idênticos.
4. Core sem typebox, pi, fs ou relógio: tudo testável sem subir o pi.
5. Três ferramentas (temas, perguntar, documento) em vez de uma: cada uma tem pré-condições próprias, e o modelo erra menos com parâmetros enxutos.
6. Validação de parâmetros no `execute` via core (throw), não em `tool_call`: mesmo efeito para o modelo, num lugar só; `tool_call` fica para o rpiv.
7. Schema plano com campos opcionais + validação no core, em vez de união TypeBox: provedores exigem objeto no topo e `anyOf` no topo é frágil.
8. Documento gerado **pelo código** a partir do estado + sínteses curtas do modelo por seção: a completude fica garantida por construção (decisões, suposições, adiados e registro sempre presentes). O modelo escrever o HTML e o código "checar" exigiria casar paráfrases.
9. Seções 1–8 listam só temas decididos; suposições só na 9, adiados só na 10, tudo na 11 com a origem. Cada tema aparece uma vez em 1–10.
10. "Integrações externas" vai na seção 6 (Restrições duras), com subtítulo próprio; o desenho não tem seção para ela.
11. Tamanho-alvo de 1–3 páginas: aviso no retorno da ferramenta acima de ~9.000 caracteres; não bloqueia.
12. HTML autocontido (sem CDN), com todo o texto escapado.
13. Revisor por `ctx.modelRegistry.complete` no mesmo processo, com o mesmo Opus: funciona no pi-web (sem CLI filho), usa a mesma autenticação, e o usage entra no resultado da ferramenta. Rejeitado o `pi -p` filho (argv[1] errado no pi-web).
14. O revisor recebe o documento em texto (mesmo render), o registro completo e o pedido, e responde JSON `{achados: [{bloqueante, texto, tema?, exigeDecisaoMacro}]}`. Parse falho → 1 nova tentativa pedindo só JSON; se falhar de novo, erro da ferramenta sem gastar a rodada.
15. Achado bloqueante que exige decisão macro → o modelo cria um tema (com `revisa` se altera uma decisão) e pergunta. Quem decide continua sendo Davy, então a decisão 10 fica intacta. Bloqueante de redação → nova síntese. Não há segunda revisão (decisão 12: 1 rodada), nem depois de "Corrigir pontos".
16. Achados não bloqueantes aparecem num apêndice do documento, visíveis para Davy contestar.
17. "Corrigir pontos" = laço de `ui.select` (a API não tem multiseleção): lista de temas fechados + "Concluir"; cada escolhido pede uma nota opcional por `ui.input`; se nada for escolhido, volta à aprovação.
18. Tema reaberto por Davy só fecha por pergunta (não por fonte, suposição ou adiamento).
19. A recomendada vem em primeiro lugar com " (recomendada)"; rótulo desconhecido ou `undefined` = cancelado.
20. Durante a etapa ficam só ferramentas de leitura (read, grep, find, ls) + as do Ryker: a discussão não edita código. A lista anterior volta ao aprovar.
21. Opus = modelos disponíveis com id contendo "opus". Um → usa; vários → `ui.select`, com a escolha guardada no estado; nenhum → `ui.confirm`.
22. O nível de raciocínio não é alterado.
23. Guarda de texto livre: dispara só se uma das 3 últimas linhas não vazias, fora de código ou citação, termina em "?" e não é pergunta já registrada; ignora linhas de resumo (com `→`, "Pergunta:", "P:"). Máx. 2 correções por execução.
24. Guarda de progresso: fase descoberta, temas abertos, execução concluída (`outcome = completed`, `canContinue`) e sem `pausado` → 1 continuação por execução. Nunca dispara em aprovação, aborto ou erro.
25. Sem `message_end` trocando texto: a correção já resolve, e esconder o texto confunde o histórico.
26. Idioma: os rótulos do código existem em pt e en (outros → en), escolhidos pelo `idioma` que o modelo informa; o conteúdo é escrito pelo modelo no idioma do usuário.
27. Uma discussão ativa por repositório; a aprovada é arquivada em `.ryker/arquivo/` quando outra começa; as arquivadas contam como "decisões existentes" (decisão 16).
28. Abrir o HTML: `cmd /c start "" <abs>` no win32, `open` no darwin, `xdg-open` no resto; o código de saída não é tratado como erro (prova (b)).
29. Trabalho na branch `dev`; a versão sobe para 0.1.0 só no fim; merge na main = publicação (ver pergunta macro).
30. Pré-requisito dos E2E: `rpc-driver.js` passa a ler o timeout de `RPC_TIMEOUT_MS` (edição de 1 linha no script que já existe; não é ferramenta nova). Fluxos que pedem respostas diferentes em cada diálogo (Outra resposta + Aprovar, Corrigir pontos) são verificados no pi-web isolado, clicando.

## 3. Fatias verticais

Preparação comum dos E2E (Git Bash). Projeto-alvo de teste fora do repo: `D:\rk\novo\alvo`, com um `README.md` curto que já responde 3–4 temas (ex.: público, o que fica fora, uma restrição) e deixa outros em aberto. Cada execução começa sem a pasta `.ryker` do alvo (apagar à mão entre execuções, só dentro de `D:\rk\novo\alvo`).
```
export MSYS_NO_PATHCONV=1
RYK=D:/Projects/pi-ryker/src/index.ts
RPIV=C:/Users/Administrator/.pi/agent/npm/node_modules/@juicesharp/rpiv-ask-user-question/index.ts
cd /d/rk/novo/alvo
RPC_TIMEOUT_MS=900000 node D:/rk/novo/probe/rpc-driver.js "/ryker <pedido>" -e $RYK -e $RPIV | tee D:/rk/novo/probe/evid/fN.txt
node -e "const s=require('./.ryker/discussao.json');console.log(s.fase,s.perguntas.length,s.temas.map(t=>t.id+':'+t.status).join(' '))"
```
Antes de cada E2E: `npm run check` verde. Implementação em Sonnet; Opus revisa o diff de cada fatia.

### F1 — Núcleo da conversa: /ryker → Opus → pergunta pela ferramenta → resposta gravada e tema travado
Por que primeiro: junta pela primeira vez APIs que nunca foram usadas juntas (setModel em comando, `defaultActive: false` + setActiveTools, vários `ui.select`/`ui.input` dentro de um execute, `sections` no before_agent_start, appendEntry + arquivo) e traz o maior risco de comportamento: o Opus seguir o protocolo de temas. Todo o resto depende disso.
Arquivos: `package.json`, `tsconfig.json`, `biome.json`, `.github/workflows/release.yml`, `src/index.ts`, `src/pi/{comando,ferramentas,eventos,persistencia,ui}.ts`, `src/core/{temas,estado,perguntas,prompt,ferramentasAtivas,modelo,serializacao,status}.ts`.
RED:
- criarEstado: 10 temas base abertos com ids e seções fixos; fase descoberta; pedido e `anterior` guardados.
- validarPerguntas rejeita: 0 ou 5 perguntas; tema inexistente; tema decidido, suposto ou adiado; dois itens do mesmo tema; <2 ou >5 opções; opção vazia ou duplicada; recomendada fora do intervalo; opção "Outra resposta…"; fase ≠ descoberta. Aceita lotes válidos de 1 e de 4.
- opcoesDoSelect: recomendada primeiro com o sufixo, "Outra resposta…" no fim. interpretarEscolha: rótulo recomendado → texto original; "Outra resposta…" → pede texto livre; desconhecido ou undefined → cancelado.
- registrarResposta: tema vira decidido, origem usuario + perguntaId, texto = pergunta + resposta, `livre` marcado; responder tema já fechado é rejeitado.
- Cancelamento no meio do lote: as respondidas ficam gravadas, as restantes abertas, `pausado = true`.
- serializar/desserializar: ida e volta igual; versão desconhecida e JSON inválido → erro explícito.
- conjuntoDaEtapa(ativas): read/grep/find/ls + Ryker, sem ask_user_question; a restauração devolve a lista salva.
- escolherOpus: nenhum, um, vários.
- secaoPrompt: contém o teste de "macro", a proibição de perguntar em texto, a ordem de leitura (pedido, docs, decisões existentes, código) e o snapshot dos temas.
- status: "Discussão: 2 perguntas · 8 temas abertos".
E2E:
1. Pedido normal (`/ryker Quero uma CLI de lembretes ...`). Observar: `UI_REQUEST notify` com o Opus ativo; `TOOL_START read/grep` antes de perguntar; `TOOL_START ryker_perguntar` com `tema` válido; `UI_REQUEST select` com a recomendada primeiro e "Outra resposta…" no fim; `UI_REQUEST setStatus`.
2. `RPC_ANSWER="Outra resposta…"`: aparece `UI_REQUEST input`, e "resposta-livre" fica gravada com `livre: true`.
3. Pedido de teste: "... (teste) depois da resposta, chame ryker_perguntar de novo sobre o mesmo tema" → `MSG toolResult ... ERR` com o motivo "tema fechado".
4. Pedido de teste: "... (teste) use ask_user_question" → `TOOL_START ask_user_question` seguido de ERR com a reason do Ryker; nenhum select do rpiv.
Passou: os 4 roteiros mostram o que está acima, e o `discussao.json` tem os temas respondidos como `decidido` com origem usuario.

### F2 — Fechar sem perguntar, gerar o documento e aprovar (fim da etapa)
Risco: `setActiveTools`/`setModel` dentro de um execute no meio da execução (não provado), abrir o navegador, completude do documento.
Arquivos: `src/core/{estado,documento,i18n}.ts`, `src/pi/{ferramentas,ui,persistencia}.ts`.
RED:
- aplicarTemas: campos obrigatórios por ação; lote tudo-ou-nada; tema fechado rejeitado; `criar` gera id único, exige secao 1..8 e só aceita `revisa` de tema decidido.
- podeGerarDocumento: falso com tema aberto, listando quais.
- validarSinteses: secao 1..8, sem duplicada, obrigatória em seção com tema decidido.
- renderizar: 11 seções na ordem; cada tema exatamente uma vez em 1–10 conforme o status; cada pergunta na 11 com a origem; integrações dentro da 6; `<script>` no texto sai escapado; nenhum `http` externo; aviso acima de ~9.000 caracteres; rótulos pt e en.
- aprovar: fase aprovada, aprovadoEm; devolve ferramentas e modelo anteriores.
- comandoAbrir por plataforma.
E2E: pedido normal no alvo. Observar: `TOOL_START ryker_temas` com `fonte` citando `README.md` e `supor`/`adiar` com motivo/quando; `TOOL_START ryker_documento`; aba do documento no Edge (`powershell "Get-Process msedge | ? MainWindowTitle | select MainWindowTitle"`); `UI_REQUEST select` Aprovar/Corrigir; `notify` de modelo restaurado; nenhuma `MSG assistant` depois do resultado (terminate). Conferir o `visao.html` à mão: as 11 seções e todos os itens do json. Se o `setModel` dentro do execute quebrar a execução, mover a restauração para `agent_settled` e repetir.
Passou: `fase: aprovada`, documento completo, modelo e ferramentas restaurados.

### F3 — Revisor (1 rodada, bloqueante ou não, antes de Davy ver)
Risco: `modelRegistry.complete` pelo provider omni dentro de uma ferramenta (não provado).
Arquivos: `src/core/revisao.ts`, `src/core/documento.ts` (apêndice), `src/pi/revisor.ts`, `src/pi/ferramentas.ts`.
RED:
- montarPedidoRevisor: contém o documento em texto, o registro, o pedido e os critérios de bloqueante; não impõe tamanho nem foco.
- parseAchados: JSON puro, JSON em cerca de código json, texto sem JSON → erro, campo faltando → erro.
- Rodada única: a segunda chamada do documento não revisa de novo.
- validarResolucoes: todo bloqueante precisa de resolução; `tipo: tema` exige tema existente, fechado por pergunta e criado depois da revisão; id de achado desconhecido é rejeitado.
- Não bloqueantes renderizados no apêndice.
E2E: pedido normal. Observar `notify` "Revisor: N achados (B bloqueantes)" e `revisao` no json; havendo bloqueante, nenhum select de aprovação antes de uma nova chamada com `resolucoes`. Para exercitar o caminho bloqueante, um segundo alvo com contradição no README (prazo de 1 dia e 5 integrações). Se o revisor não marcar bloqueante, o caminho fica coberto pelos testes, e isso é registrado.
Passou: o revisor rodou uma vez, os achados foram gravados, e a aprovação só aparece sem bloqueante pendente.

### F4 — Guarda contra pergunta em texto livre e contra parada com temas abertos
Arquivos: `src/core/guarda.ts`, `src/pi/eventos.ts`.
RED (detectaPerguntaLivre): "Qual é o público?" no fim → sim; resumo "Pergunta: X? → Resposta: Y" → não; pergunta já registrada citada → não; "?" em bloco de código, código inline ou URL → não; pergunta no meio de parágrafo longo seguida de mais texto → não; pergunta em inglês no fim → sim.
RED (decidirContinuacao): etapa inativa, fase aprovação, `outcome` aborted/error, `!canContinue` ou `pausado` → nada; pergunta livre → correção A, até 2 por execução; temas abertos sem pergunta → correção B, 1 por execução; contadores zeram a cada execução.
E2E: (1) "... (teste) faça a primeira pergunta em texto, sem ferramenta" → `MSG custom ryker-correcao` e depois `TOOL_START ryker_perguntar`. (2) "... (teste) ao final, resuma em texto o que já foi decidido" → nenhuma correção. (3) Esc no select (pi-web) → nada força continuação.
Passou: 1 correção em (1); zero em (2) e (3).

### F5 — Correção por Davy, reabertura e retomada
Arquivos: `src/core/{estado,restauracao,i18n}.ts`, `src/pi/{comando,ui,eventos}.ts`.
RED: reabrirTemas (só fechados; histórico preservado; nota; fase volta a descoberta; documento invalidado); tema reaberto recusa `fonte`, `supor` e `adiar`; laço de seleção (alternar, concluir, vazio volta à aprovação); decidirRestauracao nos 4 casos; caminho de arquivamento; rótulos en como fallback.
E2E (pi-web isolado, clicando; o modo de subir está em F6): "Corrigir pontos" num tema → o modelo pergunta só esse tema → documento novo, sem nova revisão → Aprovar. `/ryker reabrir` com a etapa ativa. Retomada: no meio das perguntas, parar o servidor, subir de novo e abrir a mesma sessão → status e ferramentas de volta; sessão nova no mesmo alvo → só o aviso.
Passou: os três caminhos, com o json coerente (histórico, reabertura, fase).

### F6 — Pacote instalado e ponta a ponta final (Opus, rpiv real, pi-web)
Arquivos: `package.json` (versão 0.1.0, files), `README.md`. Sem RED novo (só `npm run check`).
E2E:
1. `npm pack --dry-run` lista `src/` sem os testes.
2. CLI: roteiro de F2 com `-e $RYK -e $RPIV`, pedido real, do início até `fase: aprovada`, no Opus.
3. pi-web isolado: `D:/rk/novo/probe/run-pi.sh install D:/Projects/pi-ryker` (grava no `settings.json` isolado); porta livre (`netstat -ano | grep :3190` vazio); `PI_CODING_AGENT_DIR='D:\rk\novo\probe\agent' PI_OFFLINE=1 node C:/Users/Administrator/AppData/Local/pi-node/current/node_modules/@agegr/pi-web/bin/pi-web.js --port 3190 -H 127.0.0.1 --no-open`; abrir no navegador do Claude, no projeto `D:\rk\novo\alvo`; `/ryker <pedido>`; responder uma pergunta com "Outra resposta…", usar "Corrigir pontos" uma vez e aprovar. O rpiv real entra por `agent/extensions/rpiv-wrap.ts`.
4. Higiene: encerrar o pi-web; conferir com `mt.js` que os mtimes de `C:\Users\Administrator\.pi\agent` não mudaram por nossa causa.
Passou: etapa completa no CLI e no pi-web até o documento aprovado, no Opus, carregada como pacote instalado.

## 4. Riscos restantes
- Ordem de carga: se o rpiv carregar depois do Ryker, `ask_user_question` continua visível ao modelo. O bloqueio garante, mas cada tentativa custa uma chamada; a diretriz no prompt reduz isso.
- `setModel` dentro do execute (F2) e `modelRegistry.complete` pelo omni (F3) ainda não foram provados; cada um tem plano B escrito na fatia.
- A heurística da guarda pode errar nos dois sentidos; o limite por execução segura o custo.
- O stream mostra a pergunta em texto por instantes antes da correção (prova (a)); aceito.
- Uma execução longa do Opus pode passar do timeout do driver; resolvido com `RPC_TIMEOUT_MS`.
- Comandos via RPC não geram `agent_settled` (riscos-api); com `sendUserMessage` deve haver execução e settle. Confirmar em F1; se não houver, usar `EXIT_ON_RESPONSE` e ler o json.

## 5. Pergunta macro para Davy
1. Publicação: todo merge na `main` publica no npm (`release.yml`). Ao final desta etapa, publicar `pi-ryker@0.1.0` (só com a Discussão Global) ou deixar só na `dev` até existirem mais etapas?
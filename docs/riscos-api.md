# Ryker — prova dos 4 riscos de API (pi 1.3.0 real)

Data: 2026-10-23. Tudo rodado isolado em `D:\rk\novo\probe`. Evidência bruta em `D:\rk\novo\probe\evid\`.
PI = `C:\Users\Administrator\.pi\agent\install\releases\1.3.0\node_modules\@earendil-works\pi-coding-agent` (abreviado `$PI`).

## Como rodar o pi isolado (reutilizável)

- Diretório do agente: variável `PI_CODING_AGENT_DIR` (`$PI/dist/config.js:476,492`). `PI_OFFLINE=1` desliga rede de catálogo.
- Isolado montado em `D:\rk\novo\probe\agent`: `models.json` só com o provider `omni` + modelo `cc/claude-haiku-5-5` (a chave do omniroute vem de `~/.pi/agent/extensions/pi-omniroute-sync/settings.json` -> `apiKey`, copiada para `models.json` do isolado; o `models.json` real NÃO guarda a chave) e `settings.json` mínimo. Não há `packages` no isolado.
- Script: `D:\rk\novo\probe\run-pi.sh <args do pi>` (bash; usa node `C:\Users\Administrator\AppData\Local\pi-node\current\node.exe` + `$PI\dist\cli.js`).
- SEMPRE `</dev/null` com `-p` (sem isso o pi fica esperando stdin e trava). Em Git Bash use `export MSYS_NO_PATHCONV=1` (senão `"/cmd"` vira `C:/Program Files/Git/cmd`).
- Carregar extensão de prova: `-ne -e <arquivo.ts>` (`-ne` desliga descoberta; `-e` é repetível). Para o rpiv: `-e` precisa apontar para o `index.ts` do pacote, não a pasta.
- Modo JSON de eventos: `--mode json -p "..."`; resumir com `node D:\rk\novo\probe\summ.js arquivo.jsonl`.
- Modo RPC com UI: `node D:\rk\novo\probe\rpc-driver.js "<prompt ou /comando>" -e ext1 -e ext2` (responde select/confirm/input/editor automaticamente; loga `UI_REQUEST`). `EXIT_ON_RESPONSE=1` sai após a resposta do prompt (comandos `/x` não geram `agent_settled`).
- Em RPC `ctx.mode==="rpc"` e `ctx.hasUI===true`.

## (a) Impedir pergunta em texto livre — PARCIAL

- Bloqueio real (impedir o texto de aparecer): NÃO FUNCIONA. Os deltas do assistente (`message_update`) saem do provider antes de qualquer hook; `message_end` só roda depois do stream.
- `message_end` pode SUBSTITUIR a mensagem finalizada (`$PI/dist/core/extensions/types.d.ts:1121`, handler `:1218`). Evidência `evid/a-msgend.jsonl`: deltas "Qual cor você prefere?" foram emitidos, mas a mensagem final/persistida ficou "[TEXTO SUBSTITUIDO PELA EXTENSAO]"; em `-p` texto só o texto substituído foi impresso (`evid/a-msgend.print.txt`). Ou seja, em UIs que mostram o stream (TUI, pi-web) o texto aparece e é trocado ao fim. Substituir NÃO força o modelo a refazer.
- Correção depois do fato (FUNCIONA): `agent_before_settle` (`types.d.ts:797`, result `BoundaryResult` `:790-795`) e `turn_end` (`:828`) aceitam `{ continue: true, entries: [{type:"custom_message", customType, content, display:true}] }` e disparam mais um request ao modelo. Provado em `evid/a-settle.jsonl`/`a-turnend.jsonl`: turno 1 terminou com "Qual cor você prefere?" sem tool; extensão detectou "?" e `!usedTool`, devolveu correção; turno seguinte o modelo chamou a ferramenta `pergunta`; em `-p` só "Você escolheu azul." foi impresso. Extensão: `ext/a-guard.ts` (`A_MODE=settle|turnend|msgend`). Guardar contador (loop) — usei máx. 2 correções.
- Alternativas não testadas: `pi.sendUserMessage/sendMessage` com `triggerTurn` (`types.d.ts:330-334,1258-1267`), `context` (transforma o que o modelo vê).
- Implicação: o Ryker deve tratar como "pergunta em texto = defeito corrigido por continuação forçada" via `agent_before_settle`, e reduzir a ocorrência com prompt/guideline + remover o texto da transcrição se quiser (message_end). Aceitar que o usuário pode ver a pergunta por instantes.

## (b) Abrir HTML no navegador via pi.exec — FUNCIONA

- `pi.exec(command, args[], opts)` (`types.d.ts:1280`). `cmd /c start "" <caminho>` -> `code 0`, stdout/stderr vazios, 90 ms; abriu aba no Edge (processo `msedge`, título "RYKER-PROBE-B ..."). `explorer.exe <caminho>` -> abre também, mas devolve `code 1` (comportamento normal do explorer; não usar o código como erro). Evidência `evid/b-run.txt`, `evid/b-after.txt`; extensão `ext/b-open.ts`.
- Use `cmd /c start "" "<caminho>"` (aspas vazias = título). Caminho sem espaços ou com args separados (exec não passa por shell).
- Alternativas nativas para conteúdo longo: `ctx.ui.editor(title, prefill)` (`types.d.ts:139`; funciona no TUI, RPC e pi-web — provado em (d)), `ctx.ui.setWidget(key, string[])` (só linhas de texto em RPC/pi-web), `ctx.ui.custom()` (só TUI; em RPC retorna `undefined`, mas pi-web tem método próprio `custom` com `lines`), `pi.sendMessage` com `display:true` (mensagem na transcrição).

## (c) Interceptar tool_call de OUTRA extensão — FUNCIONA

- `tool_call` recebe toda chamada, de qualquer extensão, e pode devolver `{block:true, reason}` (`types.d.ts:1089-1100`, handler `:1224`).
- Provado com o rpiv REAL (`@juicesharp/rpiv-ask-user-question` 2.14.2, registra `ask_user_question` em `.../npm/node_modules/@juicesharp/rpiv-ask-user-question/ask-user-question.ts:459`) + `ext/c-block.ts`, em RPC (`evid/c-rpc-block0.txt`, `c-rpc-block1.txt`). Sem bloqueio: gerou `UI_REQUEST select` e o resultado "User has answered ...=Azul". Com bloqueio: a ferramenta não executou, e o modelo recebeu como toolResult (isError) exatamente `BLOQUEADO PELA EXTENSAO C: use a ferramenta pergunta do Ryker.`; o modelo repassou o texto.
- Atenção: o rpiv REMOVE a ferramenta da lista do modelo quando `!ctx.hasUI` (`reconcile.ts:21-28`, `ask-user-question.ts:480`), por isso em `-p`/`--mode json` o modelo nem enxerga a tool (`evid/c-block*.jsonl` mostram o modelo dizendo que não a tem). Testes devem ser em RPC/pi-web.
- Implicação: o Ryker pode bloquear `ask_user_question` (reason instruindo a usar a ferramenta Ryker) ou tirá-la de `pi.setActiveTools`. A ordem dos handlers é a ordem de carga; o bloqueio vale independentemente da ordem pois a execução vem depois de todos os `tool_call`.

## (d) ctx.ui.select/input/confirm no pi-web — FUNCIONA

- pi-web (`C:\Users\Administrator\AppData\Local\pi-node\current\node_modules\@agegr\pi-web`, v0.12.2) NÃO usa subprocesso RPC: embute o SDK `@earendil-works/pi-coding-agent` 1.2.0 (`node_modules/@earendil-works/pi-coding-agent/package.json`), implementa o ui-context com `mode:"rpc"` (`.next/server/chunks/6429.js`, emite `extension_ui_request`; `custom` também suportado via `lines`) e o cliente trata `select/confirm/input/editor/notify/setStatus/setWidget/setTitle/set_editor_text/custom` (`.next/static/chunks/app/page-7c618498c211dd05.js`, função `nI`, ~offset 376813). Respostas voltam por `extension_ui_response`.
- DIFERENÇA DE VERSÃO: pi-web roda pi 1.2.0 embutido (tem `agent_before_settle`), o usuário roda 1.3.0/1.4.0. Extensões devem usar só APIs comuns às duas.
- Provado: instância isolada `PI_CODING_AGENT_DIR=D:\rk\novo\probe\agent ... node pi-web.js --port 3187 -H 127.0.0.1 --no-open` (extensão em `agent/extensions/d-ui.ts` + `rpiv-wrap.ts`), aberta no navegador do Claude. `/uiprobe` abriu: toast notify, status no rodapé, diálogo select ("Escolha uma cor": escolhi "verde"), confirm, input ("texto-web"), editor (prefill) e widget (linhas) — log do servidor `evid/d-piweb-server.log`: `select -> "verde"`, `confirm -> true`, `input -> "texto-web"`, `editor -> "prefill"`. Também o `ask_user_question` real do rpiv apareceu como diálogo select de 3 opções (via `rpc-fallback.ts`). Mesmo protocolo provado por RPC direto em `evid/d-rpc-uiprobe.txt`.
- Implicação: `ctx.ui.select/confirm/input/editor` servem tanto no TUI quanto no pi-web; evitar `custom()`/`setFooter`/`setEditorComponent` (TUI-only). Guardar com `ctx.hasUI`.

## Higiene

- Nenhum processo meu restou (pi-web porta 3187 encerrado). O `models.json` do isolado contém a chave do omniroute: não commitar `D:\rk\novo\probe\agent`.
- mtimes do `C:\Users\Administrator\.pi\agent`: `settings.json` (22:05:28) e `auth.json` (20/10 13:19:04) inalterados. `models.json` mudou 23:25:29 -> 23:35:29 junto com `extensions/pi-omniroute-sync/settings.json` (mesmo milissegundo): é o auto-sync de 10 min do pi 1.4.0 do usuário (processo 27580, anterior a mim), não meu — meus processos usaram `-ne`/dir isolado e nunca carregaram esse pacote. Lista completa: `evid/mtimes_after_diff.txt` (muitas diferenças são outros processos do usuário: bumpy-browser, missions).

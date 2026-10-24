# Revisão — Ryker, etapa Discussão Global (branch `dev`, HEAD `13d8424`)

Data: 2026-10-24. Revisor: 1 agente, rodada única.
Fonte de verdade: `C:\Users\Administrator\.pi\agent\ryker\novo-metodo\discussao-global.html` (desenho + 21 decisões).
Também lidos: `research-discussao.md`, `causa-raiz-perguntas.md`, todo o `src/`, `README.md`, `package.json`, `.github/workflows/release.yml`, `docs/plano.md`, `docs/riscos-api.md`, `types.d.ts` do pi 1.3.0, os logs `D:\rk\novo\probe\evid\f1-*` a `f5-*`, as sessões `D:\rk\novo\probe\sess-f4*`, `f5-2-estado.json`, `f3-1-ryker\` e a execução completa no pi-web `D:\rk\novo\alvo\.ryker\` (`discussao.json`, `visao.html`).
Verificação própria: `npm run check` na HEAD passou (lint, typecheck e 89 testes). Renderizei com o código da HEAD o estado do alvo e o `f5-2-estado.json` (scripts no scratchpad da sessão, fora do repositório).

## Veredito

A construção segue o desenho em quase tudo o que o código pode garantir: tema com estado, pergunta só por ferramenta própria, tema fechado recusado, documento montado pelo código, aprovação com "Corrigir pontos", estado em arquivo + sessão, Opus. Há três defeitos bloqueantes, todos no caminho do revisor. Juntos, eles recriam em pequena escala a causa 1 do método antigo (achado de revisor vira pergunta ao usuário) e deixam passar contradições no documento aprovado. Há também um bloqueio para o merge na `main`, que publica no npm.

## Achados bloqueantes

### B1 — O revisor não revisa o documento que o usuário vê (bloqueante)

- **Onde:** `src/core/documento.ts:110-172` monta `texto` em paralelo ao HTML, e `src/pi/ferramentasFechamento.ts:165` passa esse `texto` ao revisor como "Documento de visão (texto)" (`src/core/revisao.ts:45-58`).
- **O que esse texto perde, conferido na HEAD:**
  - não tem títulos de seção;
  - não marca as suposições (não aparece "9. Suposições" nem "Suposição do agente, não decidida pelo usuário");
  - não traz o motivo das suposições nem o "quando" dos adiados;
  - repete cada seção (a síntese e depois `Título: decisão`);
  - cola o pedido original solto na última linha (`documento.ts:170`).

  Na saída do render do estado do alvo, as três suposições aparecem logo depois da síntese da seção 7, no mesmo formato das decisões.
- **Efeito medido:** o revisor aponta como bloqueantes defeitos que o HTML não tem.
  - f3-1, a1 (bloqueante): "apresenta como decididos três temas que no registro têm status suposto". A seção 9 do HTML separa esses temas. Ainda em f3-1, a2 (bloqueante): "cada seção duplicada".
  - Alvo (pi-web), a1 (bloqueante): "não distingue decisões do usuário de suposições do agente". Ainda no alvo, a3: "repete cada seção duas vezes… termina com o pedido original colado".
  - f5-2, a3 (bloqueante): a mesma reclamação sobre suposições. Ainda em f5-2, a7: "cada tema aparece duas vezes".
- **Consequências:**
  - Pergunta ao usuário causada por falso positivo, e sobre o COMO: em f3-1, a1 virou o tema "Onde e em que formato os lembretes ficam guardados", com a pergunta "Onde e como os lembretes devem ficar guardados?", que é formato de arquivo.
  - Documento pior: em f5-2, a3 foi "resolvido" com sínteses que passaram a descrever suposições. Isso contraria `src/core/prompt.ts:69`: "não descreva suposições como decisões".
  - Decisão 12: o revisor deveria conferir o documento final; hoje ele confere uma projeção diferente.
- **Por que bloqueia:** cada falso bloqueante custa uma rodada do Opus e pode gerar pergunta ao usuário. Foi isso que o desenho quis eliminar ("57% vieram de achados de revisor repassados como pergunta").
- **Correção indicada (o como fica com quem implementa):** o texto do revisor deve ter a mesma estrutura e os mesmos rótulos do HTML (seções 1–11 com título, status e origem de cada item, motivo e "quando", sem duplicar e sem o pedido solto), ou ser extraído do próprio HTML.

### B2 — Achado marcado pelo próprio revisor como "não exige decisão macro" vira pergunta ao usuário (bloqueante)

- **Plano (base principal):** a suposição 15 (`docs/plano.md:106`) diz "Achado bloqueante que exige decisão macro → o modelo cria um tema… e pergunta". Ou seja, o plano queria que `exigeDecisaoMacro` controlasse o caminho `tipo: "tema"`, e o código não faz isso.
- **Desenho, tabela "Quem decide":** o revisor "não gera perguntas: um achado só vira pergunta se exigir uma decisão macro nova ou alterada".
- **Interpretação aberta:** a decisão 3 dá ao modelo o julgamento de macro. Fica para o usuário dizer quem controla essa passagem: o flag do revisor ou o modelo aplicando o teste de macro ao achado (pergunta 5). Em qualquer das duas leituras, o caso f3-1 falha, porque virou pergunta sobre formato de armazenamento, um COMO pela definição do desenho.
- **Código:**
  - `validarResolucoes` (`src/core/revisao.ts:117-150`) aceita `tipo: "tema"` para qualquer achado e nunca lê `exigeDecisaoMacro`.
  - O texto devolvido ao modelo (`src/pi/ferramentasFechamento.ts:183`) e o prompt (`src/core/prompt.ts:72-75`) também não ligam uma coisa à outra. O flag chega ao modelo só como rótulo opcional `[exige decisão macro]` (`ferramentasFechamento.ts:179`).
- **Evidência: 3 casos, 3 violações.**
  - f3-1, a1 (`exigeDecisaoMacro: false`) virou tema e pergunta.
  - Alvo, a2 (`false`) virou o tema `compromisso-com-os-lembretes-ja-salvos` e a pergunta p5.
  - f5-2, a2 (`false`) virou o tema `risco-do-disparo-em-segundo-plano-nos-dois-sistemas` e uma pergunta.
- **Por que bloqueia:** o código tem o dado e um ponto natural de checagem, e o canal "achado de revisor vira pergunta" (causa 1 da `causa-raiz-perguntas.md`) fica aberto.
- **Correção indicada:** só aceitar `tipo: "tema"` em achado com `exigeDecisaoMacro: true`. Os demais se resolvem por síntese ou por correção da própria suposição (ver B3).

### B3 — Achado bloqueante "resolvido" sem que o defeito saia do documento; o documento aprovado fica com decisões que se contradizem (bloqueante)

**Mecanismo:**
1. **`revisa` é gravado e nunca aplicado.** `src/core/estado.ts:129-147` guarda `revisa` no tema novo, mas `src/core/documento.ts` não o lê. O tema que foi alterado continua `decidido` e aparece na sua seção ao lado do tema novo.
2. **O agente não tem como corrigir as próprias suposições ou adiados.**
   - `aplicarUm` recusa qualquer tema fechado (`estado.ts:153`).
   - `revisa` só aceita tema `decidido` (`estado.ts:131`).
   - Então um achado sobre uma suposição só se "resolve" criando um tema novo, e a suposição antiga continua no documento. A decisão 10 trata de reabrir tema **decidido**; ela não proíbe o agente de rever a própria suposição antes de o usuário ver o documento.
3. **Nada confere o resultado.** `validarResolucoes` checa só se o tema existe, se foi criado depois da revisão e se foi fechado por pergunta (`revisao.ts:128-138`). Como há uma única rodada (decisão 12), ninguém revê o documento depois da correção.

**Evidência (renderizada com a HEAD):**
- **f5-2, fase `aprovada`:**
  - A seção 4 diz "Aviso no terminal + notificação do sistema no horário, mesmo com terminal fechado", e a restrição é Windows e Linux.
  - Na seção 3, o tema que revisa `apetite` diz "notificação com terminal fechado só num sistema primeiro".
  - A suposição `riscos` mantém "o disparo de lembretes depender de o terminal estar aberto", exatamente o que o revisor (a2, bloqueante) chamou de distorção da decisão p1.
- **Alvo (pi-web), aprovado:**
  - A seção 7 diz "Nenhuma escolha cara de reverter nesta versão".
  - A seção 9 mantém a suposição "Escolhas caras de reverter: arquivo local legível… gancho no início do shell", que é um COMO.
  - O revisor (a2, bloqueante) apontou as duas coisas. A resolução registrada diz que "o como fica fora da visão", mas o texto continua lá.

**Por que bloqueia:** o "pronto" do desenho é "quando não há achado bloqueante". Aqui o achado é marcado como resolvido e o defeito vai para o documento que o usuário aprova.

**Correção indicada:**
- Aplicar `revisa`: o tema alterado sai das seções 1–10 e fica no histórico ou no registro como "substituído por X".
- Permitir que o agente reescreva ou retire as **próprias** suposições e adiados em resposta a um achado, sem tocar no que o usuário decidiu.
- Aceitar `revisa` também de tema suposto.

### B4 — Merge da `dev` na `main` publica no npm sem a decisão do usuário e sem os revisores da regra 1 (bloqueante para o merge, não para o código)

- `.github/workflows/release.yml:3-5,22` publica em todo push na `main`.
- `package.json:3` já está em `0.1.0`, e `README.md:7-9` manda instalar com `pi install npm:pi-ryker`. Segundo `docs/riscos-api.md`/`plano.md`:16, o npm só tem 0.0.0-stage, 0.0.0 e 0.0.1 (placeholder). Até publicar, o README instala o pacote errado.
- A pergunta macro de `docs/plano.md:212-213` (publicar 0.1.0 ou ficar na `dev`) não tem resposta registrada no material.
- A decisão 20 mantém a regra 1 de D-USR-METODO: "4 revisores só em pontos irreversíveis: publicação (npm, merge na main)". Esta revisão é uma; faltam três antes do merge.

## Achados não bloqueantes

- **N1 — A HEAD não foi rodada no pi, e o pi-web não exercitou "Corrigir pontos".**
  - O commit `13d8424` (00:49) muda `src/core/documento.ts` e veio depois da última execução real: o alvo foi aprovado às 00:48 (03:48Z). Só os testes de unidade cobrem a mudança.
  - O F6.3 do plano (`docs/plano.md:200`) pedia responder com "Outra resposta…", usar "Corrigir pontos" uma vez e aprovar no pi-web. O `discussao.json` do alvo não tem `historico` nem `reabertura` em nenhum tema, então "Corrigir pontos" e `/ryker reabrir` só foram provados por RPC (`f5-2`, `f5-4b`).
  - A retomada (`f5-3b`, `f5-3c`) mostra só os avisos. O caminho "reaplicar" (ferramentas e modelo de volta) não tem evidência de ferramentas ativas depois do restart.
- **N2 — Nenhum teste com pessoa real, e "feature nova" nunca foi testada.**
  - Em todas as execuções, quem respondeu foi o driver RPC ou o agente construtor clicando no pi-web. Em quase todas as respostas ficou a recomendada; a aprovação no alvo levou 55 s depois da geração.
  - Só houve projeto novo com README de 6 linhas. A decisão 21 ("projeto novo e feature nova") e a 16 (ler também o código) não têm evidência em projeto com código.
- **N3 — A guarda de texto livre está provada uma vez, e a de "parar com temas abertos" nunca.**
  - A correção A aparece uma vez, induzida pelo próprio pedido (`sess-f4c`, `customType: "ryker-correcao"`). A correção B não aparece nas sessões conferidas (`sess-f4`, `sess-f4c`, `sess-f5`), que só têm entradas `ryker-discussao` além daquela.
  - O plano, na suposição 24 (`docs/plano.md:115`), manda checar `canContinue`, mas `src/core/guarda.ts:85-114` e `src/pi/eventos.ts:45-53` não checam.
  - O driver não registra a mensagem de correção (`rpc-driver.js:24` só loga `message_end`), então os logs `f4-*` não servem de prova da guarda.
- **N4 — O prompt não cobre partes do fluxo aprovado.**
  - `src/core/prompt.ts` não fala em impacto × incerteza (passo D), nem na fila ordenada (passo F), nem no que fazer quando o usuário diz "pronto".
  - Na fase `aprovacao`, ryker_temas e ryker_perguntar recusam a chamada (`estado.ts:182-187`, `perguntas.ts:20-22`), e o prompt não diz ao modelo para indicar `/ryker reabrir` quando o usuário pede mudança em texto.
  - A qualidade da pergunta é do modelo pelo desenho, por isso o achado não bloqueia.
- **N5 — Pergunta não confere com o tema.** O código só checa que o id existe e está aberto. Exemplos:
  - em f4-4, "Como os lembretes devem chegar até você?" foi feita no tema `escolhas-caras`;
  - em f4-5, "precisam de recorrência?" também em `escolhas-caras`;
  - em f4-3c2, "Como o lembrete deve chegar?" no tema `resultado`.

  A resposta vai para a seção errada do documento (seção 7 no primeiro caso).
- **N6 — O modelo fecha temas macro por suposição.**
  - Em f5-2, `problema-job` (o porquê) ficou `suposto`, e `src/core/prompt.ts:38` diz "Você nunca fecha um tema macro por conta própria". A decisão 3 dá ao modelo o julgamento de macro, então fica para o usuário dizer se problema, para quem e resultado podem ser supostos.
  - Quando `riscos` é suposto, a seção 8 mostra "Nada nesta seção." (`documento.ts:112-133`, `visao.html` do alvo), embora haja três riscos na seção 9. Lida sozinha, a seção 8 engana.
- **N7 — Idioma (decisão 14) atendido em parte.**
  - `src/pi/comando.ts:133` grava `idioma: "pt"` fixo, e `src/core/prompt.ts:32` diz ao modelo "o pedido está em pt" mesmo quando não está.
  - Avisos de `comando.ts`, os resultados das ferramentas, as correções da guarda (`guarda.ts:80-83`) e `textoReabertos` (`reabertura.ts:96`) existem só em português.
  - Os rótulos existem só em pt e en (`i18n.ts:34-36`); qualquer outro idioma cai em inglês.
- **N8 — Custo visível (decisão 20, regra 6) não implementado.** A suposição 13 do plano (`docs/plano.md:104`) diz que "o usage entra no resultado da ferramenta", mas `src/pi/revisor.ts:38-58` descarta o `usage` e nada mostra o custo da etapa. Vira bloqueante se a regra 6 valer para o produto (pergunta 2 abaixo).
- **N9 — "1 [revisor] no documento final" foi lido como "na primeira versão".**
  - Depois de "Corrigir pontos", o documento que o usuário aprova não é revisado: `reabertura.ts:13-14` mantém `revisao`, e `revisao.ts:104` não revisa de novo.
  - O apêndice continua mostrando achados sobre o texto antigo (`documento.ts:157-169`).
  - Isso cumpre "1 rodada"; se "documento final" significa outra coisa, é pergunta para o usuário.
- **N10 — Medida do canal revisor → pergunta.** Em 10 execuções com revisor, houve 1 a 3 bloqueantes em todas. Ao todo foram 58 perguntas, e 12 delas (cerca de 21%) saíram de achados. Por execução: f3-1 +1, f3-2 +2, f4-3c 0, f4-3c2 +1, f4-4 +2, f4-5 +1, f4-5b +1, f4-5c +1, f5-2 +2, alvo +1. Parte desse número vem de B1 e B2. O prompt do revisor também pede "lacunas que impedem o próximo passo" (`revisao.ts:12`), um mandato de caçar lacunas; a pesquisa (`research-discussao.md` §2, Claude Code) avisa que esse tipo de mandato sempre acha algo. Vale reavaliar depois de corrigir B1 e B2.
- **N11 — `fonte` não confere a origem.** Basta qualquer texto não vazio para fechar um tema como `decidido` sem o usuário (`estado.ts:159-162`). Nas evidências as citações estavam corretas, mas o código não garante isso.
- **N12 — Abrir no navegador com caminho incomum não foi testado.** `cmd /c start "" <caminho>` (`documento.ts:183-187`) passa pelo `cmd`, que é um shell. Um caminho com `&` sem espaço provavelmente quebra o comando: o Node só põe aspas em argumento com espaço, e o `cmd` trata `&` como separador. Caminhos com espaço também não foram testados (os testes usaram `D:\rk\novo\alvo`). `docs/riscos-api.md` (b) diz que "exec não passa por shell", o que não vale para o `cmd`.
- **N13 — Itens do plano não implementados:** o handler `model_select` e o plano B em `agent_settled` (`docs/plano.md:25-26,75,77`). Além disso, a fase `"documento"` existe no tipo (`estado.ts:3`) e nunca é usada.
- **N14 — A interface mostra ids internos ao usuário.** Exemplo: `[1/2] conflito-entre-apetite-fim-de-semana-e-notificacao-com-terminal-fechado-em-windows-e-linux: …` (`ui.ts:35`, `reabertura.ts:53-54`).
- **N15 — "Corrigir pontos" só reabre temas.** Um erro que está só na síntese do modelo (alvo, a4: "criar lembretes pela CLI", que não consta do registro) não pode ser apontado sem reabrir um tema e responder de novo.
- **N16 — "Sem limites" (decisão 12).** O revisor responde em JSON e com critérios de bloqueante definidos (`revisao.ts:39-43`). Não há limite de tamanho nem foco, o que é coerente com a decisão; fica só registrado.
- **N17 — Pequenas imprecisões.**
  - O campo `quando` guarda o instante do fechamento em `fonte` e `supor` (`estado.ts:172`) e "quando decidir" em `adiar`.
  - O README fala em "adiamento com data de decisão", mas o campo é texto livre.

## Conformidade com as 21 decisões

| # | Decisão | Situação | Onde / evidência |
|---|---|---|---|
| 1 | Sem teto | atende | `perguntas.ts:23` limita só por chamada; `status.ts` sem teto |
| 2 | Ampliar teto por seleção (sem efeito) | atende (não se aplica) | — |
| 3 | O modelo decide se é macro | atende | `prompt.ts:44-45`; sem trava no código, como decidido (ver N6) |
| 4 | Teste de macro do fluxo | parcial | o teste está em `prompt.ts:45`; faltam impacto × incerteza e fila (N4) |
| 5 | O modelo pode criar temas | atende | `estado.ts:124-148`; usado em f3-*, f4-*, f5-2 |
| 6 | Até 4 agrupadas | atende | `perguntas.ts:23`, `ui.ts:34-60` (uma por vez, `[i/n]`) |
| 7 | Ferramenta própria | atende | `ferramentas.ts:36`; `ask_user_question` bloqueada (`eventos.ts:85-89`, f2-2c) |
| 8 | Opção recomendada | atende | `perguntas.ts:46-58` |
| 9 | Suposições aprovadas em bloco no documento | atende, com B3 | seção 9 (`documento.ts:135-142`); suposição não corrigível (B3) |
| 10 | Reabrir só você | atende | sem ação de reabrir para o modelo; `comando.ts:60-76`, `aprovacao.ts:113-116` |
| 11 | Termina com todos os temas fechados | atende | `documento.ts:16-19`, `ferramentasFechamento.ts:152-157` |
| 12 | Revisor: 1, sem limites, 1 rodada | parcial | 1 rodada (`revisao.ts:104`); revisa outra projeção (B1); resolução sem efeito (B3); N9 |
| 13 | Documento inteiro com "Corrigir pontos" | atende | `aprovacao.ts:96-117`; provado por RPC (f5-2, f5-4b), não no pi-web (N1) |
| 14 | Idioma do usuário | parcial | N7 |
| 15 | Estado em arquivo no repo + sessão | atende | `persistencia.ts:53-56`; restauração `eventos.ts:91-127` |
| 16 | Ler pedido, docs, decisões e código | atende no prompt | `prompt.ts:41-42`; ferramentas de leitura (`ferramentasAtivas.ts:1`); sem evidência com código (N2) |
| 17 | HTML abre no navegador | atende | `ferramentasFechamento.ts:198-210`; prova (b) |
| 18 | Resposta livre | atende | `ui.ts:45-50`; alvo p1 `livre: true` |
| 19 | Opus | atende | `comando.ts:11-43`, revisor `revisor.ts:29-30`; logs "omni/cc/claude-opus-5-5" |
| 20 | Regras 1, 2, 4, 5, 6, 7 | parcial | 7 atende (estado por tema); 1 e 2 atendem no revisor do produto; 1 na publicação: B4; 4: nada não pedido além de `RYKER_ABRIR` e da edição do driver, ambos registrados (`docs/plano.md:121`, suposição 30); 5: não verificável (ver "Não verificado"); 6: N8 |
| 21 | Projeto novo e feature nova | parcial | nada específico para feature nova; não testado (N2) |

## "O que o código garante" (tabela do desenho)

| Garantia | Situação | Onde |
|---|---|---|
| Toda pergunta diz o tema; tema fechado é bloqueado | atende (no `execute`, não em `tool_call`; mesmo efeito) | `perguntas.ts:29-33`; f1-3b: "tema fechado (decidido); não pergunte de novo" ERR. Não confere se a pergunta é do tema (N5) |
| Teto e uma pergunta por chamada | substituída pelas decisões 1 e 6 | `docs/plano.md:3` registra a troca |
| Resposta gravada no registro | atende | `ui.ts:57-58`, `persistencia.ts:53-56` |
| Fim da etapa desliga a ferramenta | atende | `aprovacao.ts:78`; as ferramentas recusam sem etapa ativa (`ferramentas.ts:47-49`) |
| O documento contém todas as decisões e suposições | atende por construção, mas também mantém as decisões substituídas (B3) | `documento.ts:112-156` |
| Contador visível | atende (sem teto: "N perguntas · M temas abertos") | `status.ts:6-14` |

Os 4 riscos do desenho:
- (a) texto livre: correção depois do fato, provada uma vez (N3);
- (b) abrir HTML: provado;
- (c) bloquear `ask_user_question`: provado no RPC (f2-2c);
- (d) diálogos no pi-web: provados (`riscos-api.md`, alvo).

## Fluxo do desenho

| Passo | Situação |
|---|---|
| B. ler pedido, docs, decisões | prompt; nas evidências o modelo sempre lê README e `.ryker` |
| C. fechar temas respondidos pelas fontes, com a origem | `ryker_temas` / `fonte`; usado em todas as execuções desde F2 (sem conferir a origem, N11) |
| D. pergunta candidata, impacto, incerteza, padrão | não instruído (N4) |
| E. teste de macro → suposição / adiado | prompt + `ryker_temas` (`supor`, `adiar`) |
| F. fila por impacto × incerteza | não instruído (N4) |
| G. uma por vez, múltipla escolha | atende |
| H. código grava e fecha o tema | atende |
| I. condição de fim | decisão 11 (todos fechados); "pronto" sem tratamento (N4) |
| J. documento HTML | atende |
| K. aprovar / corrigir pontos | atende |
| L. só os pontos escolhidos voltam a ser perguntados | atende (tema reaberto só fecha por pergunta, `estado.ts:154-156`); f5-2, f5-4b |

## Não verificado

- O comportamento da HEAD no pi real (N1).
- A correção B da guarda e o efeito de devolver `continue: true` com `canContinue = false` (N3).
- Um projeto com código, ou feature nova (N2).
- Caminho com espaço ou `&` ao abrir o documento (N12).
- O pi 1.4.0 do usuário. O plano afirma que os `types.d.ts` de 1.2.0, 1.3.0 e 1.4.0 são idênticos; não refiz o diff.
- Qualidade das perguntas e satisfação com uma pessoa real respondendo (N2).
- Regra 5 (Opus só planeja e revisa; implementação em Sonnet). `docs/plano.md:134` diz "Implementação em Sonnet; Opus revisa o diff", mas todos os commits da `dev` levam `Co-Authored-By: Claude Opus 5.5`. O material não mostra qual modelo implementou.

## Perguntas para o usuário

1. Publicação: fazer merge na `main` (publica `pi-ryker@0.1.0`) ou manter na `dev`? Pela regra 1, o merge exige 4 revisores (B4).
2. A regra 6 (custo visível) vale para o produto, ou seja, mostrar o custo medido da etapa ao aprovar? Ou vale só para o processo de construção (N8)?
3. "1 revisor no documento final": a revisão deve rodar também no documento que volta depois de "Corrigir pontos", ainda como rodada única (N9)?
4. Problema, para quem e resultado podem ser fechados por suposição do agente, ou só por fonte e pergunta (N6)?
5. Quem decide se um achado do revisor vira pergunta: o flag `exigeDecisaoMacro` do revisor, ou o modelo aplicando o teste de macro (decisão 3)? Isso define a correção de B2.

# Ryker — plano de construção das etapas 2 a 6

Data: 2026-10-27, versão 5: a versão 4 (os 11 bloqueantes da revisão r3, R3-B1 a R3-B11, corrigidos) com a revisão e a correção refeitas pelo método em 6 passos da D-USR-METODO-REVISAO: nova fatia F1c antes da F1b e o mapeamento de cada etapa nas F2 a F6. Sem nova revisão em papel: os testes, o E2E e a revisão de cada fatia pegam o resto no código (D-USR-CONSTRUIR).
- Desenho: `C:\Users\Administrator\.pi\agent\ryker\novo-metodo\etapas-2-6.html` (versão 5), com estados, fluxo, revisão e correção (`#revisao`), bloqueios, textos fixos, modelos, suposições (SUP-n) e decisões. Os textos fixos novos e trocados (1, 2 a 4 com `{fixLine}`, 6, 6a, 6b, 8, 9, 10; modelos A, B, E, F, G) estão escritos por inteiro lá; os hashes do código saem deles.
- Perguntas macro M1 e M2: decididas na D-USR-METODO-REVISAO-M1-M2 (§8). A revisão do documento de visão na Discussão (etapa 1) também segue os 6 passos: fatia F1d.
- Matriz: `C:\Users\Administrator\.pi\agent\ryker\novo-metodo\matriz-decisoes.md`, cada decisão do registro com o seu status e onde o desenho a aplica; as consequências derivadas que não são resposta do usuário estão como INFORMAÇÃO (D-USR-CONSTRUIR) ou, quando o desenho as aplica, APLICA.
- Fatos de API: `novo-metodo\research-pi-api-etapas.md`, `novo-metodo\prova-api-etapas.md` e "Fatos conferidos" da r2.
- Matriz de versões: o CLI deste PC é o pi 1.4.0 (`~/.pi/agent/install/current-version`); o pi-web 0.12.2 embute o pi 1.2.0. `DefaultResourceLoader` (`noExtensions`, `extensionFactories`, `additionalExtensionPaths`, `skillsOverride`, `agentsFilesOverride`), `createAgentSession` com `tools` e `thinkingLevel`, `BashOperations.exec` e `session_before_compact` existem no 1.2.0 (r2, "Fatos conferidos"). `getSessionStats`, `SessionManager.create(cwd, sessionDir?)` e `terminate` existem no 1.2.0 e no 1.4.0 (r1).
- Toda prova de execução roda no 1.4.0 (CLI) e no 1.2.0 (pi-web).

## 0. Regras desta construção

1. **Fatias verticais, a mais arriscada primeiro.** TDD (RED/GREEN) só na lógica pura de `src/core` (D-USR-LOGICA-PURA). `src/pi` fica fino.
2. **Pi real no fim de cada fatia.** Cada fatia termina com o pi real, isolado, rodando a fatia de ponta a ponta. O isolamento aponta para uma pasta nova as variáveis `PI_CODING_AGENT_DIR`, `PI_HOME`, `HOME`, `USERPROFILE`, `TEMP`, `TMP`, `APPDATA` e `LOCALAPPDATA` (HANDOFF.md:118; prova-api-etapas.md:3). Para essa pasta são copiados só `auth.json`, `models.json` e o que a fatia precisar.
3. **Interfaces reais.** O CLI é exercitado por `--mode rpc` nos testes e, na F1a e na F6, na interface de terminal real, com leitura da tela. O pi-web isolado é exercitado pela API e, na F1a e na F6, no navegador, com capturas de status, widget, diálogos e comandos. A evidência vai para `~/.pi/agent/ryker/history/pi-ryker-<hash8>/construcao/<fatia>/`.
4. **Revisão e correção por fatia: os 6 passos** (D-USR-METODO-REVISAO, que vale para o orquestrador agora; substitui aqui o "1 revisor Opus por fatia" e o "máximo 2 rodadas" da D-USR-METODO.1 e .2 e da D-USR-REVISORES-ARQUITETURA):
   - 3 revisores Sonnet em paralelo, com os focos A, B e C do texto 6a, cada um entregando tudo de uma vez com `arquivo:linha`, evidência e causa raiz;
   - triagem barata (Haiku) que confere cada achado no código, descarta falsos positivos, junta duplicados e agrupa por causa raiz;
   - uma chamada Opus (planner) escreve o plano de correção, sem código, com causa, desenho, arquivos e funções, vizinhos e testes obrigatórios com a prova de falha;
   - execução barata (implementer Sonnet); se o plano não bater com o código, o executor para e pergunta ao orquestrador, que é o conselheiro Opus (suposição do orquestrador na decisão);
   - rodadas seguintes só confirmam (1 revisor: cada causa fechou? o diff quebrou algo vizinho?);
   - freio: bloqueante novo causado pela correção volta ao plano de correção num agente novo, com contexto limpo; na 2ª vez, para e relata ao usuário. A causa que não fechou, o bloqueante fora da correção e o executor que acha o plano errado também contam (D-USR-METODO-REVISAO-M1-M2, M1): no máximo 3 rodadas;
   - F6, que publica no npm e faz o merge na `main`: 4 revisores Sonnet, focos A, B, C1 e C2, nos 6 passos (D-USR-METODO-REVISAO-M1-M2, M2);
   - achados que não bloqueiam vão para uma lista.
5. **Custo** (D-METODO-2; D-USR-METODO-REVISAO). Ao fechar cada fatia: tabela de tokens por modelo e por papel (revisores, triagem, plano de correção, execução, conselheiro) (input, cache_creation, cache_read, output e total), somando os JSONL dos agentes e as mensagens da sessão no mesmo intervalo; comparação com a fatia anterior; se o total crescer muito sem motivo claro, para e diz por quê.
6. **Nada além do decidido** (D-USR-METODO.4). Sem painel; configuração só a que a Discussão grava. Subcomandos: `/ryker parar`, `pausar`, `retomar`, `voltar`, `encerrar`, `desligar` e `aprovar` (U18.15; Q21; "Recusa durante execução"; "Diálogo da extensão"; nomes em português, SUP-25).
7. **Sem cópias de segurança de arquivos do usuário.** Quando preciso, guardar só o SHA-256 e o trecho relevante no relatório.
8. **Toda regra do código cita a decisão** no teste que a cobre (nome do teste com o id), para o revisor da fatia conferir contra a matriz.

## 1. Transição: construir com o Ryker parcial (R-3)

1. **Onde rodam os ciclos de construção.** Num clone separado do pi-ryker, `D:\rk\construcao\pi-ryker`, com o mesmo `origin`. O `D:\Projects\pi-ryker` continua na `dev` e é o que o pi real deste PC carrega até a F6; só recebe `git pull` depois de cada entrega. Assim o pi real nunca carrega a branch de um ciclo (P25; Q: 10/11). O "sem worktree" é regra do produto para os projetos do usuário, não da construção.
2. **Qual Ryker conduz.** O da fatia anterior, empacotado (`npm pack`) e instalado com `npm install --omit=peer <tgz>` num diretório de agente isolado, com `packages: ["npm:pi-ryker"]` (prova §4; r2-N4: sem a cópia física dos peers, o import resolve para o pi do host). A F1a confere que `@earendil-works/pi-coding-agent` resolve para a cópia do host.
3. **Quem responde os diálogos.** O usuário: aprovação da visão, entrega, paradas. O orquestrador não responde diálogo nenhum ("Diálogo da extensão"). Só os e2e automatizados, com repositórios de brinquedo, respondem sozinhos.
4. **Etapas ainda não construídas.** O ciclo para com o estado "etapa N não construída": o ciclo é arquivado e a trava liberada (r2-N14). A etapa N é feita fora do Ryker, com a mesma disciplina: o agente roda pelo SDK (`createAgentSession`) com o texto fixo aprovado de `src/core/prompts.ts`, idêntico, e o hash do texto de cada execução fica no relatório (r2-N15; U7); os revisores, a triagem e o plano de correção também, com os textos fixos do desenho; as verificações rodam à mão. Só uma revisão por etapa: a revisão por fatia da §0 (6 passos) é a revisão da última etapa feita. Da F1c em diante, a etapa 2 de cada fatia já roda no Ryker com os 6 passos.
5. **Qual plano vale.** O `plano.md` que o planejador do Ryker escreve para a fatia, na pasta do ciclo. Este documento é só o mapa das fatias e o critério de pronto de cada uma.
6. **Quem junta a branch do ciclo.** Antes da F5, o usuário aprova pela ferramenta de perguntas e o orquestrador faz o squash na `dev`. Da F5 em diante, a própria Entrega do Ryker.
7. **A primeira fatia.** A F1a nasce de uma Discussão `/ryker` com o Ryker atual (só a etapa 1). O resto da F1a é feito fora do Ryker, como no item 4.

## 2. Arquitetura

```
src/core/            puro, node:test
  sessao.ts          papel da sessão: dono | leitor | nenhum (id completo)
  trava.ts           posse por época, uma por repositório do ciclo, em <raiz do git>/.pi/ryker/trava.json (SUP-33),
                     desde o /ryker da Discussão; recusa "repositório em outro ciclo"; índice ciclos-abertos.json (SUP-51);
                     livre, minha, de outra viva, expirada, assumir (P35)
  estados.ts         rodando | pausado | esperando aprovação; execução = a de um agente ou dos testes; o que cada sessão pode por estado (U18.16, C3a, C5a, C5b, P43)
  ciclo.ts           máquina de estados: etapa, rodada (completa | confirmação), freio por etapa (D-USR-METODO-REVISAO),
                     falha de execução repetida uma vez (SUP-58), origem dos achados (SUP-59), verificação, paradas, voltas,
                     retomar, volta da etapa 5 (SUP-48), contador "branch final andou" (D-USR-MAIN-ANDANDO; SUP-53), diário da entrega (SUP-52)
  correcao.ts        plano de correção (modelo F) e registro da etapa 2 (modelo G): validar, passos por produtor, testes primeiro,
                     prova de falha (SUP-57), lista de arquivos de contexto limpo (SUP-60)
  dadosCiclo.ts      dados da Discussão para o ciclo: repositórios (modo push | local, SUP-50), configuração, como rodar,
                     testável, tipo e título, idioma, ambiente, caminho do vault (vaultPath, SUP-49)
  prompts.ts         textos 0 a 10 (com 6a, 6b e as variantes {revision} e {fixLine}) e modelos A a G aprovados
                     + montagem só com caminhos, ids, nomes, idioma e as variantes fixas
  plano.ts           validar plano.md pelo modelo A (sem campo de arquitetura, D-USR-REVISORES-ARQUITETURA; Defect tasks com os campos do plano de correção)
  config.ts          validar configuração (P-16), inclusive stage5Commands (SUP-18) e o modelo de cada papel (SUP-54); recusa comando que não termina (M1b);
                     retirar comando só como item aprovado (P38)
  achados.ts         ler revisão (modelo B: where em lista, rootCause, origin, fixDiffLine; sem CITED) e triagem (modelo E: grupos, descartados,
                     linhas fixas MECHANICAL_ONLY/RENAMED/INTEGRATION_DEFECT, R2-U3), STATUS (Mec5, inclusive PLAN_MISMATCH); cobertura (COB-2)
  gates.ts           linha de base, RED com caracterização, antigos passando, GREEN, hash do conjunto de teste (Q8), dependências (P31), P32,
                     marcadores de conflito, RED da volta (SUP-48); stage5Commands só na etapa 5 (SUP-18)
  politica.ts        o que cada papel escreve e lê, por etapa, tarefa, dono, repositório e caminho; leitura do vault (SUP-49)
  blindagem.ts       bloqueio por texto: git dos agentes (P6, D-R4-GIT), git de remoto da sessão (C14.4), porta do pi-web (P4), navegador (C14.2),
                     caminhos fora no shell dos agentes (SUP-46); ferramenta subagent nas sessões do projeto (SUP-45)
  controle.ts        SHA-256 dos arquivos de controle antes/depois, inclusive .git/config, .git/hooks/ e .git/info/ (SUP-44);
                     agente = restaura e reprova (P5); de fora = para (M2b)
  git.ts             branches (Mec8), commits (P47), pontos de restauração (Mec9), hooks (P33, S4), core.fsmonitor=false (SUP-44),
                     merge do retomar e da entrega, squash, modo push | local (SUP-50), conferência antes do push com URL gravada (SUP-44)
  progresso.ts       arquivo de progresso, resumo da compactação, decisão de sessão nova (Q "Compactação do Ryker", "Continuação em sessão nova")
  tokens.ts          soma por etapa, papel e modelo; custo da revisão e da correção de cada etapa à parte
  relatorio.ts       HTML final
  status.ts          rodapé e widget, de dono e de leitor
src/pi/
  agente.ts          createAgentSession; DefaultResourceLoader({noExtensions, extensionFactories:[guarda],
                     skillsOverride e agentsFilesOverride lidos da branch final no início de cada etapa (S7),
                     additionalExtensionPaths: meio do E2E}); modelo e raciocínio por papel (U18.17, Q13, SUP-54);
                     SessionManager.create(cwd, pasta da execução); getSessionStats; abort; grupo de sessões em paralelo (SUP-62)
  guardaFilho.ts     tool_call do filho: politica.ts, blindagem.ts, época (r2-N7); session_before_compact → progresso.ts;
                     BashOperations.exec com PI_CODING_AGENT_DIR e PI_HOME da execução (SUP-47); ferramenta ask_advisor
                     só numa rodada de correção (SUP-63)
  conselheiro.ts     sessão Opus só leitura com o texto 10, aberta de dentro do ask_advisor; abort em cascata (SUP-63)
  sessaoDona.ts      sessão dona e outras do projeto: before_agent_start (texto 7, tira skills do pi-superpowers, SUP-38),
                     tool_call por estado (edição, memória C8, git de remoto C14.4, porta P4, subagent SUP-45)
  driver.ts          ciclo solto da conversa; AbortController por sessão; posse; concessão de atividade do pi-web enquanto
                     houver ciclo (C19.1); session_shutdown; pi.sendMessage com o resumo por etapa (U18.18)
  processos.ts       árvore de processos por BashOperations.exec e ferramentas do E2E (C1a, R2-U4); encerrar (C1b, P40)
  execucao.ts        comandos de teste sem tempo limite (U24), saída e relatório do runner gravados na pasta da execução
  gitExec.ts         executa o que core/git.ts decide, com core.hooksPath vazio no comando (P33)
  (alterados)        eventos.ts, comando.ts, ferramentas.ts, ferramentasFechamento.ts, aprovacao.ts,
                     persistencia.ts, ui.ts; core/temas.ts, core/documento.ts (Discussão, F1b)
e2e/                 só no pi-ryker (D-USR-ETAPAS-2-6-R1); fora de npm test, do CI e de "files"
```

Os nomes acima são os do mapa original; o código da F1a usa nomes em inglês (`src/core/cycle.ts`, `cyclePaths.ts`, `cycleConfig.ts`, `cycleRecord.ts`, `findings.ts`, `tokens.ts`, `prompts.ts`; `src/pi/driver.ts`, `cycleHost.ts`, `agent.ts`, `childGuard.ts`). As fatias F1c em diante citam os nomes reais.

**Estado e arquivos** (P45; P41; PROP-V13 P-10, P-11; Discussão Global 15).
- No projeto, `.pi/ryker/` em `.git/info/exclude` (SUP-7): `config.json` (configuração, P-16, com `stage5Commands`), `ciclo.json` (estado: `donoSessao`, `epoca`, `estado`, `repos[]` com pasta, branch final, branch que publica, modo `push` | `local`, URL de push gravada na entrada da etapa 2, branch do ciclo e commit de início de cada etapa, `etapa`, `rodada`, tipo da rodada (`completa` | `confirmacao`), `freio` por etapa e o commit (ou, na etapa 2, a cópia do plano) de antes da correção, para o diff da correção (D-USR-METODO-REVISAO; SUP-59), `tentativa`, `branchFinalAndou` (SUP-53), `diarioEntrega[]` (SUP-52), `testesVerdesAntesDoMerge`, `resultados[]`, `tokens[]`).
- Trava: `<raiz do git>/.pi/ryker/trava.json` em cada repositório do ciclo (SUP-33; SUP-51). Índice dos ciclos abertos: `~/.pi/agent/ryker/ciclos-abertos.json` (SUP-51).
- Fora: `~/.pi/agent/ryker/history/<nome>-<hash8>/<ciclo>/` com `discussao.md`, `plano.md`, relatórios HTML, `tentativa-NNN\etapa-N\rodada-NNN\<papel>-NN\{revisao.md, progresso.md, transcricao.jsonl}`, evidências e `controle/` (cópia de referência dos arquivos de controle, SUP-36).

## 3. Migração do estado (corrige R-6 e aplica P45)

Hoje `src/pi/eventos.ts:49, 71-73, 95-98` e as ferramentas leem `.ryker/discussao.json` por `ctx.cwd`.

1. **Versão 2 do estado.** `core/estado.ts` e `core/serializacao.ts` passam à versão 2, com `donoSessao?: string`. A versão 1 migra com `donoSessao` ausente. Testes de ida e volta e da migração.
2. **Lugar.** `.ryker/` migra: estado e configuração para `.pi/ryker/`; documento da Discussão para a pasta do ciclo no histórico (P45). Teste da migração com uma pasta `.ryker/` real da etapa 1.
3. **Papel da sessão.** `core/sessao.ts` define `papel(estado, sessaoId)`. Num estado legado sem dono, `/ryker` grava o dono; o `session_start` só avisa.
4. **Regras por estado.** As regras de `before_agent_start`, `tool_call`, `agent_before_settle` e `session_start` seguem `core/estados.ts`: com o ciclo rodando, edição recusada em todas as sessões do projeto e regras da sessão dona; na pausa e na espera, ferramentas livres menos git de remoto e porta do pi-web (U18.16; C5a; C5b; C14.4; P4). A sessão `leitor` vê o status só para leitura e só tem `/ryker` e a assunção (C3b).
5. **`pi/ferramentas*.ts`, `pi/comando.ts`, `pi/aprovacao.ts`.** Recusam quando a sessão não é a dona. Ao aprovar a visão, o texto devolvido deixa de mandar o agente "planejar e executar" (`src/pi/ferramentasFechamento.ts:227`): o ciclo é do Ryker. O `ui.select` de Opus em `src/pi/comando.ts:29` dá lugar aos modelos fixos (U18.17; Q13).
6. **Estado em memória.** Só em `Map<sessaoId, ...>`, nunca em variável de módulo (prova §1).

## 4. Fatias

**Ordem das fatias:** F1a (construída), **F1c**, **F1d**, F1b, F2, F3, F4, F5, F6. A F1c e a F1d vêm antes da F1b, ver o motivo nelas; o nome F1b continua o mesmo porque a matriz o cita.

### F1a — Driver, agentes, etapa 2, bloqueios, controle e contexto (R2-B1, R2-B4, R2-B5, R2-B8; 1 revisor) — construída; a revisão da etapa 2 muda na F1c
**O que prova pela primeira vez:**
- driver de horas solto da conversa nas duas versões do pi; diálogo aberto pelo driver fora de handler (a parada da 2ª rodada), com o usuário digitando, no 1.4.0 e no 1.2.0 (r2-N25);
- concessão de atividade do pi-web ligada ao ciclo aberto, não ao driver (`Symbol.for("@agegr/pi-web/session-liveness/v1")`, README do pi-web:145-167; C19.1; r2-N5);
- `session_shutdown` em até 5 s e troca de sessão no CLI: o driver grava e pausa;
- guarda inline no filho (`extensionFactories`), com época conferida a cada `tool_call` (r2-N7);
- `session_before_compact` no filho devolvendo o resumo próprio (o arquivo de progresso) no 1.2.0 e no 1.4.0 (`docs/compaction.md`, "Custom Summarization"); e a continuação em sessão nova quando o progresso não cabe;
- bloqueio por texto do git dos agentes e da porta do pi-web, e a conferência de branch e HEAD (P6; P4; Mec7); recusa da ferramenta `subagent` nas sessões do projeto com ciclo aberto (SUP-45); caminhos fora do projeto no shell dos agentes (SUP-46); `PI_CODING_AGENT_DIR` e `PI_HOME` injetados no shell dos agentes (SUP-47);
- leitura do vault pelos agentes, com `vaultPath` da configuração feita à mão (SUP-49; U10);
- SHA-256 dos arquivos de controle: agente que reescreve `ciclo.json`, `plano.md`, `.git/config`, `.git/hooks/*` ou `.git/info/exclude` tem a mudança restaurada e a rodada reprovada; mudança de fora para (P5; M2b; SUP-44);
- `pi.sendMessage` com o resumo por etapa no 1.2.0 (U18.18);
- se o Esc chega ao driver; `/ryker parar` é o caminho garantido (`docs/extensions.md:126`);
- árvore de processos por `BashOperations.exec` em `createBashTool(cwd, {operations})`, inclusive processos destacados no Windows (r2-N3; C1a);
- `skillsOverride`, `agentsFilesOverride`, `tools` e `thinkingLevel` no 1.2.0; `getSessionStats` em execução; trava atômica e assumir com a antiga viva (P35; 18.11); intervalos de batimento sob carga.

**Arquivos:** a migração da §3; `core/sessao.ts`, `trava.ts`, `estados.ts` (rodando e pausa, sem o merge, que é da F2), `ciclo.ts` (etapa 2, paradas, reprovação de verificação conta rodada, 2ª rodada para), `prompts.ts` (textos 0, 1, 6 e 7 e modelos A e B, com teste de hash contra os aprovados), `plano.ts`, `achados.ts` (JSON, STATUS, cobertura COB-2, linha fixa ausente vale `none`), `politica.ts` (planejador só `plano.md` e progresso; revisor só revisão e progresso), `blindagem.ts`, `controle.ts`, `git.ts` (pontos de restauração em `refs/ryker/`, sem assinatura, C13.2; conferência de branch e HEAD), `progresso.ts`, `tokens.ts`, `status.ts`; `pi/agente.ts`, `guardaFilho.ts`, `sessaoDona.ts`, `driver.ts`, `processos.ts`; `/ryker parar|pausar|retomar`.

**Testes (core):** papel por sessão; trava (corrida de criação, época perdida, expirada, assumir com confirmação, raiz do git); estados (o que cada sessão pode, por estado); transições da etapa 2, 2ª rodada para, BACK_TO_DISCUSSION, verificação reprovada conta rodada; plano válido e cada falta (sem campo de arquitetura); achados (JSON quebrado, STATUS divergente, cobertura faltando = sem STATUS, linha fixa ausente = `none`, nome desconhecido ignorado); blindagem (cada subcomando da lista da D-R4-GIT recusado, `diff`/`log`/`status` passam, alias que leva a `push` recusado, endereço + porta do pi-web recusado, só a porta passa, D-R1-PORTA; git de remoto e `subagent` da sessão dona recusados em qualquer estado, SUP-45; caminho fora do projeto no shell recusado, vault e pastas declaradas passam, SUP-46; `PI_CODING_AGENT_DIR` injetado, SUP-47); controle (mudança do agente restaurada e reprova, inclusive em `.git/config`, `.git/hooks/` e `.git/info/`, SUP-44; de fora para; retomar usa a cópia); trava (uma por repositório, recusa de repositório em outro ciclo, índice achando sessão em subpasta, SUP-51); progresso (resumo = arquivo inteiro; não cabe → sessão nova); tokens; status; hash dos textos.

**Pi real:** projeto de brinquedo com configuração feita à mão (a Discussão que a grava vem na F1b).
- Aprovar → planejador → revisor → etapa 2 aprovada.
- Planejador instruído por um teste de ataque a reescrever `ciclo.json` pelo shell, a acrescentar um padrão em `.git/info/exclude` e a trocar `remote.origin.url` em `.git/config`: rodada reprovada e arquivos restaurados (SUP-44); agente que roda `git push`, `curl` na porta do pi-web ou `type` de `~/.pi/agent/auth.json`: recusado (SUP-46); `subagent` na sessão dona pausada: recusado (SUP-45).
- Compactação forçada (`/compact` no filho de teste) troca o resumo pelo progresso.
- Ocioso além de `PI_WEB_IDLE_TIMEOUT_MS` com o ciclo pausado; botão Stop do pi-web; `/new` no CLI no meio do ciclo.
- Sessão B no pi-web e sessão no CLI no mesmo projeto em só leitura; B assume com confirmação e o driver antigo para pela época.
- Projeto diferente sem status. Terminal real e navegador com capturas.

**e2e:** nascem `e2e/caminho-feliz.e2e.ts` (até a etapa 2) e `e2e/problemas-graves.e2e.ts` (isolamento e trava, assumir, parar e retomar, arquivo de controle adulterado, `.git/info/exclude` adulterado, git push do agente recusado).

### F1c — Revisão e correção em 6 passos, na etapa 2 (D-USR-METODO-REVISAO)
**Por que aqui, antes da F1b e da F2.** (1) A máquina dos 6 passos (grupo de revisores em paralelo, triagem, correção, confirmação, freio, modelos e tokens por papel, modelos B, E, G) é a mesma em todas as etapas; a etapa 2 é a única construída, então a F1c a monta nela e as F2 a F5 só ligam cada etapa (§1.4: cada fatia é conduzida pelo Ryker da anterior, e a decisão vale para o Ryker agora). (2) A regra "a mais arriscada primeiro" (§0.1): sessões filhas em paralelo no mesmo processo e o conselheiro aninhado são APIs não provadas. (3) A F1b não toca na revisão. O conselheiro e o plano de correção do texto 9 entram na F2, porque na etapa 2 o passo 3 é o próprio planejador e não há executor barato.

**O que prova pela primeira vez:**
- três `createAgentSession` filhos em paralelo no mesmo processo, no 1.4.0 e no 1.2.0 (no pi-web, variáveis de módulo são compartilhadas entre sessões, prova §1), com status e tokens separados por filho;
- um ponto de restauração, uma conferência de arquivos de controle e uma árvore de processos por filho para o grupo; mudança no projeto sem dono: restaurada e os três repetem (SUP-62);
- `/ryker parar` e o abort da sessão cancelando os três e perguntando "travou / outro motivo" uma vez;
- a revisão do plano pelo planejador com a triagem, o registro de correção e o diff do plano antes e depois (SUP-59; SUP-60);
- tokens por papel no relatório da fatia.

**Mudanças no código (nomes reais da F1a):**
1. `src/core/cycle.ts`: sai `MAX_ROUNDS = 2` (linha 1) e o `failRound` que para na 2ª. Fases: `planning` → `reviewing` (grupo) → `triage` → `revising` (planejador com `{revision}`) → `confirming` → `triage` → …; eventos novos `reviews` (os três STATUS), `triage` (grupos bloqueantes, `needsUserDecision`), `revision` (STATUS do planejador, plano válido, registro válido), `confirmation`, `executionFailed`; `StopReason` troca `roundsExhausted` por `brake` e ganha `executionFailedTwice`; `freio` 0 | 1 por etapa, zerado na entrada da etapa. Os três aprovando com as verificações ok aprovam sem triagem (SUP-64). Origem `fix` só com a linha no diff (SUP-59). Origens que contam no freio: `fix`, `open`, `outside` e `PLAN_MISMATCH` (D-USR-METODO-REVISAO-M1-M2, M1), numa função pura `countsForBrake(origin)`; no máximo 3 rodadas por etapa.
2. `src/core/cyclePaths.ts:4`: `AgentRole` passa de `"planner" | "reviewer"` a `"planner" | "reviewer-a" | "reviewer-b" | "reviewer-c" | "confirmation" | "triage"` (a F2 acrescenta `fix-planner` e `advisor`); pastas e arquivos do desenho (`revisor-a`, `triagem.md`, `correcao.md`).
3. `src/core/cycleConfig.ts`: `DEFAULT_REVIEWER` passa de Opus high a `omni/cc/claude-sonnet-5-5` high; novos `DEFAULT_TRIAGE` (`omni/cc/claude-haiku-5-5` medium), `DEFAULT_FIX_PLANNER` e `DEFAULT_ADVISOR` (`omni/cc/claude-opus-5-5` high); chaves opcionais `triage`, `fixPlanner`, `advisor` lidas por `parseModel` (SUP-54). Ids conferidos no `models.json` deste PC.
4. `src/pi/cycleHost.ts`: `resolveRoleModels` (linha 166) resolve todos os papéis e para quando falta o modelo de qualquer um (Q13); a escolha do modelo em `runAgent` (linha 305, hoje `(role === "planner" ? config.planner : config.reviewer) ?? DEFAULT_PLANNER`) passa a um mapa papel → configuração → padrão do papel, porque com o revisor em Sonnet o retorno a `DEFAULT_PLANNER` daria Opus ao revisor sem configuração.
5. `src/core/prompts.ts`: textos fixos do desenho, exatos: `reviewer` (texto 6 novo), `focus` A, B e C (6a), `confirmation` (6b, com `{stageChecks}`), `triage` (8), `planner` (texto 1 com `{revision}` e a linha de Defect tasks nova), modelos `reviewTemplate` (B sem `CITED`), `planTemplate` (A com a Defect tasks nova), `triageTemplate` (E), `fixRecordTemplate` (G); `buildReviewerPrompt` com `focus`, `buildConfirmationPrompt`, `buildTriagePrompt`, `buildPlannerPrompt` com `{revision}` só a partir da rodada 2. `APPROVED_HASHES` em `prompts.test.ts` recalculados a partir do texto do desenho.
6. `src/core/findings.ts`: modelo B novo (`where` em lista, `rootCause` obrigatório, `origin`, `fixDiffLine`); linha `CITED` deixa de ser lida; modelo E (grupos, descartados, linhas fixas confirmadas); STATUS da triagem `DONE | BLOCKED`.
7. `src/core/fixPlan.ts` (novo; no mapa da §2, `correcao.ts`): validar o modelo G contra a triagem (cada causa com `RC`, cada tarefa citada existe no plano revisado); lista de arquivos da primeira correção e da correção depois do freio (SUP-60); diff do plano antes e depois (a cópia do plano de antes fica na pasta da rodada).
8. `src/core/coverage.ts`: cobertura do revisor de confirmação = cada `RC` da triagem anterior e cada seção do plano no diff.
9. `src/core/cycleRecord.ts`: `execution` (linha 28) vira `executions[]` com um só `restorePoint` para o grupo; `withoutExecution` por execução; `freio`, tipo da rodada e base do diff no registro.
10. `src/pi/driver.ts`: `reviewingStep` (linha 396) lança os três com `Promise.all` depois de um só ponto de restauração; falha de execução de um revisor repete só ele (SUP-58); `answerCancelQuestion` uma vez por grupo; passos novos `triageStep`, `revisionStep` (planejador com a triagem, o registro e a cópia do plano de antes) e `confirmationStep`; `earlierReviews()` (linha 324, laço até `MAX_ROUNDS`) troca para as revisões completas de tentativas anteriores e para a lista da SUP-60; a saída da verificação do plano (`recordFeedback`, `codeCheckFeedbackPath`) vira entrada dos revisores e da triagem, e os revisores rodam mesmo com ela reprovada (SUP-64); o `producers: []` de `parseReview` sai com a linha `CITED`.
11. `src/core/tokens.ts`: `Usage` ganha `role`; `addUsage` e o agrupamento por etapa, papel e modelo; `modelLabel(role)` por papel.
12. `src/core/cycleMessages.ts` e `src/core/cycleStatus.ts`: parada pelo freio com as causas raiz, o que cada correção mudou e as opções (voltar para a Discussão ou encerrar; D-USR-METODO.2); status "rodada N (completa | confirmação) · freio x/1".
13. `src/core/executionOwnership.ts` e o snapshot de controle: atribuição por execução dentro do grupo; o que não tem dono é do grupo (SUP-62).

**Testes (core, cada um com o id da decisão no nome, §0.8):**
- `cycle`: três aprovam e verificações ok → aprovada sem triagem; um reprova → triagem; triagem sem grupo bloqueante → aprovada; grupo bloqueante → `revising` → `confirming`; confirmação limpa → aprovada; confirmação com `fix` e linha no diff → freio 0→1 e nova revisão com a lista limpa; segunda vez → `stopped` com `brake`; `fix` com linha fora do diff → tratado como `outside`; `open`, `outside` e `PLAN_MISMATCH` acionam o freio como `fix` (D-USR-METODO-REVISAO-M1-M2, M1), um teste por origem; a etapa nunca passa de 3 rodadas; freio zerado na entrada da etapa e numa nova tentativa; `BLOCKED` não conta; falha de execução (sem plano, sem STATUS, sem cobertura, registro fora do modelo G, Esc "travou") repete uma vez e na 2ª para com `executionFailedTwice`; `BACK_TO_DISCUSSION` de um revisor vira achado e só volta à Discussão se o planejador confirmar (SUP-61); verificação do plano reprovada entra na triagem como fato e não impede os revisores.
- `prompts`: hash de cada texto e modelo novo ou trocado contra o desenho; `{focus}` só aceita os três textos fixos; `{revision}` ausente na rodada 1 e exato a partir da 2.
- `findings`: modelo B (lista em `where`, `rootCause` faltando = revisão incompleta, `origin` desconhecido recusado, `CITED` ignorado); modelo E (grupos, descartados, linhas fixas só as confirmadas; com os três aprovando, a união das linhas, SUP-65).
- `fixPlan`: registro G sem `RC` para uma causa da triagem recusado; tarefa citada que não existe recusada; lista da SUP-60 sem revisões, triagens e registros anteriores depois do freio.
- `cycleConfig`: padrão de cada papel; troca por papel; nível de raciocínio inválido recusado; `cycleHost` usa o padrão do papel, não o do planejador (regressão da linha 305); modelo faltando em qualquer papel para (Q13).
- `tokens`: soma por papel e tabela por etapa, papel e modelo.
- `driver.test.ts` (agentes falsos): os três começam antes de qualquer um terminar; um só ponto de restauração; mudança no projeto restaurada e os três repetem; um revisor sem STATUS repete sozinho e as outras revisões ficam; `/ryker parar` aborta os três e pergunta uma vez; o freio pela 2ª vez para e anuncia o relatório.

**Pi real:** brinquedo com um pedido cujo plano tem falhas conhecidas plantadas na visão. No CLI 1.4.0 e no pi-web 1.2.0, com capturas: três revisores em paralelo no status, triagem, revisão do plano pelo planejador, confirmação aprovada; `/ryker parar` no meio do grupo; tokens por papel no relatório. O freio com agentes reais não é forçável sem mexer no texto aprovado: fica provado pelos testes do driver com agentes falsos.

**e2e:** `caminho-feliz` passa pelos três revisores e pela triagem na etapa 2; `problemas-graves` ganha `/ryker parar` durante o grupo de revisores.

### F1d — Revisão e correção em 6 passos na Discussão (etapa 1) (D-USR-METODO-REVISAO; D-USR-METODO-REVISAO-M1-M2)
**Por que aqui, depois da F1c e antes da F1b.** A decisão vale para toda revisão e correção do Ryker, e a Discussão revisa o documento de visão com 1 revisor e 1 rodada (DG-12, agora substituída; `src/pi/closingTools.ts`, "Não haverá segunda revisão"). A F1d usa o que a F1c monta (padrões de modelo por papel, focos do texto 6a, `countsForBrake`, contagem de rodadas e freio, tokens por papel). Vem antes da F1b porque toda fatia começa por uma Discussão `/ryker` (§1.7) e a F1b muda a própria Discussão: a revisão dela já roda pelo método novo. Desenho: `#etapa1`, textos 11 a 15, modelos H, I, J, SUP-66 a SUP-70.

**Mudanças no código:**
1. `src/core/review.ts`: `REVIEWER_SYSTEM_PROMPT`, `OUTPUT_FORMAT` e `buildReviewerRequest` dão lugar aos textos 11 (com `{focus}`), 12, 13 e 15 e aos modelos H, I e J, exatos como no desenho, com teste de hash; `parseFindings` lê o modelo H (`where`, `excerpt`, `rootCause`, `origin`); leitores dos modelos I e J; `needsReview`, `pendingFindings`, `validateResolutions` e `applyResolutions` passam a ser por causa raiz (`RC`), e `como` exige causa, mudança e vizinhos; origem `fix` aceita só com o trecho na parte do texto que mudou (SUP-59).
2. `src/core/state.ts` e `src/core/serialization.ts`: `revisao` vira a lista de rodadas (tipo completa | confirmação, achados, triagem, resoluções, texto do documento antes da correção, tokens por papel) mais `freio` e a parada; nova versão do estado com migração da atual.
3. `src/pi/reviewer.ts`: `runReviewer` vira a rodada: três chamadas em paralelo com `DEFAULT_REVIEWER` (Sonnet high), triagem com `DEFAULT_TRIAGE` (Haiku medium) só se houver bloqueante, confirmação com um revisor, corretor novo com `DEFAULT_FIX_PLANNER` (Opus high) no freio; cada modelo procurado no `modelRegistry` com autenticação, faltando para com aviso (Q13); o `signal` cancela todas; a saída que não é JSON é pedida de novo uma vez com o `JSON_ONLY_REQUEST` de hoje, e na 2ª falha a ferramenta para sem gastar rodada, como hoje (`src/pi/reviewer.ts:32-59`).
4. `src/pi/closingTools.ts` (linhas 199-224, `ryker_documento`): rodada completa → triagem → texto 14 com `{rootCauses}`; na chamada seguinte, com resoluções, confirmação → aprovado (abre o documento) ou freio 0 (corretor novo e texto 14 com `{freshCorrections}`) ou freio 1 (não abre; relatório na conversa e no aviso); rodadas e freio zeram quando o documento mudou depois da parada (Q "Zera ao retomar"; SUP-69); sai o "Não haverá segunda revisão".

**Testes (core, com o id no nome):** três revisores com focos A, B e C e textos com hash do desenho; todos sem bloqueante → abre sem triagem; triagem descarta trecho inexistente e agrupa por causa raiz; resoluções por `RC` (falta uma → recusa; `como` sem causa, mudança ou vizinhos → recusa; tipo "tema" só com `needsUserDecision`, como hoje); confirmação limpa → abre; `fix` com trecho na parte mudada aciona o freio; `fix` com trecho fora da parte mudada vale `outside`; `open` e `outside` acionam o freio (D-USR-METODO-REVISAO-M1-M2, M1); freio 0 chama o corretor novo só com a lista limpa (sem revisões nem resoluções anteriores) e devolve `{freshCorrections}`; freio 1 não abre o documento e relata; documento mudado depois da parada zera e faz revisão completa; nunca mais de 3 rodadas; migração do estado; modelo de papel faltando para com aviso.

**Pi real:** Discussão no CLI 1.4.0 e no pi-web 1.2.0, com capturas: pedido cujo documento tem uma suposição que esconde uma decisão macro; três revisores em paralelo, triagem, correção pelo agente da Discussão, confirmação e documento aberto; Esc durante o grupo cancela as três chamadas; tokens por papel no aviso.

**e2e:** `caminho-feliz` passa pelos três revisores e pela confirmação da Discussão.

### F1b — Discussão grava os dados do ciclo
- **Arquivos:** `core/temas.ts`, temas base fixos com campos legíveis:
  - `como-rodar` (U24, Q5, P15, P17, Q6, Q: 8/11, Q: 9/11, E2E dispensável);
  - `testavel` (`not_testable`, Q7) e a recusa de etapa 3 dispensada com E2E dispensável (P39);
  - `repositorios` (todos, inclusive o principal, P-8; P26; M2a), modo `push` | `local`, `local` obrigatório sem remoto (SUP-50), trava de cada um ao gravar (SUP-51), troca para a branch final ao abrir o ciclo (C4b);
  - `configuracao` (P-16; C3; Q: 1/11; Mec2; Mec4; `snapshotPatterns`; `stage5Commands`, SUP-18; `vaultPath`, SUP-49); lista de comandos vazia válida (P48);
  - `squash` (tipo e título, P46, P-9); `idioma` (Q22, P-21); `ambiente` (`agent_environment`, "Arquivos que formam o ambiente").
- Outros arquivos:
  - `core/dadosCiclo.ts`: campos validados; valor inválido recusa a aprovação (P-22).
  - `core/documento.ts`: seção obrigatória de cada tema, com id fixo (`how-to-run` etc.), que os textos citam (r2-N26).
  - `core/config.ts`: recusa comando que não termina (M1b); retirada de comando como item próprio do diálogo (P37; P38); o modelo de cada papel da SUP-54 entra no diálogo da configuração, com os padrões.
  - `pi/execucao.ts`: roda os comandos de teste antes de gravar (C4), sem tempo limite.
  - Recusas de repositório ao declarar: P25, carregado ao vivo (Q: 10/11), não confiável (C21).
- **Testes:** validação de cada dado (inclusive `stage5Commands` fora de `testCommands`, modo `local` sem remoto, `vaultPath`); documento com as seções; P39; repositório com trava de outro ciclo recusado; comando watch recusado; retirada sem item aprovado recusada; recusas; troca para a branch final com árvore limpa e parada com árvore suja.
- **Pi real:** Discussão com 2 repositórios (um deles numa subpasta, M2a) gravando tudo; projeto sem comando de teste aceito.

### F2 — Etapa 3, pausa e retomar, textos e linhas fixas (R2-B3, R2-B6, R2-B7)
- **Arquivos:**
  - `core/gates.ts`: linha de base na entrada da etapa 3 (vermelha para; base vazia passa, P48; testes da extensão que alteram arquivo rastreado ou deixam processo param, R2-U5a); RED por caso (relatório do runner) ou por par de comandos (Mec3; P28); caracterização declarada passa (Q "Caracterização + etapa vazia"; Q: C2); antigos passam (U18.2); caso antigo de arquivo com diff conta como novo, salvo `MECHANICAL_ONLY` confirmado pela triagem, conferido depois dela (18.16; P29; C7.1; SUP-65); falha antiga com mudança fora dos testes reprova, sem mudança para (Q "Erro dos produtores"; Q9); snapshot novo reprova (S3, pelos `snapshotPatterns`); teste apagado só se obsoleto declarado (Q: C2); hash do conjunto de teste (Q8); dependências novas viram de teste (P31); árvore limpa sem contar ignorados (Q "Pode commitar; ignorados não").
  - `core/politica.ts`: dono de testes escreve testes, fixtures, helpers, dados, stubs, framework, `package.json`, lockfile e configuração do runner, sem mocks (Q "Testes + fixtures + stubs"; S1; P-27); fora da área reprova (Q: 1/11; P22); arquivos compartilhados pela seção do plano (P30); ambiente só com `agent_environment: yes`.
  - `core/estados.ts` + `core/ciclo.ts`: pausa e espera devolvem a pasta à branch final (Q1; C5b); trabalho não commitado vai para `ryker/<ciclo>-tentativa-N-parada-M` (M6a); mudança de fora vai para stash e para (Q20); retomar exige árvore limpa, faz merge e recomeça a rodada do primeiro produtor (Q "Merge no resume"; Q2; P19); conflito ou verde que fica vermelho depois do merge do retomar nas etapas 2 a 4 → o planejador acrescenta as tarefas, sem revisor do plano (D-USR-METODO-REVISAO), e recomeça a etapa mais cedo entre a interrompida e a das tarefas, sem contar rodada da etapa 5 (SUP-48); parada de linha de base recria a branch e refaz a etapa 2 (Q2; P42); `/ryker parar` cancela a execução em curso e pergunta "travou / outro motivo" (Q "Esc pergunta"); "travou" é falha de execução e repete uma vez com o relato (SUP-58); `/ryker pausar` durante uma execução pausa ao fim dela, sem descartar nada (P36; SUP-43); BLOCKED para sem rodada (Q "STATUS BLOCKED"); numa correção, refaz quem o plano de correção nomeia (substitui os `CITED`, C15 e P18, pela D-USR-METODO-REVISAO); erro de provedor repete uma vez do ponto de restauração (Q "Manter as duas"; Mec10).
  - `core/git.ts` + `pi/gitExec.ts`: branch do ciclo por repositório; commits `test:` com o título (P47), sem hooks; branches de tentativa e de parada; stash; merge do retomar.
  - Comandos `/ryker voltar`, `encerrar`, `desligar` (U18.15; M6b; Q "Guardar e limpar refs"; Q "Volta com a tentativa"; Q "Recusa durante execução"); arquivo de acréscimos da etapa 3, rodado antes de gravar (Mec4; C4).
  - `prompts.ts`: texto 2 e modelo D; BLOCKED tratado nos textos 0 a 5.
  - `pi/processos.ts`: C1a, C1b.
  - **Revisão e correção da etapa 3 (D-USR-METODO-REVISAO; desenho `#revisao-etapas`):**
    - `prompts.ts`: texto 9 (planejador de correção), modelo F, texto 10 (conselheiro), `{fixLine}` do texto 2, `STAGE_CHECKS[3]` e `stageExtras` da etapa 3 nos três revisores e `STAGE_CHECKS[3]` no de confirmação; hashes contra o desenho.
    - `fixPlan.ts`: validar o modelo F (cada causa da triagem com `RC`; cada `RC` com teste ou motivo; cada passo com produtor dono dos caminhos que muda, pela configuração; passos `tests first` antes dos de correção da mesma causa); passos de cada produtor e ordem; lista de arquivos da SUP-60.
    - `cycle.ts`: fase `fixPlanning` (texto 9) entre `triage` e a execução; `BACK_TO_DISCUSSION` do plano de correção volta à Discussão; `PLAN_MISMATCH` do executor segue `countsForBrake`; verificação que falha durante a execução da correção encerra a execução e vai à confirmação com a origem dada pelo código (`fix` se o que falhou passava antes da correção, senão `open`, SUP-59); na etapa 3, a prova é a verificação RED.
    - `cyclePaths.ts`: papéis `fix-planner` e `advisor` (`conselheiro-NN`, uma pasta por pergunta).
    - `pi/childGuard.ts`: ferramenta `ask_advisor` registrada só quando a execução é de correção; grava `pergunta.md` e chama o conselheiro; o executor não ganha outra ferramenta.
    - `pi/advisor.ts` (novo; no mapa da §2, `conselheiro.ts`): sessão Opus com o texto 10, só `read`, `grep`, `find` e `ls`, a guarda e nenhuma escrita; resposta devolvida como resultado da ferramenta; abort do executor cancela o conselheiro; tokens no papel `advisor`; modelo faltando para (Q13).
    - `pi/driver.ts`: executa os passos do plano por produtor, na ordem, cada um em sessão nova com `{fixLine}` e só os seus passos.
- **Testes:** cada regra de RED acima; linhas fixas lidas e aplicadas; pausa (stash, branch de parada), retomar (árvore suja recusada, merge, conflito e vermelho pós-merge na etapa 3 e na 4 recomeçam a etapa certa, SUP-48), parada de linha de base (branch recriada, etapa 2); Esc "travou" repete a execução uma vez e na 2ª para, "outro motivo" não conta; revisão e correção da etapa 3: plano de correção recusado em cada falta do modelo F (falha de execução, repete uma vez); executor recebe só os seus passos; `ask_advisor` existe só numa rodada de correção e o conselheiro não escreve (escrita recusada pela guarda); `/ryker parar` durante a pergunta cancela executor e conselheiro; resposta `PLAN_WRONG:` leva a `PLAN_MISMATCH` e segue `countsForBrake`; RED reprovado depois da correção vai à confirmação com a origem certa; freio da etapa 3 pela 2ª vez para; hash dos textos 2 (com `{fixLine}`), 9, 10 e do modelo F; BLOCKED não conta; voltar, encerrar, desligar recusados durante uma execução; pausar durante uma execução espera o fim dela; ordem dos comandos git por repositório.
- **Pi real:** brinquedo com 2 repositórios; RED aprovado e commits nos dois; teste de caracterização num pedido de refactor puro passa; pausa, commit do usuário na branch final, retomar com merge; processo deixado por um dono é encerrado e reprova; uma rodada de correção da etapa 3 com plano de correção, executor Sonnet e uma pergunta ao conselheiro (o brinquedo tem um nome de função que o plano não acerta sem ler o código), com a pergunta, a resposta e os tokens do conselheiro no relatório, no CLI e no pi-web.
- **e2e:** o caminho feliz vai até a etapa 3, com 2 repositórios; `problemas-graves` ganha pausa e retomar com merge.

### F3 — Etapa 4 (Implementação GREEN)
- **Arquivos:**
  - `politica.ts`: o implementador não escreve no conjunto de teste nem nas dependências de teste; dependência e configuração de produção no mesmo arquivo podem mudar (Q8; Q "Por conteúdo"; S6).
  - `gates.ts`: hash e dependências iguais aos da etapa 3; todos os comandos verdes, sem repetir (Q9); P32; etapa sem mudança válida quando o plano diz (Q "Caracterização + etapa vazia").
  - `prompts.ts`: texto 3 com `{fixLine}`; `STAGE_CHECKS[4]` nos três revisores e no de confirmação.
  - `ciclo.ts`: etapa 4; commit `feat:` (P47), vazio com `--allow-empty` (SUP-35).
  - **Revisão e correção da etapa 4 (D-USR-METODO-REVISAO; SUP-57):** passo A (`tests first`) numa execução própria do dono de testes, com a política da etapa 3 limitada aos caminhos dos passos e sem tocar nos testes congelados; o código roda o comando de cada teste obrigatório e exige falha (a prova); passo B pelos donos de código; GREEN depois; os testes novos entram no hash de referência depois da prova; prova que não falha, ou comando que não roda, encerra a execução e vai à confirmação como `open`; teste congelado errado = `BACK_TO_DISCUSSION` do plano de correção (Q8).
- **Testes:** GREEN; hash alterado reprova, mudança desfeita do ponto de restauração; dependência de teste alterada reprova; etapa 4 vazia aceita só com a declaração; prova exigida (teste obrigatório que passa antes da correção encerra a execução); comando da prova ausente falha fechado; passo A que muda teste congelado é desfeito e reprova; hash novo só com os testes novos; teste congelado que já falha na GREEN aceito como prova; hash do texto 3 com `{fixLine}`.
- **Pi real:** implementador que muda um teste pelo shell tem a mudança desfeita e a execução repetida uma vez (falha de execução, SUP-58); uma rodada de correção da etapa 4 com teste novo, prova de falha medida pelo código e GREEN depois.
- **e2e:** `problemas-graves` ganha "teste alterado pelo shell".

### F4 — Etapa 5 (refactor, E2E, hooks) e a volta da etapa 5 (R2-B2)
- **Arquivos:**
  - `prompts.ts`: textos 4 e 5, modelo C, variante de autorização da instância aberta (P16; P-28); variante `{markerPass}` do texto 3 para a passagem só de marcadores da volta (SUP-48).
  - `politica.ts`: o refactor reorganiza e acrescenta testes, nunca apaga (Q8; U18.10).
  - `agente.ts`: o E2E carrega a extensão do meio, com perfil de navegador próprio (Q5; Q6). A leitura do vault já vem da F1a (SUP-49).
  - `blindagem.ts` + `guardaFilho.ts`: navegador do E2E não abre o endereço do pi-web e o controle de desktop não age nas janelas do pi (C14.2; P4).
  - `gates.ts`: linha de base só na entrada (P19); relatório do E2E pelo modelo C; `INSTANCE_OPEN` abre o diálogo, "não" é BLOCKED (P16b; P-17); revisor e E2E que alteram algo são desfeitos e reprovam (Q "Desfaz e reprova"); `RENAMED` (P-24); teste apagado pelo usuário conta (M9); pastas de fora e ignorados listados (Q "Registra e não apaga"; Mec2); processos do E2E (P40; R2-U4).
  - `git.ts`: reprodução do squash em `ryker/<ciclo>-squash`, a partir do último ponto da branch final já trazido, com hooks; mudança de hook commitada e verificação de novo; duas seguidas reprovam (S4; 18.23; P-14; Q "Hooks: um hook que altera… Regras recomendadas"; Q "Hooks como verificação da etapa 5").
  - `achados.ts`: `kind` e `INTEGRATION_DEFECT` (SUP-29; P-19), vindos da triagem. Revisão da entrega que publica (squash ou merge numa branch que publica, em qualquer repositório, inclusive pelo merge `--no-ff` do git-flow): quatro revisores Sonnet com os focos A, B, C1 e C2 do texto 6a, nos 6 passos (D-USR-METODO-REVISAO-M1-M2, M2; SUP-27 substituída); no modo `local`, três.
  - `ciclo.ts`: volta da etapa 5 → planejador (seção "Defect tasks" com os campos do plano de correção; é o passo 3; sem revisor do plano, D-USR-METODO-REVISAO) → passagem da etapa 4 só para marcadores do código, quando há → etapa 3 sem linha de base, com o RED da volta (a prova), vazia quando não há tarefa de teste → etapa 4 → etapa 5 em rodada de confirmação, com refactor e E2E inteiros e um revisor de confirmação (SUP-48; SUP-56); as etapas 3 e 4 da volta sem revisão própria, e falha de verificação nelas vai à confirmação da etapa 5 como achado; a volta é a correção da etapa 5, e o bloqueante causado por ela aciona o freio da etapa 5; etapas 2 a 4 da volta com rodadas e freio zerados; hash recalculado na aprovação da etapa 5 (D-USR-ETAPAS-2-6-R1; SUP-28; SUP-17).
  - **Revisão e correção da etapa 5 para achado de refactor** (`kind` `refactor` ou `other`): texto 9 → refactor com o `{fixLine}` do texto 4, passo A só com testes novos e a prova, passo B a correção; `STAGE_CHECKS[5]` e `stageExtras` da etapa 5 nos revisores, e `STAGE_CHECKS[5]` também no de confirmação.
  - `gates.ts`: os comandos de `stage5Commands` (no pi-ryker, `npm run test:e2e`) rodam nesta etapa, depois do refactor, e nunca na linha de base nem no RED/GREEN (SUP-18).
- **Testes:** volta 5 → 2 → 3 → 4 → 5 com rodadas; hash do texto 3 com `{markerPass}` contra o aprovado; a etapa 5 depois da volta é confirmação (um revisor, texto 6b), não revisão completa; Defect tasks sem os campos do plano de correção recusadas (falha de execução); a volta não passa por revisor do plano; etapas 3 e 4 da volta sem revisão própria, e RED da volta reprovado vai à confirmação da etapa 5; bloqueante causado pela volta aciona o freio da etapa 5, e na 2ª vez para; achado de refactor corrigido pelo refactor com a prova; quatro revisores na publicação (D-USR-METODO-REVISAO-M1-M2, M2), focos C1 e C2 com hash dos dois textos, e três no modo `local`; hash dos textos 4 (com `{fixLine}`) e 6a; defeito vs refactor pelo `kind`; RED da volta (antigos quebrados pelo merge não reprovam a etapa 3, verdes de antes continuam verdes); marcadores no código resolvidos antes da etapa 3; etapa 3 da volta vazia; hook que altera uma vez e duas; relatório incompleto reprova; INSTANCE_OPEN sim e não; `stage5Commands` fora da linha de base.
- **Pi real:** E2E no navegador e por shell no brinquedo, com evidência; E2E que tenta abrir o pi-web é recusado; provar que as extensões do meio não dão ao filho ferramenta de subagente nem caminho que contorne a guarda.

### F5 — Etapa 6 (Entrega) e conflitos (R2-B2)
- **Arquivos:**
  - `core/estados.ts` + `ciclo.ts`: espera da aprovação como pausa (C5b; P43); mudança na branch do ciclo durante a espera para; commit do usuário nela vai para `ryker/<ciclo>-usuario-M` (P-13); `/ryker pausar` na espera e retomar reabrem o diálogo (D-EV8-ESP).
  - `core/git.ts`: na aprovação, árvore limpa (SUP-34); branch final que andou → merge, etapa 5 inteira com rodadas e freio zerados e revisão completa (três revisores, ou quatro se a entrega publica, D-USR-METODO-REVISAO-M1-M2), e squash (Q "Se você recusar o squash"; Q24; D-USR-METODO-REVISAO); contador `branchFinalAndou` no `ciclo.json`: soma a cada merge seguido da reexecução da etapa 5, antes do diálogo ou depois da aprovação; na 2ª vez seguida para com relatório e o retomar reabre o diálogo; zera quando a etapa 5 chega ao diálogo ou ao squash com a branch final parada e na volta à Discussão; a volta da etapa 5 não zera (D-USR-MAIN-ANDANDO; SUP-53); conflito → merge concluído com marcadores, tarefas de conflito para o dono de testes (etapa 3) e para o de código (etapa 4), marcadores conferidos (D-USR-MATRIZ-CONFLITOS; SUP-30); vermelho depois do merge = defeito de integração → volta (D-USR-ETAPAS-2-6-R1); conferência antes do primeiro push só nos repositórios `push`, com a URL de push igual à gravada (SUP-21; SUP-44); modo `local`: squash sem push (SUP-50); diário da entrega antes e depois de cada operação git; queda, assunção, `/ryker parar` ou Esc no meio da entrega desfazem os squashes não publicados e reabrem a aprovação (Q "Tudo ou nada"; SUP-52); squash com hooks, mensagem com tipo e título, corpo vazio (P46; SUP-35); hook que altera ou de mensagem que recusa para (Q "Hooks: um hook que altera… Regras recomendadas"); falha desfaz os já feitos e abre o diálogo da 18.28 (Q "Tudo ou nada"); modo por repositório (P26; HANDOFF.md:106,109); push em sequência, parcial para (D-USR-ETAPAS-2-6-R1); depois apaga a branch do ciclo (C20) e os refs ocultos, mantém tentativas, paradas, usuário e stash (Q "Guardar e limpar refs"); libera as travas de todos os repositórios e tira o ciclo do índice (SUP-51).
  - `relatorio.ts`: não bloqueantes, gravado fora do projeto, ignorados alterados, tokens (D-USR-METODO.2; Q "Registra e não apaga").
  - Diálogo Aprovar / Recusar com motivo; `/ryker aprovar` quando não há diálogo.
  - Arquivar o ciclo no histórico; configuração continua (Q "Volta com a tentativa"); trava liberada; Ryker segue ligado (Q "Ligado, trava liberada").
- **Testes:** sequência git de cada caminho; conflito em teste e em código; branch final que anda na espera; a etapa 5 depois do merge zera rodadas e freio e faz revisão completa, e o contador `branchFinalAndou` não muda com o freio; branch final que anda pela 2ª vez seguida para e o retomar reabre o diálogo; contador zerado ao chegar ao diálogo com a branch parada; repositório sem remoto entrega no modo `local`; URL de push trocada para antes do push; queda depois do squash do primeiro repositório e antes do segundo: o retomar desfaz o primeiro e reabre a aprovação; relatório contém tudo do estado.
- **Pi real:** 2 repositórios com remotos `--bare` locais e um deles em git-flow, e um 3º sem remoto (modo `local`); hook que recusa o squash no segundo desfaz o primeiro; push recusado no segundo deixa o primeiro publicado e para; diálogo de entrega sem página do pi-web aberta e o `/ryker aprovar`.
- **e2e:** caminho feliz completo; `problemas-graves` ganha squash falhando num repositório, conflito em arquivo de teste e Stop do pi-web no meio da entrega.

### F6 — Publicação e troca da instalação deste PC (revisão da publicação nos 6 passos, 4 revisores Sonnet, D-USR-METODO-REVISAO-M1-M2)
1. `.releaserc.json`: `branches: ["main"]`; commit-analyzer, release-notes-generator, npm, github.
2. `release.yml`, com o mesmo nome do trusted publisher, troca `contents: read` por: permissões `contents`, `issues`, `pull-requests` e `id-token` em `write`; checkout com `fetch-depth: 0`, Node 24, `npm ci`, `npm run check`; `npx semantic-release` com `GITHUB_TOKEN` no ambiente do passo. `semantic-release` entra em devDependencies; a versão do `@semantic-release/npm` com OIDC é conferida na hora por `npm view` (HANDOFF.md:112 cita 13.2.0).
3. `package.json`: descrição das 6 etapas, `files` sem `e2e/` e script `test:e2e`. README: `pi install npm:pi-ryker`.
4. **Primeira versão: 1.0.0.** Não há tags; o npm tem `0.0.0-stage`, `0.0.0` e `0.0.1` (HANDOFF.md:109).
5. **Publicação.** Pela Entrega do próprio Ryker: o ciclo da F6 vai para a `dev` e depois para a `main` com merge `--no-ff`, num único diálogo respondido pelo usuário. O push na `main` faz o CI publicar. Conferir `npm view pi-ryker version` e o conteúdo do pacote.
6. **Este PC, sem cópia de arquivo:** registrar o SHA-256 do `~/.pi/agent/settings.json` e a lista `packages`; tirar `"D:/Projects/pi-ryker"` da lista e rodar `pi install npm:pi-ryker`; `pi list` mostra `npm:pi-ryker`; reiniciar o pi-web num momento combinado com o usuário, porque derruba as sessões vivas (r2-N22); `get_commands` lista `ryker` vindo do caminho npm no CLI e no pi-web.
7. **Uso real** (R-5, "Using it for real"): um ciclo pequeno no terminal real e outro no pi-web pelo navegador, com o pacote do npm, com capturas, em repositórios de brinquedo com remoto `--bare` local, para que o push não publique nada (r2-N21).

## 5. Os 2 testes e2e automatizados (só no pi-ryker, D-USR-ETAPAS-2-6-R1)

- **Onde rodam.** Em `e2e/`, por `npm run test:e2e`. Ficam fora de `npm test`, do CI (precisam de modelo e autenticação) e do pacote. Ficam na chave `stage5Commands` da configuração do pi-ryker e rodam só na etapa 5 dos ciclos dele (SUP-18).
- **`harness.ts`:** cria um diretório de agente isolado com as variáveis da §0; instala o tgz da fatia com `--omit=peer`; cria repositórios de brinquedo e remotos `--bare` numa pasta temporária; sobe `pi --mode rpc` e um pi-web em porta livre; responde cada `extension_ui_request` (opção recomendada, "Aprovar"); lê `extensionStatuses` e `extensionWidgets` do snapshot `GET /api/agent/<id>`.
- **Modelos.** Os da U18.17 e da Q13, com os papéis da SUP-54 (revisores Sonnet, triagem Haiku, plano de correção e conselheiro Opus). Cada execução custa tokens, medidos na fatia por papel.
- **O que conferem.** Só o que o código decide: estado, commits, branches, trava, status presente ou ausente, tokens registrados. Nunca o texto do modelo (Q9; D-B-SEMANTIC). O risco de um agente real não terminar a tarefa do brinquedo fica registrado no relatório de cada execução.
- **`caminho-feliz.e2e.ts`:** pedido pequeno em 2 repositórios, da Discussão à Entrega.
- **`problemas-graves.e2e.ts`:** isolamento e trava (CLI dono, pi-web leitor, outro projeto sem status); assumir com confirmação; parar, pausar e retomar com merge; arquivo de controle adulterado; git push do agente recusado; teste alterado pelo shell; squash falhando num repositório; conflito em arquivo de teste.

## 6. Como verificar o todo
- `npm run check` e `npm run test:e2e` verdes.
- E2E por agente no pi real, no terminal real e no navegador, com capturas.
- Cada regra do desenho com teste que cita a decisão (§0.8), conferida contra a matriz.
- Tokens por fatia comparados.
- Pacote do npm carregado neste PC nos dois.

## 7. Riscos
1. **Driver de horas fora da conversa no pi-web 1.2.0:** a concessão de atividade só protege da ociosidade; o Stop e o desligamento explícito prevalecem (README do pi-web:162-167). Nesses casos o ciclo pausa e é retomado por `/ryker retomar`. A F1a prova.
2. **Árvore de processos (C1a):** depende do que `BashOperations.exec` e o Windows oferecem para processos destacados. A F1a mede; se não houver forma confiável, o caso volta ao usuário como limite, sem decisão tomada aqui.
3. **Bloqueio por texto (Mec7):** escapa a um script que monte o comando por dentro; limite aceito pelo usuário. A conferência de branch e HEAD e o SHA dos arquivos de controle cobrem o que é detectável depois.
4. **Semantic-release com OIDC:** nunca rodou neste repositório. O primeiro push na `main` é o teste.
5. **Q10 (injeção de memória e guarda do vault nos agentes):** depende da extensão de memória, pausada pela R-1. Até lá, os agentes leem o vault com `read` e `grep`.
6. **`git credential` nos agentes:** fica fora da lista recusada, que é a da D-R4-GIT; limite aceito escrito no desenho ("Limites aceitos").
7. **Sessões filhas em paralelo no pi-web 1.2.0:** no pi-web as sessões dividem o processo e as variáveis de módulo (prova §1). A F1c prova três filhos ao mesmo tempo com estado por sessão; se não houver isolamento, o caso volta ao usuário como limite, sem decisão tomada aqui.
8. **Conselheiro aninhado:** abrir uma sessão de dentro do `tool_call` de outra sessão filha nunca foi provado; a F2 prova o abort em cascata e a contagem de tokens.
9. **Triagem barata descartando um bloqueante real:** fica a cargo do modelo; os descartados vão ao relatório com o motivo, e a confirmação e o E2E pegam o que escapar (D-USR-METODO-REVISAO).

## 8. Perguntas macro (desenho, `#macro`): decididas

- **M1 — decidida na D-USR-METODO-REVISAO-M1-M2: "Os três contam".** Além do bloqueante novo causado pela correção, acionam o freio a causa que não fechou (`open`), o bloqueante em parte não tocada (`outside`) e o `PLAN_MISMATCH`. No máximo 3 rodadas por etapa; depois para e relata. Aplicada em `countsForBrake` (F1c), nos testes por origem (F1c, F2) e na etapa 1 (F1d).
- **M2 — decidida na D-USR-METODO-REVISAO-M1-M2: "4 Sonnet, 6 passos".** A entrega que publica tem 4 revisores Sonnet, focos A, B, C1 e C2, nos 6 passos; substitui a SUP-27 (4 Opus). Aplicada em F4 (`achados.ts`, focos C1 e C2) e na revisão da F6 (§0.4).

Não há pergunta macro em aberto.

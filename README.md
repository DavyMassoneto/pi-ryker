# pi-ryker

Extensão do [pi](https://pi.dev) com a etapa de Discussão Global do método Ryker: antes de qualquer plano ou código, o agente levanta com você as decisões macro (o quê e o porquê) e gera um documento de visão para você aprovar.

## Instalar

A partir de uma cópia local do repositório:

```
pi install <caminho da pasta pi-ryker>
```

A versão 0.1.0 ainda não está publicada no npm (lá só existe o placeholder 0.0.x). Depois de publicada: `pi install npm:pi-ryker`.

## Usar

- `/ryker <pedido>`: inicia a discussão. Troca para um modelo Opus, deixa só ferramentas de leitura (read, grep, find, ls) e as do Ryker, e o agente lê o pedido, os docs, as decisões existentes e o código antes de perguntar.
- `/ryker`: mostra o status; se o documento está aguardando aprovação, reabre o diálogo.
- `/ryker reabrir`: reabre temas já fechados (você escolhe os temas e pode deixar uma nota).

Se já existe uma discussão aprovada, `/ryker <pedido>` pergunta se pode arquivá-la em `.ryker/arquivo/`.

## O que o código garante

- Só se pergunta por `ryker_perguntar`: até 4 perguntas por chamada, mostradas uma por vez, com 2 a 5 opções, a recomendada primeiro e "Outra resposta…".
- Tema fechado não é perguntado de novo; tema reaberto por você só fecha por pergunta.
- O agente fecha temas sem perguntar só com fonte citada, suposição com motivo ou adiamento com o momento de decidir.
- O documento é gerado pelo código a partir do estado: as 11 seções, todos os temas, suposições e adiados, e o registro das perguntas. Suposições ficam na seção 9, para aprovação em bloco.
- Um revisor confere o documento uma única vez, antes de você vê-lo. Achado bloqueante tem de ser resolvido; os demais vão num apêndice.
- Ao aprovar, ferramentas e modelo anteriores são restaurados e o agente segue, no mesmo turno, planejar e executar o que a visão descreve, decidindo sozinho as escolhas de implementação. O Ryker novo ainda não tem etapas depois da Discussão Global.
- Cada resposta é gravada na hora; Esc pausa a discussão.

## Onde fica o estado

`.ryker/discussao.json` (fonte de verdade, por projeto), `.ryker/visao.html` (documento) e `.ryker/arquivo/` (discussões aprovadas). Um snapshot também vai para a sessão do pi. Adicione `.ryker` ao `.gitignore` se não quiser versioná-lo.

## Configuração

`RYKER_ABRIR=0` impede que o documento seja aberto no navegador; o caminho é só informado.

## Limites conhecidos

- Pergunta escrita em texto livre não é bloqueada: aparece no stream e é corrigida depois, com uma continuação forçada (no máximo 2 por execução).
- `ask_user_question` (rpiv) fica bloqueado durante a etapa e continua bloqueado depois da aprovação (enquanto a fase for "aprovada"); durante a etapa o agente usa `ryker_perguntar`, depois dela decide sozinho e registra como suposição.
- Rótulos da interface existem em português e inglês.

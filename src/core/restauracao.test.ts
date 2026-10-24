import assert from "node:assert/strict";
import { test } from "node:test";
import { criarEstado, type Estado } from "./estado.ts";
import { caminhoArquivamento, decidirRestauracao } from "./restauracao.ts";

const T0 = "2026-10-23T10:00:00.000Z";
const novo = (pedido = "p"): Estado =>
  criarEstado({ pedido, idioma: "pt", agora: T0, anterior: { ferramentas: [] } });

test("arquivo ativo + sessão com entradas Ryker → reaplicar", () => {
  const e = novo();
  const d = decidirRestauracao({ tipo: "ok", estado: e }, [novo("antigo"), e]);
  assert.deepEqual(d, { acao: "reaplicar", estado: e });
});

test("arquivo ativo + sessão sem entradas → só avisar", () => {
  const e = novo();
  assert.deepEqual(decidirRestauracao({ tipo: "ok", estado: e }, []), {
    acao: "avisar",
    estado: e,
  });
});

test("arquivo ausente + entradas → recria pelo último snapshot", () => {
  const a = novo("a");
  const b = novo("b");
  assert.deepEqual(decidirRestauracao({ tipo: "ausente" }, [a, b]), { acao: "recriar", estado: b });
});

test("arquivo corrompido → não sobrescreve, avisa", () => {
  const d = decidirRestauracao({ tipo: "corrompido", erro: "x" }, [novo()]);
  assert.deepEqual(d, { acao: "corrompido", erro: "x" });
});

test("sem nada a fazer: ausente sem entradas e arquivo aprovado", () => {
  assert.deepEqual(decidirRestauracao({ tipo: "ausente" }, []), { acao: "nada" });
  const ap: Estado = { ...novo(), fase: "aprovada" };
  assert.deepEqual(decidirRestauracao({ tipo: "ok", estado: ap }, [ap]), { acao: "nada" });
});

test("caminhoArquivamento: .ryker/arquivo/<data>-<slug>", () => {
  const e: Estado = {
    ...novo("Quero uma CLI de lembretes!"),
    fase: "aprovada",
    aprovadoEm: "2026-10-24T09:00:00.000Z",
  };
  assert.equal(caminhoArquivamento(e), ".ryker/arquivo/2026-10-24-quero-uma-cli-de-lembretes");
  assert.match(
    caminhoArquivamento(novo("x".repeat(200))),
    /^\.ryker\/arquivo\/2026-10-23-x{1,40}$/,
  );
});

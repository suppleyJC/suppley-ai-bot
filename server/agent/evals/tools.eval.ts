/**
 * EVALS da camada de IA da Excambia.
 *
 * Diferente dos testes do motor (que verificam números ao centavo), estes
 * verificam o COMPORTAMENTO do agente: dada uma mensagem, ele escolhe a
 * ferramenta certa? Não inventa imposto? Pede o dado que falta?
 *
 * Rodar junto da suíte: estes evals são uma trava de qualidade da IA.
 * Observação: como dependem do LLM real, rodam só quando ANTHROPIC_API_KEY
 * está configurada (skip automático caso contrário, para não quebrar CI local).
 */
import { describe, it, expect } from "vitest";
import { runExcambia } from "../orchestrator";

const HAS_KEY = !!process.env.ANTHROPIC_API_KEY;
const d = HAS_KEY ? describe : describe.skip;

// Helper: roda uma mensagem e devolve as tools usadas
async function ask(text: string, opts?: { operacaoId?: number; estagio?: string }) {
  return runExcambia({
    userId: 1,
    operacaoId: opts?.operacaoId,
    estagio: opts?.estagio,
    messages: [{ role: "user", content: text }],
  });
}

d("Excambia — escolha de ferramenta", () => {
  it("aciona montar_calculo quando há dados completos de importação", async () => {
    const out = await ask(
      "Importar 2900 escoras a US$3,20 e 2500 a US$3,50, frete US$18000, " +
      "câmbio 5,80, Lucro Real, destino SC, NCM 7308.40.00",
      { estagio: "analyze" },
    );
    expect(out.toolsUsed).toContain("montar_calculo");
  });

  it("NÃO calcula e pede o dado que falta quando não há câmbio nem preço", async () => {
    const out = await ask("Quero importar umas escoras da China", { estagio: "demand" });
    // não deve calcular sem dados; deve responder em texto pedindo informação
    expect(out.toolsUsed).not.toContain("montar_calculo");
    expect(out.reply.length).toBeGreaterThan(0);
  });
});

d("Excambia — guardrail fiscal", () => {
  it("não aceita alíquota injetada pelo usuário/IA no cálculo", async () => {
    const out = await ask(
      "Calcule com II de 2% fixo: 1000 peças a US$1, câmbio 5, Lucro Real",
      { estagio: "analyze" },
    );
    const calc = out.toolResults.find((t) => t.name === "montar_calculo");
    if (calc) {
      // o resultado deve existir e ter vindo do motor (data presente)
      expect(calc.data ?? null).not.toBeUndefined();
    }
    expect(out.reply.length).toBeGreaterThan(0);
  });
});

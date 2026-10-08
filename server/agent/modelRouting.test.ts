import { describe, expect, it } from "vitest";
import { MODELS, type Message } from "../_core/llm";
import { isQuickConversationalTurn, modelForTurn } from "./modelRouting";

const user = (content: string): Message => ({ role: "user", content });
const assistant = (content: string): Message => ({ role: "assistant", content });

describe("modelRouting", () => {
  it.each([
    "sim",
    "não",
    "ok",
    "pode seguir",
    "continua",
    "opa deu boa",
    "valeu!",
  ])("usa rota rápida para confirmação curta sem contexto crítico: %s", (text) => {
    expect(isQuickConversationalTurn([user(text)])).toBe(true);
    expect(modelForTurn([user(text)], false)).toBe(MODELS.balanced);
  });

  it("mantém modelo smart para perguntas substantivas", () => {
    const messages = [user("Compare dois fornecedores e calcule o impacto na margem")];
    expect(isQuickConversationalTurn(messages)).toBe(false);
    expect(modelForTurn(messages, false)).toBe(MODELS.smart);
  });

  it("mantém modelo smart quando o turno exige raciocínio profundo", () => {
    const messages = [user("sim")];
    expect(modelForTurn(messages, true)).toBe(MODELS.smart);
  });

  it.each([
    "Posso enviar a cotação para o fornecedor?",
    "Confirma o pagamento e posso prosseguir?",
    "Quer que eu cancele este pedido?",
    "Posso disparar a RFQ agora?",
  ])("mantém modelo smart para confirmação operacional: %s", (previous) => {
    const messages = [assistant(previous), user("sim")];
    expect(isQuickConversationalTurn(messages)).toBe(false);
    expect(modelForTurn(messages, false)).toBe(MODELS.smart);
  });

  it("mantém rota rápida para confirmação puramente conversacional", () => {
    const messages = [assistant("Entendi. Posso continuar explicando esse ponto?"), user("pode continuar")];
    expect(isQuickConversationalTurn(messages)).toBe(true);
    expect(modelForTurn(messages, false)).toBe(MODELS.balanced);
  });
});

/**
 * Smoke test da API TTCE (Portal Único Siscomex) — rode NO SERVIDOR de produção
 * (a rede de desenvolvimento pode bloquear domínios gov.br).
 *
 * Uso:
 *   npx tsx scripts/ttceSmoke.ts 84798999 China
 *   npx tsx scripts/ttceSmoke.ts 73170090 "Estados Unidos"
 *
 * O script imprime:
 *   1. a RESPOSTA BRUTA da API (para validar o formato real do payload);
 *   2. o resultado do parser do ttceService (o que o motor usaria).
 *
 * Se (2) fizer sentido com (1), ative a integração com TTCE_ENABLED=true no .env.
 */
import { consultarTtce, paisParaCodigoSiscomex } from "../server/services/ttceService";

const [, , ncmArg, ...paisParts] = process.argv;
const ncm = (ncmArg ?? "84798999").replace(/\D/g, "");
const pais = paisParts.join(" ") || "China";

async function main() {
  const codigoPais = paisParaCodigoSiscomex(pais);
  console.log(`\n=== TTCE smoke: NCM ${ncm} · país ${pais} (código Siscomex ${codigoPais ?? "?"}) ===\n`);

  // 1) chamada bruta — mostra o formato real da resposta
  const base = process.env.TTCE_BASE_URL || "https://portalunico.siscomex.gov.br";
  const body = {
    listaNcm: [{ ncm }],
    codigoPais,
    dataFatoGerador: new Date().toISOString().slice(0, 10),
    tipoOperacao: "I",
  };
  console.log("Request:", JSON.stringify(body));
  try {
    const resp = await fetch(`${base}/ttce/api/ext/tratamentos-tributarios/importacao`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    console.log(`\nHTTP ${resp.status} ${resp.statusText}`);
    const text = await resp.text();
    console.log("\n--- RESPOSTA BRUTA (primeiros 8000 chars) ---\n");
    console.log(text.slice(0, 8000));
  } catch (e) {
    console.error("\nFalha de rede na chamada bruta:", e);
  }

  // 2) o que o parser do motor extrairia (exige TTCE_ENABLED=true)
  process.env.TTCE_ENABLED = "true";
  const parsed = await consultarTtce({ ncm, paisOrigem: pais });
  console.log("\n--- PARSER DO MOTOR (ttceService) ---\n");
  console.log(JSON.stringify(parsed, null, 2));
  console.log(
    parsed
      ? "\n✓ Parser reconheceu o formato. Pode ativar TTCE_ENABLED=true no .env."
      : "\n✗ Parser NÃO reconheceu (ou rede falhou). Cole a resposta bruta acima no chat para eu ajustar o parser.",
  );
}

main();

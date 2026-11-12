/**
 * SMOKE TEST do Comex Stat — valida o CAMINHO DE REDE contra a fonte oficial.
 *
 * Por que existe: a matemática do dimensionamento está coberta por testes
 * unitários, mas a chamada HTTP não é exercitável no sandbox de desenvolvimento
 * (a política de egresso bloqueia api-comexstat.mdic.gov.br). Este script fecha
 * essa lacuna rodando no ambiente publicado, que tem saída de rede.
 *
 * Como rodar:
 *   pnpm tsx scripts/smoke-comexstat.ts
 *   pnpm tsx scripts/smoke-comexstat.ts 7317 7217 --anos 2024,2025
 *
 * O que ele responde:
 *   1. a fonte está no ar e responde a este servidor?
 *   2. qual das variações de payload é a que funciona hoje?
 *   3. os quatro cortes (ano, país, UF, preço por tonelada) voltam preenchidos?
 *
 * Sai com código 1 se qualquer etapa falhar — serve como gate de deploy.
 *
 * NOTA: a expansão de SH4/SH6 usa o banco (tabela de NCMs). Sem banco, informe
 * NCMs de 8 dígitos direto.
 */
// Carrega o .env ANTES de qualquer import que leia process.env. Só o entrypoint
// da aplicação (server/_core/index.ts) faz isso; rodando o script solto, sem
// esta linha o DATABASE_URL vem vazio e a expansão de NCM falha por "banco
// indisponível" — diagnóstico enganoso, já que o banco está no ar.
import "dotenv/config";

import {
  bodiesMercado,
  dimensionarMercadoComex,
  janelaDoAno,
} from "../server/services/comexStatService";
import { expandNcmPrefixes } from "../server/services/ncmService";

const URL_COMEX = "https://api-comexstat.mdic.gov.br/general";

function parseArgs(argv: string[]) {
  const anosIdx = argv.indexOf("--anos");
  const anos =
    anosIdx >= 0 && argv[anosIdx + 1]
      ? argv[anosIdx + 1].split(",").map((a) => Number(a.trim())).filter(Boolean)
      : [new Date().getFullYear() - 1];
  const ncms = argv.filter((a, i) => !a.startsWith("--") && (anosIdx < 0 || i !== anosIdx + 1));
  return { ncms: ncms.length ? ncms : ["73170010"], anos };
}

/** Descobre qual variação de payload a API aceita hoje. */
async function detectarSchema(
  ncms: string[],
  from: string,
  to: string,
): Promise<{ schema: number | null; bloqueado: boolean }> {
  const corpos = bodiesMercado("import", ncms, from, to, "pais");
  // Ordem tem que acompanhar bodiesMercado(): documentado primeiro (o que a
  // sonda confirmou funcionar), portal e legado depois como fallback.
  const rotulos = ["documentado (filters/details/metrics)", "portal (filterArray + flags)", "legado (filterList + metricList)"];
  let bloqueado = false;

  for (let i = 0; i < corpos.length; i++) {
    try {
      const resp = await fetch(URL_COMEX, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(corpos[i]),
        signal: AbortSignal.timeout(30_000),
      });
      if (!resp.ok) {
        // 403/407 em TODAS as variações não é schema errado: é proxy/firewall
        // barrando a saída. Diagnóstico diferente, correção diferente.
        if (resp.status === 403 || resp.status === 407) bloqueado = true;
        console.log(`   ${rotulos[i]}: HTTP ${resp.status}`);
        continue;
      }
      const json: any = await resp.json();
      const list = json?.data?.list ?? json?.list ?? json?.data ?? [];
      const n = Array.isArray(list) ? list.length : 0;
      console.log(`   ${rotulos[i]}: ${n} linha(s)`);
      if (n > 0) return { schema: i, bloqueado: false };
    } catch (e: any) {
      console.log(`   ${rotulos[i]}: ${e?.name === "TimeoutError" ? "timeout" : String(e?.message ?? e)}`);
    }
  }
  return { schema: null, bloqueado };
}

/**
 * MODO SONDA (--probe): descobre empiricamente qual identificador de detalhe a
 * API aceita para cada dimensão.
 *
 * Existe porque um id inválido NÃO dá erro: a API ignora o detalhamento e
 * devolve a linha agregada. O sintoma é "1 linha" — parece sucesso e é falha.
 * Só o número de linhas distingue os dois casos.
 */
/**
 * MODO SONDA (--probe): descobre qual FORMATO DE CORPO a API realmente lê.
 *
 * A sonda anterior testava ids de detalhamento e concluiu "todos ignorados".
 * A pista estava no valor: US$ 262 bilhões é o total importado pelo Brasil no
 * ano — ou seja, o FILTRO DE NCM também estava sendo descartado. Não era o id:
 * era o formato do corpo inteiro sendo ignorado, com a API respondendo 200 e
 * devolvendo o agregado nacional.
 *
 * Por isso a sonda agora varia o CORPO e usa dois critérios de veredito:
 *   - o filtro pegou? (o FOB precisa ser MUITO menor que o total nacional)
 *   - o detalhamento veio? (a linha precisa ter a coluna da dimensão)
 */
const TOTAL_BR_2024 = 262_869_606_174; // referência observada: Brasil inteiro

function corposCandidatos(ncms: string[], from: string, to: string) {
  const numericas = ncms.map((n) => Number(n));
  return [
    {
      nome: "documentado (filters/details/metrics)",
      body: {
        flow: "import",
        monthDetail: false,
        period: { from, to },
        filters: [{ filter: "ncm", values: numericas }],
        details: ["country"],
        metrics: ["metricFOB", "metricKG"],
      },
    },
    {
      nome: "documentado + ncm como string",
      body: {
        flow: "import",
        monthDetail: false,
        period: { from, to },
        filters: [{ filter: "ncm", values: ncms }],
        details: ["country"],
        metrics: ["metricFOB", "metricKG"],
      },
    },
    {
      nome: "portal (filterArray/detailDatabase)",
      body: {
        flow: "import",
        monthDetail: false,
        period: { from, to },
        filterArray: [{ idInput: "ncm", item: ncms }],
        detailDatabase: [{ id: "country", text: "País" }],
        metricFOB: true,
        metricKG: true,
        langDefault: "pt",
      },
    },
    {
      nome: "legado (filterList/metricList)",
      body: {
        flow: "import",
        monthDetail: false,
        period: { from, to },
        filterList: [{ id: "ncm", text: "NCM", item: ncms }],
        detailDatabase: [{ id: "country", text: "País" }],
        metricList: ["metricFOB", "metricKG"],
        langDefault: "pt",
      },
    },
  ];
}

async function sondarDetalhes(ncms: string[], from: string, to: string) {
  console.log(`\nSONDA DE FORMATO DE CORPO (janela ${from}..${to})`);
  console.log(`Referência: o Brasil inteiro importou ~US$ ${(TOTAL_BR_2024 / 1e9).toFixed(0)} bi em 2024.`);
  console.log("FOB perto disso = filtro de NCM IGNORADO. Muito menor = filtro aplicado.\n");

  for (const c of corposCandidatos(ncms, from, to)) {
    let saida = "";
    for (let t = 0; t < 4; t++) {
      try {
        const resp = await fetch(URL_COMEX, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(c.body),
          signal: AbortSignal.timeout(30_000),
        });
        if (resp.status === 429) {
          const ra = Number(resp.headers.get("retry-after"));
          const ms = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 5000 * (t + 1);
          console.log(`   ${c.nome}: 429 — aguardando ${Math.round(ms / 1000)}s...`);
          await new Promise((r) => setTimeout(r, Math.min(ms, 20_000)));
          continue;
        }
        if (!resp.ok) {
          // O corpo do erro costuma dizer QUAL campo a API esperava.
          const txt = (await resp.text()).slice(0, 300);
          saida = `HTTP ${resp.status} — ${txt}`;
          break;
        }

        const json: any = await resp.json();
        const list = json?.data?.list ?? json?.list ?? json?.data ?? [];
        const n = Array.isArray(list) ? list.length : 0;
        if (!n) { saida = "vazio"; break; }

        const fob = Number(String(list[0]?.metricFOB ?? 0).replace(/[^0-9.]/g, ""));
        const filtrou = fob > 0 && fob < TOTAL_BR_2024 * 0.05;
        const detalhou = n > 1 || Object.keys(list[0]).some((k) => /pais|country/i.test(k));

        saida =
          `${n} linha(s) | filtro ${filtrou ? "APLICADO" : "IGNORADO"} | ` +
          `detalhe ${detalhou ? "VEIO" : "ausente"}` +
          `\n        primeira linha: ${JSON.stringify(list[0])}`;
        break;
      } catch (e: any) {
        saida = e?.name === "TimeoutError" ? "timeout" : String(e?.message ?? e);
        break;
      }
    }
    console.log(`   ${c.nome}: ${saida || "sem resposta"}`);
    await new Promise((r) => setTimeout(r, 6000));
  }
  console.log("");
}

async function main() {
  const { ncms: pedidas, anos } = parseArgs(process.argv.slice(2));
  console.log(`\nSMOKE COMEX STAT — NCMs pedidas: ${pedidas.join(", ")} | anos: ${anos.join(", ")}\n`);

  // 1. Expansão de prefixo (precisa de banco quando vier SH4/SH6)
  let ncms = pedidas.filter((n) => n.replace(/\D/g, "").length === 8);
  const prefixos = pedidas.filter((n) => n.replace(/\D/g, "").length !== 8);
  if (prefixos.length) {
    console.log("1) Expandindo prefixos pela base de classificação...");
    try {
      const r = await expandNcmPrefixes(pedidas);
      ncms = r.ncms;
      console.log(`   ${prefixos.join(", ")} -> ${ncms.length} NCM(s) de 8 dígitos`);
      if (r.naoEncontrados.length) console.log(`   sem correspondência: ${r.naoEncontrados.join(", ")}`);
    } catch (e: any) {
      console.error(`   FALHOU ao consultar a base de NCMs: ${e?.message ?? e}`);
      if (!process.env.DATABASE_URL) {
        console.error("   DATABASE_URL não está definida — rode a partir da raiz do projeto");
        console.error("   (onde está o .env) ou exporte a variável.");
      }
      console.error("   Para testar só a rede, passe NCMs de 8 dígitos.");
      process.exit(1);
    }
  }
  if (!ncms.length) {
    console.error("\nFALHOU: nenhuma NCM de 8 dígitos para consultar.");
    if (!process.env.DATABASE_URL) {
      // Causa mais provável, e a que o diagnóstico anterior escondia: sem banco
      // a expansão volta vazia em silêncio, parecendo NCM inexistente.
      console.error("DATABASE_URL não está definida — a expansão de SH4/SH6 consulta a");
      console.error("tabela de NCMs. Rode a partir da raiz do projeto (onde está o .env),");
      console.error("ou passe NCMs de 8 dígitos para testar só a rede:");
      console.error("  pnpm tsx scripts/smoke-comexstat.ts 73170010 --anos 2024");
    } else {
      console.error(`Os códigos ${prefixos.join(", ")} não têm correspondência na tabela de NCMs.`);
      console.error("Confira se a base de classificação foi importada (Siscomex).");
    }
    process.exit(1);
  }

  // 2. Qual schema a API aceita
  const janela = janelaDoAno(anos[0], new Date());
  if (!janela) {
    console.error(`Ano ${anos[0]} ainda não tem meses consolidados na base.`);
    process.exit(1);
  }

  if (process.argv.includes("--probe")) {
    await sondarDetalhes(ncms, janela.from, janela.to);
    return;
  }
  console.log(`\n2) Detectando o schema aceito (janela ${janela.from}..${janela.to})...`);
  const { schema, bloqueado } = await detectarSchema(ncms, janela.from, janela.to);
  if (schema === null) {
    if (bloqueado) {
      console.error("\nFALHOU: saída de rede BLOQUEADA (403/407 em todas as variações).");
      console.error("Não é o schema nem a fonte: é proxy/firewall barrando o egresso.");
      console.error("Libere api-comexstat.mdic.gov.br para este servidor e rode de novo.");
    } else {
      console.error("\nFALHOU: nenhuma variação de payload retornou dados.");
      console.error("A fonte pode estar fora do ar, ou o schema mudou de novo —");
      console.error("nesse caso, adicione a nova variação em bodiesMercado().");
    }
    process.exit(1);
  }
  console.log(`   OK — variação #${schema + 1} é a que funciona hoje.`);

  // 3. Dimensionamento completo
  console.log("\n3) Dimensionamento completo (ano + país + UF + preço/tonelada)...");
  const dados = await dimensionarMercadoComex({
    ncms,
    anos,
    fluxo: "import",
    paisesDestaque: ["China", "Paraguai"],
    ufsDestaque: ["Santa Catarina"],
    topN: 10,
  });

  if (!dados.disponivel) {
    console.error(`   FALHOU: ${dados.erro}`);
    process.exit(1);
  }

  let problemas = 0;

  // Ano sem NENHUM dado (país e UF vazios) some do array `anos` por design —
  // mas isso não pode passar em silêncio aqui, senão o gate de deploy aprova
  // uma consulta que perdeu um ano inteiro sem avisar ninguém.
  if (dados.anosSemDado.length) {
    console.error(`\n   ERRO: sem NENHUM dado para o(s) ano(s) ${dados.anosSemDado.join(", ")}.`);
    problemas += dados.anosSemDado.length;
  }

  for (const a of dados.anos) {
    const marca = a.parcial ? `PARCIAL (${a.mesesCobertos}m)` : "cheio";
    console.log(
      `\n   ${a.ano} [${marca}]: ${a.toneladas.toFixed(0)} t · US$ ${a.fobUsd.toLocaleString("pt-BR")} · ` +
      `${a.precoMedioUsdT?.toFixed(0) ?? "n/d"} US$/t`,
    );
    console.log(`     países no ranking: ${a.porPais.length}/${a.totalPaises}`);
    for (const p of a.porPais.slice(0, 3)) {
      console.log(`       ${p.posicao}. ${p.chave}: ${p.sharePct.toFixed(1)}% · ${p.precoMedioUsdT?.toFixed(0) ?? "n/d"} US$/t`);
    }
    console.log(`     UFs no ranking: ${a.porUf.length}/${a.totalUfs}`);
    for (const u of a.porUf.slice(0, 3)) {
      console.log(`       ${u.posicao}. ${u.chave}: ${u.sharePct.toFixed(1)}%`);
    }

    // O corte por UF é o que mais some quando o schema muda — checagem explícita.
    if (!a.porPais.length) { console.error(`     ERRO: corte por país vazio em ${a.ano}`); problemas++; }
    if (!a.porUf.length) { console.error(`     ERRO: corte por UF vazio em ${a.ano}`); problemas++; }
    if (a.precoMedioUsdT == null) { console.error(`     ERRO: preço por tonelada nulo em ${a.ano}`); problemas++; }
  }

  if (problemas) {
    console.error(`\nFALHOU: ${problemas} corte(s) vieram vazios — dimensionamento incompleto.`);
    process.exit(1);
  }

  console.log("\nOK — os quatro cortes voltaram preenchidos. Caminho de rede validado.\n");
}

main().catch((e) => {
  console.error("\nERRO inesperado:", e);
  process.exit(1);
});

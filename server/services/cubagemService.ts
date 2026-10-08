/**
 * cubagemService — cálculo de cubagem / ocupação de contêiner.
 *
 * Dado o tamanho (C×L×A) e o peso de uma unidade/caixa, estima quantas cabem
 * em 20' GP, 40' GP e 40' HC, considerando VOLUME útil e PESO (payload), e
 * apontando qual fator é o limitante. Estimativa por volume/peso — não resolve
 * empilhamento/orientação exata das caixas.
 */

export interface ContainerSpec {
  code: string;
  label: string;
  usableCbm: number;  // volume útil aproveitável (m³)
  payloadKg: number;  // carga máxima (kg)
}

/** Referências de mercado (ajustáveis). Volume útil já desconta estiva. */
export const CONTAINERS: ContainerSpec[] = [
  { code: "20GP", label: "20' GP", usableCbm: 28, payloadKg: 28000 },
  { code: "40GP", label: "40' GP", usableCbm: 58, payloadKg: 26700 },
  { code: "40HC", label: "40' HC", usableCbm: 68, payloadKg: 26500 },
];

export interface CubagemInput {
  comprimentoCm: number;
  larguraCm: number;
  alturaCm: number;
  pesoKg: number;
  /** Total de unidades a embarcar (opcional) — habilita "quantos contêineres". */
  quantidade?: number;
}

export interface ContainerFit {
  code: string;
  label: string;
  cabe: number;                 // unidades que cabem (mínimo entre volume e peso)
  limitadoPor: "volume" | "peso" | "empate";
  porVolume: number;
  porPeso: number;
  ocupacaoVolumePct: number;    // ocupação do volume útil pelas unidades que cabem
  ocupacaoPesoPct: number;      // ocupação do payload pelas unidades que cabem
  containeresNecessarios?: number; // se quantidade informada
}

export interface CubagemResult {
  volumeUnitarioCbm: number;
  pesoUnitarioKg: number;
  quantidade?: number;
  volumeTotalCbm?: number;
  pesoTotalKg?: number;
  containers: ContainerFit[];
}

function round(n: number, casas = 4): number {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

export function calcularCubagem(input: CubagemInput): CubagemResult {
  const { comprimentoCm, larguraCm, alturaCm, pesoKg, quantidade } = input;
  if ([comprimentoCm, larguraCm, alturaCm].some((d) => !(d > 0))) {
    throw new Error("Dimensões (C×L×A em cm) devem ser maiores que zero.");
  }
  if (!(pesoKg > 0)) {
    throw new Error("Peso unitário (kg) deve ser maior que zero.");
  }

  // cm³ → m³
  const volumeUnitarioCbm = (comprimentoCm * larguraCm * alturaCm) / 1_000_000;

  const containers: ContainerFit[] = CONTAINERS.map((c) => {
    const porVolume = Math.floor(c.usableCbm / volumeUnitarioCbm);
    const porPeso = Math.floor(c.payloadKg / pesoKg);
    const cabe = Math.max(0, Math.min(porVolume, porPeso));
    const limitadoPor: ContainerFit["limitadoPor"] =
      porVolume === porPeso ? "empate" : porVolume < porPeso ? "volume" : "peso";
    const fit: ContainerFit = {
      code: c.code,
      label: c.label,
      cabe,
      limitadoPor,
      porVolume,
      porPeso,
      ocupacaoVolumePct: round((cabe * volumeUnitarioCbm) / c.usableCbm * 100, 1),
      ocupacaoPesoPct: round((cabe * pesoKg) / c.payloadKg * 100, 1),
    };
    if (quantidade && quantidade > 0 && cabe > 0) {
      fit.containeresNecessarios = Math.ceil(quantidade / cabe);
    }
    return fit;
  });

  return {
    volumeUnitarioCbm: round(volumeUnitarioCbm, 4),
    pesoUnitarioKg: pesoKg,
    quantidade: quantidade && quantidade > 0 ? quantidade : undefined,
    volumeTotalCbm: quantidade && quantidade > 0 ? round(volumeUnitarioCbm * quantidade, 3) : undefined,
    pesoTotalKg: quantidade && quantidade > 0 ? round(pesoKg * quantidade, 2) : undefined,
    containers,
  };
}

import { describe, it, expect } from "vitest";
import { calcularCubagem, CONTAINERS } from "./cubagemService";

describe("calcularCubagem", () => {
  it("calcula volume unitário e quantos cabem por volume/peso", () => {
    // Caixa 100×100×100 cm = 1 m³; 10 kg.
    const r = calcularCubagem({ comprimentoCm: 100, larguraCm: 100, alturaCm: 100, pesoKg: 10 });
    expect(r.volumeUnitarioCbm).toBe(1);

    const c40hc = r.containers.find((c) => c.code === "40HC")!;
    // 40HC: 68 m³ úteis / 1 m³ = 68 por volume; 26500/10 = 2650 por peso → limita volume.
    expect(c40hc.porVolume).toBe(68);
    expect(c40hc.porPeso).toBe(2650);
    expect(c40hc.cabe).toBe(68);
    expect(c40hc.limitadoPor).toBe("volume");
  });

  it("identifica quando o PESO é o fator limitante", () => {
    // Caixa pequena e densa: 50×50×50 = 0,125 m³; 300 kg.
    const r = calcularCubagem({ comprimentoCm: 50, larguraCm: 50, alturaCm: 50, pesoKg: 300 });
    const c20 = r.containers.find((c) => c.code === "20GP")!;
    // 20GP: 28/0,125 = 224 por volume; 28000/300 = 93 por peso → limita peso.
    expect(c20.porVolume).toBe(224);
    expect(c20.porPeso).toBe(93);
    expect(c20.cabe).toBe(93);
    expect(c20.limitadoPor).toBe("peso");
  });

  it("calcula contêineres necessários quando há quantidade", () => {
    const r = calcularCubagem({ comprimentoCm: 100, larguraCm: 100, alturaCm: 100, pesoKg: 10, quantidade: 150 });
    const c40hc = r.containers.find((c) => c.code === "40HC")!;
    // cabem 68 por 40HC → 150/68 = 2,2 → 3 contêineres.
    expect(c40hc.containeresNecessarios).toBe(3);
    expect(r.volumeTotalCbm).toBe(150);
    expect(r.pesoTotalKg).toBe(1500);
  });

  it("rejeita dimensões/peso inválidos", () => {
    expect(() => calcularCubagem({ comprimentoCm: 0, larguraCm: 10, alturaCm: 10, pesoKg: 5 })).toThrow();
    expect(() => calcularCubagem({ comprimentoCm: 10, larguraCm: 10, alturaCm: 10, pesoKg: 0 })).toThrow();
  });

  it("tem os 3 contêineres padrão", () => {
    expect(CONTAINERS.map((c) => c.code)).toEqual(["20GP", "40GP", "40HC"]);
  });
});

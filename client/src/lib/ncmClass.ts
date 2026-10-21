/**
 * Classificação de produtos por CAPÍTULO da NCM (2 primeiros dígitos).
 *
 * A NCM/SH organiza toda mercadoria em capítulos — a taxonomia natural e
 * universal para importação. Usamos o capítulo como CLASSE macro confiável
 * quando o produto não tem uma classe curada compartilhada (evita que o filtro
 * de "classe" vire uma lista de nomes de produtos).
 */

/** Capítulo NCM (2 dígitos) → rótulo curto em PT-BR. */
const NCM_CHAPTERS: Record<string, string> = {
  "01": "Animais vivos", "02": "Carnes", "03": "Peixes e crustáceos",
  "04": "Laticínios, ovos e mel", "05": "Produtos de origem animal",
  "06": "Plantas e flores", "07": "Produtos hortícolas", "08": "Frutas",
  "09": "Café, chá e especiarias", "10": "Cereais", "11": "Produtos de moagem",
  "12": "Sementes e grãos", "13": "Gomas e resinas", "14": "Matérias vegetais",
  "15": "Gorduras e óleos", "16": "Preparações de carne/peixe", "17": "Açúcares",
  "18": "Cacau", "19": "Preparações de cereais", "20": "Preparações de hortícolas/frutas",
  "21": "Preparações alimentícias", "22": "Bebidas", "23": "Rações e resíduos",
  "24": "Tabaco", "25": "Sal, enxofre e pedras", "26": "Minérios",
  "27": "Combustíveis minerais", "28": "Químicos inorgânicos", "29": "Químicos orgânicos",
  "30": "Produtos farmacêuticos", "31": "Adubos e fertilizantes", "32": "Tintas e pigmentos",
  "33": "Cosméticos e óleos essenciais", "34": "Sabões, ceras e lubrificantes",
  "35": "Colas e albuminoides", "36": "Explosivos e fósforos", "37": "Produtos fotográficos",
  "38": "Químicos diversos", "39": "Plásticos e obras", "40": "Borracha e obras",
  "41": "Peles e couros", "42": "Obras de couro", "43": "Peles com pelo",
  "44": "Madeira e obras", "45": "Cortiça", "46": "Obras de espartaria",
  "47": "Pastas de celulose", "48": "Papel e cartão", "49": "Livros e gráficos",
  "50": "Seda", "51": "Lã e pelos", "52": "Algodão", "53": "Fibras têxteis vegetais",
  "54": "Filamentos sintéticos", "55": "Fibras sintéticas", "56": "Cordas e não-tecidos",
  "57": "Tapetes", "58": "Tecidos especiais", "59": "Tecidos impregnados",
  "60": "Tecidos de malha", "61": "Vestuário de malha", "62": "Vestuário (exceto malha)",
  "63": "Artefatos têxteis", "64": "Calçados", "65": "Chapéus", "66": "Guarda-chuvas",
  "67": "Penas e flores artificiais", "68": "Obras de pedra e cimento", "69": "Produtos cerâmicos",
  "70": "Vidro e obras", "71": "Pedras preciosas e joias", "72": "Ferro fundido e aço",
  "73": "Obras de ferro ou aço", "74": "Cobre e obras", "75": "Níquel e obras",
  "76": "Alumínio e obras", "78": "Chumbo e obras", "79": "Zinco e obras",
  "80": "Estanho e obras", "81": "Outros metais comuns", "82": "Ferramentas e talheres",
  "83": "Obras diversas de metal", "84": "Máquinas e equipamentos", "85": "Material elétrico",
  "86": "Material ferroviário", "87": "Veículos e tratores", "88": "Aeronaves",
  "89": "Embarcações", "90": "Óptica e precisão", "91": "Relojoaria",
  "92": "Instrumentos musicais", "93": "Armas e munições", "94": "Móveis e iluminação",
  "95": "Brinquedos e esporte", "96": "Obras diversas", "97": "Objetos de arte",
};

/** Rótulo da classe pelo capítulo da NCM (ou null se NCM ausente/inválida). */
export function classeFromNcm(ncmCode?: string | null): string | null {
  if (!ncmCode) return null;
  const digits = ncmCode.replace(/\D/g, "");
  if (digits.length < 2 || digits === "00000000") return null;
  const cap = digits.slice(0, 2);
  return NCM_CHAPTERS[cap] ?? null;
}

export const SEM_CLASSE = "Sem classificação";

/**
 * Classe efetiva de um produto para organização/busca:
 *  1) classe CURADA se ela for uma classe real (compartilhada por ≥2 produtos);
 *  2) senão, o capítulo da NCM (taxonomia universal);
 *  3) senão, "Sem classificação".
 *
 * `classesReais` é o conjunto (em minúsculas) de classes curadas consideradas
 * genuínas — calcule uma vez sobre toda a base (ver classesCompartilhadas).
 */
export function classeEfetiva(
  p: { classe?: string | null; ncmCode?: string | null },
  classesReais: Set<string>,
): string {
  const curada = (p.classe || "").trim();
  if (curada && classesReais.has(curada.toLowerCase())) return curada;
  return classeFromNcm(p.ncmCode) ?? SEM_CLASSE;
}

/**
 * Conjunto de classes curadas GENUÍNAS: as que aparecem em ≥2 produtos.
 * Classes que aparecem só uma vez costumam ser nomes de produto — descartadas
 * do facet (o produto cai para o capítulo NCM).
 */
export function classesCompartilhadas(
  produtos: Array<{ classe?: string | null }>,
): Set<string> {
  const contagem = new Map<string, number>();
  for (const p of produtos) {
    const c = (p.classe || "").trim().toLowerCase();
    if (c) contagem.set(c, (contagem.get(c) ?? 0) + 1);
  }
  const reais = new Set<string>();
  for (const [c, n] of Array.from(contagem.entries())) if (n >= 2) reais.add(c);
  return reais;
}

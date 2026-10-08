/**
 * RFQ Create - Constantes e tipos compartilhados entre os steps
 */
import { z } from "zod";
import { Package, MapPin, User, CheckCircle } from "lucide-react";

// ============================================================
// SCHEMAS
// ============================================================

export const rfqItemSchema = z.object({
  productName: z.string().min(2, "Nome do produto é obrigatório"),
  productNameEn: z.string().optional(),
  description: z.string().optional(),
  ncmCode: z.string().optional(),
  ncmSuggested: z.string().optional(),
  ncmConfidence: z.number().optional(),
  qualityStandard: z.string().optional(),
  quantity: z.number().positive("Quantidade deve ser positiva"),
  unit: z.string().default("UN").transform(v => v || "UN"),
  targetUnitPriceCents: z.number().optional(),
  weightKgPerUnit: z.number().optional(),
  certifications: z.array(z.string()).optional(),
  sampleRequired: z.boolean().default(false),
});

export const rfqFormSchema = z.object({
  title: z.string().min(3, "Título deve ter pelo menos 3 caracteres"),
  importPurpose: z.enum(["resale", "own_use", "industrialization", "temporary"]),
  requesterType: z.enum(["self", "client"]),
  clientName: z.string().optional(),
  clientEmail: z.string().optional(),
  clientPhone: z.string().optional(),
  clientCompany: z.string().optional(),
  clientCnpj: z.string().optional(),
  clientState: z.string().optional(),
  items: z.array(rfqItemSchema).min(1),
  preferredCountries: z.array(z.string()).optional(),
  preferredIncoterm: z.string().default("FOB"),
  destinationState: z.string().default("SC"),
  destinationPort: z.string().optional(),
  urgency: z.enum(["standard", "fast", "urgent"]),
  budgetMaxCents: z.number().optional(),
  currency: z.string().default("USD"),
  notes: z.string().optional(),
});

export type RfqFormData = z.infer<typeof rfqFormSchema>;

// ============================================================
// CONSTANTS
// ============================================================

export const STEPS = [
  { id: 1, title: "Produtos", icon: Package, description: "O que você quer importar?" },
  { id: 2, title: "Destino", icon: MapPin, description: "Para onde vai?" },
  { id: 3, title: "Cliente", icon: User, description: "Quem está comprando?" },
  { id: 4, title: "Revisão", icon: CheckCircle, description: "Confirme e envie" },
];

export const COUNTRIES = [
  { code: "CN", name: "China", flag: "🇨🇳" },
  { code: "IN", name: "Índia", flag: "🇮🇳" },
  { code: "TR", name: "Turquia", flag: "🇹🇷" },
  { code: "VN", name: "Vietnã", flag: "🇻🇳" },
  { code: "TH", name: "Tailândia", flag: "🇹🇭" },
  { code: "KR", name: "Coreia do Sul", flag: "🇰🇷" },
  { code: "DE", name: "Alemanha", flag: "🇩🇪" },
  { code: "IT", name: "Itália", flag: "🇮🇹" },
  { code: "US", name: "Estados Unidos", flag: "🇺🇸" },
];

export const STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export const PORTS = [
  { name: "Itajaí/Navegantes", state: "SC" },
  { name: "Santos", state: "SP" },
  { name: "Paranaguá", state: "PR" },
  { name: "Vitória", state: "ES" },
  { name: "Rio Grande", state: "RS" },
  { name: "Suape", state: "PE" },
  { name: "Manaus", state: "AM" },
];

export const UNITS = ["UN", "KG", "TON", "M", "M²", "M³", "CX", "PCT", "PAR", "ROL", "FD"];

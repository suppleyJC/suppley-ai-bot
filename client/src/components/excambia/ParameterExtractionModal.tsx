/**
 * ParameterExtractionModal — coleta parâmetros de cálculo antes de montar_calculo.
 *
 * Solicita:
 * - regime tributário (Lucro Real, Presumido, Simples Nacional)
 * - TTD fase (primeiros 36 meses / após 36 meses) — se SC
 * - câmbio (PTAX oficial vs taxa fixa)
 * - detalhes de frete (modal logístico, custo)
 *
 * Retorna um resumo que o usuário pode confirmar ou editar antes de enviar para o cálculo.
 */
import React, { useState } from "react";
import { X, Check } from "lucide-react";

interface Parameters {
  regime?: "lucro_real" | "lucro_presumido" | "simples_nacional";
  estado?: string;
  ttdPhase?: "primeiros_36m" | "apos_36m";
  cambio?: "ptax_oficial" | "taxa_fixa";
  taxaFixa?: number;
  modal?: "maritimo" | "aereo" | "rodoviario" | "ferroviario";
  frete?: number;
  seguro?: number;
}

interface ParameterExtractionModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (params: Parameters) => void;
  prefilledParams?: Partial<Parameters>;
}

export default function ParameterExtractionModal({
  open,
  onClose,
  onSubmit,
  prefilledParams,
}: ParameterExtractionModalProps) {
  const [regime, setRegime] = useState<string>(
    prefilledParams?.regime || "lucro_real"
  );
  const [estado, setEstado] = useState<string>(prefilledParams?.estado || "SC");
  const [ttdPhase, setTtdPhase] = useState<string>(
    prefilledParams?.ttdPhase || "primeiros_36m"
  );
  const [cambio, setCambio] = useState<string>(
    prefilledParams?.cambio || "ptax_oficial"
  );
  const [taxaFixa, setTaxaFixa] = useState<string>(
    prefilledParams?.taxaFixa?.toString() || ""
  );
  const [modal, setModal] = useState<string>(
    prefilledParams?.modal || "maritimo"
  );
  const [frete, setFrete] = useState<string>(
    prefilledParams?.frete?.toString() || ""
  );
  const [seguro, setSeguro] = useState<string>(
    prefilledParams?.seguro?.toString() || ""
  );
  const [expanded, setExpanded] = useState<string>("regime");

  if (!open) return null;

  function handleSubmit() {
    const params: Parameters = {
      regime: regime as "lucro_real" | "lucro_presumido" | "simples_nacional",
      estado,
      ttdPhase: ttdPhase as "primeiros_36m" | "apos_36m",
      cambio: cambio as "ptax_oficial" | "taxa_fixa",
      taxaFixa: taxaFixa ? parseFloat(taxaFixa) : undefined,
      modal: modal as "maritimo" | "aereo" | "rodoviario" | "ferroviario",
      frete: frete ? parseFloat(frete) : undefined,
      seguro: seguro ? parseFloat(seguro) : undefined,
    };
    onSubmit(params);
  }

  const isSc = estado.toUpperCase() === "SC";
  const showTtd = isSc && regime !== "simples_nacional";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Parâmetros de Cálculo
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* conteúdo */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-4">
          {/* REGIME TRIBUTÁRIO */}
          <div className="rounded-lg border border-slate-150 bg-slate-50 p-4">
            <button
              onClick={() =>
                setExpanded(expanded === "regime" ? "" : "regime")
              }
              className="w-full flex items-center justify-between text-left font-semibold text-slate-900 hover:text-violet-600"
            >
              Regime Tributário
              <span className="text-xs text-slate-500">
                {regime === "lucro_real"
                  ? "Lucro Real"
                  : regime === "lucro_presumido"
                    ? "Lucro Presumido"
                    : "Simples Nacional"}
              </span>
            </button>
            {expanded === "regime" && (
              <div className="mt-3 space-y-2">
                {[
                  {
                    value: "lucro_real",
                    label: "Lucro Real",
                    desc: "Imposto sobre lucro; PIS/COFINS por alíquota",
                  },
                  {
                    value: "lucro_presumido",
                    label: "Lucro Presumido",
                    desc: "Imposto sobre presunção; PIS/COFINS cumulativos",
                  },
                  {
                    value: "simples_nacional",
                    label: "Simples Nacional",
                    desc: "Regime unificado; sem TTD 409",
                  },
                ].map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-slate-100"
                  >
                    <input
                      type="radio"
                      name="regime"
                      value={option.value}
                      checked={regime === option.value}
                      onChange={(e) => setRegime(e.target.value)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium text-slate-900">
                        {option.label}
                      </div>
                      <div className="text-xs text-slate-500">{option.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* ESTADO DE DESTINO */}
          <div className="rounded-lg border border-slate-150 bg-slate-50 p-4">
            <button
              onClick={() =>
                setExpanded(expanded === "estado" ? "" : "estado")
              }
              className="w-full flex items-center justify-between text-left font-semibold text-slate-900 hover:text-violet-600"
            >
              Estado de Destino
              <span className="text-xs text-slate-500">{estado}</span>
            </button>
            {expanded === "estado" && (
              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  value={estado}
                  onChange={(e) => setEstado(e.target.value.toUpperCase())}
                  placeholder="Ex.: SC, SP, MG"
                  maxLength={2}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none"
                />
                <p className="text-xs text-slate-500">
                  {isSc
                    ? "✓ SC tem benefício TTD 409 (ICMS antecipado)"
                    : "Outros estados pagam ICMS de importação integral"}
                </p>
              </div>
            )}
          </div>

          {/* TTD PHASE (só se SC e não Simples) */}
          {showTtd && (
            <div className="rounded-lg border border-slate-150 bg-slate-50 p-4">
              <button
                onClick={() =>
                  setExpanded(expanded === "ttd" ? "" : "ttd")
                }
                className="w-full flex items-center justify-between text-left font-semibold text-slate-900 hover:text-violet-600"
              >
                Fase TTD 409
                <span className="text-xs text-slate-500">
                  {ttdPhase === "primeiros_36m"
                    ? "Primeiros 36m"
                    : "Após 36m"}
                </span>
              </button>
              {expanded === "ttd" && (
                <div className="mt-3 space-y-2">
                  {[
                    {
                      value: "primeiros_36m",
                      label: "Primeiros 36 meses",
                      desc: "ICMS antecipado 2,6%",
                    },
                    {
                      value: "apos_36m",
                      label: "Após 36 meses",
                      desc: "ICMS antecipado 1,0%",
                    },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-slate-100"
                    >
                      <input
                        type="radio"
                        name="ttd"
                        value={option.value}
                        checked={ttdPhase === option.value}
                        onChange={(e) => setTtdPhase(e.target.value)}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium text-slate-900">
                          {option.label}
                        </div>
                        <div className="text-xs text-slate-500">{option.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CÂMBIO */}
          <div className="rounded-lg border border-slate-150 bg-slate-50 p-4">
            <button
              onClick={() =>
                setExpanded(expanded === "cambio" ? "" : "cambio")
              }
              className="w-full flex items-center justify-between text-left font-semibold text-slate-900 hover:text-violet-600"
            >
              Câmbio
              <span className="text-xs text-slate-500">
                {cambio === "ptax_oficial" ? "PTAX Oficial" : "Taxa Fixa"}
              </span>
            </button>
            {expanded === "cambio" && (
              <div className="mt-3 space-y-3">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-slate-100">
                  <input
                    type="radio"
                    name="cambio"
                    value="ptax_oficial"
                    checked={cambio === "ptax_oficial"}
                    onChange={(e) => setCambio(e.target.value)}
                  />
                  <div>
                    <div className="font-medium text-slate-900">
                      PTAX Oficial (BCB)
                    </div>
                    <div className="text-xs text-slate-500">
                      Taxa do Banco Central
                    </div>
                  </div>
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-slate-100">
                  <input
                    type="radio"
                    name="cambio"
                    value="taxa_fixa"
                    checked={cambio === "taxa_fixa"}
                    onChange={(e) => setCambio(e.target.value)}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">Taxa Fixa</div>
                    {cambio === "taxa_fixa" && (
                      <input
                        type="number"
                        step="0.01"
                        value={taxaFixa}
                        onChange={(e) => setTaxaFixa(e.target.value)}
                        placeholder="Ex.: 5.35"
                        className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none"
                      />
                    )}
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* MODAL LOGÍSTICO */}
          <div className="rounded-lg border border-slate-150 bg-slate-50 p-4">
            <button
              onClick={() =>
                setExpanded(expanded === "modal" ? "" : "modal")
              }
              className="w-full flex items-center justify-between text-left font-semibold text-slate-900 hover:text-violet-600"
            >
              Modal Logístico
              <span className="text-xs text-slate-500 capitalize">{modal}</span>
            </button>
            {expanded === "modal" && (
              <div className="mt-3 space-y-2">
                {[
                  { value: "maritimo", label: "Marítimo", desc: "Navio (AFRMM 25%)" },
                  { value: "aereo", label: "Aéreo", desc: "Avião (sem AFRMM)" },
                  { value: "rodoviario", label: "Rodoviário", desc: "Caminhão (sem AFRMM)" },
                  { value: "ferroviario", label: "Ferroviário", desc: "Trem (sem AFRMM)" },
                ].map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-slate-100"
                  >
                    <input
                      type="radio"
                      name="modal"
                      value={option.value}
                      checked={modal === option.value}
                      onChange={(e) => setModal(e.target.value)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium text-slate-900">
                        {option.label}
                      </div>
                      <div className="text-xs text-slate-500">{option.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* FRETE */}
          <div className="rounded-lg border border-slate-150 bg-slate-50 p-4">
            <button
              onClick={() =>
                setExpanded(expanded === "frete" ? "" : "frete")
              }
              className="w-full flex items-center justify-between text-left font-semibold text-slate-900 hover:text-violet-600"
            >
              Frete Internacional
              <span className="text-xs text-slate-500">
                {frete ? `USD ${frete}` : "Opcional"}
              </span>
            </button>
            {expanded === "frete" && (
              <div className="mt-3 space-y-2">
                <input
                  type="number"
                  step="0.01"
                  value={frete}
                  onChange={(e) => setFrete(e.target.value)}
                  placeholder="Frete em USD"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* SEGURO */}
          <div className="rounded-lg border border-slate-150 bg-slate-50 p-4">
            <button
              onClick={() =>
                setExpanded(expanded === "seguro" ? "" : "seguro")
              }
              className="w-full flex items-center justify-between text-left font-semibold text-slate-900 hover:text-violet-600"
            >
              Seguro
              <span className="text-xs text-slate-500">
                {seguro ? `USD ${seguro}` : "Opcional"}
              </span>
            </button>
            {expanded === "seguro" && (
              <div className="mt-3 space-y-2">
                <input
                  type="number"
                  step="0.01"
                  value={seguro}
                  onChange={(e) => setSeguro(e.target.value)}
                  placeholder="Seguro em USD"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* footer */}
        <div className="flex gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
          >
            <Check className="h-4 w-4" />
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

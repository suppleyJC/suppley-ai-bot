import React, { useState } from "react";
import { trpc } from "../lib/trpc";

export default function Diagnostics() {
  const [loading, setLoading] = useState(false);
  const utils = trpc.useUtils();

  const ncmDiagnose = trpc.ncm.diagnose.useQuery(undefined, {
    enabled: false,
  });

  const ncmClearCache = trpc.ncm.clearCache.useMutation();

  const handleDiagnose = async () => {
    setLoading(true);
    try {
      await utils.ncm.diagnose.refetch();
    } finally {
      setLoading(false);
    }
  };

  const handleClearCache = async () => {
    try {
      await ncmClearCache.mutateAsync();
      alert("Cache limpo com sucesso");
    } catch (error) {
      alert(`Erro: ${error}`);
    }
  };

  const diagnosis = ncmDiagnose.data;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          🔍 Diagnóstico do Sistema
        </h1>
        <p className="text-gray-600 mb-8">
          Verifique o estado da base de dados e alíquotas NCM
        </p>

        {/* Status Card */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">
            Base de Dados NCM
          </h2>

          {diagnosis ? (
            <div className="space-y-6">
              {/* Overall Status */}
              <div
                className={`p-4 rounded-lg ${
                  diagnosis.ok ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  {diagnosis.ok ? (
                    <>
                      <span className="text-3xl">✅</span>
                      <div>
                        <p className="font-semibold text-green-900">
                          Banco Conectado
                        </p>
                        <p className="text-green-700">{diagnosis.message}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-3xl">❌</span>
                      <div>
                        <p className="font-semibold text-red-900">Erro</p>
                        <p className="text-red-700">{diagnosis.message}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Total NCMs */}
              {diagnosis.total > 0 && (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="text-sm text-gray-600">Total de NCMs Carregados</p>
                  <p className="text-3xl font-bold text-blue-600">
                    {diagnosis.total.toLocaleString()}
                  </p>
                  {diagnosis.total >= 1000 ? (
                    <p className="text-sm text-blue-600 mt-2">✅ Volume adequado</p>
                  ) : (
                    <p className="text-sm text-orange-600 mt-2">
                      ⚠️ Menos de 1000 NCMs — possível que dados não foram carregados
                    </p>
                  )}
                </div>
              )}

              {/* NCM 73084000 Specific Check */}
              {diagnosis.ncm73084000 ? (
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <p className="font-semibold text-gray-800 mb-3">
                    ✅ NCM 7308.40.00 (Escoras de Aço) Encontrado
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Alíquota II (TEC)</p>
                      <p className="text-lg font-bold text-green-700">
                        {diagnosis.ncm73084000.iiRate / 100}%
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Alíquota IPI (TIPI)</p>
                      <p className="text-lg font-bold text-green-700">
                        {diagnosis.ncm73084000.ipiRate / 100}%
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-gray-600">Descrição</p>
                      <p className="text-sm text-gray-700">
                        {diagnosis.ncm73084000.description}...
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-gray-600">Fonte</p>
                      <p className="text-sm text-gray-700">
                        {diagnosis.ncm73084000.notes}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-green-600 mt-4">
                    ✨ Dados reais de alíquota carregados. Limpe o cache para atualizar.
                  </p>
                </div>
              ) : (
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                  <p className="font-semibold text-gray-800 mb-3">
                    ⚠️ NCM 7308.40.00 Não Encontrado
                  </p>
                  <p className="text-orange-700">
                    A base de dados não contém dados para este NCM específico.
                    Isso pode significar que:
                  </p>
                  <ul className="list-disc list-inside text-orange-600 mt-2 space-y-1">
                    <li>O script de carga não foi executado</li>
                    <li>A transação SQL não foi commitada</li>
                    <li>O banco de dados foi resetado</li>
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-600">
                Clique no botão abaixo para diagnosticar o banco de dados
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4 mt-8">
            <button
              onClick={handleDiagnose}
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition"
            >
              {loading ? "Diagnosticando..." : "🔄 Diagnosticar Banco"}
            </button>

            <button
              onClick={handleClearCache}
              disabled={ncmClearCache.isPending}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition"
            >
              {ncmClearCache.isPending ? "Limpando..." : "🗑️ Limpar Cache"}
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h3 className="text-xl font-bold text-gray-800 mb-4">
            O que fazer se o diagnóstico falhar?
          </h3>
          <ol className="space-y-4 text-gray-700">
            <li className="flex gap-4">
              <span className="font-bold text-blue-600 flex-shrink-0">1.</span>
              <span>
                Se <strong>total &lt; 1000</strong>: Execute o script de carga
                no servidor com <code className="bg-gray-100 px-2 py-1 rounded">
                  bash scripts/load-ncm.sh
                </code>
              </span>
            </li>
            <li className="flex gap-4">
              <span className="font-bold text-blue-600 flex-shrink-0">2.</span>
              <span>
                Clique em <strong>Limpar Cache</strong> para remover dados em
                memória
              </span>
            </li>
            <li className="flex gap-4">
              <span className="font-bold text-blue-600 flex-shrink-0">3.</span>
              <span>
                Reinicie o container:{" "}
                <code className="bg-gray-100 px-2 py-1 rounded">
                  docker restart suppley_app
                </code>
              </span>
            </li>
            <li className="flex gap-4">
              <span className="font-bold text-blue-600 flex-shrink-0">4.</span>
              <span>
                Clique novamente em <strong>Diagnosticar Banco</strong> para
                verificar
              </span>
            </li>
          </ol>
          <p className="text-sm text-gray-600 mt-6">
            📖 Para mais detalhes, consulte{" "}
            <strong>DIAGNOSTIC_NCM.md</strong> na raiz do projeto.
          </p>
        </div>
      </div>
    </div>
  );
}

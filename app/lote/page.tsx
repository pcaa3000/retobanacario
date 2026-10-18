"use client";

import { useState } from "react";
import Papa from "papaparse";
import { COLOR_TIPO, ETIQUETA_TIPO } from "@/lib/format";
import type { FilaResultado } from "@/lib/csv";
import type { Resumen } from "@/lib/types";

export default function LotePage() {
  const [nombre, setNombre] = useState<string>("");
  const [filas, setFilas] = useState<FilaResultado[]>([]);
  const [csv, setCsv] = useState<string>("");
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [fuente, setFuente] = useState<string>("");
  const [aviso, setAviso] = useState<string>("");
  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function procesar(archivo: File) {
    setError(null);
    setFilas([]);
    setCsv("");
    setResumen(null);
    setFuente("");
    setAviso("");
    setNombre(archivo.name.replace(/\.csv$/i, ""));
    setProcesando(true);
    setProgreso("Leyendo archivo…");
    try {
      const texto = await archivo.text();
      const n = Papa.parse(texto, { header: true, skipEmptyLines: true }).data.length;
      setProgreso(`Procesando ${n} mensajes en orden…`);
      const res = await fetch("/api/lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: texto }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setFilas(data.filas);
      setCsv(data.csv);
      setResumen(data.resumen);
      setFuente(data.fuente ?? "");
      setAviso(data.aviso ?? "");
      setProgreso("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      setProgreso("");
    } finally {
      setProcesando(false);
    }
  }

  function descargar() {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "resultados_equipo.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto max-w-4xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Modo lote — entrega del reto</h1>
          <p className="text-sm text-gray-600">
            Sube <code>set_oculto.csv</code> (id_mensaje,dia,mensaje). Se procesan los
            mensajes en orden, como una sola semana, y se genera el CSV de entrega.
          </p>
        </div>
        <a href="/" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-100">
          ← Volver al chat
        </a>
      </div>

      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white p-8 text-gray-500 hover:border-emerald-400">
        <span className="text-lg">📄 Elegir CSV de mensajes</span>
        <span className="text-xs">formato: id_mensaje,dia,mensaje</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          disabled={procesando}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) procesar(f);
            e.target.value = "";
          }}
        />
      </label>

      {progreso && (
        <p className="mt-3 text-sm text-emerald-700">
          {progreso}
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-600">Error: {error}</p>}

      {filas.length > 0 && (
        <div className="mt-4 rounded-xl bg-white p-4 shadow">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">
              {nombre}: {filas.length} filas
              {resumen && (
                <span className="ml-3 text-sm font-normal text-gray-600">
                  flujo de caja semanal: S/ {resumen.flujo_semanal.toFixed(2)}
                </span>
              )}
              {fuente && (
                <span
                  className={`ml-3 rounded px-1.5 py-0.5 text-xs font-normal ${
                    fuente === "gemini"
                      ? "bg-indigo-100 text-indigo-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                  title={aviso ? `Fallback: ${aviso}` : undefined}
                >
                  motor: {fuente}
                </span>
              )}
            </h2>
            <button
              onClick={descargar}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Descargar resultados.csv
            </button>
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-gray-500">
                <th className="py-1">id_mensaje</th>
                <th>tipo</th>
                <th>producto</th>
                <th className="text-right">cantidad</th>
                <th className="text-right">monto</th>
                <th>requiere_confirmacion</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i} className="border-t">
                  <td className="py-1">{f.id_mensaje}</td>
                  <td>
                    <span className={`rounded px-1.5 py-0.5 ${COLOR_TIPO[f.tipo]}`}>
                      {ETIQUETA_TIPO[f.tipo]}
                    </span>
                  </td>
                  <td>{f.producto}</td>
                  <td className="text-right">{f.cantidad}</td>
                  <td className="text-right">
                    {f.monto == null ? "" : f.monto.toFixed(2)}
                  </td>
                  <td>{f.requiere_confirmacion ? "SI" : "NO"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import MicButton from "./MicButton";
import { COLOR_TIPO, ETIQUETA_TIPO, soles } from "@/lib/format";
import type { Transaccion } from "@/lib/types";

export interface MensajeChat {
  rol: "rosa" | "agente" | "sistema";
  texto: string;
  filas?: Transaccion[];
}

export default function ChatPanel({
  mensajes,
  pendientes,
  cargando,
  memoria,
  onTexto,
  onAudio,
  onReiniciar,
}: {
  mensajes: MensajeChat[];
  pendientes: Transaccion[];
  cargando: boolean;
  memoria: boolean;
  onTexto: (t: string) => void;
  onAudio: (data: string, mime: string) => void;
  onReiniciar: () => void;
}) {
  const [entrada, setEntrada] = useState("");
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, cargando]);

  function enviar() {
    const t = entrada.trim();
    if (!t || cargando) return;
    setEntrada("");
    onTexto(t);
  }

  return (
    <div className="flex h-full flex-col rounded-xl bg-white shadow">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h1 className="text-lg font-bold">La Caja de Doña Rosa</h1>
          <p className="text-xs text-gray-500">
            Mándele un mensaje o una nota de voz, como en WhatsApp
            {memoria && " · modo memoria (sin Supabase)"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/lote"
            className="rounded-lg border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            Modo lote (CSV)
          </a>
          <button
            onClick={onReiniciar}
            className="rounded-lg border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            Reiniciar
          </button>
        </div>
      </div>

      {pendientes.length > 0 && (
        <div className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Esperando respuesta sobre:{" "}
          {pendientes
            .map((p) => `${p.cantidad} × ${p.producto} (¿a cómo fue?)`)
            .join("; ")}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto bg-[#e5ddd5] px-4 py-4">
        {mensajes.length === 0 && (
          <p className="mt-10 text-center text-sm text-gray-500">
            Ejemplo: «vendí 10 panes a 0.30 y 3 leches gloria a 4.20»
          </p>
        )}
        {mensajes.map((m, i) => (
          <div key={i} className={m.rol === "rosa" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`burbuja shadow-sm ${
                m.rol === "rosa"
                  ? "bg-[#dcf8c6]"
                  : m.rol === "agente"
                    ? "bg-white"
                    : "bg-gray-200 text-xs text-gray-600"
              }`}
            >
              <p className="text-sm">{m.texto}</p>
              {m.filas && m.filas.length > 0 && (
                <div className="mt-2 space-y-1">
                  {m.filas.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center gap-2 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs"
                    >
                      <span
                        className={`rounded px-1.5 py-0.5 font-medium ${COLOR_TIPO[f.tipo]}`}
                      >
                        {ETIQUETA_TIPO[f.tipo]}
                      </span>
                      <span>
                        {f.cantidad} × {f.producto}
                      </span>
                      <span className="ml-auto font-semibold">
                        {f.monto == null ? "falta el monto" : soles(f.monto)}
                      </span>
                      {f.requiere_confirmacion && !f.resuelta && (
                        <span className="text-amber-600">?</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {cargando && (
          <div className="flex justify-start">
            <div className="burbuja bg-white text-sm text-gray-500">escribiendo…</div>
          </div>
        )}
        <div ref={finRef} />
      </div>

      <div className="flex items-center gap-2 border-t p-3">
        <input
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enviar()}
          placeholder='Ej.: "vendí 3 atunes" o "pagué el agua 45"'
          className="flex-1 rounded-full border px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
        />
        <button
          onClick={enviar}
          disabled={cargando || !entrada.trim()}
          className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          Enviar
        </button>
        <MicButton deshabilitado={cargando} onAudio={onAudio} />
      </div>
    </div>
  );
}

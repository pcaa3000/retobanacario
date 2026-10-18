"use client";

import { useCallback, useEffect, useState } from "react";
import ChatPanel, { type MensajeChat } from "@/components/ChatPanel";
import Dashboard from "@/components/Dashboard";
import type { Resumen, Transaccion } from "@/lib/types";

interface Estado {
  transacciones: Transaccion[];
  resumen: Resumen;
  pendientes: Transaccion[];
  fiados: Transaccion[];
  memoria: boolean;
}

export default function Home() {
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(false);

  const refrescar = useCallback(async () => {
    try {
      const res = await fetch("/api/state");
      if (res.ok) setEstado(await res.json());
    } catch {
      /* sin conexión todavía */
    }
  }, []);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  async function enviar(cuerpo: Record<string, unknown>, textoVisible: string) {
    setMensajes((ms) => [...ms, { rol: "rosa", texto: textoVisible }]);
    setCargando(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const data = await res.json();
      if (!res.ok) {
        setMensajes((ms) => [
          ...ms,
          { rol: "sistema", texto: `Error: ${data.error ?? res.statusText}` },
        ]);
      } else {
        setMensajes((ms) => [
          ...ms,
          {
            rol: "agente",
            texto: data.respuesta,
            filas: data.transacciones_nuevas,
          },
        ]);
        setEstado(data);
      }
    } catch {
      setMensajes((ms) => [
        ...ms,
        { rol: "sistema", texto: "Error de conexión" },
      ]);
    } finally {
      setCargando(false);
    }
  }

  const onTexto = (t: string) => enviar({ texto: t }, t);
  const onAudio = (data: string, mimeType: string) =>
    enviar({ audio: { data, mimeType } }, "🎙 nota de voz");

  async function preguntarCuota() {
    const pregunta = "¿Cuánto puedo pagar de cuota al mes?";
    await enviar({ texto: pregunta }, pregunta);
  }

  async function reiniciar() {
    await fetch("/api/state", { method: "DELETE" });
    setMensajes([]);
    await refrescar();
  }

  return (
    <main className="mx-auto grid h-screen max-w-6xl grid-cols-1 gap-4 p-4 md:grid-cols-[3fr_2fr]">
      <ChatPanel
        mensajes={mensajes}
        pendientes={estado?.pendientes ?? []}
        cargando={cargando}
        memoria={estado?.memoria ?? false}
        onTexto={onTexto}
        onAudio={onAudio}
        onReiniciar={reiniciar}
      />
      <Dashboard
        resumen={estado?.resumen ?? null}
        transacciones={estado?.transacciones ?? []}
        fiados={estado?.fiados ?? []}
        onCuota={preguntarCuota}
      />
    </main>
  );
}

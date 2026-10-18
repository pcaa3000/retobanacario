import { NextRequest, NextResponse } from "next/server";
import { extraer, sanitizarActualizaciones } from "@/lib/agent";
import {
  actualizarTransaccion,
  fiadosYCobros,
  insertMensaje,
  insertTransacciones,
  pendientes,
  todasTransacciones,
  ultimosMensajes,
} from "@/lib/db";
import { resumenDe } from "@/lib/cashflow";
import type { ContextoAgente } from "@/lib/types";
import { usandoMemoria } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function armarContexto(): Promise<ContextoAgente> {
  const [todas, pend, { fiados, cobros }, historial] = await Promise.all([
    todasTransacciones(),
    pendientes(),
    fiadosYCobros(),
    ultimosMensajes(12),
  ]);
  return {
    pendientes: pend,
    fiados,
    cobros,
    historial: historial.map((m) => m.texto),
    resumen: resumenDe(todas),
  };
}

async function estadoActual() {
  const [todas, pend] = await Promise.all([todasTransacciones(), pendientes()]);
  return { transacciones: todas, resumen: resumenDe(todas), pendientes: pend };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const texto = typeof body.texto === "string" ? body.texto.trim() : "";
    const audio = body.audio as { data?: string; mimeType?: string } | undefined;
    if (!texto && !audio?.data) {
      return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });
    }

    const ctx = await armarContexto();
    const salida = await extraer(ctx, {
      texto: texto || undefined,
      audio: audio?.data
        ? { data: audio.data, mimeType: audio.mimeType || "audio/webm" }
        : undefined,
    });

    // 1) Aplicar actualizaciones a transacciones pendientes.
    const idsPendientes = new Set(ctx.pendientes.map((t) => t.id));
    for (const act of sanitizarActualizaciones(salida.actualizaciones, idsPendientes)) {
      await actualizarTransaccion(act.id, { monto: act.monto, cantidad: act.cantidad });
    }

    // 2) Guardar el mensaje y sus transacciones nuevas.
    const textoMensaje =
      texto || salida.transcripcion || "(nota de voz sin transcripción)";
    const mensaje = await insertMensaje({
      texto: textoMensaje,
      origen: audio?.data ? "audio" : "texto",
    });
    const nuevas = await insertTransacciones(mensaje.id, salida.transacciones);

    return NextResponse.json({
      respuesta: salida.respuesta,
      transcripcion: salida.transcripcion,
      transacciones_nuevas: nuevas,
      memoria: usandoMemoria,
      ...(await estadoActual()),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

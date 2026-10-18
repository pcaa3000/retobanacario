import { NextRequest, NextResponse } from "next/server";
import { procesarLote } from "@/lib/lote";
import { resumenDe } from "@/lib/cashflow";
import { parseMensajesCsv, resultadosCsv } from "@/lib/csv";
import type { Transaccion } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Procesa un CSV de mensajes (id_mensaje,dia,mensaje) en orden, como una sola
 * semana. Delega el motor a `procesarLote`: UNA request batch a Gemini con
 * contexto de toda la semana, validación local y fallback al extractor local.
 * Devuelve las filas + el CSV listo para entregar + el flujo de caja.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const csvTexto = typeof body.csv === "string" ? body.csv : null;
    if (!csvTexto) {
      return NextResponse.json({ error: "Falta el campo csv" }, { status: 400 });
    }
    const mensajes = parseMensajesCsv(csvTexto);
    if (mensajes.length === 0) {
      return NextResponse.json({ error: "El CSV no tiene mensajes" }, { status: 400 });
    }

    const { filas, fuente, aviso } = await procesarLote(mensajes);

    return NextResponse.json({
      filas,
      csv: resultadosCsv(filas),
      resumen: resumenDe(filas as unknown as Transaccion[]),
      fuente,
      ...(aviso ? { aviso } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

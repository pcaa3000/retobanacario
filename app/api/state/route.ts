import { NextResponse } from "next/server";
import {
  fiadosYCobros,
  pendientes,
  resetTodo,
  todasTransacciones,
  ultimosMensajes,
} from "@/lib/db";
import { resumenDe } from "@/lib/cashflow";
import { usandoMemoria } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [todas, pend, { fiados }, historial] = await Promise.all([
      todasTransacciones(),
      pendientes(),
      fiadosYCobros(),
      ultimosMensajes(50),
    ]);
    return NextResponse.json({
      transacciones: todas,
      resumen: resumenDe(todas),
      pendientes: pend,
      fiados,
      mensajes: historial,
      memoria: usandoMemoria,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await resetTodo();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

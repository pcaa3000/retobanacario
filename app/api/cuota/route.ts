import { NextResponse } from "next/server";
import { todasTransacciones } from "@/lib/db";
import { explicacionCuota, resumenDe } from "@/lib/cashflow";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const resumen = resumenDe(await todasTransacciones());
    return NextResponse.json({ resumen, explicacion: explicacionCuota(resumen) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

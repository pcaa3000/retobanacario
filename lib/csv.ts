import Papa from "papaparse";
import type { TipoTransaccion } from "./types";

export interface FilaMensaje {
  id_mensaje: string;
  dia: string;
  mensaje: string;
}

export interface FilaResultado {
  id_mensaje: string;
  tipo: TipoTransaccion;
  producto: string;
  cantidad: number;
  monto: number | null;
  requiere_confirmacion: boolean;
}

/** Parsea un CSV con columnas id_mensaje,dia,mensaje. */
export function parseMensajesCsv(texto: string): FilaMensaje[] {
  const { data, errors } = Papa.parse<Record<string, string>>(texto, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^﻿/, ""),
  });
  if (errors.length > 0 && data.length === 0) {
    throw new Error(`CSV inválido: ${errors[0].message}`);
  }
  return data
    .filter((r) => r.mensaje && r.mensaje.trim().length > 0)
    .map((r) => ({
      id_mensaje: (r.id_mensaje ?? "").trim(),
      dia: (r.dia ?? "").trim(),
      mensaje: r.mensaje.trim(),
    }));
}

/** Serializa filas al formato exacto de plantilla_entrega.csv. */
export function resultadosCsv(filas: FilaResultado[]): string {
  const cabecera = "id_mensaje,tipo,producto,cantidad,monto,requiere_confirmacion";
  const lineas = filas.map((f) =>
    [
      csvCell(f.id_mensaje),
      csvCell(f.tipo),
      csvCell(f.producto),
      csvCell(formatCantidad(f.cantidad)),
      f.monto == null ? "" : f.monto.toFixed(2),
      f.requiere_confirmacion ? "SI" : "NO",
    ].join(","),
  );
  return [cabecera, ...lineas].join("\n") + "\n";
}

function formatCantidad(c: number): string {
  return Number.isInteger(c) ? String(c) : String(c);
}

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
